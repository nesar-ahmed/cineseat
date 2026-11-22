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
import { Show } from './show.entity';
import { User } from './user.entity';

@Entity('notifications')
@Index('notifications_userId_readAt_idx', ['userId', 'readAt'])
@Index('notifications_userId_createdAt_idx', ['userId', 'createdAt'])
// Timed and throttled messages carry a key, so the same one is never written twice
// for the same account. NULLs are distinct in SQLite: rows without a key never clash.
@Index('notifications_userId_dedupeKey_key', ['userId', 'dedupeKey'], { unique: true })
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  userId: string;

  @Column('text')
  type: string;

  @Column('text')
  title: string;

  @Column('text')
  body: string;

  @Column('datetime', { nullable: true })
  readAt: Date | null;

  /** The booking it is about. Unpaid holds are deleted; the message stays, unlinked. */
  @Column('text', { nullable: true })
  bookingId: string | null;

  /** The show it is about, where no booking is left to point at. */
  @Column('text', { nullable: true })
  showId: string | null;

  /** The offer code it announces. */
  @Column('text', { nullable: true })
  couponCode: string | null;

  /** The account it is about (a new sign-up, for admins) — not the one it is for. */
  @Column('text', { nullable: true })
  subjectUserId: string | null;

  /** Written once per account and key (e.g. `show-reminder-24h:<bookingId>`). */
  @Column('text', { nullable: true })
  dedupeKey: string | null;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;

  @ManyToOne(() => User, (user) => user.notifications, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'userId', foreignKeyConstraintName: 'notifications_userId_fkey' })
  user: Relation<User>;

  @ManyToOne(() => Booking, { onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'bookingId', foreignKeyConstraintName: 'notifications_bookingId_fkey' })
  booking: Relation<Booking> | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'subjectUserId', foreignKeyConstraintName: 'notifications_subjectUserId_fkey' })
  subjectUser: Relation<User> | null;

  @ManyToOne(() => Show, { onDelete: 'SET NULL', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'showId', foreignKeyConstraintName: 'notifications_showId_fkey' })
  show: Relation<Show> | null;
}
