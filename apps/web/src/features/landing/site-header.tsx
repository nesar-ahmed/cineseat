'use client';

import { useEffect, useState } from 'react';
import { ArrowRightIcon, CloseIcon, LogoMark, MenuIcon } from '../../components/ui/icons';

const links = [
  { href: '#browse', label: 'Movies' },
  { href: '#how', label: 'How it works' },
  { href: '#engineering', label: 'Under the hood' },
  { href: '#venues', label: 'Venues' },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

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

        <div className="hidden items-center gap-2 sm:flex">
          <a href="#get-started" className="btn-ghost px-4 py-2 text-sm">
            Sign in
          </a>
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
              <a href="#get-started" onClick={() => setOpen(false)} className="btn-ghost">
                Sign in
              </a>
              <a href="#browse" onClick={() => setOpen(false)} className="btn-primary">
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
