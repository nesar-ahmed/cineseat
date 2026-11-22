import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { databasePathFromEnv } from '../config/env';
import { buildDataSourceOptions } from './typeorm.options';

/**
 * Entry point for the TypeORM CLI (`npm run db:migrate`, `db:migrate:revert`,
 * `db:migration:generate`). The running API does not import this file; it
 * builds the same options through DatabaseModule.
 */
export default new DataSource(buildDataSourceOptions(databasePathFromEnv()));
