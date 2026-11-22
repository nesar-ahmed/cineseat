import { Global, Logger, Module, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { InventoryLane } from './inventory-lane';
import { buildDataSourceOptions } from './typeorm.options';

/**
 * The single SQLite connection for the whole app. Feature modules ask for
 * repositories with `TypeOrmModule.forFeature([...])`; `DataSource` itself is
 * injectable everywhere for raw queries. Seat inventory changes only through
 * `InventoryLane`, which runs each change as one isolated transaction.
 */
@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        buildDataSourceOptions(config.getOrThrow<string>('databasePath')),
    }),
  ],
  providers: [
    {
      provide: InventoryLane,
      inject: [DataSource],
      useFactory: (dataSource: DataSource) => new InventoryLane(dataSource),
    },
  ],
  exports: [InventoryLane],
})
export class DatabaseModule implements OnApplicationBootstrap {
  private readonly logger = new Logger('Database');

  constructor(private readonly dataSource: DataSource) {}

  /**
   * Brings the file up to the current schema before the app serves traffic, then
   * reports what SQLite actually applied. Without this a fresh checkout (or a
   * database file deleted by hand) starts happily and then fails every query
   * with "no such table" — including the background jobs. Only the reviewed
   * migrations registered in `migrations/index.ts` run; `synchronize` stays off.
   */
  async onApplicationBootstrap(): Promise<void> {
    const applied = await this.dataSource.runMigrations({ transaction: 'each' });
    if (applied.length > 0) {
      this.logger.log(
        `Applied ${applied.length} pending migration(s): ${applied
          .map((migration) => migration.name)
          .join(', ')}`,
      );
    }

    const [{ count }] = (await this.dataSource.query(
      'SELECT COUNT(*) AS "count" FROM "users"',
    )) as { count: number }[];
    if (Number(count) === 0) {
      this.logger.warn(
        'No accounts yet — run `npm run db:seed` to load the demo catalog and logins.',
      );
    }

    const [{ journal_mode: journalMode }] = (await this.dataSource.query(
      'PRAGMA journal_mode',
    )) as {
      journal_mode: string;
    }[];
    const [{ foreign_keys: foreignKeys }] = (await this.dataSource.query(
      'PRAGMA foreign_keys',
    )) as {
      foreign_keys: number;
    }[];
    this.logger.log(
      `Connected to SQLite (journal_mode=${journalMode}, foreign_keys=${foreignKeys ? 'on' : 'off'})`,
    );
  }
}
