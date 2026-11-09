import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import type { User } from '@prisma/client';
import type { Paginated, PublicUser, UpdateProfileInput, UserListQuery, UserRole } from '@cineseat/shared';
import { resolve, join } from 'node:path';
import { unlink } from 'node:fs/promises';
import { hashPassword, verifyPassword } from '../common/security/password';
import { PrismaService } from '../database/prisma.service';
import { AVATAR_SUBFOLDER, UPLOAD_URL_PREFIX } from './avatar.storage';

/** Rows never leave this service: callers get `PublicUser`, which has no `passwordHash`. */
type PublicColumns = Pick<User, 'id' | 'email' | 'name' | 'phone' | 'avatarPath' | 'role' | 'preferredCity' | 'preferredGenres' | 'createdAt'>;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
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
    return this.prisma.user.findUnique({ where: { email } });
  }

  async findById(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  getProfile(id: string): Promise<PublicUser> {
    return this.findById(id).then((user) => this.toPublicUser(user));
  }

  /** Signup always creates a `USER`; the `ADMIN` role is assigned by an admin, never by the client. */
  async create(input: { email: string; name: string; passwordHash: string }): Promise<PublicUser> {
    try {
      const user = await this.prisma.user.create({ data: input });
      return this.toPublicUser(user);
    } catch (error) {
      // A second signup for the same email loses the race against the unique index.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('An account with this email already exists');
      }
      throw error;
    }
  }

  async updateProfile(id: string, input: UpdateProfileInput): Promise<PublicUser> {
    const user = await this.findById(id);
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        name: input.name,
        phone: input.phone,
        preferredCity: input.preferredCity,
        preferredGenres: input.preferredGenres ? UsersService.joinGenres(input.preferredGenres) : undefined,
      },
    });
    return this.toPublicUser(updated);
  }

  async changePassword(id: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.findById(id);
    const matches = await verifyPassword(currentPassword, user.passwordHash);
    if (!matches) throw new BadRequestException('Current password is incorrect');
    if (currentPassword === newPassword) throw new BadRequestException('New password must be different');

    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(newPassword) },
    });
  }

  /**
   * Stores the public path of the uploaded avatar and removes the previous file,
   * so disk does not grow on every upload (guideline 13: generated names, own dir).
   * Returns the public URL of the new image.
   */
  async setAvatar(id: string, filename: string): Promise<string> {
    const user = await this.findById(id);
    const avatarPath = `${UPLOAD_URL_PREFIX}/${AVATAR_SUBFOLDER}/${filename}`;
    await this.prisma.user.update({ where: { id: user.id }, data: { avatarPath } });
    await this.removeStoredFile(user.avatarPath);
    return avatarPath;
  }

  async list(query: UserListQuery): Promise<Paginated<PublicUser>> {
    const where: Prisma.UserWhereInput = {
      ...(query.role ? { role: query.role } : {}),
      ...(query.search
        ? { OR: [{ name: { contains: query.search } }, { email: { contains: query.search } }] }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);
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
