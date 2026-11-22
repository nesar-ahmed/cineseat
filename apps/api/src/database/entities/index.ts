/**
 * CineSeat data model (guideline section 7), mapped with TypeORM.
 * SQLite: statuses are stored as strings (validated by Zod in @cineseat/shared)
 * and money as integers (minor units). Table, index and foreign-key names match
 * the original schema, so the database looks the same to anything outside the API.
 */
import { AuditLog } from './audit-log.entity';
import { Booking } from './booking.entity';
import { BookingSeat } from './booking-seat.entity';
import { Coupon } from './coupon.entity';
import { Movie } from './movie.entity';
import { MovieGenre } from './movie-genre.entity';
import { Notification } from './notification.entity';
import { Payment } from './payment.entity';
import { Review } from './review.entity';
import { Screen } from './screen.entity';
import { Seat } from './seat.entity';
import { Show } from './show.entity';
import { ShowSeat } from './show-seat.entity';
import { Theater } from './theater.entity';
import { User } from './user.entity';
import { Wishlist } from './wishlist.entity';

export {
  AuditLog,
  Booking,
  BookingSeat,
  Coupon,
  Movie,
  MovieGenre,
  Notification,
  Payment,
  Review,
  Screen,
  Seat,
  Show,
  ShowSeat,
  Theater,
  User,
  Wishlist,
};

/** Every entity the DataSource knows about — the app, the CLI and the tests share this list. */
export const ENTITIES = [
  User,
  Movie,
  MovieGenre,
  Theater,
  Screen,
  Seat,
  Show,
  ShowSeat,
  Booking,
  BookingSeat,
  Payment,
  Coupon,
  Review,
  Wishlist,
  Notification,
  AuditLog,
];
