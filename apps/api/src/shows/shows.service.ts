import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  DataSource,
  In,
  Not,
  type EntityManager,
  type Repository,
  type SelectQueryBuilder,
} from 'typeorm';
import {
  CURRENCY,
  MAX_SEATS_PER_BOOKING,
  SCHEDULE_DAYS,
  type BulkResult,
  type BulkShowActionInput,
  type CreateShowInput,
  type ScheduleShowsInput,
  type ScheduleShowsResult,
  type MovieShowtimes,
  type MovieShowtimesQuery,
  type SeatCategory,
  type SeatMap,
  type ShowDetail,
  type ShowListQuery,
  type ShowSeatStatus,
  type Showtime,
  type UpdateShowInput,
} from '@cineseat/shared';
import { recordChange } from '../common/audit/audit-log';
import { httpMessage } from '../common/http/http-message';
import {
  addDays,
  dateInZone,
  dayRangeInZone,
  instantInZone,
  showTimeLabel,
  timeInZone,
} from '../common/time/zoned-time';
import { Booking, Movie, Screen, Seat, Show, ShowSeat } from '../database/entities';
import { InventoryLane, sqlTime } from '../database/inventory-lane';
import { releaseExpiredHolds } from '../holds/hold-release';
import { seatLabel } from '../theaters/seat-layout';
import { TURNAROUND_MINUTES, availabilityOf, pricesFor, seatPrice } from './pricing';

const MINUTE = 60_000;

/** Why a show cannot change — the same words for API errors and the admin panel. */
export const SHOW_STARTED = 'This show has already started and can no longer be changed.';
const ticketsBlock = (sold: number, held: number, bookings: number) =>
  `This show has ${sold} sold and ${held} held seats (${bookings} ${bookings === 1 ? 'booking' : 'bookings'}) and`;
const attemptsOnRecord = (attempts: number) =>
  `This show has ${attempts} booking ${attempts === 1 ? 'attempt' : 'attempts'} on record (payments that did not complete) and cannot be deleted. Change its time instead, or leave it to end.`;

/** A show loaded with its movie, screen and theater. */
type LoadedShow = Show & {
  movie: Movie;
  screen: Screen & { theater: NonNullable<Screen['theater']> };
};

type SeatStats = { total: number; available: number };

@Injectable()
export class ShowsService {
  constructor(
    @InjectRepository(Show) private readonly shows: Repository<Show>,
    @InjectRepository(ShowSeat) private readonly showSeats: Repository<ShowSeat>,
    @InjectRepository(Seat) private readonly seats: Repository<Seat>,
    @InjectRepository(Movie) private readonly movies: Repository<Movie>,
    @InjectRepository(Screen) private readonly screens: Repository<Screen>,
    @InjectRepository(Booking) private readonly bookings: Repository<Booking>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly lane: InventoryLane,
  ) {}

  private get timeZone(): string {
    return this.config.getOrThrow<string>('timeZone');
  }

  /** Last instant the public schedule reaches: the end of its final day. */
  private scheduleEnd(now: Date): Date {
    const lastDay = addDays(dateInZone(now, this.timeZone), SCHEDULE_DAYS - 1);
    return dayRangeInZone(lastDay, this.timeZone).end;
  }

  // --- Reading ---------------------------------------------------------------

  /**
   * GET /shows. With `date`: that whole local day, started shows included (they
   * come back with `bookable: false`). Without: from now to the end of the schedule.
   */
  async search(query: ShowListQuery, now: Date = new Date()): Promise<Showtime[]> {
    const window = query.date
      ? dayRangeInZone(query.date, this.timeZone)
      : { start: now, end: this.scheduleEnd(now) };
    const qb = this.loaded().where('s.startsAt >= :from AND s.startsAt < :to', {
      from: window.start,
      to: window.end,
    });
    if (query.movie.length) qb.andWhere('s.movieId IN (:...movies)', { movies: query.movie });
    if (query.theater.length) qb.andWhere('t.id IN (:...theaters)', { theaters: query.theater });
    if (query.city) qb.andWhere('LOWER(t.city) = :city', { city: query.city.toLowerCase() });
    if (query.format.length) qb.andWhere('s.format IN (:...formats)', { formats: query.format });
    if (query.language.length) {
      qb.andWhere('LOWER(s.language) IN (:...languages)', {
        languages: query.language.map((l) => l.toLowerCase()),
      });
    }
    return this.toShowtimes((await qb.getMany()) as LoadedShow[], now);
  }

