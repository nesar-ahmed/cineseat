'use client';

import { useEffect, useState, type FocusEvent, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogoMark, SidebarIcon } from '../../components/ui/icons';
import { ADMIN_NAV, ADMIN_ROOT, isActive, type AdminNavItem } from './nav';

type Tip = { label: string; top: number; left: number };

type Props = {
  /** Icons only (desktop). The mobile drawer is always expanded. */
  collapsed: boolean;
  /** Minimize / maximize; absent in the drawer, which closes instead. */
  onToggle?: () => void;
  /** Called when a link is followed (the drawer closes itself). */
  onNavigate?: () => void;
};

/**
 * The admin panel's left navbar: the brand, the sections, and a control to
 * minimize it to icons or maximize it to icons with labels.
 *
 * Minimized, each label stays in the link for screen readers and shows as a
 * tooltip on hover or keyboard focus. The tooltip is drawn in a portal because
 * the nav scrolls, and a scrolling box would clip anything that sticks out.
 */
export function AdminSidebar({ collapsed, onToggle, onNavigate }: Props) {
  const pathname = usePathname();
  const [tip, setTip] = useState<Tip | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  // A tooltip never outlives the state that showed it.
  useEffect(() => setTip(null), [collapsed, pathname]);
  useEffect(() => {
    if (!tip) return;
    const hide = (event: KeyboardEvent) => event.key === 'Escape' && setTip(null);
    window.addEventListener('keydown', hide);
    return () => window.removeEventListener('keydown', hide);
  }, [tip]);

  const showTip = (label: string) => (event: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>) => {
    if (!collapsed) return;
    const box = event.currentTarget.getBoundingClientRect();
    setTip({ label, top: box.top + box.height / 2, left: box.right + 12 });
  };
  const tipHandlers = (label: string) => ({
    onMouseEnter: showTip(label),
    onFocus: showTip(label),
    onMouseLeave: () => setTip(null),
    onBlur: () => setTip(null),
  });

  return (
    <div className="flex h-full flex-col">
      <div
        className={`flex h-16 shrink-0 items-center border-b border-white/[0.06] ${
          collapsed ? 'justify-center' : 'px-5'
        }`}
      >
        <Link
          href={ADMIN_ROOT}
          onClick={onNavigate}
          aria-label="CineSeat admin — dashboard"
          className="flex items-center gap-2.5"
          {...tipHandlers('CineSeat admin')}
        >
          <LogoMark />
          {collapsed ? null : (
            <span className="flex items-baseline gap-2">
              <span className="font-display text-lg font-semibold tracking-tight text-ink-50">
                Cine<span className="text-brand-400">Seat</span>
              </span>
              <span className="rounded-md border border-gold-500/40 bg-gold-400/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-gold-300">
                Admin
              </span>
            </span>
          )}
        </Link>
      </div>

      <nav
        aria-label="Admin"
        onScroll={() => setTip(null)}
        className={`flex-1 overflow-y-auto overflow-x-hidden py-3 [scrollbar-color:theme(colors.ink.700)_transparent] [scrollbar-width:thin] ${collapsed ? 'px-2.5' : 'px-3'}`}
      >
        {ADMIN_NAV.map((section, index) => (
          <div key={section.title ?? 'home'} className={index > 0 ? 'mt-4' : ''}>
            {section.title ? (
              collapsed ? (
                <>
                  <p className="sr-only">{section.title}</p>
                  <span aria-hidden="true" className="mx-auto mb-1.5 block h-px w-6 bg-white/10" />
                </>
              ) : (
                <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-500">
                  {section.title}
                </p>
              )
            ) : null}
            <ul className="flex flex-col gap-0.5">
              {section.items.map((item) => (
                <li key={item.href}>
                  <NavEntry
                    item={item}
                    active={isActive(item, pathname)}
                    collapsed={collapsed}
                    onNavigate={onNavigate}
                    tipHandlers={tipHandlers(item.ready ? item.label : `${item.label} · Soon`)}
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {onToggle ? (
        <div className="shrink-0 border-t border-white/[0.06] p-2.5">
          <button
            type="button"
            onClick={onToggle}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
            title={collapsed ? undefined : 'Collapse sidebar'}
            {...tipHandlers('Expand sidebar')}
            className={`flex h-10 w-full items-center rounded-xl text-sm font-medium text-ink-300 transition hover:bg-white/[0.05] hover:text-ink-50 motion-reduce:transition-none ${
              collapsed ? 'justify-center' : 'gap-3 px-3'
            }`}
          >
            <SidebarIcon
              className={`h-5 w-5 shrink-0 transition-transform motion-reduce:transition-none ${collapsed ? '' : '-scale-x-100'}`}
            />
            {collapsed ? null : <span>Collapse</span>}
          </button>
        </div>
      ) : null}

      {tip && mounted
        ? createPortal(
            <div
              role="tooltip"
              style={{ top: tip.top, left: tip.left }}
              className="pointer-events-none fixed z-[80] -translate-y-1/2 animate-fade-in whitespace-nowrap rounded-lg border border-white/10 bg-ink-800 px-2.5 py-1.5 text-xs font-semibold text-ink-50 shadow-lift motion-reduce:animate-none"
            >
              {tip.label}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

type TipHandlers = {
  onMouseEnter: (event: MouseEvent<HTMLElement>) => void;
  onFocus: (event: FocusEvent<HTMLElement>) => void;
  onMouseLeave: () => void;
  onBlur: () => void;
};

function NavEntry({
  item,
  active,
  collapsed,
  onNavigate,
  tipHandlers,
}: {
  item: AdminNavItem;
  active: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
  tipHandlers: TipHandlers;
}) {
  const Icon = item.icon;
  const shape = collapsed ? 'mx-auto h-10 w-10 justify-center' : 'h-9 w-full gap-3 px-3';
  const base = `relative flex items-center rounded-xl text-sm font-medium transition motion-reduce:transition-none ${shape}`;

  if (!item.ready) {
    // Shown for the panel's shape, not linked until the page exists. A link from
    // elsewhere (a notification) can still land in it: then it marks where you are.
    return (
      <span
        aria-disabled="true"
        aria-current={active ? 'page' : undefined}
        onMouseEnter={tipHandlers.onMouseEnter}
        onMouseLeave={tipHandlers.onMouseLeave}
        className={`${base} cursor-default ${
          active ? 'bg-white/[0.05] text-ink-300 ring-1 ring-inset ring-white/10' : 'text-ink-500'
        }`}
      >
        <Icon className="h-5 w-5 shrink-0 opacity-70" />
        {collapsed ? (
          <span className="sr-only">{item.label} (coming soon)</span>
        ) : (
          <>
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            <span className="rounded-full border border-white/10 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wider text-ink-500">
              Soon
            </span>
          </>
        )}
      </span>
    );
  }

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      {...tipHandlers}
      className={`${base} ${
        active
          ? 'bg-brand-500/15 text-ink-50 ring-1 ring-inset ring-brand-500/35'
          : 'text-ink-300 hover:bg-white/[0.05] hover:text-ink-50'
      }`}
    >
      {active && !collapsed ? (
        <span
          aria-hidden="true"
          className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-brand-500"
        />
      ) : null}
      <Icon className={`h-5 w-5 shrink-0 ${active ? 'text-brand-300' : ''}`} />
      {collapsed ? (
        <span className="sr-only">{item.label}</span>
      ) : (
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
      )}
    </Link>
  );
}
