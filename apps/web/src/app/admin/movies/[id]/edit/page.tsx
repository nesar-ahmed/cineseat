import type { Metadata } from 'next';
import { EditMoviePage } from '../../../../../features/admin/movies/movie-detail';

export const metadata: Metadata = { title: 'Edit movie' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditMoviePage id={id} />;
}
