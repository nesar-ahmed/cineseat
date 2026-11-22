import type { MigrationInterface, QueryRunner } from 'typeorm';

const NEW_MOVIE_COLUMNS = [
  `"tagline" text`,
  `"certificate" text NOT NULL DEFAULT ('U')`,
  `"formats" text NOT NULL DEFAULT ('2D')`,
  `"director" text`,
  `"cast" text NOT NULL DEFAULT ('[]')`,
  `"ratingAvg" real`,
  `"ratingCount" integer NOT NULL DEFAULT (0)`,
  `"interestCount" integer NOT NULL DEFAULT (0)`,
  `"popularity" integer NOT NULL DEFAULT (0)`,
];

/**
 * Catalog fields for movies (tagline, certificate, formats, credits and the
 * audience counters) and a `movie_genres` table for multi-genre titles. Existing
 * movies keep their single genre as their primary genre.
 */
export class MovieCatalog1794305750228 implements MigrationInterface {
  name = 'MovieCatalog1794305750228';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Plain ADD COLUMN (every new column is nullable or has a default), so the
    // movies table is not rebuilt and its foreign keys stay untouched.
    for (const column of NEW_MOVIE_COLUMNS) {
      await queryRunner.query(`ALTER TABLE "movies" ADD COLUMN ${column}`);
    }
    await queryRunner.query(`
      CREATE TABLE "movie_genres" (
        "movieId" varchar NOT NULL,
        "genre" text NOT NULL,
        "position" integer NOT NULL DEFAULT (0),
        CONSTRAINT "movie_genres_movieId_fkey" FOREIGN KEY ("movieId") REFERENCES "movies" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        PRIMARY KEY ("movieId", "genre")
      )
    `);
    await queryRunner.query(`CREATE INDEX "movie_genres_genre_idx" ON "movie_genres" ("genre")`);
    await queryRunner.query(
      `INSERT INTO "movie_genres" ("movieId", "genre", "position") SELECT "id", "genre", 0 FROM "movies"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "movie_genres"`);
    for (const column of [...NEW_MOVIE_COLUMNS].reverse()) {
      const name = column.slice(0, column.indexOf(' '));
      await queryRunner.query(`ALTER TABLE "movies" DROP COLUMN ${name}`);
    }
  }
}
