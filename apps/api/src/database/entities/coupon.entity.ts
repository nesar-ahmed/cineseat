import { Column, Entity, Index, OneToMany, PrimaryGeneratedColumn, type Relation } from 'typeorm';
import { Booking } from './booking.entity';

@Entity('coupons')
@Index('coupons_code_key', ['code'], { unique: true })
export class Coupon {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  code: string;

  /** What the code gives, shown at checkout ("10% off weekend shows"). */
  @Column('text', { nullable: true })
  description: string | null;

  /** PERCENT | FLAT */
  @Column('text')
  type: string;

  /** Minor units, or a percentage when type = PERCENT. */
  @Column('integer')
  value: number;

  @Column('datetime')
  validFrom: Date;

  @Column('datetime')
  validTo: Date;

  @Column('integer', { nullable: true })
  usageLimit: number | null;

  @Column('integer', { default: 0 })
  usedCount: number;

  /** Fewest seats a booking needs for the code to apply; null = any. */
  @Column('integer', { nullable: true })
  minSeats: number | null;

  /** Days of the week the show must be on (0 = Sunday … 6 = Saturday, comma-separated); null = any. */
  @Column('text', { nullable: true })
  weekdays: string | null;

  /** Only for a buyer's first confirmed booking. */
  @Column('boolean', { default: false })
  firstBookingOnly: boolean;

  @OneToMany(() => Booking, (booking) => booking.coupon)
  bookings: Relation<Booking[]>;
}
