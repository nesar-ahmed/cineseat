import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import {
  ADMIN_MOVIE_HISTORY_LIMIT,
  ADMIN_MOVIE_UPCOMING_LIMIT,
  defaultSortOrder,
  type AdminMovie,
  type AdminMovieDetail,
  type AdminMovieList,
  type AdminMovieListQuery,
  type AdminMovieSort,
  type AdminMovieStats,
  type Movie as MovieDto,
  type ShowFormat,
} from '@cineseat/shared';
import { historyOf } from '../common/audit/audit-log';
import { dateInZone, dayRangeInZone, startOfDayInZone } from '../common/time/zoned-time';
import { fromSqlTime, placeholders, sqlTime, type SqlValue } from '../database/inventory-lane';
import { containsPattern } from './movie-filters';
import { MoviesService, deleteBlockedReason } from './movies.service';
import { scheduleLimits } from './schedule-limits';

/**
 * Figures per movie, all time, one row each (movies without shows have none):
 * its shows, seats sold on them, and successful payments for their bookings.
 * The first two parameters are "now" (upcoming = starts after now).
 *
 * Aggregated on read: fine for a catalog of hundreds of titles. At a much larger
 * scale these would become counters kept by the booking and payment paths, like
 * `movies.popularity`.
 */
const STATS_CTE = `
  WITH "st" AS (
    SELECT s."movieId" AS "movieId", COUNT(*) AS "shows",
           SUM(s."startsAt" > ?) AS "upcoming",
           MIN(CASE WHEN s."startsAt" > ? THEN s."startsAt" END) AS "nextShowAt",
           MAX(s."startsAt") AS "lastShowAt"
    FROM "shows" s GROUP BY s."movieId"
  ),
  "sold" AS (
    SELECT s."movieId" AS "movieId", COUNT(*) AS "tickets"
    FROM "show_seats" ss JOIN "shows" s ON s."id" = ss."showId"
    WHERE ss."status" = 'BOOKED' GROUP BY s."movieId"
  ),
  "rev" AS (
    SELECT s."movieId" AS "movieId", SUM(p."amount") AS "revenue"
    FROM "payments" p
    JOIN "bookings" b ON b."id" = p."bookingId"
    JOIN "shows" s ON s."id" = b."showId"
    WHERE p."status" = 'SUCCESS' GROUP BY s."movieId"
  )`;

const FROM = `
  FROM "movies" m
  LEFT JOIN "st" ON "st"."movieId" = m."id"
  LEFT JOIN "sold" ON "sold"."movieId" = m."id"
  LEFT JOIN "rev" ON "rev"."movieId" = m."id"`;

const COLUMNS = `
  m."id" AS "id", m."createdAt" AS "createdAt", m."updatedAt" AS "updatedAt",
  COALESCE("st"."shows", 0) AS "shows", COALESCE("st"."upcoming", 0) AS "upcoming",
  "st"."nextShowAt" AS "nextShowAt", "st"."lastShowAt" AS "lastShowAt",
  COALESCE("sold"."tickets", 0) AS "tickets", COALESCE("rev"."revenue", 0) AS "revenue"`;

/** ORDER BY expression per sort key; every order ends on title and id, so pages never overlap. */
const ORDER_BY: Record<AdminMovieSort, string> = {
  updated: 'm."updatedAt"',
  created: 'm."createdAt"',
  title: 'm."title" COLLATE NOCASE',
  release: 'm."releaseDate"',
  runtime: 'm."durationMin"',
  popularity: 'm."popularity"',
  rating: 'm."ratingAvg"',
  shows: 'COALESCE("st"."upcoming", 0)',
  tickets: 'COALESCE("sold"."tickets", 0)',
  revenue: 'COALESCE("rev"."revenue", 0)',
};

type StatsRow = {
  id: string;
  createdAt: string;
  updatedAt: string;
  shows: number;
  upcoming: number;
  nextShowAt: string | null;
  lastShowAt: string | null;
  tickets: number;
  revenue: number;
};

type Where = { sql: string; params: SqlValue[] };

/**
 * The admin panel's read model for movies (GET /admin/movies, /admin/movies/:id):
 * the public movie shape plus record times, schedule and sales figures, with
 * sorting and filters an admin needs (by revenue, by what is unscheduled or
 * missing a poster, by release window…). Read-only; edits go through
 * MoviesService, which applies the same schedule limits reported here.
 */
