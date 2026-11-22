import { resolve } from 'node:path';
import type { DataSourceOptions } from 'typeorm';
import { ENTITIES } from './entities';
import { MIGRATIONS } from './migrations';

/**
 * The one place that turns configuration into TypeORM options. The Nest app,
 * the TypeORM CLI (`data-source.ts`) and the seed script all build their
 * connection here, so they always agree on the file, entities and migrations.
 */
export function buildDataSourceOptions(databasePath: string): DataSourceOptions {
  return {
    type: 'better-sqlite3',
    // Relative paths resolve against the working directory (apps/api); the
    // driver creates the parent folder on first connect.
    database: databasePath === ':memory:' ? databasePath : resolve(databasePath),
    entities: ENTITIES,
    migrations: MIGRATIONS,
    // WAL so reads are not blocked by writes (guideline section 7). TypeORM also
    // runs `PRAGMA foreign_keys = ON` on every SQLite connection it opens.
    enableWAL: true,
    // The schema only ever changes through reviewed migrations.
    synchronize: false,
    migrationsRun: false,
  };
}
