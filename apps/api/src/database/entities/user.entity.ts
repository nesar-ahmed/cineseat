import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  type Relation,
} from 'typeorm';
import { AuditLog } from './audit-log.entity';
import { Booking } from './booking.entity';
import { Notification } from './notification.entity';
import { Payment } from './payment.entity';
import { Review } from './review.entity';
import { Wishlist } from './wishlist.entity';

@Entity('users')
@Index('users_email_key', ['email'], { unique: true })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  email: string;

  @Column('text')
  passwordHash: string;

  @Column('text')
  name: string;

  @Column('text', { nullable: true })
  phone: string | null;

  @Column('text', { nullable: true })
  avatarPath: string | null;

  /** USER | ADMIN */
  @Column('text', { default: 'USER' })
  role: string;

  @Column('text', { nullable: true })
  preferredCity: string | null;

  /** Comma-separated list. */
  @Column('text', { nullable: true })
  preferredGenres: string | null;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt: Date;

  @OneToMany(() => Booking, (booking) => booking.user)
  bookings: Relation<Booking[]>;

  @OneToMany(() => Review, (review) => review.user)
  reviews: Relation<Review[]>;

  @OneToMany(() => Wishlist, (wishlist) => wishlist.user)
  wishlists: Relation<Wishlist[]>;

  @OneToMany(() => Notification, (notification) => notification.user)
  notifications: Relation<Notification[]>;

  @OneToMany(() => AuditLog, (auditLog) => auditLog.actor)
  auditLogs: Relation<AuditLog[]>;

  @OneToMany(() => Payment, (payment) => payment.user)
  payments: Relation<Payment[]>;
}
