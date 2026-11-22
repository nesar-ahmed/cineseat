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
import { Screen } from './screen.entity';
import { ShowSeat } from './show-seat.entity';

@Entity('seats')
@Index('seats_screenId_row_number_key', ['screenId', 'row', 'number'], { unique: true })
export class Seat {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  screenId: string;

  @Column('integer')
  row: number;

  @Column('integer')
  number: number;

  /** STANDARD | PREMIUM | RECLINER */
  @Column('text', { default: 'STANDARD' })
  category: string;

  @ManyToOne(() => Screen, (screen) => screen.seats, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'screenId', foreignKeyConstraintName: 'seats_screenId_fkey' })
  screen: Relation<Screen>;

  @OneToMany(() => ShowSeat, (showSeat) => showSeat.seat)
  showSeats: Relation<ShowSeat[]>;
}
