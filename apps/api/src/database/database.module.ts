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

  /** Reports what SQLite actually applied, rather than what was requested. */
  async onApplicationBootstrap(): Promise<void> {
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
