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
import { Movie } from './movie.entity';
import { User } from './user.entity';

@Entity('wishlists')
@Index('wishlists_userId_movieId_key', ['userId', 'movieId'], { unique: true })
export class Wishlist {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  userId: string;

  @Column('text')
  movieId: string;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;

  @ManyToOne(() => User, (user) => user.wishlists, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'userId', foreignKeyConstraintName: 'wishlists_userId_fkey' })
  user: Relation<User>;

  @ManyToOne(() => Movie, (movie) => movie.wishlists, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'movieId', foreignKeyConstraintName: 'wishlists_movieId_fkey' })
  movie: Relation<Movie>;
}
