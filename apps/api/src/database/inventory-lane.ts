import { ServiceUnavailableException } from '@nestjs/common';
import type { DataSource } from 'typeorm';

/** The part of better-sqlite3 the lane uses (the driver ships no types). */
interface Statement {
  all(...params: SqlValue[]): unknown[];
  get(...params: SqlValue[]): unknown;
  run(...params: SqlValue[]): { changes: number };
}
interface Database {
  inTransaction: boolean;
  prepare(sql: string): Statement;
  transaction<T>(fn: () => T): { immediate(): T };
}

export type SqlValue = string | number | bigint | null;

/** What a unit of work can do: synchronous SQL on the lane's transaction. */
export interface InventoryTx {
  all<T>(sql: string, ...params: SqlValue[]): T[];
  get<T>(sql: string, ...params: SqlValue[]): T | undefined;
  /** Returns the number of rows changed. */
  run(sql: string, ...params: SqlValue[]): number;
}

/** How long a unit waits for someone else's transaction to finish before giving up. */
const MAX_WAIT_MS = 5_000;

/**
 * The one way seat inventory changes (holds now, bookings and refunds later):
 * each unit of work runs as a single synchronous SQLite transaction.
 *
 * Why not `DataSource.transaction()`: TypeORM keeps one query runner per SQLite
 * connection, so its transactions are shared with every request running at the
 * same moment — a concurrent statement lands inside them, a second transaction
 * nests as a savepoint, and a rollback in either undoes the other's work. For
 * seats that is a double booking waiting to happen. A second connection does
 * not help either: its lock waits block Node's only thread while the holder
 * needs that thread to finish.
 *
 * So a unit waits (without blocking) until no transaction is open on the
 * connection, then runs start to finish with no `await` in between: BEGIN
 * IMMEDIATE, its statements, COMMIT — or ROLLBACK if it throws. Nothing else can
 * run in the middle, and nothing it reads can change before it commits.
 *
 * Units use plain SQL, with times as `sqlTime()` strings (the format TypeORM
 * stores). On PostgreSQL this class would become a transaction with row locks.
 */
export class InventoryLane {
  private readonly db: Database;
  private readonly statements = new Map<string, Statement>();

  constructor(dataSource: DataSource) {
    this.db = (dataSource.driver as unknown as { databaseConnection: Database }).databaseConnection;
  }

  /** Runs `work` as one transaction: committed if it returns, rolled back if it throws. */
  async run<T>(work: (tx: InventoryTx) => T): Promise<T> {
    const started = Date.now();
    // A TypeORM transaction (an admin edit, a signup) may be mid-flight on this
    // connection; joining it would make our writes part of it. Wait it out.
    while (this.db.inTransaction) {
      if (Date.now() - started > MAX_WAIT_MS) {
        throw new ServiceUnavailableException('The box office is busy. Please try again.');
      }
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    // From here to the end of `immediate()` nothing else can run on this thread.
    return this.db.transaction(() => work(this.tx)).immediate();
  }

  private readonly tx: InventoryTx = {
    all: <T>(sql: string, ...params: SqlValue[]) => this.statement(sql).all(...params) as T[],
    get: <T>(sql: string, ...params: SqlValue[]) =>
      this.statement(sql).get(...params) as T | undefined,
    run: (sql: string, ...params: SqlValue[]) => this.statement(sql).run(...params).changes,
  };

  private statement(sql: string): Statement {
    let statement = this.statements.get(sql);
    if (!statement) {
      statement = this.db.prepare(sql);
      this.statements.set(sql, statement);
    }
    return statement;
  }
}

/** A Date as TypeORM stores `datetime` columns in SQLite: UTC, `YYYY-MM-DD HH:MM:SS.mmm`. */
export function sqlTime(date: Date): string {
  return date.toISOString().replace('T', ' ').replace('Z', '');
}

/** The reverse of `sqlTime` (also accepts SQLite's own `datetime('now')` without milliseconds). */
export function fromSqlTime(value: string): Date {
  return new Date(`${value.replace(' ', 'T')}Z`);
}

/** `?, ?, ?` for an IN list. */
export function placeholders(count: number): string {
  return Array.from({ length: count }, () => '?').join(', ');
}