  /** GET /movies/:id/showtimes — today (started shows included) to the end of the schedule. */
  async movieShowtimes(
    movieId: string,
    query: MovieShowtimesQuery,
    now: Date = new Date(),
  ): Promise<MovieShowtimes> {
    if (!(await this.movies.existsBy({ id: movieId })))
      throw new NotFoundException('Movie not found');
    const today = dateInZone(now, this.timeZone);
    const qb = this.loaded()
      .where('s.movieId = :movieId', { movieId })
      .andWhere('s.startsAt >= :from AND s.startsAt < :to', {
        from: dayRangeInZone(today, this.timeZone).start,
        to: this.scheduleEnd(now),
      });
    if (query.city) qb.andWhere('LOWER(t.city) = :city', { city: query.city.toLowerCase() });
    if (query.theater.length) qb.andWhere('t.id IN (:...theaters)', { theaters: query.theater });
    if (query.format.length) qb.andWhere('s.format IN (:...formats)', { formats: query.format });
    const shows = await this.toShowtimes((await qb.getMany()) as LoadedShow[], now);

    const days = Array.from({ length: SCHEDULE_DAYS }, (_, offset) => {
      const date = addDays(today, offset);
      const onDay = shows.filter((show) => show.date === date);
      return { date, shows: onDay.length, bookable: onDay.filter((show) => show.bookable).length };
    });
    return { movieId, timeZone: this.timeZone, days, shows };
  }

  async findOne(id: string, now: Date = new Date()): Promise<ShowDetail> {
    const show = (await this.loaded().where('s.id = :id', { id }).getOne()) as LoadedShow | null;
    if (!show) throw new NotFoundException('Show not found');
    const [showtime] = await this.toShowtimes([show], now);
    return {
      ...showtime,
      movie: {
        id: show.movie.id,
        title: show.movie.title,
        durationMin: show.movie.durationMin,
        certificate: show.movie.certificate,
        language: show.movie.language,
        posterPath: show.movie.posterPath,
      },
      theater: { ...showtime.theater, address: show.screen.theater.address },
    };
  }

  /** GET /shows/:id/seats — every seat with its live state and price. Expired holds read as free. */
  async seatMap(id: string, now: Date = new Date()): Promise<SeatMap> {
    const show = await this.shows.findOne({ where: { id }, relations: { screen: true } });
    if (!show) throw new NotFoundException('Show not found');
    const rows = await this.showSeats
      .createQueryBuilder('ss')
      .innerJoinAndSelect('ss.seat', 'seat')
      .where('ss.showId = :id', { id })
      .orderBy('seat.row', 'ASC')
      .addOrderBy('seat.number', 'ASC')
      .getMany();

    const counts = { available: 0, held: 0, booked: 0 };
    const seats = rows.map((row) => {
      const status = liveStatus(row, now);
      counts[status === 'AVAILABLE' ? 'available' : status === 'HELD' ? 'held' : 'booked'] += 1;
      const category = row.seat.category as SeatCategory;
      return {
        id: row.id,
        seatId: row.seatId,
        row: row.seat.row,
        number: row.seat.number,
        label: seatLabel(row.seat.row, row.seat.number),
        category,
        status,
        price: seatPrice(show.basePrice, category),
      };
    });
    return {
      showId: show.id,
      rows: show.screen.rows,
      cols: show.screen.cols,
      currency: CURRENCY,
      prices: pricesFor(show.basePrice, new Set(seats.map((seat) => seat.category))),
      rules: {
        holdMinutes: this.config.getOrThrow<number>('holdMinutes'),
        maxSeats: MAX_SEATS_PER_BOOKING,
      },
      counts,
      seats,
    };
  }

