'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRightIcon, CloseIcon, LogoMark, MenuIcon } from '../../components/ui/icons';
import { useAuth } from '../auth/auth-provider';
import { assetUrl } from '../../lib/api';

const links = [
  { href: '#browse', label: 'Movies' },
  { href: '#how', label: 'How it works' },
  { href: '#engineering', label: 'Under the hood' },
  { href: '#venues', label: 'Venues' },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const { user, status, signOut } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const handleSignOut = async () => {
    setOpen(false);
    await signOut();
    router.push('/');
  };

  const avatar = assetUrl(user?.avatarUrl);

  return (
    <header className="sticky top-0 z-50 border-b border-ink-800/70 bg-ink-950/70 backdrop-blur-md">
      <div className="container-x flex h-16 items-center justify-between gap-4 sm:h-[72px]">
        <a href="#top" className="flex items-center gap-3">
          <LogoMark />
          <span className="font-display text-lg tracking-tight text-ink-50">
            Cine<span className="text-brand-500">Seat</span>
          </span>
        </a>

        <nav aria-label="Primary" className="hidden items-center gap-1 lg:flex">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-full px-3 py-2 text-sm text-ink-300 transition hover:bg-ink-900 hover:text-ink-50 motion-reduce:transition-none"
            >
              {link.label}
            </a>
          ))}
        </nav>

        {/* Signed-out: log in. Signed-in: open the panel, sign out. While the
            session check is in flight a same-size placeholder avoids layout
            jump. */}
        <div className="hidden items-center gap-2 sm:flex">
          {status === 'loading' ? (
            <span className="h-9 w-44 rounded-full bg-ink-900" aria-hidden="true" />
          ) : user ? (
            <>
              <a
                href="/account"
                className="flex items-center gap-2 rounded-full border border-ink-700 bg-ink-900/60 py-1.5 pl-1.5 pr-3 text-sm text-ink-100 transition hover:border-ink-600 hover:bg-ink-800 motion-reduce:transition-none"
              >
                <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-ink-800 text-xs font-semibold">
                  {avatar ? <img src={avatar} alt="" className="h-full w-full object-cover" /> : initialsOf(user.name)}
                </span>
                <span className="max-w-32 truncate">{firstName(user.name)}</span>
              </a>
              <button type="button" onClick={handleSignOut} className="btn-ghost px-4 py-2 text-sm">
                Sign out
              </button>
            </>
          ) : (
            <a href="/login" className="btn-ghost px-4 py-2 text-sm">
              Log in
            </a>
          )}
          <a href="#browse" className="btn-primary px-4 py-2 text-sm">
            Book tickets
            <ArrowRightIcon className="h-4 w-4" />
          </a>
        </div>

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? 'Close menu' : 'Open menu'}
          className="btn-ghost px-3 py-2 sm:hidden"
        >
          {open ? <CloseIcon className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
        </button>
      </div>

      {open ? (
        <nav
          id="mobile-nav"
          aria-label="Mobile"
          className="border-t border-ink-800 bg-ink-950/95 sm:hidden"
        >
          <div className="container-x flex flex-col gap-1 py-4">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-xl px-3 py-2.5 text-sm text-ink-200 hover:bg-ink-900"
              >
                {link.label}
              </a>
            ))}
            <div className="mt-2 flex flex-col gap-2">
              {status === 'loading' ? (
                <span className="h-11 rounded-full bg-ink-900" aria-hidden="true" />
              ) : user ? (
                <>
                  <a href="/account" onClick={() => setOpen(false)} className="btn-primary">
                    My account
                    <ArrowRightIcon className="h-4 w-4" />
                  </a>
                  <button type="button" onClick={handleSignOut} className="btn-ghost">
                    Sign out
                  </button>
                </>
              ) : (
                <>
                  <a href="/login" onClick={() => setOpen(false)} className="btn-ghost">
                    Log in
                  </a>
                  <a href="/signup" onClick={() => setOpen(false)} className="btn-primary">
                    Sign up
                  </a>
                </>
              )}
              <a href="#browse" onClick={() => setOpen(false)} className="btn-ghost">
                Book tickets
                <ArrowRightIcon className="h-4 w-4" />
              </a>
            </div>
          </div>
        </nav>
      ) : null}
    </header>
  );
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((part) => part[0] ?? '')
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
