'use client';

import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { CloseIcon, ShieldIcon } from '../../components/ui/icons';
import { Overlay } from '../../components/ui/overlay';
import { useAuth } from '../auth/auth-provider';
import { AdminSidebar } from './admin-sidebar';
import { AdminTopbar } from './admin-topbar';
import { ADMIN_ROOT, SIDEBAR_COOKIE } from './nav';
import { ToastProvider } from './toaster';

const WIDTH = { expanded: '16rem', collapsed: '4.75rem' } as const;

/**
 * The frame of every admin page (`/admin/*`): a left navbar that can be
 * minimized to icons, a top navbar, and the page.
 *
 * - Desktop (lg+): the sidebar is fixed on the left; its state is kept in a
 *   cookie that the layout reads on the server, so the first paint is right.
 * - Smaller screens: the sidebar becomes a drawer opened from the top bar.
 * - Pages can confirm what they did with a toast (`useToast`).
 * - Only ADMIN accounts get in. The proxy already sent visitors without a
 *   session to sign in; the API checks the role on every admin request — this
 *   screen is the front door, not the lock.
 */
export function AdminShell({
  initialCollapsed,
  children,
}: {
  initialCollapsed: boolean;
  children: ReactNode;
}) {
  const { user, status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // A session that ended (expired cookie): sign in again and come back here.
  useEffect(() => {
    if (status === 'unauthenticated') router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [status, router, pathname]);

  useEffect(() => setDrawerOpen(false), [pathname]);

  const toggle = useCallback(() => {
    setCollapsed((value) => {
      const next = !value;
      document.cookie = `${SIDEBAR_COOKIE}=${next ? 'collapsed' : 'expanded'}; path=${ADMIN_ROOT}; max-age=31536000; samesite=lax`;
      return next;
    });
  }, []);

  if (status === 'authenticated' && user && user.role !== 'ADMIN')
    return <AdminsOnly email={user.email} />;

  const ready = status === 'authenticated' && user;
  const style = {
    '--admin-sidebar': collapsed ? WIDTH.collapsed : WIDTH.expanded,
  } as CSSProperties;

  return (
    <ToastProvider>
      <div style={style} className="min-h-screen">
        <aside
          aria-label="Admin sidebar"
          className="fixed inset-y-0 left-0 z-40 hidden w-[var(--admin-sidebar)] border-r border-white/[0.06] bg-ink-900 transition-[width] duration-200 ease-out motion-reduce:transition-none lg:block"
        >
          <AdminSidebar collapsed={collapsed} onToggle={toggle} />
        </aside>

        <Overlay
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          label="Admin navigation"
          className="absolute inset-y-0 left-0 w-[min(18rem,85vw)] animate-drawer-in border-r border-white/10 bg-ink-900 shadow-lift motion-reduce:animate-none"
        >
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close admin navigation"
            className="absolute right-3 top-3 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full text-ink-300 hover:bg-white/[0.06] hover:text-ink-50"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
          <AdminSidebar collapsed={false} onNavigate={() => setDrawerOpen(false)} />
        </Overlay>

        <div className="flex min-h-screen flex-col transition-[padding] duration-200 ease-out motion-reduce:transition-none lg:pl-[var(--admin-sidebar)]">
          {ready ? (
            <AdminTopbar user={user} onOpenNav={() => setDrawerOpen(true)} />
          ) : (
            <div className="sticky top-0 z-30 h-16 border-b border-white/[0.06] bg-ink-950/85" />
          )}
          <div className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
            {ready ? children : <ShellSkeleton />}
          </div>
        </div>
      </div>
    </ToastProvider>
  );
}

function AdminsOnly({ email }: { email: string }) {
  return (
    <div className="container-x flex min-h-screen items-center justify-center py-16">
      <div className="card max-w-md rounded-3xl p-8 text-center">
        <span className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500/15 text-brand-200 ring-1 ring-brand-500/30">
          <ShieldIcon className="h-7 w-7" />
        </span>
        <h1 className="mt-5 font-display text-2xl text-ink-50">Admins only</h1>
        <p className="mt-2 text-sm text-ink-400">
          You’re signed in as <span className="font-semibold text-ink-200">{email}</span>, which
          doesn’t have access to the admin panel.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/account" className="btn-primary">
            Go to my account
          </Link>
          <Link href="/" className="btn-ghost">
            Back to CineSeat
          </Link>
        </div>
      </div>
    </div>
  );
}

function ShellSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-6">
      <span className="sr-only">Loading the admin panel</span>
      <span className="h-8 w-48 animate-pulse rounded-full bg-white/[0.06] motion-reduce:animate-none" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className="h-32 animate-pulse rounded-2xl bg-white/[0.04] motion-reduce:animate-none"
          />
        ))}
      </div>
      <span className="h-72 animate-pulse rounded-2xl bg-white/[0.03] motion-reduce:animate-none" />
    </div>
  );
}