  // --- Scheduling (ADMIN) ---------------------------------------------------------
  //
  // `actorId` is the admin making the change (recorded in the audit log); null
  // for system changes (seed, tests), which are not recorded.

  async create(
    input: CreateShowInput,
    actorId: string | null,
    now: Date = new Date(),
  ): Promise<ShowDetail> {
    const { movie, screen } = await this.movieAndScreen(input.movieId, input.screenId);
    const startsAt = new Date(input.startsAt);
    await this.assertSchedulable({ movie, screen, startsAt, format: input.format, now });
    const id = await this.dataSource.transaction((tx) =>
      this.insertShow(tx, { movie, screen, startsAt, input, actorId, now }),
    );
    return this.findOne(id, now);
  }

  /**
   * POST /shows/batch: every date × time (cinema clock), earliest first. Each is
   * checked like a single show, and against the ones before it in the batch;
   * those that fit are created (each in its own transaction, audited), the
   * others come back with the reason. A dry run checks and saves nothing.
   */
  async schedule(
    input: ScheduleShowsInput,
    actorId: string | null,
    now: Date = new Date(),
  ): Promise<ScheduleShowsResult> {
    const { movie, screen } = await this.movieAndScreen(input.movieId, input.screenId);
    const slots = input.dates
      .flatMap((date) => input.times.map((time) => ({ date, time })))
      .map((slot) => ({ ...slot, startsAt: instantInZone(slot.date, slot.time, this.timeZone) }))
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

    const accepted: Date[] = [];
    const results: ScheduleShowsResult['results'] = [];
    for (const slot of slots) {
      let showId: string | null = null;
      let error: string | null = null;
      try {
        await this.assertSchedulable({
          movie,
          screen,
          startsAt: slot.startsAt,
          format: input.format,
          now,
          alsoPlanned: accepted,
        });
        if (!input.dryRun) {
          showId = await this.dataSource.transaction((tx) =>
            this.insertShow(tx, {
              movie,
              screen,
              startsAt: slot.startsAt,
              input,
              actorId,
              now,
            }),
          );
        }
        accepted.push(slot.startsAt);
      } catch (caught) {
        if (!(caught instanceof HttpException)) throw caught;
        error = httpMessage(caught);
      }
      results.push({
        date: slot.date,
        time: slot.time,
        startsAt: slot.startsAt.toISOString(),
        showId,
        error,
      });
    }
    return {
      dryRun: input.dryRun,
      created: accepted.length,
      failed: results.length - accepted.length,
      results,
    };
  }

  /**
   * Time, language, format and price can change until the first seat is held or
   * sold. Only what differs is written and audited; the same values are a no-op.
   */
  async update(
    id: string,
    input: UpdateShowInput,
    actorId: string | null,
    now: Date = new Date(),
  ): Promise<ShowDetail> {
    const show = await this.shows.findOne({
      where: { id },
      relations: { movie: true, screen: { theater: true } },
    });
    if (!show) throw new NotFoundException('Show not found');

    const startsAt = input.startsAt ? new Date(input.startsAt) : show.startsAt;
    const changed: (keyof UpdateShowInput)[] = [];
    if (input.startsAt !== undefined && startsAt.getTime() !== show.startsAt.getTime())
      changed.push('startsAt');
    if (input.format !== undefined && input.format !== show.format) changed.push('format');
    if (input.language !== undefined && input.language !== show.language) changed.push('language');
    if (input.basePrice !== undefined && input.basePrice !== show.basePrice)
      changed.push('basePrice');
    if (changed.length === 0) return this.findOne(id, now);

    if (show.startsAt <= now) throw new ConflictException(SHOW_STARTED);
    await this.clearLapsedHolds(show.id, now);
    await this.assertNoTickets(show.id, now, 'changed');

    const format = input.format ?? show.format;
    if (changed.includes('startsAt') || changed.includes('format')) {
      await this.assertSchedulable({
        movie: show.movie,
        screen: show.screen,
        startsAt,
        format,
        now,
        ignoreShowId: show.id,
      });
    }
    await this.dataSource.transaction(async (tx) => {
      await tx.update(
        Show,
        { id },
        {
          ...(changed.includes('startsAt') ? { startsAt } : {}),
          ...(changed.includes('format') ? { format } : {}),
          ...(changed.includes('language') ? { language: input.language } : {}),
          ...(changed.includes('basePrice') ? { basePrice: input.basePrice } : {}),
        },
      );
      await recordChange(tx, {
        actorId,
        entity: 'shows',
        entityId: id,
        verb: 'update',
        fields: changed,
        subject: this.label(show.movie.title, show.screen, startsAt),
        now,
      });
    });
    return this.findOne(id, now);
  }

