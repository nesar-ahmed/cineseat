import { ConflictException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { DataSource, In, type EntityManager, type Repository } from 'typeorm';
import type {
  BulkMovieActionInput,
  BulkMovieResult,
  Certificate,
  CreateMovieInput,
  Movie as MovieDto,
  MovieListQuery,
  MovieStatus,
  Paginated,
  ShowFormat,
  UpdateMovieInput,
} from '@cineseat/shared';
import { recordChange } from '../common/audit/audit-log';
import { httpMessage } from '../common/http/http-message';
import { dateInZone, startOfDayInZone } from '../common/time/zoned-time';
import { Movie, MovieGenre, Show } from '../database/entities';
import { UPLOAD_URL_PREFIX } from '../users/avatar.storage';
import { applyMovieFilters, applyMovieSort } from './movie-filters';
import { POSTER_SUBFOLDER } from './poster.storage';
import { scheduleConflicts, scheduleLimits } from './schedule-limits';

/** Why a movie with shows cannot be deleted — the same words for the API error and the admin panel. */
export function deleteBlockedReason(title: string, shows: number): string {
  return `“${title}” has ${shows} scheduled ${shows === 1 ? 'show' : 'shows'}. Remove them before deleting the movie.`;
}

/** Whether a PATCH value differs from what the movie has (format order does not matter). */
function differs(key: keyof UpdateMovieInput, before: unknown, after: unknown): boolean {
  if (key === 'formats' && Array.isArray(before) && Array.isArray(after))
    return [...before].sort().join() !== [...after].sort().join();
  return JSON.stringify(before ?? null) !== JSON.stringify(after ?? null);
}

@Injectable()
export class MoviesService {
  constructor(
    @InjectRepository(Movie) private readonly movies: Repository<Movie>,
    @InjectRepository(MovieGenre) private readonly genreLinks: Repository<MovieGenre>,
    @InjectRepository(Show) private readonly shows: Repository<Show>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  private get timeZone(): string {
    return this.config.getOrThrow<string>('timeZone');
  }

  /** Public search: filters, sort and a page of results. */
  async list(query: MovieListQuery, now: Date = new Date()): Promise<Paginated<MovieDto>> {
    const qb = applyMovieSort(
      applyMovieFilters(this.movies.createQueryBuilder('m'), query, {
        now,
        timeZone: this.timeZone,
      }),
      query,
    )
      .offset((query.page - 1) * query.pageSize)
      .limit(query.pageSize);
    const [rows, total] = await qb.getManyAndCount();
    return { items: await this.toDtos(rows), total, page: query.page, pageSize: query.pageSize };
  }

  async findOne(id: string): Promise<MovieDto> {
    const [dto] = await this.toDtos([await this.findEntity(id)]);
    return dto;
  }

  /** Several movies in the API shape, in the order of `ids` (unknown ids are skipped). */
  async findMany(ids: string[]): Promise<MovieDto[]> {
    if (ids.length === 0) return [];
    const rows = await this.movies.find({ where: { id: In(ids) } });
    const order = new Map(ids.map((id, index) => [id, index]));
    rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    return this.toDtos(rows);
  }

  async create(
    input: CreateMovieInput,
    actorId: string,
    now: Date = new Date(),
  ): Promise<MovieDto> {
    const id = await this.dataSource.transaction(async (tx) => {
      const movie = await tx.save(
        tx.create(Movie, {
          title: input.title,
          tagline: input.tagline,
          description: input.description,
          genre: input.genres[0],
          language: input.language,
          durationMin: input.durationMin,
          releaseDate: startOfDayInZone(input.releaseDate, this.timeZone),
          certificate: input.certificate,
          formats: input.formats,
          director: input.director,
          cast: input.cast,
          trailerUrl: input.trailerUrl,
          status: input.status,
        }),
      );
      await this.replaceGenres(tx, movie.id, input.genres);
      await recordChange(tx, {
        actorId,
        entity: 'movies',
        entityId: movie.id,
        verb: 'create',
        subject: movie.title,
        now,
      });
      return movie.id;
    });
    return this.findOne(id);
  }

  /**
   * Only the fields present in `input` change (PATCH semantics), and only those
   * that differ are written and audited — sending the form back unchanged is a
   * no-op. Edits that would break the movie's schedule are refused with 409
   * (see `schedule-limits.ts`).
   */
  async update(
    id: string,
    input: UpdateMovieInput,
    actorId: string,
    now: Date = new Date(),
  ): Promise<MovieDto> {
    const before = await this.findOne(id);
    const changed = (Object.keys(input) as (keyof UpdateMovieInput)[]).filter(
      (key) => input[key] !== undefined && differs(key, before[key], input[key]),
    );
    if (changed.length === 0) return before;
    const has = (key: keyof UpdateMovieInput) => changed.includes(key);

    if (has('formats') || has('releaseDate') || has('durationMin')) {
      const problems = scheduleConflicts(
        await scheduleLimits(this.dataSource.manager, id, now),
        {
          title: input.title ?? before.title,
          formats: has('formats') ? input.formats : undefined,
          releaseDate: has('releaseDate') ? input.releaseDate : undefined,
          durationMin: has('durationMin')
            ? { from: before.durationMin, to: input.durationMin! }
            : undefined,
        },
        this.timeZone,
      );
      if (problems.length > 0) {
        throw new ConflictException({
          statusCode: 409,
          error: 'Conflict',
          message: problems.length === 1 ? problems[0] : problems,
        });
      }
    }

    await this.dataSource.transaction(async (tx) => {
      const changes: Partial<Movie> = {};
      for (const key of changed) {
        if (key === 'genres') {
          changes.genre = input.genres![0];
          await this.replaceGenres(tx, id, input.genres!);
        } else if (key === 'releaseDate') {
          changes.releaseDate = startOfDayInZone(input.releaseDate!, this.timeZone);
        } else {
          Object.assign(changes, { [key]: input[key] });
        }
      }
      await tx.update(Movie, { id }, changes);
      await recordChange(tx, {
        actorId,
        entity: 'movies',
        entityId: id,
        verb: 'update',
        fields: changed,
        subject: input.title ?? before.title,
        now,
      });
    });
    return this.findOne(id);
  }

  /**
   * Deleting a title would cascade to its shows and their seat maps (and fail on
   * shows that already have bookings), so a movie with shows cannot be deleted.
   */
  async remove(id: string, actorId: string, now: Date = new Date()): Promise<void> {
    const movie = await this.findEntity(id);
    const scheduled = await this.shows.count({ where: { movieId: id } });
    if (scheduled > 0) throw new ConflictException(deleteBlockedReason(movie.title, scheduled));
    await this.dataSource.transaction(async (tx) => {
      await tx.delete(Movie, { id });
      await recordChange(tx, {
        actorId,
        entity: 'movies',
        entityId: id,
        verb: 'delete',
        subject: movie.title,
        now,
      });
    });
    await this.removeStoredPoster(movie.posterPath);
  }

  /** Points the movie at a freshly uploaded poster and deletes the previous file. */
  async setPoster(
    id: string,
    filename: string,
    actorId: string,
    now: Date = new Date(),
  ): Promise<MovieDto> {
    const posterPath = `${UPLOAD_URL_PREFIX}/${POSTER_SUBFOLDER}/${filename}`;
    const movie = await this.movies.findOne({ where: { id } });
    if (!movie) {
      // Multer already wrote the file; do not leave an orphan behind.
      await this.removeStoredPoster(posterPath);
      throw new NotFoundException('Movie not found');
    }
    await this.dataSource.transaction(async (tx) => {
      await tx.update(Movie, { id }, { posterPath });
      await recordChange(tx, {
        actorId,
        entity: 'movies',
        entityId: id,
        verb: 'poster',
        subject: movie.title,
        now,
      });
    });
    await this.removeStoredPoster(movie.posterPath);
    return this.findOne(id);
  }

  /** Takes the poster down (the site falls back to generated art) and deletes its file. */
  async removePoster(id: string, actorId: string, now: Date = new Date()): Promise<MovieDto> {
    const movie = await this.findEntity(id);
    if (movie.posterPath === null) return this.findOne(id);
    await this.dataSource.transaction(async (tx) => {
      await tx.update(Movie, { id }, { posterPath: null });
      await recordChange(tx, {
        actorId,
        entity: 'movies',
        entityId: id,
        verb: 'poster.remove',
        subject: movie.title,
        now,
      });
    });
    await this.removeStoredPoster(movie.posterPath);
    return this.findOne(id);
  }

  /**
   * One action on several movies. Each movie goes through the same path as a
   * single edit or delete (rules, audit), one after the other, and succeeds or
   * fails on its own: a movie with shows is reported, the others are deleted.
   */
  async bulk(
    input: BulkMovieActionInput,
    actorId: string,
    now: Date = new Date(),
  ): Promise<BulkMovieResult> {
    const found = await this.movies.find({
      where: { id: In(input.ids) },
      select: { id: true, title: true, status: true },
    });
    const byId = new Map(found.map((movie) => [movie.id, movie]));
    const result: BulkMovieResult = { succeeded: [], failed: [] };

    for (const id of input.ids) {
      const movie = byId.get(id);
      if (!movie) {
        result.failed.push({ id, title: null, message: 'Movie not found' });
        continue;
      }
      try {
        if (input.action === 'status') {
          await this.update(id, { status: input.status }, actorId, now);
        } else {
          await this.remove(id, actorId, now);
        }
        result.succeeded.push(id);
      } catch (error) {
        if (!(error instanceof HttpException)) throw error;
        result.failed.push({ id, title: movie.title, message: httpMessage(error) });
      }
    }
    return result;
  }

  private async findEntity(id: string): Promise<Movie> {
    const movie = await this.movies.findOne({ where: { id } });
    if (!movie) throw new NotFoundException('Movie not found');
    return movie;
  }

  private async replaceGenres(tx: EntityManager, movieId: string, genres: string[]): Promise<void> {
    await tx.delete(MovieGenre, { movieId });
    await tx.insert(
      MovieGenre,
      genres.map((genre, position) => ({ movieId, genre, position })),
    );
  }

  /** Rows → API shape. Genres for the whole page come from one query. */
  private async toDtos(rows: Movie[]): Promise<MovieDto[]> {
    if (rows.length === 0) return [];
    const links = await this.genreLinks.find({
      where: { movieId: In(rows.map((row) => row.id)) },
      order: { position: 'ASC' },
    });
    const genresOf = new Map<string, string[]>();
    for (const link of links)
      genresOf.set(link.movieId, [...(genresOf.get(link.movieId) ?? []), link.genre]);

    return rows.map((row) => {
      const genres = genresOf.get(row.id) ?? [row.genre];
      return {
        id: row.id,
        title: row.title,
        tagline: row.tagline,
        description: row.description,
        genre: genres[0],
        genres,
        language: row.language,
        durationMin: row.durationMin,
        releaseDate: dateInZone(row.releaseDate, this.timeZone),
        certificate: row.certificate as Certificate,
        formats: row.formats as ShowFormat[],
        director: row.director,
        cast: row.cast,
        posterPath: row.posterPath,
        trailerUrl: row.trailerUrl,
        status: row.status as MovieStatus,
        rating: row.ratingAvg === null ? null : Math.round(row.ratingAvg * 10) / 10,
        votes: row.ratingCount,
        interested: row.interestCount,
        popularity: row.popularity,
      };
    });
  }

  /** Only deletes files we generated under `<UPLOAD_DIR>/posters`, never arbitrary paths. */
  private async removeStoredPoster(publicPath: string | null): Promise<void> {
    const prefix = `${UPLOAD_URL_PREFIX}/${POSTER_SUBFOLDER}/`;
    if (!publicPath?.startsWith(prefix)) return;
    const root = join(resolve(this.config.getOrThrow<string>('uploadDir')), POSTER_SUBFOLDER);
    const candidate = join(root, publicPath.slice(prefix.length));
    if (!candidate.startsWith(`${root}/`)) return;
    try {
      await unlink(candidate);
    } catch {
      // Already gone — nothing to clean up.
    }
  }
}
