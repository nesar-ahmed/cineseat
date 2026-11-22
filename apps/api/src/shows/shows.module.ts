import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Booking, Movie, Screen, Seat, Show, ShowSeat } from '../database/entities';
import { AdminShowsController } from './admin-shows.controller';
import { AdminShowsService } from './admin-shows.service';
import { MovieShowtimesController, ShowsController } from './shows.controller';
import { ShowsService } from './shows.service';

/**
 * Showtimes: search, detail, seat maps; for ADMIN accounts, scheduling (one
 * show, or several dates × times at once), bulk actions and the admin panel's
 * read model (`/admin/shows`).
 */
@Module({
  imports: [TypeOrmModule.forFeature([Show, ShowSeat, Seat, Movie, Screen, Booking])],
  controllers: [ShowsController, MovieShowtimesController, AdminShowsController],
  providers: [ShowsService, AdminShowsService],
  exports: [ShowsService, AdminShowsService],
})
export class ShowsModule {}
