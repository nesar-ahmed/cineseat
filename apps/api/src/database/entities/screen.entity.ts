import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { Seat } from './seat.entity';
import { Show } from './show.entity';
import { Theater } from './theater.entity';

@Entity('screens')
export class Screen {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  theaterId: string;

  @Column('text')
  name: string;

  @Column('integer')
  rows: number;

  @Column('integer')
  cols: number;

  /** Formats the projector supports; a 3D show needs a screen with 3D. */
  @Column('simple-array', { default: '2D' })
  formats: string[];

  @ManyToOne(() => Theater, (theater) => theater.screens, {
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({ name: 'theaterId', foreignKeyConstraintName: 'screens_theaterId_fkey' })
  theater: Relation<Theater>;

  @OneToMany(() => Seat, (seat) => seat.screen)
  seats: Relation<Seat[]>;

  @OneToMany(() => Show, (show) => show.screen)
  shows: Relation<Show[]>;
}
