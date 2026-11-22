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
import { MovieGenre } from './movie-genre.entity';
import { Review } from './review.entity';
import { Show } from './show.entity';
import { Wishlist } from './wishlist.entity';

@Entity('movies')
@Index('movies_status_idx', ['status'])
export class Movie {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  title: string;

  @Column('text', { nullable: true })
  tagline: string | null;

  @Column('text')
  description: string;

  /** Primary genre — always `genres[0]`; the full list lives in `movie_genres`. */
  @Column('text')
  genre: string;

  @Column('text')
  language: string;

  @Column('integer')
  durationMin: number;

  @Column('datetime')
  releaseDate: Date;

  @Column('text', { nullable: true })
  posterPath: string | null;

  @Column('text', { nullable: true })
  trailerUrl: string | null;

  /** NOW_SHOWING | COMING_SOON */
  @Column('text', { default: 'NOW_SHOWING' })
  status: string;

  /** U | U/A | A */
  @Column('text', { default: 'U' })
  certificate: string;

  /** Formats the film is released in (2D, 3D); stored comma-separated. */
  @Column('simple-array', { default: '2D' })
  formats: string[];

  @Column('text', { nullable: true })
  director: string | null;

  /** Billed cast, in order; stored as a JSON array. */
  @Column('simple-json', { default: '[]' })
  cast: string[];

  /*
   * Denormalised audience signals, so listing and sorting never aggregate on the
   * fly. The reviews, wishlist and booking features keep them current.
   */

  /** Average review score out of 5; null until the first review. */
  @Column('real', { nullable: true })
  ratingAvg: number | null;

  @Column('integer', { default: 0 })
  ratingCount: number;

  /** Watchlist saves — the "interested" count shown for upcoming titles. */
  @Column('integer', { default: 0 })
  interestCount: number;

  /** Ranking signal for the default "popular" order. */
  @Column('integer', { default: 0 })
  popularity: number;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt: Date;

  @OneToMany(() => MovieGenre, (link) => link.movie)
  genreLinks: Relation<MovieGenre[]>;

  @OneToMany(() => Show, (show) => show.movie)
  shows: Relation<Show[]>;

  @OneToMany(() => Review, (review) => review.movie)
  reviews: Relation<Review[]>;

  @OneToMany(() => Wishlist, (wishlist) => wishlist.movie)
  wishlists: Relation<Wishlist[]>;
}
