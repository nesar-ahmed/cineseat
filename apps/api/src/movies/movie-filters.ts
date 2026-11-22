import { Brackets, type SelectQueryBuilder } from 'typeorm';
import type { MovieListQuery } from '@cineseat/shared';
import { dayRangeInZone } from '../common/time/zoned-time';
import type { Movie } from '../database/entities';

/**
 * The one place that turns a catalog query into SQL. GET /movies and
 * GET /catalog/facets both build on it, so a facet count always equals the
 * number of results you get by choosing that option.
 *
 * Conventions: the movie alias is `m`; options inside one list are OR-ed, lists
 * are AND-ed; text matching is case-insensitive.
 */

/** A filter group that facet counting can leave out while counting its own options. */
export type Facet =
  'status' | 'genres' | 'languages' | 'certificates' | 'formats' | 'cities' | 'theaters';

export type FilterContext = {
  /** "Upcoming" is measured from here — one clock reading per request. */
  now: Date;
  timeZone: string;
  skip?: Facet;
};

/** `LIKE` pattern for a substring, with `%`, `_` and `\` matched literally (use with `ESCAPE '\'`). */
export function containsPattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

const lower = (values: string[]) => values.map((value) => value.toLowerCase());

/**
 * Conditions on a show row aliased `s`, joined to its screen `sc` and theater `t`.
 * Only upcoming shows count: a title whose last matching show has started is no
 * longer bookable there. Returns null when no show-based filter is in play.
 *
 * COMING_SOON titles have no shows yet, so where/when/format filters rest while
 * the status filter asks for them (the web catalog behaves the same way).
 */
export function showConditions(
  query: MovieListQuery,
  ctx: FilterContext,
  options: { always?: boolean } = {},
): { sql: string; params: Record<string, unknown> } | null {
  if (query.status === 'COMING_SOON') return null;
  const clauses: string[] = [];
  const params: Record<string, unknown> = {};

  let from = ctx.now;
  if (query.date) {
    const day = dayRangeInZone(query.date, ctx.timeZone);
    if (day.start > from) from = day.start;
    clauses.push('s.startsAt < :showTo');
    params.showTo = day.end;
  }
  if (query.city && ctx.skip !== 'cities') {
    clauses.push('LOWER(t.city) = :showCity');
    params.showCity = query.city.toLowerCase();
  }
  if (query.theater.length && ctx.skip !== 'theaters') {
    clauses.push('t.id IN (:...showTheaters)');
    params.showTheaters = query.theater;
  }
  if (query.format.length && ctx.skip !== 'formats') {
    clauses.push('s.format IN (:...showFormats)');
    params.showFormats = query.format;
  }
  if (clauses.length === 0 && !options.always) return null;

  clauses.unshift('s.startsAt >= :showFrom');
  params.showFrom = from;
  return { sql: clauses.join(' AND '), params };
}

/** Adds every filter in `query` (except `ctx.skip`) to a movies query aliased `m`. */
export function applyMovieFilters(
  qb: SelectQueryBuilder<Movie>,
  query: MovieListQuery,
  ctx: FilterContext,
): SelectQueryBuilder<Movie> {
  const { skip } = ctx;

  if (query.status && skip !== 'status')
    qb.andWhere('m.status = :status', { status: query.status });

  const search = query.search?.trim();
  if (search) {
    // Title, director, cast or a genre. `cast` is a SQL keyword, hence the quotes.
    qb.andWhere(
      new Brackets((where) => {
        where
          .where(`m.title LIKE :search ESCAPE '\\'`)
          .orWhere(`m.director LIKE :search ESCAPE '\\'`)
          .orWhere(`m."cast" LIKE :search ESCAPE '\\'`)
          .orWhere(
            `EXISTS (SELECT 1 FROM movie_genres sg WHERE sg.movieId = m.id AND sg.genre LIKE :search ESCAPE '\\')`,
          );
      }),
      { search: containsPattern(search) },
    );
  }

  if (query.genre.length && skip !== 'genres') {
    qb.andWhere(
      'EXISTS (SELECT 1 FROM movie_genres fg WHERE fg.movieId = m.id AND LOWER(fg.genre) IN (:...genres))',
      { genres: lower(query.genre) },
    );
  }
  if (query.language.length && skip !== 'languages') {
    qb.andWhere('LOWER(m.language) IN (:...languages)', { languages: lower(query.language) });
  }
  if (query.certificate.length && skip !== 'certificates') {
    qb.andWhere('m.certificate IN (:...certificates)', { certificates: query.certificate });
  }
  if (query.minRating !== undefined)
    qb.andWhere('m.ratingAvg >= :minRating', { minRating: query.minRating });
  if (query.minDuration !== undefined)
    qb.andWhere('m.durationMin >= :minDuration', { minDuration: query.minDuration });
  if (query.maxDuration !== undefined)
    qb.andWhere('m.durationMin <= :maxDuration', { maxDuration: query.maxDuration });

  const shows = showConditions(query, ctx);
  if (shows) {
    qb.andWhere(
      `EXISTS (SELECT 1 FROM shows s
        INNER JOIN screens sc ON sc.id = s.screenId
        INNER JOIN theaters t ON t.id = sc.theaterId
        WHERE s.movieId = m.id AND ${shows.sql})`,
      shows.params,
    );
  }
  return qb;
}

/** ORDER BY for a sort key. Every order ends on the id, so pages never overlap. */
export function applyMovieSort(
  qb: SelectQueryBuilder<Movie>,
  query: MovieListQuery,
): SelectQueryBuilder<Movie> {
  switch (query.sort) {
    case 'rating':
      qb.orderBy('m.ratingAvg', 'DESC', 'NULLS LAST').addOrderBy('m.ratingCount', 'DESC');
      break;
    case 'release':
      // Newest first for what is out; soonest first for what is coming.
      qb.orderBy('m.releaseDate', query.status === 'COMING_SOON' ? 'ASC' : 'DESC');
      break;
    case 'title':
      qb.orderBy('m.title COLLATE NOCASE', 'ASC');
      break;
    case 'runtime':
      qb.orderBy('m.durationMin', 'ASC');
      break;
    default:
      qb.orderBy('m.popularity', 'DESC').addOrderBy('m.ratingAvg', 'DESC', 'NULLS LAST');
  }
  return qb.addOrderBy('m.title', 'ASC').addOrderBy('m.id', 'ASC');
}
