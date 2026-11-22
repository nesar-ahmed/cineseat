import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { Booking } from './booking.entity';
import { ShowSeat } from './show-seat.entity';

@Entity('booking_seats')
@Index('booking_seats_bookingId_idx', ['bookingId'])
// One seat, one buyer: a show seat is in at most one live booking. Rows of a
// booking that failed (or, later, was cancelled) are released, not deleted, so
// the booking keeps its seat history while the seat goes back on sale.
@Index('booking_seats_showSeatId_live_key', ['showSeatId'], {
  unique: true,
  where: '"releasedAt" IS NULL',
})
export class BookingSeat {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  bookingId: string;

  @Column('text')
  showSeatId: string;

  /** Minor units. */
  @Column('integer')
  price: number;

  /** When the seat stopped belonging to this booking (hold lost, payment failed); null while live. */
  @Column('datetime', { nullable: true })
  releasedAt: Date | null;

  @ManyToOne(() => Booking, (booking) => booking.seats, {
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({ name: 'bookingId', foreignKeyConstraintName: 'booking_seats_bookingId_fkey' })
  booking: Relation<Booking>;

  @ManyToOne(() => ShowSeat, (showSeat) => showSeat.bookingSeats, {
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({ name: 'showSeatId', foreignKeyConstraintName: 'booking_seats_showSeatId_fkey' })
  showSeat: Relation<ShowSeat>;
}
