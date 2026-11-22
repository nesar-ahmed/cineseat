import Link from 'next/link';
import { ADMIN_ROUTES } from '../../features/admin/links';

/** A 404 inside the admin frame, so the navbars stay. */
export default function AdminNotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="max-w-md text-center">
        <p className="section-label">404</p>
        <h1 className="mt-2 font-display text-3xl text-ink-50">Page not found</h1>
        <p className="mt-3 text-sm text-ink-400">There’s no admin page at this address.</p>
        <Link href={ADMIN_ROUTES.dashboard} className="btn-primary mt-7">
          Go to the dashboard
        </Link>
      </div>
    </div>
  );
}
