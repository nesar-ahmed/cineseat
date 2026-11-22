import { QueryFailedError } from 'typeorm';

/** The driver error TypeORM wraps: better-sqlite3 sets `code`, e.g. `SQLITE_CONSTRAINT_UNIQUE`. */
export function databaseErrorCode(error: unknown): string | undefined {
  if (!(error instanceof QueryFailedError)) return undefined;
  const code = (error.driverError as { code?: unknown } | undefined)?.code;
  return typeof code === 'string' ? code : undefined;
}

/** A write lost against a unique index or primary key (SQLite, and PostgreSQL's 23505). */
export function isUniqueViolation(error: unknown): boolean {
  const code = databaseErrorCode(error);
  return (
    code === 'SQLITE_CONSTRAINT_UNIQUE' ||
    code === 'SQLITE_CONSTRAINT_PRIMARYKEY' ||
    code === '23505'
  );
}

/** Any other constraint the database enforced: foreign key, NOT NULL, CHECK. */
export function isConstraintViolation(error: unknown): boolean {
  const code = databaseErrorCode(error);
  return code !== undefined && (code.startsWith('SQLITE_CONSTRAINT') || code.startsWith('23'));
}
