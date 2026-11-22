import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import {
  Certificate,
  MovieSort,
  MovieStatus,
  SCHEDULE_DAYS,
  ShowFormat,
  type CatalogFacets,
  type CatalogFilters,
  type FacetOption,
  type MovieListQuery,
} from '@cineseat/shared';
import { addDays, dateInZone } from '../common/time/zoned-time';
import { Movie, MovieGenre, Theater } from '../database/entities';
import {
  applyMovieFilters,
  showConditions,
  type Facet,
  type FilterContext,
} from '../movies/movie-filters';

const STATUS_LABEL: Record<MovieStatus, string> = {
  NOW_SHOWING: 'Now showing',
  COMING_SOON: 'Coming soon',
};
const CERTIFICATE_LABEL: Record<Certificate, string> = {
  U: 'Universal — all ages',
  'U/A': 'Parental guidance under 12',
  A: 'Adults only (18+)',
};
const SORT_LABEL: Record<MovieSort, string> = {
  popular: 'Popularity',
  rating: 'Top rated',
  release: 'Release date',
  title: 'Title A–Z',
  runtime: 'Shortest first',
};

type Vocabulary = {
  genres: string[];
  languages: string[];
  cities: string[];
  theaters: { id: string; name: string; city: string }[];
};

/**
 * Discovery metadata around GET /movies: the filter vocabulary, and facet counts
 * for a query. Counting reuses the movies filter code, so the numbers always
 * agree with the results.
 */
@Injectable()
export class CatalogService {
  constructor(
    @InjectRepository(Movie) private readonly movies: Repository<Movie>,
    @InjectRepository(MovieGenre) private readonly genreLinks: Repository<MovieGenre>,
    @InjectRepository(Theater) private readonly theaters: Repository<Theater>,
    private readonly config: ConfigService,
  ) {}

  private get timeZone(): string {
    return this.config.getOrThrow<string>('timeZone');
  }

  async filters(now: Date = new Date()): Promise<CatalogFilters> {
    const vocabulary = await this.vocabulary();
    const today = dateInZone(now, this.timeZone);
    return {
      timeZone: this.timeZone,
      dates: Array.from({ length: SCHEDULE_DAYS }, (_, offset) => addDays(today, offset)),
      status: MovieStatus.options.map((value) => ({ value, label: STATUS_LABEL[value] })),
      genres: vocabulary.genres,
      languages: vocabulary.languages,
      certificates: Certificate.options.map((value) => ({
        value,
        label: CERTIFICATE_LABEL[value],
      })),
      formats: [...ShowFormat.options],
      cities: vocabulary.cities,
      theaters: vocabulary.theaters,
      sorts: MovieSort.options.map((value) => ({ value, label: SORT_LABEL[value] })),
    };
  }

  /**
   * For every option of every filter: how many results the query would have with
   * that option chosen (its own filter group swapped for just that option, all
   * other filters kept). Options with no results are listed with a zero.
   */
  async facets(query: MovieListQuery, now: Date = new Date()): Promise<CatalogFacets> {
    const ctx: FilterContext = { now, timeZone: this.timeZone };
    const vocabulary = await this.vocabulary();

    const count = (q: MovieListQuery) =>
      applyMovieFilters(this.movies.createQueryBuilder('m'), q, ctx).getCount();

    const [total, statusCounts, genres, languages, certificates, formats, cities, theaters] =
      await Promise.all([
        count(query),
        Promise.all(MovieStatus.options.map((status) => count({ ...query, status }))),
        this.grouped(query, { ...ctx, skip: 'genres' }, 'genres'),
        this.grouped(query, { ...ctx, skip: 'languages' }, 'languages'),
        this.grouped(query, { ...ctx, skip: 'certificates' }, 'certificates'),
        this.groupedByShow(query, { ...ctx, skip: 'formats' }, 's.format'),
        this.groupedByShow(query, { ...ctx, skip: 'cities' }, 't.city'),
        this.groupedByShow(query, { ...ctx, skip: 'theaters' }, 't.id'),
      ]);

    // `null` counts: the filter rests for this query, so every option keeps the total.
    const countOf = (counts: Map<string, number> | null, value: string) =>
      counts === null ? total : (counts.get(value.toLowerCase()) ?? 0);
    const fill = (
      values: string[],
      counts: Map<string, number> | null,
      label = (value: string) => value,
    ): FacetOption[] =>
      values.map((value) => ({ value, label: label(value), count: countOf(counts, value) }));

    return {
      total,
      status: MovieStatus.options.map((value, index) => ({
        value,
        label: STATUS_LABEL[value],
        count: statusCounts[index],
      })),
      genres: fill(vocabulary.genres, genres),
      languages: fill(vocabulary.languages, languages),
      certificates: fill(
        [...Certificate.options],
        certificates,
        (value) => CERTIFICATE_LABEL[value as Certificate],
      ),
      formats: fill([...ShowFormat.options], formats),
      cities: fill(vocabulary.cities, cities),
      theaters: vocabulary.theaters.map((theater) => ({
        value: theater.id,
        label: theater.name,
        city: theater.city,
        count: countOf(theaters, theater.id),
      })),
    };
  }

