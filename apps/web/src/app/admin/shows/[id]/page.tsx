import type { Metadata } from 'next';
import { AdminShowDetailPage } from '../../../../features/admin/shows/show-detail';

export const metadata: Metadata = { title: 'Show' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AdminShowDetailPage id={id} />;
}
