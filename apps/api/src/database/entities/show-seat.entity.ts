import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { BookingSeat } from './booking-seat.entity';
import { Seat } from './seat.entity';
import { Show } from './show.entity';

@Entity('show_seats')
@Index('show_seats_showId_seatId_key', ['showId', 'seatId'], { unique: true })
@Index('show_seats_showId_status_idx', ['showId', 'status'])
@Index('show_seats_status_holdExpiresAt_idx', ['status', 'holdExpiresAt'])
export class ShowSeat {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  showId: string;

  @Column('text')
  seatId: string;

  /** AVAILABLE | HELD | BOOKED */
  @Column('text', { default: 'AVAILABLE' })
  status: string;

  @Column('text', { nullable: true })
  heldBy: string | null;

  @Column('datetime', { nullable: true })
  holdExpiresAt: Date | null;

  @ManyToOne(() => Show, (show) => show.showSeats, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'showId', foreignKeyConstraintName: 'show_seats_showId_fkey' })
  show: Relation<Show>;

  @ManyToOne(() => Seat, (seat) => seat.showSeats, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'seatId', foreignKeyConstraintName: 'show_seats_seatId_fkey' })
  seat: Relation<Seat>;

  /** Every booking this seat was part of; at most one is live (see BookingSeat). */
  @OneToMany(() => BookingSeat, (bookingSeat) => bookingSeat.showSeat)
  bookingSeats: Relation<BookingSeat[]>;
}
