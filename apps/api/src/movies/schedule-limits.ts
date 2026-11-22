import type { EntityManager } from 'typeorm';
import type { ShowFormat } from '@cineseat/shared';
import { dateInZone, timeInZone } from '../common/time/zoned-time';
import { fromSqlTime, sqlTime } from '../database/inventory-lane';
import { TURNAROUND_MINUTES } from '../shows/pricing';

const MINUTE = 60_000;

/**
 * How far a movie can be edited without breaking the schedule it already has.
 *
 * Shows are checked against the movie when they are scheduled (format released,
 * on or after the release day, no overlap on the screen), but a show's end is
 * always derived from the movie's *current* running time. So an edit to the
 * movie can break shows that were fine when they were made:
 *
 * - removing a format that shows which have not started yet use;
 * - moving the release day past the first show that has not started;
 * - lengthening the film into the next show on a screen (plus turnaround).
 *
 * Shows that already started are history and do not limit anything, except
 * that a running show must still end before the next one on its screen starts.
 * PATCH /movies/:id enforces these limits; GET /admin/movies/:id reports them.
 */
export type ScheduleLimits = {
  /** Formats of shows that have not started, with how many shows use each. */
  formatsInUse: Map<ShowFormat, number>;
  /** Start of the first show that has not started yet. */
  firstUpcoming: Date | null;
  /** The tightest gap to a following show, or null when nothing follows any show. */
  duration: {
    maxMin: number;
    screen: string;
    theater: string;
    startsAt: Date;
    next: { title: string; startsAt: Date };
  } | null;
};

export async function scheduleLimits(
  manager: EntityManager,
  movieId: string,
  now: Date,
): Promise<ScheduleLimits> {
  const at = sqlTime(now);
  const [formats, first, gaps] = await Promise.all([
    manager.query<{ format: ShowFormat; n: number }[]>(
      `SELECT "format", COUNT(*) AS "n" FROM "shows"
       WHERE "movieId" = ? AND "startsAt" > ? GROUP BY "format"`,
      [movieId, at],
    ),
    manager.query<{ first: string | null }[]>(
      `SELECT MIN("startsAt") AS "first" FROM "shows" WHERE "movieId" = ? AND "startsAt" > ?`,
      [movieId, at],
    ),
    // Each show of this movie that could still be running (started in the last
    // day), paired with the next show on the same screen — if that one is still to come.
    manager.query<
      { startsAt: string; screen: string; theater: string; nextAt: string; nextTitle: string }[]
    >(
      `SELECT s."startsAt", sc."name" AS "screen", t."name" AS "theater",
              n."startsAt" AS "nextAt", nm."title" AS "nextTitle"
       FROM "shows" s
       JOIN "screens" sc ON sc."id" = s."screenId"
       JOIN "theaters" t ON t."id" = sc."theaterId"
       JOIN "shows" n ON n."id" = (
         SELECT x."id" FROM "shows" x
         WHERE x."screenId" = s."screenId" AND x."startsAt" > s."startsAt"
         ORDER BY x."startsAt" ASC LIMIT 1)
       JOIN "movies" nm ON nm."id" = n."movieId"
       WHERE s."movieId" = ? AND s."startsAt" > ? AND n."startsAt" > ?`,
      [movieId, sqlTime(new Date(now.getTime() - 24 * 60 * MINUTE)), at],
    ),
  ]);

  let duration: ScheduleLimits['duration'] = null;
  for (const gap of gaps) {
    const startsAt = fromSqlTime(gap.startsAt);
    const nextAt = fromSqlTime(gap.nextAt);
    const maxMin = Math.max(
      0,
      Math.floor((nextAt.getTime() - startsAt.getTime()) / MINUTE) - TURNAROUND_MINUTES,
    );
    if (!duration || maxMin < duration.maxMin) {
      duration = {
        maxMin,
        screen: gap.screen,
        theater: gap.theater,
        startsAt,
        next: { title: gap.nextTitle, startsAt: nextAt },
      };
    }
  }

  return {
    formatsInUse: new Map(formats.map((row) => [row.format, Number(row.n)])),
    firstUpcoming: first[0]?.first ? fromSqlTime(first[0].first) : null,
    duration,
  };
}

/** Field-prefixed reasons an edit would break the schedule (`field: message`), none if it fits. */
export function scheduleConflicts(
  limits: ScheduleLimits,
  change: {
    title: string;
    formats?: readonly string[];
    releaseDate?: string;
    /** Only checked when it grows: shortening a film never causes an overlap. */
    durationMin?: { from: number; to: number };
  },
  timeZone: string,
): string[] {
  const problems: string[] = [];

  if (change.formats) {
    for (const [format, shows] of limits.formatsInUse) {
      if (change.formats.includes(format)) continue;
      problems.push(
        `formats: ${shows} upcoming ${shows === 1 ? 'show is' : 'shows are'} in ${format}. Move or delete ${shows === 1 ? 'it' : 'them'} before removing ${format}.`,
      );
    }
  }

  if (change.releaseDate && limits.firstUpcoming) {
    const firstDay = dateInZone(limits.firstUpcoming, timeZone);
    if (change.releaseDate > firstDay) {
      problems.push(
        `releaseDate: “${change.title}” has a show on ${firstDay}, so it must be released on or before that day.`,
      );
    }
  }

  const limit = limits.duration;
  if (change.durationMin && limit && change.durationMin.to > change.durationMin.from) {
    if (change.durationMin.to > limit.maxMin) {
      problems.push(
        `durationMin: at most ${limit.maxMin} minutes — the show at ${timeInZone(limit.startsAt, timeZone)} on ${dateInZone(limit.startsAt, timeZone)} (${limit.theater}, ${limit.screen}) would run into “${limit.next.title}” at ${timeInZone(limit.next.startsAt, timeZone)} (with ${TURNAROUND_MINUTES} min turnaround).`,
      );
    }
  }
  return problems;
}
