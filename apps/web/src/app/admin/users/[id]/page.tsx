import type { Metadata } from 'next';
import { AdminUserDetailPage } from '../../../../features/admin/users/user-detail';

export const metadata: Metadata = { title: 'User' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AdminUserDetailPage id={id} />;
}
