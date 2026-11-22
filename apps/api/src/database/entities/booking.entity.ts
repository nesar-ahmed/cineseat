import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  type Relation,
} from 'typeorm';
import { BookingSeat } from './booking-seat.entity';
import { Coupon } from './coupon.entity';
import { Payment } from './payment.entity';
import { Show } from './show.entity';
import { User } from './user.entity';

@Entity('bookings')
@Index('bookings_userId_status_idx', ['userId', 'status'])
@Index('bookings_showId_idx', ['showId'])
@Index('bookings_status_expiresAt_idx', ['status', 'expiresAt'])
export class Booking {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  userId: string;

  @Column('text')
  showId: string;

  /** PENDING | CONFIRMED | FAILED | CANCELLED */
  @Column('text', { default: 'PENDING' })
  status: string;

  /** Minor units. */
  @Column('integer')
  totalAmount: number;

  @Column('text', { nullable: true })
  couponId: string | null;

  /**
   * While PENDING, the booking is a seat hold that lapses at this instant; an
   * unpaid hold is then removed and its seats go back on sale. Null once settled.
   */
  @Column('datetime', { nullable: true })
  expiresAt: Date | null;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt: Date;

  @ManyToOne(() => User, (user) => user.bookings, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'userId', foreignKeyConstraintName: 'bookings_userId_fkey' })
  user: Relation<User>;

  @ManyToOne(() => Show, (show) => show.bookings, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'showId', foreignKeyConstraintName: 'bookings_showId_fkey' })
  show: Relation<Show>;

  @ManyToOne(() => Coupon, (coupon) => coupon.bookings, {
    nullable: true,
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({ name: 'couponId', foreignKeyConstraintName: 'bookings_couponId_fkey' })
  coupon: Relation<Coupon> | null;

  @OneToMany(() => BookingSeat, (bookingSeat) => bookingSeat.booking)
  seats: Relation<BookingSeat[]>;

  @OneToMany(() => Payment, (payment) => payment.booking)
  payments: Relation<Payment[]>;
}
