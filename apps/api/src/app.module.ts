import { ConfigModule, ConfigService } from '@nestjs/config';
import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './modules/health/health.module';
import { validateEnv } from './config/env';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [validateEnv],
      envFilePath: ['.env'],
    }),
    DatabaseModule,
    HealthModule,
  ],
})
export class AppModule {}

export { ConfigService };