  /** Counts per genre / language / certificate, keyed by lower-cased value. */
  private async grouped(
    query: MovieListQuery,
    ctx: FilterContext,
    facet: Extract<Facet, 'genres' | 'languages' | 'certificates'>,
  ): Promise<Map<string, number>> {
    const qb = applyMovieFilters(this.movies.createQueryBuilder('m'), query, ctx);
    if (facet === 'genres')
      qb.innerJoin(MovieGenre, 'g', 'g.movieId = m.id')
        .select('g.genre', 'value')
        .groupBy('g.genre');
    else if (facet === 'languages') qb.select('m.language', 'value').groupBy('m.language');
    else qb.select('m.certificate', 'value').groupBy('m.certificate');
    const rows = await qb
      .addSelect('COUNT(DISTINCT m.id)', 'count')
      .getRawMany<{ value: string; count: number }>();
    const counts = new Map<string, number>();
    for (const row of rows) {
      const key = row.value.toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + Number(row.count));
    }
    return counts;
  }

  /**
   * Counts per show format / city / theater: titles with an upcoming show that
   * matches the option and every other where/when filter. Returns null for
   * COMING_SOON queries — those titles have no shows and these filters rest.
   */
  private async groupedByShow(
    query: MovieListQuery,
    ctx: FilterContext,
    column: string,
  ): Promise<Map<string, number> | null> {
    const shows = showConditions(query, ctx, { always: true });
    if (!shows) return null;
    const rows = await applyMovieFilters(this.movies.createQueryBuilder('m'), query, ctx)
      .innerJoin('shows', 's', `s.movieId = m.id AND ${shows.sql}`, shows.params)
      .innerJoin('screens', 'sc', 'sc.id = s.screenId')
      .innerJoin('theaters', 't', 't.id = sc.theaterId')
      .select(column, 'value')
      .addSelect('COUNT(DISTINCT m.id)', 'count')
      .groupBy(column)
      .getRawMany<{ value: string; count: number }>();
    return new Map(rows.map((row) => [row.value.toLowerCase(), Number(row.count)]));
  }

  private async vocabulary(): Promise<Vocabulary> {
    const [genreRows, languageRows, theaters] = await Promise.all([
      this.genreLinks
        .createQueryBuilder('g')
        .select('DISTINCT g.genre', 'genre')
        .orderBy('g.genre', 'ASC')
        .getRawMany<{ genre: string }>(),
      this.movies
        .createQueryBuilder('m')
        .select('DISTINCT m.language', 'language')
        .orderBy('m.language', 'ASC')
        .getRawMany<{ language: string }>(),
      this.theaters.find({ order: { city: 'ASC', name: 'ASC' } }),
    ]);
    return {
      genres: genreRows.map((row) => row.genre),
      languages: languageRows.map((row) => row.language),
      cities: Array.from(new Set(theaters.map((theater) => theater.city))),
      theaters: theaters.map((theater) => ({
        id: theater.id,
        name: theater.name,
        city: theater.city,
      })),
    };
  }
}