  /** Shows with tickets sold or held cannot be deleted — those bookings must be cancelled first. */
  async remove(id: string, actorId: string | null, now: Date = new Date()): Promise<void> {
    const show = await this.shows.findOne({
      where: { id },
      relations: { movie: true, screen: { theater: true } },
    });
    if (!show) throw new NotFoundException('Show not found');
    await this.clearLapsedHolds(id, now);
    await this.assertNoTickets(id, now, 'deleted');
    // Bookings that never completed stay on record with their payments, so the show stays too.
    const attempts = await this.bookings.countBy({ showId: id });
    if (attempts > 0) throw new ConflictException(attemptsOnRecord(attempts));
    await this.dataSource.transaction(async (tx) => {
      await tx.delete(Show, { id }); // show_seats go with it (ON DELETE CASCADE)
      await recordChange(tx, {
        actorId,
        entity: 'shows',
        entityId: id,
        verb: 'delete',
        subject: this.label(show.movie.title, show.screen, show.startsAt),
        now,
      });
    });
  }

  /**
   * POST /shows/bulk: cancel several shows, or give them a new base price. Each
   * goes through the single-show path (rules, audit) and succeeds or fails on its own.
   */
  async bulk(
    input: BulkShowActionInput,
    actorId: string | null,
    now: Date = new Date(),
  ): Promise<BulkResult> {
    const found = await this.shows.find({
      where: { id: In(input.ids) },
      relations: { movie: true, screen: { theater: true } },
    });
    const byId = new Map(found.map((show) => [show.id, show]));
    const result: BulkResult = { succeeded: [], failed: [] };
    for (const id of input.ids) {
      const show = byId.get(id);
      if (!show) {
        result.failed.push({ id, label: null, message: 'Show not found' });
        continue;
      }
      try {
        if (input.action === 'delete') await this.remove(id, actorId, now);
        else await this.update(id, { basePrice: input.basePrice }, actorId, now);
        result.succeeded.push(id);
      } catch (caught) {
        if (!(caught instanceof HttpException)) throw caught;
        result.failed.push({
          id,
          label: this.label(show.movie.title, show.screen, show.startsAt),
          message: httpMessage(caught),
        });
      }
    }
    return result;
  }

