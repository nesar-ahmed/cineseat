import type { Metadata } from 'next';
import { NewMoviePage } from '../../../../features/admin/movies/movie-detail';

export const metadata: Metadata = { title: 'Add a movie' };

export default function Page() {
  return <NewMoviePage />;
}
