import Link from 'next/link';
import type { ComponentType, SVGProps } from 'react';
import { ADMIN_ROUTES } from './links';

/**
 * Where a link into a part of the admin panel that is not built yet lands (a
 * notification's "View show", say): the admin frame stays, the page says so and
 * offers a way back. The link itself is already right — once the page exists,
 * Next.js routes to it instead of here.
 */
export function ComingSoon({
  section,
  icon: Icon,
  path,
}: {
  section: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  path: string;
}) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="max-w-md text-center">
        <span className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.06] text-ink-200 ring-1 ring-white/15">
          <Icon className="h-7 w-7" />
        </span>
        <p className="section-label mt-6">Coming soon</p>
        <h1 className="mt-2 font-display text-3xl text-ink-50">{section}</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-400">
          This part of the admin panel isn’t built yet. The link you followed will open it here once
          it is.
        </p>
        <p className="mt-3 break-all font-mono text-xs text-ink-500">{path}</p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link href={ADMIN_ROUTES.notifications} className="btn-primary">
            Back to notifications
          </Link>
          <Link href={ADMIN_ROUTES.dashboard} className="btn-ghost">
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
