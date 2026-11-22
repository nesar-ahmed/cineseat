import type { Metadata } from 'next';
import { AdminMovieDetailPage } from '../../../../features/admin/movies/movie-detail';

export const metadata: Metadata = { title: 'Movie' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AdminMovieDetailPage id={id} />;
}