  /**
   * What stops a show from being changed or deleted right now, read without
   * changing anything (lapsed holds count as gone, as they are about to be).
   * The admin panel shows these; `update` and `remove` enforce the same rules.
   */
  async showLocks(
    showIds: string[],
    now: Date,
  ): Promise<
    Map<string, { started: boolean; editBlocked: string | null; deleteBlocked: string | null }>
  > {
    const locks = new Map<
      string,
      { started: boolean; editBlocked: string | null; deleteBlocked: string | null }
    >();
    if (showIds.length === 0) return locks;
    const at = sqlTime(now);
    const rows = await this.dataSource.query<
      { id: string; startsAt: string; sold: number; held: number; live: number; attempts: number }[]
    >(
      `SELECT s."id", s."startsAt",
         (SELECT COUNT(*) FROM "show_seats" ss WHERE ss."showId" = s."id" AND ss."status" = 'BOOKED') AS "sold",
         (SELECT COUNT(*) FROM "show_seats" ss WHERE ss."showId" = s."id" AND ss."status" = 'HELD'
            AND ss."holdExpiresAt" > ?) AS "held",
         (SELECT COUNT(*) FROM "bookings" b WHERE b."showId" = s."id"
            AND (b."status" = 'CONFIRMED' OR (b."status" = 'PENDING' AND b."expiresAt" > ?))) AS "live",
         -- Lapsed holds nobody tried to pay for are about to be removed; everything else stays on record.
         (SELECT COUNT(*) FROM "bookings" b WHERE b."showId" = s."id"
            AND NOT (b."status" = 'PENDING' AND b."expiresAt" <= ?
              AND NOT EXISTS (SELECT 1 FROM "payments" p WHERE p."bookingId" = b."id"))) AS "attempts"
       FROM "shows" s WHERE s."id" IN (${showIds.map(() => '?').join(', ')})`,
      [at, at, at, ...showIds],
    );
    for (const row of rows) {
      const started = new Date(`${row.startsAt.replace(' ', 'T')}Z`) <= now;
      const tickets =
        row.sold + row.held + row.live > 0 ? ticketsBlock(row.sold, row.held, row.live) : null;
      locks.set(row.id, {
        started,
        editBlocked: started ? SHOW_STARTED : tickets ? `${tickets} cannot be changed.` : null,
        deleteBlocked: tickets
          ? `${tickets} cannot be deleted. Cancel its bookings first.`
          : row.attempts > 0
            ? attemptsOnRecord(row.attempts)
            : null,
      });
    }
    return locks;
  }

  // --- Internals ------------------------------------------------------------------

  private async movieAndScreen(
    movieId: string,
    screenId: string,
  ): Promise<{ movie: Movie; screen: Screen & { theater: NonNullable<Screen['theater']> } }> {
    const movie = await this.movies.findOne({ where: { id: movieId } });
    if (!movie) throw new BadRequestException('movieId: no movie with this id');
    const screen = await this.screens.findOne({
      where: { id: screenId },
      relations: { theater: true },
    });
    if (!screen) throw new BadRequestException('screenId: no screen with this id');
    return { movie, screen };
  }

  /** One show with its own copy of the screen's seats (where holds and sales live), audited. */
  private async insertShow(
    tx: EntityManager,
    args: {
      movie: Movie;
      screen: Screen & { theater: NonNullable<Screen['theater']> };
      startsAt: Date;
      input: { format: string; language?: string; basePrice: number };
      actorId: string | null;
      now: Date;
    },
  ): Promise<string> {
    const { movie, screen, startsAt, input } = args;
    const show = await tx.save(
      tx.create(Show, {
        movieId: movie.id,
        screenId: screen.id,
        startsAt,
        language: input.language ?? movie.language,
        format: input.format,
        basePrice: input.basePrice,
      }),
    );
    const seats = await tx.find(Seat, { where: { screenId: screen.id }, select: { id: true } });
    await tx.insert(
      ShowSeat,
      seats.map((seat) => ({ showId: show.id, seatId: seat.id, status: 'AVAILABLE' })),
    );
    await recordChange(tx, {
      actorId: args.actorId,
      entity: 'shows',
      entityId: show.id,
      verb: 'create',
      subject: this.label(movie.title, screen, startsAt),
      now: args.now,
    });
    return show.id;
  }

  /** "Dhaka Noir · CineSeat Gulshan, Screen 1 · Fri 13 Nov, 6:00 PM" — a show in words. */
  private label(
    title: string,
    screen: Screen & { theater?: Screen['theater'] },
    startsAt: Date,
  ): string {
    const venue = screen.theater ? `${screen.theater.name}, ${screen.name}` : screen.name;
    return `${title} · ${venue} · ${showTimeLabel(startsAt, this.timeZone)}`;
  }

