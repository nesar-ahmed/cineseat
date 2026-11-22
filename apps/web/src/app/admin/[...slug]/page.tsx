import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ComingSoon } from '../../../features/admin/coming-soon';
import { ADMIN_ROOT } from '../../../features/admin/links';
import { currentItem } from '../../../features/admin/nav';

export const metadata: Metadata = { title: 'Coming soon' };

/**
 * Any `/admin/…` address without a page of its own. Links into sections that are
 * planned (notifications already point at users, bookings, shows, offers…) get
 * "coming soon" inside the admin frame; anything else is a 404. Built pages
 * always win over this catch-all.
 */
export default async function Page({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const path = `${ADMIN_ROOT}/${slug.join('/')}`;
  const item = currentItem(path);
  if (!item || item.ready) notFound();
  return <ComingSoon section={item.label} icon={item.icon} path={path} />;
}