@Injectable()
export class AdminMoviesService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly movies: MoviesService,
    private readonly config: ConfigService,
  ) {}

  private get timeZone(): string {
    return this.config.getOrThrow<string>('timeZone');
  }

  async list(query: AdminMovieListQuery, now: Date = new Date()): Promise<AdminMovieList> {
    const at = sqlTime(now);
    const filters = this.where(query, { skipStatus: true });
    const withStatus = query.status
      ? { sql: `${filters.sql} AND m."status" = ?`, params: [...filters.params, query.status] }
      : filters;

    const direction = (query.order ?? defaultSortOrder(query.sort)).toUpperCase();
    const nulls = query.sort === 'rating' ? ' NULLS LAST' : '';
    const [rows, statusCounts] = await Promise.all([
      this.dataSource.query<StatsRow[]>(
        `${STATS_CTE} SELECT ${COLUMNS} ${FROM} WHERE ${withStatus.sql}
         ORDER BY ${ORDER_BY[query.sort]} ${direction}${nulls}, m."title" COLLATE NOCASE ASC, m."id" ASC
         LIMIT ? OFFSET ?`,
        [at, at, ...withStatus.params, query.pageSize, (query.page - 1) * query.pageSize],
      ),
      // Tabs: titles per status with every other filter applied.
      this.dataSource.query<{ status: string; n: number }[]>(
        `${STATS_CTE} SELECT m."status" AS "status", COUNT(*) AS "n" ${FROM}
         WHERE ${filters.sql} GROUP BY m."status"`,
        [at, at, ...filters.params],
      ),
    ]);

    const counts = { all: 0, NOW_SHOWING: 0, COMING_SOON: 0 };
    for (const row of statusCounts) {
      if (row.status === 'NOW_SHOWING' || row.status === 'COMING_SOON') counts[row.status] = row.n;
      counts.all += row.n;
    }
    return {
      items: await this.withStats(rows),
      total: query.status ? counts[query.status] : counts.all,
      page: query.page,
      pageSize: query.pageSize,
      counts,
    };
  }

  async detail(id: string, now: Date = new Date()): Promise<AdminMovieDetail> {
    const movie = await this.movies.findOne(id); // 404 for unknown ids
    const at = sqlTime(now);
    const [rows, upcoming, limits, history] = await Promise.all([
      this.dataSource.query<StatsRow[]>(`${STATS_CTE} SELECT ${COLUMNS} ${FROM} WHERE m."id" = ?`, [
        at,
        at,
        id,
      ]),
      this.upcomingShows(id, now),
      scheduleLimits(this.dataSource.manager, id, now),
      historyOf(this.dataSource.manager, 'movies', id, ADMIN_MOVIE_HISTORY_LIMIT),
    ]);
    const stats = this.statsOf(rows[0]);

    return {
      ...movie,
      createdAt: fromSqlTime(rows[0].createdAt).toISOString(),
      updatedAt: fromSqlTime(rows[0].updatedAt).toISOString(),
      stats,
      upcoming,
      constraints: {
        canDelete: stats.shows === 0,
        deleteBlockedReason:
          stats.shows === 0 ? null : deleteBlockedReason(movie.title, stats.shows),
        formatsInUse: [...limits.formatsInUse.keys()].sort(),
        latestReleaseDate: limits.firstUpcoming
          ? dateInZone(limits.firstUpcoming, this.timeZone)
          : null,
        maxDurationMin: limits.duration?.maxMin ?? null,
      },
      history,
    };
  }

  // --- Internals ------------------------------------------------------------------

  /** WHERE clause (on `m` and the stats CTEs) for everything in `query` except paging and sort. */
  private where(query: AdminMovieListQuery, options: { skipStatus?: boolean } = {}): Where {
    const clauses: string[] = ['1 = 1'];
    const params: SqlValue[] = [];
    const lower = (values: string[]) => values.map((value) => value.toLowerCase());

    if (query.status && !options.skipStatus) {
      clauses.push('m."status" = ?');
      params.push(query.status);
    }
    const search = query.search?.trim();
    if (search) {
      // Title, director, cast or a genre, case-insensitive and literal — or an exact id.
      const like = containsPattern(search);
      clauses.push(`(m."title" LIKE ? ESCAPE '\\' OR m."director" LIKE ? ESCAPE '\\'
        OR m."cast" LIKE ? ESCAPE '\\' OR m."id" = ?
        OR EXISTS (SELECT 1 FROM "movie_genres" sg WHERE sg."movieId" = m."id" AND sg."genre" LIKE ? ESCAPE '\\'))`);
      params.push(like, like, like, search, like);
    }
    if (query.genre.length) {
      clauses.push(
        `EXISTS (SELECT 1 FROM "movie_genres" fg WHERE fg."movieId" = m."id" AND LOWER(fg."genre") IN (${placeholders(query.genre.length)}))`,
      );
      params.push(...lower(query.genre));
    }
    if (query.language.length) {
      clauses.push(`LOWER(m."language") IN (${placeholders(query.language.length)})`);
      params.push(...lower(query.language));
    }
    if (query.certificate.length) {
      clauses.push(`m."certificate" IN (${placeholders(query.certificate.length)})`);
      params.push(...query.certificate);
    }
    if (query.format.length) {
      // `formats` is stored comma-separated ("2D,3D").
      clauses.push(
        `(${query.format.map(() => `(',' || m."formats" || ',') LIKE ?`).join(' OR ')})`,
      );
      params.push(...query.format.map((format) => `%,${format},%`));
    }
    if (query.schedule) {
      clauses.push(`COALESCE("st"."upcoming", 0) ${query.schedule === 'scheduled' ? '>' : '='} 0`);
    }
    if (query.poster) {
      clauses.push(`m."posterPath" IS ${query.poster === 'with' ? 'NOT NULL' : 'NULL'}`);
    }
    if (query.releasedFrom) {
      clauses.push('m."releaseDate" >= ?');
      params.push(sqlTime(startOfDayInZone(query.releasedFrom, this.timeZone)));
    }
    if (query.releasedTo) {
      clauses.push('m."releaseDate" < ?');
      params.push(sqlTime(dayRangeInZone(query.releasedTo, this.timeZone).end));
    }
    return { sql: clauses.join(' AND '), params };
  }

  private async withStats(rows: StatsRow[]): Promise<AdminMovie[]> {
    const movies = await this.movies.findMany(rows.map((row) => row.id));
    const byId = new Map<string, MovieDto>(movies.map((movie) => [movie.id, movie]));
    return rows.flatMap((row) => {
      const movie = byId.get(row.id);
      if (!movie) return []; // deleted between the two reads
      return [
        {
          ...movie,
          createdAt: fromSqlTime(row.createdAt).toISOString(),
          updatedAt: fromSqlTime(row.updatedAt).toISOString(),
          stats: this.statsOf(row),
        },
      ];
    });
  }

  private statsOf(row: StatsRow): AdminMovieStats {
    return {
      shows: row.shows,
      upcomingShows: row.upcoming,
      nextShowAt: row.nextShowAt ? fromSqlTime(row.nextShowAt).toISOString() : null,
      lastShowAt: row.lastShowAt ? fromSqlTime(row.lastShowAt).toISOString() : null,
      ticketsSold: row.tickets,
      revenue: row.revenue,
    };
  }

  private async upcomingShows(movieId: string, now: Date): Promise<AdminMovieDetail['upcoming']> {
    const rows = await this.dataSource.query<
      {
        id: string;
        startsAt: string;
        theater: string;
        city: string;
        screen: string;
        format: ShowFormat;
        language: string;
        sold: number | null;
        held: number | null;
        capacity: number;
      }[]
    >(
      `SELECT s."id", s."startsAt", t."name" AS "theater", t."city", sc."name" AS "screen",
              s."format", s."language",
              SUM(ss."status" = 'BOOKED') AS "sold",
              SUM(ss."status" = 'HELD' AND ss."holdExpiresAt" > ?) AS "held",
              COUNT(ss."id") AS "capacity"
       FROM "shows" s
       JOIN "screens" sc ON sc."id" = s."screenId"
       JOIN "theaters" t ON t."id" = sc."theaterId"
       LEFT JOIN "show_seats" ss ON ss."showId" = s."id"
       WHERE s."movieId" = ? AND s."startsAt" > ?
       GROUP BY s."id"
       ORDER BY s."startsAt" ASC, t."name" ASC, sc."name" ASC
       LIMIT ${ADMIN_MOVIE_UPCOMING_LIMIT}`,
      [sqlTime(now), movieId, sqlTime(now)],
    );
    return rows.map((row) => ({
      ...row,
      startsAt: fromSqlTime(row.startsAt).toISOString(),
      sold: row.sold ?? 0,
      held: row.held ?? 0,
    }));
  }
}