  private loaded(): SelectQueryBuilder<Show> {
    return this.shows
      .createQueryBuilder('s')
      .innerJoinAndSelect('s.movie', 'm')
      .innerJoinAndSelect('s.screen', 'sc')
      .innerJoinAndSelect('sc.theater', 't')
      .orderBy('s.startsAt', 'ASC')
      .addOrderBy('t.name', 'ASC')
      .addOrderBy('sc.name', 'ASC');
  }

  private async assertSchedulable(args: {
    movie: Movie;
    screen: Screen;
    startsAt: Date;
    format: string;
    now: Date;
    ignoreShowId?: string;
    /** Starts of other shows of this movie on this screen about to be created (a batch). */
    alsoPlanned?: Date[];
  }): Promise<void> {
    const { movie, screen, startsAt, format, now, ignoreShowId } = args;
    if (!movie.formats.includes(format)) {
      throw new BadRequestException(
        `format: “${movie.title}” is not released in ${format} (${movie.formats.join(', ')}).`,
      );
    }
    if (!screen.formats.includes(format)) {
      throw new BadRequestException(
        `format: ${screen.name} cannot show ${format} (${screen.formats.join(', ')}).`,
      );
    }
    if (startsAt <= now)
      throw new BadRequestException('startsAt: a show must start in the future.');
    if (dateInZone(startsAt, this.timeZone) < dateInZone(movie.releaseDate, this.timeZone)) {
      throw new BadRequestException(
        `startsAt: “${movie.title}” is released on ${dateInZone(movie.releaseDate, this.timeZone)}.`,
      );
    }

    // No two shows on one screen within each other's running time plus turnaround.
    const span = (movie.durationMin + TURNAROUND_MINUTES) * MINUTE;
    const endsAt = startsAt.getTime() + span;
    const planned = (args.alsoPlanned ?? []).find(
      (other) => other.getTime() < endsAt && startsAt.getTime() < other.getTime() + span,
    );
    if (planned) {
      throw new ConflictException(
        `startsAt: overlaps the show at ${timeInZone(planned, this.timeZone)} on ${dateInZone(planned, this.timeZone)} in this batch (with ${TURNAROUND_MINUTES} min turnaround).`,
      );
    }
    const nearby = await this.shows.find({
      where: {
        screenId: screen.id,
        startsAt: Between(new Date(startsAt.getTime() - 24 * 60 * MINUTE), new Date(endsAt)),
        ...(ignoreShowId ? { id: Not(ignoreShowId) } : {}),
      },
      relations: { movie: true },
    });
    const clash = nearby.find((other) => {
      const otherEnds =
        other.startsAt.getTime() + (other.movie.durationMin + TURNAROUND_MINUTES) * MINUTE;
      return other.startsAt.getTime() < endsAt && startsAt.getTime() < otherEnds;
    });
    if (clash) {
      throw new ConflictException(
        `startsAt: ${screen.name} is busy: “${clash.movie.title}” starts at ${timeInZone(clash.startsAt, this.timeZone)} on ${dateInZone(clash.startsAt, this.timeZone)} (with ${TURNAROUND_MINUTES} min turnaround).`,
      );
    }
  }

  /**
   * Holds that ran out are gone as far as anyone can see, but the expiry job may
   * not have removed them yet; do it now, so they neither count as tickets nor
   * block the delete (bookings restrict deleting their show).
   */
  private async clearLapsedHolds(showId: string, now: Date): Promise<void> {
    await this.lane.run((tx) => releaseExpiredHolds(tx, now, showId));
  }

