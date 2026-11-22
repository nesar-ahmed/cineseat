import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, type EntityManager, type Repository } from 'typeorm';
import type {
  CreateScreenInput,
  CreateTheaterInput,
  Screen as ScreenDto,
  ScreenLayout,
  SeatCategory,
  SeatCounts,
  ShowFormat,
  Theater as TheaterDto,
  TheaterDetail,
  TheaterListQuery,
  UpdateScreenInput,
  UpdateTheaterInput,
} from '@cineseat/shared';
import { recordChange } from '../common/audit/audit-log';
import { dateInZone, dayRangeInZone } from '../common/time/zoned-time';
import { Screen, Seat, Show, Theater } from '../database/entities';
import { seatLabel, seatsFor, type Layout } from './seat-layout';

const emptyCounts = (): SeatCounts => ({ total: 0, STANDARD: 0, PREMIUM: 0, RECLINER: 0 });
const showCount = (count: number) => `${count} ${count === 1 ? 'show' : 'shows'}`;

/** Why a theater, a screen or a layout cannot change — the same words for API errors and the admin panel. */
export const theaterDeleteBlocked = (name: string, count: number) =>
  `${name} has ${showCount(count)}. Remove them before deleting the theater.`;
export const screenDeleteBlocked = (name: string, count: number) =>
  `${name} has ${showCount(count)}. Remove them before deleting the screen.`;
export const layoutLocked = (name: string, count: number) =>
  `${name} has ${showCount(count)}; its seat layout can no longer change.`;

