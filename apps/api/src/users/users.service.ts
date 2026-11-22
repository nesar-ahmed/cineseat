import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import type { FindOptionsWhere, Repository } from 'typeorm';
import type { Paginated, PublicUser, UpdateProfileInput, UserListQuery, UserRole } from '@cineseat/shared';
import { resolve, join } from 'node:path';
import { unlink } from 'node:fs/promises';
import { hashPassword, verifyPassword } from '../common/security/password';
import { isUniqueViolation } from '../database/database-errors';
import { User } from '../database/entities';
import { Contains } from '../database/find-operators';
import { emailChanged, passwordChanged } from '../notifications/messages';
import { NotificationsService } from '../notifications/notifications.service';
import { AVATAR_SUBFOLDER, UPLOAD_URL_PREFIX } from './avatar.storage';

/** Rows never leave this service: callers get `PublicUser`, which has no `passwordHash`. */
type PublicColumns = Pick<User, 'id' | 'email' | 'name' | 'phone' | 'avatarPath' | 'role' | 'preferredCity' | 'preferredGenres' | 'createdAt'>;

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
  ) {}

  /** SQLite stores statuses and lists as strings, so mapping happens here (guideline 7). */
  toPublicUser(row: PublicColumns): PublicUser {
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      phone: row.phone ?? null,
      avatarUrl: row.avatarPath ?? null,
      role: row.role as UserRole,
      preferredCity: row.preferredCity ?? null,
      preferredGenres: UsersService.splitGenres(row.preferredGenres),
      createdAt: row.createdAt.toISOString(),
    };
  }

  /** Row including the password hash — for credential checks inside the service layer only. */
  async findByEmailWithSecret(email: string): Promise<User | null> {
    return this.users.findOne({ where: { email } });
  }

  async findById(id: string): Promise<User> {
    const user = await this.users.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  getProfile(id: string): Promise<PublicUser> {
    return this.findById(id).then((user) => this.toPublicUser(user));
  }

  /** Signup always creates a `USER`; the `ADMIN` role is assigned by an admin, never by the client. */
  async create(input: { email: string; name: string; passwordHash: string }): Promise<PublicUser> {
    try {
      // `role` is left out on purpose: the column default makes every signup a USER.
      const user = await this.users.save(this.users.create(input));
      return this.toPublicUser(user);
    } catch (error) {
      // A second signup for the same email loses the race against the unique index.
      if (isUniqueViolation(error)) {
        throw new ConflictException('An account with this email already exists');
      }
      throw error;
    }
  }

  async updateProfile(id: string, input: UpdateProfileInput): Promise<PublicUser> {
    const user = await this.findById(id);
    const candidates: Partial<User> = {
      name: input.name,
      phone: input.phone,
      preferredCity: input.preferredCity,
      preferredGenres: input.preferredGenres ? UsersService.joinGenres(input.preferredGenres) : undefined,
    };
    // Only the fields that were sent are written; everything else is left alone.
    const changes = Object.fromEntries(
      Object.entries(candidates).filter(([, value]) => value !== undefined),
    ) as Partial<User>;
    if (Object.keys(changes).length > 0) await this.users.update({ id: user.id }, changes);
    return this.toPublicUser({ ...user, ...changes });
  }

  async changePassword(id: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.findById(id);
    const matches = await verifyPassword(currentPassword, user.passwordHash);
    if (!matches) throw new BadRequestException('Current password is incorrect');
    if (currentPassword === newPassword) throw new BadRequestException('New password must be different');

    await this.users.update({ id: user.id }, { passwordHash: await hashPassword(newPassword) });
    await this.notifications.sendTo(user.id, passwordChanged());
  }

  /**
   * Changes the sign-in email. The password is checked first, so without it the
   * endpoint says nothing about which addresses are taken. `email` arrives
   * trimmed and lowercased by `EmailSchema`, the same key signup and login use.
   * Sessions survive: JwtStrategy reloads the account by id on every request.
   */
  async changeEmail(id: string, email: string, currentPassword: string): Promise<PublicUser> {
    const user = await this.findById(id);
    const matches = await verifyPassword(currentPassword, user.passwordHash);
    if (!matches) throw new BadRequestException('Current password is incorrect');
    if (email === user.email) throw new BadRequestException('This is already your email address');

    const taken = await this.users.findOne({ where: { email }, select: { id: true } });
    if (taken) throw new ConflictException('An account with this email already exists');
    try {
      await this.users.update({ id: user.id }, { email });
    } catch (error) {
      // Another account claimed the address between the check and the write.
      if (isUniqueViolation(error)) {
        throw new ConflictException('An account with this email already exists');
      }
      throw error;
    }
    await this.notifications.sendTo(user.id, emailChanged(user.email, email));
    return this.toPublicUser({ ...user, email });
  }

  /**
   * Stores the public path of the uploaded avatar and removes the previous file,
   * so disk does not grow on every upload (guideline 13: generated names, own dir).
   * Returns the public URL of the new image.
   */
  async setAvatar(id: string, filename: string): Promise<string> {
    const user = await this.findById(id);
    const avatarPath = `${UPLOAD_URL_PREFIX}/${AVATAR_SUBFOLDER}/${filename}`;
    await this.users.update({ id: user.id }, { avatarPath });
    await this.removeStoredFile(user.avatarPath);
    return avatarPath;
  }

  async list(query: UserListQuery): Promise<Paginated<PublicUser>> {
    const byRole: FindOptionsWhere<User> = query.role ? { role: query.role } : {};
    // An array of conditions is OR-ed: the search matches the name or the email.
    const where: FindOptionsWhere<User> | FindOptionsWhere<User>[] = query.search
      ? [
          { ...byRole, name: Contains(query.search) },
          { ...byRole, email: Contains(query.search) },
        ]
      : byRole;
    const [rows, total] = await this.users.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });
    return { items: rows.map((row) => this.toPublicUser(row)), total, page: query.page, pageSize: query.pageSize };
  }

  /** Only deletes files we generated under `<UPLOAD_DIR>/avatars`, never arbitrary paths. */
  private async removeStoredFile(publicPath: string | null): Promise<void> {
    const fsPath = this.toFsPath(publicPath);
    if (!fsPath) return;
    try {
      await unlink(fsPath);
    } catch {
      // A missing old avatar is not worth failing the request over.
    }
  }

  private toFsPath(publicPath: string | null): string | null {
    const prefix = `${UPLOAD_URL_PREFIX}/${AVATAR_SUBFOLDER}/`;
    if (!publicPath || !publicPath.startsWith(prefix)) return null;
    const root = resolve(this.config.getOrThrow<string>('uploadDir'));
    const candidate = join(root, AVATAR_SUBFOLDER, publicPath.slice(prefix.length));
    // Normalised containment check: `..` segments cannot escape the avatars folder.
    return candidate.startsWith(join(root, AVATAR_SUBFOLDER) + '/') ? candidate : null;
  }

  private static joinGenres(genres: string[]): string {
    return Array.from(new Set(genres.map((genre) => genre.trim()))).join(',');
  }

  private static splitGenres(raw: string | null): string[] {
    if (!raw) return [];
    return Array.from(new Set(raw.split(',').map((genre) => genre.trim()).filter(Boolean)));
  }
}
