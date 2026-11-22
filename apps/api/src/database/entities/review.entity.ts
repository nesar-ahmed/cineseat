import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  type Relation,
} from 'typeorm';
import { Movie } from './movie.entity';
import { User } from './user.entity';

@Entity('reviews')
@Index('reviews_userId_movieId_key', ['userId', 'movieId'], { unique: true })
export class Review {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  userId: string;

  @Column('text')
  movieId: string;

  @Column('integer')
  rating: number;

  @Column('text')
  comment: string;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt: Date;

  @ManyToOne(() => User, (user) => user.reviews, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'userId', foreignKeyConstraintName: 'reviews_userId_fkey' })
  user: Relation<User>;

  @ManyToOne(() => Movie, (movie) => movie.reviews, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'movieId', foreignKeyConstraintName: 'reviews_movieId_fkey' })
  movie: Relation<Movie>;
}
