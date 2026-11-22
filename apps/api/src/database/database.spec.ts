import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { isConstraintViolation, isUniqueViolation } from './database-errors';
import { Screen, Theater, User } from './entities';
import { buildDataSourceOptions } from './typeorm.options';

/** Real SQLite file in a temp folder: the same options, entities and migrations as the app. */
describe('database (SQLite + migrations)', () => {
  let dir: string;
  let dataSource: DataSource;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'cineseat-db-'));
    dataSource = await new DataSource(buildDataSourceOptions(join(dir, 'test.db'))).initialize();
    await dataSource.runMigrations();
  });

  afterAll(async () => {
    await dataSource?.destroy();
    rmSync(dir, { recursive: true, force: true });
  });

  it('migrations build exactly the schema the entities describe (no drift)', async () => {
    const pending = await dataSource.driver.createSchemaBuilder().log();
    expect(pending.upQueries.map((query) => query.query)).toEqual([]);
  });

  it('runs in WAL mode with foreign keys enforced', async () => {
    await expect(dataSource.query('PRAGMA journal_mode')).resolves.toEqual([
      { journal_mode: 'wal' },
    ]);
    await expect(dataSource.query('PRAGMA foreign_keys')).resolves.toEqual([{ foreign_keys: 1 }]);
  });

  it('applies column defaults and timestamps on insert', async () => {
    const users = dataSource.getRepository(User);
    const saved = await users.save(
      users.create({ email: 'defaults@cineseat.dev', name: 'Defaults', passwordHash: 'x' }),
    );
    expect(saved.role).toBe('USER');
    expect(saved.createdAt).toBeInstanceOf(Date);
    expect(saved.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('reports a second row for the same email as a unique violation', async () => {
    const users = dataSource.getRepository(User);
    await users.insert({ email: 'twice@cineseat.dev', name: 'First', passwordHash: 'x' });
    const error = await users
      .insert({ email: 'twice@cineseat.dev', name: 'Second', passwordHash: 'x' })
      .catch((e: unknown) => e);
    expect(isUniqueViolation(error)).toBe(true);
    expect(isConstraintViolation(error)).toBe(true);
  });

  it('rejects a dangling foreign key, and cascades deletes like the original schema', async () => {
    const screens = dataSource.getRepository(Screen);
    const dangling = await screens
      .insert({ theaterId: 'no-such-theater', name: 'Ghost', rows: 1, cols: 1 })
      .catch((e: unknown) => e);
    expect(isConstraintViolation(dangling)).toBe(true);
    expect(isUniqueViolation(dangling)).toBe(false);

    const theater = await dataSource
      .getRepository(Theater)
      .save({ name: 'T', city: 'Dhaka', address: 'A' });
    await screens.insert({ theaterId: theater.id, name: 'S1', rows: 1, cols: 1 });
    await dataSource.getRepository(Theater).delete({ id: theater.id });
    await expect(screens.countBy({ theaterId: theater.id })).resolves.toBe(0);
  });
});
