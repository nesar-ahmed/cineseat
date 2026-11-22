import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Screen, Seat, Show, Theater } from '../database/entities';
import { ShowsModule } from '../shows/shows.module';
import { AdminTheatersController } from './admin-theaters.controller';
import { AdminTheatersService } from './admin-theaters.service';
import { ScreensController, TheatersController } from './theaters.controller';
import { TheatersService } from './theaters.service';

/**
 * Cinemas and their screens: venue data and seat layouts; for ADMIN accounts,
 * editing and the admin panel's read model (`/admin/theaters`, which lists a
 * cinema's next shows through the shows read model).
 */
@Module({
  imports: [TypeOrmModule.forFeature([Theater, Screen, Seat, Show]), ShowsModule],
  controllers: [TheatersController, ScreensController, AdminTheatersController],
  providers: [TheatersService, AdminTheatersService],
  exports: [TheatersService],
})
export class TheatersModule {}