/** Theaters and their screens: venue data, seat layouts and ADMIN editing. */
@Injectable()
export class TheatersService {
  constructor(
    @InjectRepository(Theater) private readonly theaters: Repository<Theater>,
    @InjectRepository(Screen) private readonly screens: Repository<Screen>,
    @InjectRepository(Seat) private readonly seats: Repository<Seat>,
    @InjectRepository(Show) private readonly shows: Repository<Show>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  private get timeZone(): string {
    return this.config.getOrThrow<string>('timeZone');
  }

  // --- Theaters -------------------------------------------------------------------

  async list(query: TheaterListQuery, now: Date = new Date()): Promise<TheaterDto[]> {
    const qb = this.theaters
      .createQueryBuilder('t')
      .orderBy('t.city', 'ASC')
      .addOrderBy('t.name', 'ASC');
    if (query.city) qb.where('LOWER(t.city) = :city', { city: query.city.toLowerCase() });
    return this.toDtos(await qb.getMany(), now);
  }

  async findOne(id: string, now: Date = new Date()): Promise<TheaterDetail> {
    const theater = await this.findTheater(id);
    const [dto] = await this.toDtos([theater], now);
    const screens = await this.screens.find({ where: { theaterId: id }, order: { name: 'ASC' } });
    return { ...dto, screens: await this.toScreenDtos(screens) };
  }

  /** Names are unique (ignoring case); a city is spelled the way existing theaters spell it. */
  async create(
    input: CreateTheaterInput,
    actorId: string | null,
    now: Date = new Date(),
  ): Promise<TheaterDetail> {
    await this.assertTheaterNameFree(input.name);
    const city = await this.canonicalCity(input.city);
    const id = await this.dataSource.transaction(async (tx) => {
      const theater = await tx.save(tx.create(Theater, { ...input, city }));
      await recordChange(tx, {
        actorId,
        entity: 'theaters',
        entityId: theater.id,
        verb: 'create',
        subject: theater.name,
        now,
      });
      return theater.id;
    });
    return this.findOne(id, now);
  }

  /** Only fields that differ are written and audited; sending the same values back is a no-op. */
  async update(
    id: string,
    input: UpdateTheaterInput,
    actorId: string | null,
    now: Date = new Date(),
  ): Promise<TheaterDetail> {
    const theater = await this.findTheater(id);
    const next: UpdateTheaterInput = { ...input };
    if (next.city !== undefined) next.city = await this.canonicalCity(next.city, id);
    const changed = (Object.keys(next) as (keyof UpdateTheaterInput)[]).filter(
      (key) =>
        next[key] !== undefined && JSON.stringify(next[key]) !== JSON.stringify(theater[key]),
    );
    if (changed.length === 0) return this.findOne(id, now);
    if (changed.includes('name')) await this.assertTheaterNameFree(next.name!, id);

    await this.dataSource.transaction(async (tx) => {
      await tx.update(Theater, { id }, Object.fromEntries(changed.map((key) => [key, next[key]])));
      await recordChange(tx, {
        actorId,
        entity: 'theaters',
        entityId: id,
        verb: 'update',
        fields: changed,
        subject: next.name ?? theater.name,
        now,
      });
    });
    return this.findOne(id, now);
  }

  /** A theater with shows (past or future) keeps its history; remove the shows first. */
  async remove(id: string, actorId: string | null, now: Date = new Date()): Promise<void> {
    const theater = await this.findTheater(id);
    const shows = await this.shows
      .createQueryBuilder('s')
      .innerJoin('s.screen', 'sc')
      .where('sc.theaterId = :id', { id })
      .getCount();
    if (shows > 0) throw new ConflictException(theaterDeleteBlocked(theater.name, shows));
    await this.dataSource.transaction(async (tx) => {
      await tx.delete(Theater, { id }); // screens and seats cascade
      await recordChange(tx, {
        actorId,
        entity: 'theaters',
        entityId: id,
        verb: 'delete',
        subject: theater.name,
        now,
      });
    });
  }

  // --- Screens --------------------------------------------------------------------

  async findScreen(id: string): Promise<ScreenLayout> {
    const screen = await this.screens.findOne({ where: { id } });
    if (!screen) throw new NotFoundException('Screen not found');
    const [dto] = await this.toScreenDtos([screen]);
    const seats = await this.seats.find({
      where: { screenId: id },
      order: { row: 'ASC', number: 'ASC' },
    });
    return {
      ...dto,
      layout: seats.map((seat) => ({
        id: seat.id,
        row: seat.row,
        number: seat.number,
        label: seatLabel(seat.row, seat.number),
        category: seat.category as SeatCategory,
      })),
    };
  }

  /** Screen changes are recorded on the theater (`theaters.screen.*`), so its history covers them. */
  async createScreen(
    theaterId: string,
    input: CreateScreenInput,
    actorId: string | null,
    now: Date = new Date(),
  ): Promise<ScreenLayout> {
    await this.findTheater(theaterId);
    await this.assertNameFree(theaterId, input.name);
    const id = await this.dataSource.transaction(async (tx) => {
      const screen = await tx.save(
        tx.create(Screen, {
          theaterId,
          name: input.name,
          rows: input.rows,
          cols: input.cols,
          formats: input.formats,
        }),
      );
      await this.writeSeats(tx, screen.id, input);
      await recordChange(tx, {
        actorId,
        entity: 'theaters',
        entityId: theaterId,
        verb: 'screen.create',
        subject: screen.name,
        now,
      });
      return screen.id;
    });
    return this.findScreen(id);
  }

  /**
   * Name and formats can change any time (except dropping a format that upcoming
   * shows use). A new seat layout is only possible while the screen has no shows:
   * every show owns a copy of the seats, and sold seats must keep their place.
   * Only what differs is written and audited.
   */
  async updateScreen(
    id: string,
    input: UpdateScreenInput,
    actorId: string | null,
    now: Date = new Date(),
  ): Promise<ScreenLayout> {
    const screen = await this.screens.findOne({ where: { id } });
    if (!screen) throw new NotFoundException('Screen not found');

    const current = await this.layoutOf(screen);
    const changed: string[] = [];
    if (input.name !== undefined && input.name !== screen.name) changed.push('name');
    if (
      input.formats !== undefined &&
      [...input.formats].sort().join() !== [...screen.formats].sort().join()
    )
      changed.push('formats');
    const layout = input.rows !== undefined ? (input as Layout) : null;
    const layoutChanged =
      layout !== null &&
      (layout.rows !== current.rows ||
        layout.cols !== current.cols ||
        layout.premiumRows !== current.premiumRows ||
        layout.reclinerRows !== current.reclinerRows);
    if (layoutChanged) changed.push('layout');
    if (changed.length === 0) return this.findScreen(id);

    if (changed.includes('name')) await this.assertNameFree(screen.theaterId, input.name!, id);
    if (changed.includes('formats')) {
      const dropped = screen.formats.filter(
        (format) => !input.formats!.includes(format as ShowFormat),
      );
      if (dropped.length) {
        const affected = await this.shows
          .createQueryBuilder('s')
          .where('s.screenId = :id AND s.format IN (:...dropped) AND s.startsAt > :now', {
            id,
            dropped,
            now,
          })
          .getCount();
        if (affected > 0) {
          throw new ConflictException(
            `formats: ${affected} upcoming ${dropped.join('/')} ${affected === 1 ? 'show uses' : 'shows use'} ${screen.name}. Move or cancel ${affected === 1 ? 'it' : 'them'} first.`,
          );
        }
      }
    }
    if (layoutChanged) {
      const shows = await this.shows.countBy({ screenId: id });
      if (shows > 0) throw new ConflictException(`rows: ${layoutLocked(screen.name, shows)}`);
    }

    await this.dataSource.transaction(async (tx) => {
      const changes: Partial<Screen> = {};
      if (changed.includes('name')) changes.name = input.name!;
      if (changed.includes('formats')) changes.formats = input.formats!;
      if (layoutChanged && layout) {
        changes.rows = layout.rows;
        changes.cols = layout.cols;
        await tx.delete(Seat, { screenId: id });
        await this.writeSeats(tx, id, layout);
      }
      await tx.update(Screen, { id }, changes);
      await recordChange(tx, {
        actorId,
        entity: 'theaters',
        entityId: screen.theaterId,
        verb: 'screen.update',
        fields: changed,
        subject: changes.name ?? screen.name,
        now,
      });
    });
    return this.findScreen(id);
  }

  async removeScreen(id: string, actorId: string | null, now: Date = new Date()): Promise<void> {
    const screen = await this.screens.findOne({ where: { id } });
    if (!screen) throw new NotFoundException('Screen not found');
    const shows = await this.shows.countBy({ screenId: id });
    if (shows > 0) throw new ConflictException(screenDeleteBlocked(screen.name, shows));
    await this.dataSource.transaction(async (tx) => {
      await tx.delete(Screen, { id }); // seats cascade
      await recordChange(tx, {
        actorId,
        entity: 'theaters',
        entityId: screen.theaterId,
        verb: 'screen.delete',
        subject: screen.name,
        now,
      });
    });
  }

  // --- Internals ------------------------------------------------------------------

  private async findTheater(id: string): Promise<Theater> {
    const theater = await this.theaters.findOne({ where: { id } });
    if (!theater) throw new NotFoundException('Theater not found');
    return theater;
  }

  private async assertTheaterNameFree(name: string, exceptId?: string): Promise<void> {
    const existing = await this.theaters
      .createQueryBuilder('t')
      .where('LOWER(t.name) = :name', { name: name.toLowerCase() })
      .getOne();
    if (existing && existing.id !== exceptId)
      throw new ConflictException(`name: There is already a theater called “${existing.name}”.`);
  }

  /**
   * The spelling other theaters use for this city ("dhaka" → "Dhaka"), so the
   * catalog's city filter never lists one city twice. A new city keeps its spelling.
   */
  private async canonicalCity(city: string, exceptId?: string): Promise<string> {
    const qb = this.theaters
      .createQueryBuilder('t')
      .select('t.city', 'city')
      .where('LOWER(t.city) = :city', { city: city.toLowerCase() });
    if (exceptId) qb.andWhere('t.id != :exceptId', { exceptId });
    const existing = await qb.orderBy('t.name', 'ASC').limit(1).getRawOne<{ city: string }>();
    return existing?.city ?? city;
  }

  /** The layout a screen was created with, read back from its seats. */
  private async layoutOf(screen: Screen): Promise<Layout> {
    const rows = await this.seats
      .createQueryBuilder('seat')
      .select('seat.category', 'category')
      .addSelect('COUNT(DISTINCT seat.row)', 'rows')
      .where('seat.screenId = :id', { id: screen.id })
      .groupBy('seat.category')
      .getRawMany<{ category: SeatCategory; rows: number }>();
    const rowsOf = (category: SeatCategory) =>
      Number(rows.find((row) => row.category === category)?.rows ?? 0);
    return {
      rows: screen.rows,
      cols: screen.cols,
      premiumRows: rowsOf('PREMIUM'),
      reclinerRows: rowsOf('RECLINER'),
    };
  }

  private async assertNameFree(theaterId: string, name: string, exceptId?: string): Promise<void> {
    const existing = await this.screens
      .createQueryBuilder('sc')
      .where('sc.theaterId = :theaterId AND LOWER(sc.name) = :name', {
        theaterId,
        name: name.toLowerCase(),
      })
      .getOne();
    if (existing && existing.id !== exceptId)
      throw new ConflictException(
        `name: This theater already has a screen called “${existing.name}”.`,
      );
  }

  private async writeSeats(tx: EntityManager, screenId: string, layout: Layout): Promise<void> {
    await tx.insert(
      Seat,
      seatsFor(layout).map((seat) => ({ ...seat, screenId })),
    );
  }

  /** Theaters → API shape; counts for the whole list come from three grouped queries. */
  private async toDtos(theaters: Theater[], now: Date): Promise<TheaterDto[]> {
    if (theaters.length === 0) return [];
    const ids = theaters.map((theater) => theater.id);
    const today = dayRangeInZone(dateInZone(now, this.timeZone), this.timeZone);

    const [screenRows, seatRows, showRows] = await Promise.all([
      this.screens
        .createQueryBuilder('sc')
        .select('sc.theaterId', 'theaterId')
        .addSelect('COUNT(*)', 'count')
        .where('sc.theaterId IN (:...ids)', { ids })
        .groupBy('sc.theaterId')
        .getRawMany<{ theaterId: string; count: number }>(),
      this.seats
        .createQueryBuilder('seat')
        .innerJoin('seat.screen', 'sc')
        .select('sc.theaterId', 'theaterId')
        .addSelect('COUNT(*)', 'count')
        .where('sc.theaterId IN (:...ids)', { ids })
        .groupBy('sc.theaterId')
        .getRawMany<{ theaterId: string; count: number }>(),
      this.shows
        .createQueryBuilder('s')
        .innerJoin('s.screen', 'sc')
        .select('sc.theaterId', 'theaterId')
        .addSelect('COUNT(*)', 'shows')
        .addSelect('COUNT(DISTINCT s.movieId)', 'movies')
        .where('sc.theaterId IN (:...ids)', { ids })
        .andWhere('s.startsAt >= :from AND s.startsAt < :to', { from: today.start, to: today.end })
        .groupBy('sc.theaterId')
        .getRawMany<{ theaterId: string; shows: number; movies: number }>(),
    ]);
    const byId = <T extends { theaterId: string }>(rows: T[]) =>
      new Map(rows.map((row) => [row.theaterId, row]));
    const screens = byId(screenRows);
    const seats = byId(seatRows);
    const shows = byId(showRows);

    return theaters.map((theater) => ({
      id: theater.id,
      name: theater.name,
      city: theater.city,
      address: theater.address,
      amenities: theater.amenities,
      screenCount: Number(screens.get(theater.id)?.count ?? 0),
      seatCount: Number(seats.get(theater.id)?.count ?? 0),
      today: {
        shows: Number(shows.get(theater.id)?.shows ?? 0),
        movies: Number(shows.get(theater.id)?.movies ?? 0),
      },
    }));
  }

  private async toScreenDtos(screens: Screen[]): Promise<ScreenDto[]> {
    if (screens.length === 0) return [];
    const rows = await this.seats
      .createQueryBuilder('seat')
      .select('seat.screenId', 'screenId')
      .addSelect('seat.category', 'category')
      .addSelect('COUNT(*)', 'count')
      .where('seat.screenId IN (:...ids)', { ids: screens.map((screen) => screen.id) })
      .groupBy('seat.screenId')
      .addGroupBy('seat.category')
      .getRawMany<{ screenId: string; category: SeatCategory; count: number }>();
    const counts = new Map<string, SeatCounts>();
    for (const row of rows) {
      const entry = counts.get(row.screenId) ?? emptyCounts();
      entry[row.category] = Number(row.count);
      entry.total += Number(row.count);
      counts.set(row.screenId, entry);
    }
    return screens.map((screen) => ({
      id: screen.id,
      theaterId: screen.theaterId,
      name: screen.name,
      rows: screen.rows,
      cols: screen.cols,
      formats: screen.formats as ShowFormat[],
      seatCounts: counts.get(screen.id) ?? emptyCounts(),
    }));
  }
}
