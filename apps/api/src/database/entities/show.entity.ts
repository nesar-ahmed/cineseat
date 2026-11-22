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
import { Booking } from './booking.entity';
import { Movie } from './movie.entity';
import { Screen } from './screen.entity';
import { ShowSeat } from './show-seat.entity';

@Entity('shows')
@Index('shows_movieId_startsAt_idx', ['movieId', 'startsAt'])
export class Show {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  movieId: string;

  @Column('text')
  screenId: string;

  @Column('datetime')
  startsAt: Date;

  @Column('text')
  language: string;

  /** 2D | 3D */
  @Column('text', { default: '2D' })
  format: string;

  /** Minor units. */
  @Column('integer')
  basePrice: number;

  @ManyToOne(() => Movie, (movie) => movie.shows, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'movieId', foreignKeyConstraintName: 'shows_movieId_fkey' })
  movie: Relation<Movie>;

  @ManyToOne(() => Screen, (screen) => screen.shows, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'screenId', foreignKeyConstraintName: 'shows_screenId_fkey' })
  screen: Relation<Screen>;

  @OneToMany(() => ShowSeat, (showSeat) => showSeat.show)
  showSeats: Relation<ShowSeat[]>;

  @OneToMany(() => Booking, (booking) => booking.show)
  bookings: Relation<Booking[]>;
}
