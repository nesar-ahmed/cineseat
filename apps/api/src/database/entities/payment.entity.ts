import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { Booking } from './booking.entity';
import { User } from './user.entity';

@Entity('payments')
@Index('payments_providerRef_key', ['providerRef'], { unique: true })
@Index('payments_bookingId_idx', ['bookingId'])
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  bookingId: string;

  @Column('text', { default: 'mock' })
  provider: string;

  @Column('text')
  providerRef: string;

  /** PENDING | SUCCESS | FAILED | REFUNDED */
  @Column('text')
  status: string;

  /** How the buyer paid, as the provider reports it ("Visa •••• 4242", "bKash 01•••••5678"). */
  @Column('text', { nullable: true })
  method: string | null;

  /** Why the payment failed or was refunded, in words a buyer can read. */
  @Column('text', { nullable: true })
  failureReason: string | null;

  /** When the provider's final answer (success, failure, refund) was recorded. */
  @Column('datetime', { nullable: true })
  completedAt: Date | null;

  /** Minor units. */
  @Column('integer')
  amount: number;

  @Column('text')
  userId: string;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;

  @ManyToOne(() => Booking, (booking) => booking.payments, {
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({ name: 'bookingId', foreignKeyConstraintName: 'payments_bookingId_fkey' })
  booking: Relation<Booking>;

  @ManyToOne(() => User, (user) => user.payments, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'userId', foreignKeyConstraintName: 'payments_userId_fkey' })
  user: Relation<User>;
}
