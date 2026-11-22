import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { BookingsModule } from './bookings/bookings.module';
import { CatalogModule } from './catalog/catalog.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { HoldsModule } from './holds/holds.module';
import { InvoicesModule } from './invoices/invoices.module';
import { MockGatewayModule } from './mock-gateway/mock-gateway.module';
import { MoviesModule } from './movies/movies.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PaymentsModule } from './payments/payments.module';
import { ShowsModule } from './shows/shows.module';
import { TheatersModule } from './theaters/theaters.module';
import { UsersModule } from './users/users.module';
import { validateEnv } from './config/env';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [validateEnv],
      envFilePath: ['.env'],
    }),
    // Broad default so no route is wide open; auth routes override it with a
    // tighter per-route limit (guideline 13: rate limit login).
    ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 100 }] }),
    // Background jobs (lapsed seat holds now; reminders later).
    ScheduleModule.forRoot(),
    DatabaseModule,
    HealthModule,
    AuthModule,
    UsersModule,
    MoviesModule,
    CatalogModule,
    TheatersModule,
    ShowsModule,
    HoldsModule,
    BookingsModule,
    InvoicesModule,
    PaymentsModule,
    NotificationsModule,
    AdminModule,
    // TEST MODE payment provider: no real money moves. The only provider there is.
    MockGatewayModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}

export { ConfigService } from '@nestjs/config';
