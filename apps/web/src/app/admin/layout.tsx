import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { AdminShell } from '../../features/admin/admin-shell';
import { SIDEBAR_COOKIE } from '../../features/admin/nav';

export const metadata: Metadata = {
  title: { default: 'Admin — CineSeat', template: '%s — CineSeat admin' },
  robots: { index: false, follow: false },
};

/**
 * Every page under `/admin`: the admin frame (left and top navbars) instead of
 * the site's header and footer. The sidebar's minimized state is read from its
 * cookie here, on the server, so the first paint already has the right width.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const collapsed = (await cookies()).get(SIDEBAR_COOKIE)?.value === 'collapsed';
  return <AdminShell initialCollapsed={collapsed}>{children}</AdminShell>;
}
