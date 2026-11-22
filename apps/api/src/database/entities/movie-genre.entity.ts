import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  type Relation,
} from 'typeorm';
import { Movie } from './movie.entity';

/**
 * A movie's genres, one row each, so genre filters and genre counts are plain
 * indexed SQL. `position` keeps the editor's order; position 0 is the primary
 * genre, mirrored in `movies.genre`.
 */
@Entity('movie_genres')
@Index('movie_genres_genre_idx', ['genre'])
export class MovieGenre {
  @PrimaryColumn('varchar')
  movieId: string;

  @PrimaryColumn('text')
  genre: string;

  @Column('integer', { default: 0 })
  position: number;

  @ManyToOne(() => Movie, (movie) => movie.genreLinks, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'movieId', foreignKeyConstraintName: 'movie_genres_movieId_fkey' })
  movie: Relation<Movie>;
}
