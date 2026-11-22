import type { Metadata } from 'next';
import { AdminTheaterDetailPage } from '../../../../features/admin/theaters/theater-detail';

export const metadata: Metadata = { title: 'Theater' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AdminTheaterDetailPage id={id} />;
}
