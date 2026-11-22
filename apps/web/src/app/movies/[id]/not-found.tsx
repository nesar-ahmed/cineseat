import { MovieNotFound } from '../../../features/movies/movie-not-found';

/** Rendered (with a 404 status) when the page calls notFound() for an unknown movie id. */
export default function NotFound() {
  return <MovieNotFound />;
}