  /** Sold seats, live holds or any live booking make a show unchangeable. */
  private async assertNoTickets(
    showId: string,
    now: Date,
    verb: 'changed' | 'deleted',
  ): Promise<void> {
    const [sold, held, bookings] = await Promise.all([
      this.showSeats.countBy({ showId, status: 'BOOKED' }),
      this.showSeats
        .createQueryBuilder('ss')
        .where('ss.showId = :showId AND ss.status = :held', { showId, held: 'HELD' })
        .andWhere('(ss.holdExpiresAt IS NULL OR ss.holdExpiresAt > :now)', { now })
        .getCount(),
      // Live bookings only: a FAILED one holds no seats — it is history.
      this.bookings.countBy({ showId, status: In(['CONFIRMED', 'PENDING']) }),
    ]);
    if (sold + held + bookings > 0) {
      throw new ConflictException(
        `${ticketsBlock(sold, held, bookings)} cannot be ${verb}.${verb === 'deleted' ? ' Cancel its bookings first.' : ''}`,
      );
    }
  }

  /** Shows → API shape, with seat counts and categories loaded in two queries for the whole list. */
  private async toShowtimes(shows: LoadedShow[], now: Date): Promise<Showtime[]> {
    if (shows.length === 0) return [];
    const stats = await this.seatStats(
      shows.map((show) => show.id),
      now,
    );
    const categories = await this.screenCategories([
      ...new Set(shows.map((show) => show.screenId)),
    ]);

    return shows.map((show) => {
      const { total, available } = stats.get(show.id) ?? { total: 0, available: 0 };
      const prices = pricesFor(show.basePrice, categories.get(show.screenId) ?? []);
      return {
        id: show.id,
        movieId: show.movieId,
        movieTitle: show.movie.title,
        theater: {
          id: show.screen.theater.id,
          name: show.screen.theater.name,
          city: show.screen.theater.city,
        },
        screen: { id: show.screen.id, name: show.screen.name },
        startsAt: show.startsAt.toISOString(),
        endsAt: new Date(show.startsAt.getTime() + show.movie.durationMin * MINUTE).toISOString(),
        date: dateInZone(show.startsAt, this.timeZone),
        time: timeInZone(show.startsAt, this.timeZone),
        language: show.language,
        format: show.format as Showtime['format'],
        currency: CURRENCY,
        // The cheapest seat that exists (a recliner-only hall has no standard price).
        priceFrom: Object.keys(prices).length ? Math.min(...Object.values(prices)) : show.basePrice,
        prices,
        seats: { total, available },
        availability: availabilityOf(total, available),
        bookable: show.startsAt > now && available > 0,
      };
    });
  }

  private async seatStats(showIds: string[], now: Date): Promise<Map<string, SeatStats>> {
    const rows = await this.showSeats
      .createQueryBuilder('ss')
      .select('ss.showId', 'showId')
      .addSelect('COUNT(*)', 'total')
      .addSelect(
        `SUM(CASE WHEN ss.status = 'AVAILABLE' OR (ss.status = 'HELD' AND ss.holdExpiresAt <= :now) THEN 1 ELSE 0 END)`,
        'available',
      )
      .where('ss.showId IN (:...showIds)', { showIds, now })
      .groupBy('ss.showId')
      .getRawMany<{ showId: string; total: number; available: number }>();
    return new Map(
      rows.map((row) => [
        row.showId,
        { total: Number(row.total), available: Number(row.available) },
      ]),
    );
  }

  private async screenCategories(screenIds: string[]): Promise<Map<string, SeatCategory[]>> {
    const rows = await this.seats
      .createQueryBuilder('seat')
      .select('seat.screenId', 'screenId')
      .addSelect('seat.category', 'category')
      .distinct(true)
      .where({ screenId: In(screenIds) })
      .getRawMany<{ screenId: string; category: SeatCategory }>();
    const map = new Map<string, SeatCategory[]>();
    for (const row of rows) map.set(row.screenId, [...(map.get(row.screenId) ?? []), row.category]);
    return map;
  }
}

/** What a seat looks like right now: a hold past its expiry is free again. */
function liveStatus(seat: ShowSeat, now: Date): ShowSeatStatus {
  if (seat.status === 'HELD' && seat.holdExpiresAt && seat.holdExpiresAt <= now) return 'AVAILABLE';
  return seat.status as ShowSeatStatus;
}
