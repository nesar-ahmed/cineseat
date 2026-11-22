'use client';

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentType,
  type KeyboardEvent,
  type ReactNode,
  type SVGProps,
} from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';

export type MenuItem =
  | {
      label: string;
      icon?: ComponentType<SVGProps<SVGSVGElement>>;
      /** A page in the app (`<Link>`), or with `external` a new tab. */
      href?: string;
      external?: boolean;
      onSelect?: () => void;
      danger?: boolean;
      disabled?: boolean;
      /** Why it is disabled, or what it does — a second line under the label. */
      hint?: string;
    }
  | 'separator';

const WIDTH = 232;
const GAP = 6;

/**
 * A button that opens a list of actions (a row's "⋯", say).
 *
 * The list is drawn in a portal with fixed positioning — tables and cards clip
 * anything that sticks out — right-aligned under the button, or above it when
 * there is no room below. Keyboard: Enter/Space/↓ open it on the first item, ↑
 * on the last; ↑ ↓ Home End move; Escape closes and returns focus; Tab closes.
 * It also closes on any click outside, on scroll and on resize. Disabled items
 * stay in the list (and reachable), with their hint saying why.
 */
export function Menu({
  label,
  items,
  children,
  buttonClassName = 'btn-icon h-9 w-9',
}: {
  /** Accessible name of the button ("Actions for Dhaka Noir"). */
  label: string;
  items: MenuItem[];
  /** The button's content (an icon). */
  children: ReactNode;
  buttonClassName?: string;
}) {
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<false | 'first' | 'last'>(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    setPosition(null);
    if (restoreFocus) button.current?.focus();
  }, []);

  // Place the list once it is rendered (its height decides up or down).
  useLayoutEffect(() => {
    if (!open || !button.current || !list.current) return;
    const box = button.current.getBoundingClientRect();
    const height = list.current.offsetHeight;
    const below = box.bottom + GAP + height <= window.innerHeight - 8;
    setPosition({
      top: below ? box.bottom + GAP : Math.max(8, box.top - GAP - height),
      left: Math.min(Math.max(8, box.right - WIDTH), window.innerWidth - WIDTH - 8),
    });
  }, [open]);

  useEffect(() => {
    if (!open || !position) return;
    const items = menuItems(list.current);
    (open === 'last' ? items[items.length - 1] : items[0])?.focus();
  }, [open, position]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!list.current?.contains(target) && !button.current?.contains(target)) close(false);
    };
    const onMove = () => close(false);
    document.addEventListener('pointerdown', onPointer);
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [open, close]);

  const onButtonKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(event.key === 'ArrowUp' ? 'last' : 'first');
    }
  };

  const onListKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = menuItems(list.current);
    const index = items.indexOf(document.activeElement as HTMLElement);
    const focus = (i: number) => items[(i + items.length) % items.length]?.focus();
    if (event.key === 'ArrowDown') focus(index + 1);
    else if (event.key === 'ArrowUp') focus(index - 1);
    else if (event.key === 'Home') focus(0);
    else if (event.key === 'End') focus(items.length - 1);
    else if (event.key === 'Escape') close(true);
    else if (event.key === 'Tab') close(false);
    else return;
    if (event.key !== 'Tab') event.preventDefault();
  };

  const itemClass = (danger?: boolean) =>
    `flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm outline-none transition focus-visible:bg-white/[0.08] aria-disabled:cursor-not-allowed aria-disabled:opacity-45 motion-reduce:transition-none ${
      danger
        ? 'text-brand-300 hover:bg-brand-500/10 focus-visible:bg-brand-500/15'
        : 'text-ink-100 hover:bg-white/[0.06]'
    }`;

  const content = (item: Exclude<MenuItem, 'separator'>) => (
    <>
      {item.icon ? (
        <item.icon
          className={`mt-0.5 h-4 w-4 shrink-0 ${item.danger ? 'text-brand-300' : 'text-ink-400'}`}
        />
      ) : null}
      <span className="min-w-0">
        <span className="block">{item.label}</span>
        {item.hint ? (
          <span className="mt-0.5 block text-xs leading-snug text-ink-400">{item.hint}</span>
        ) : null}
      </span>
    </>
  );

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={Boolean(open)}
        aria-controls={open ? id : undefined}
        onClick={() => (open ? close(false) : setOpen('first'))}
        onKeyDown={onButtonKey}
        className={buttonClassName}
      >
        {children}
      </button>
      {open
        ? createPortal(
            <div
              ref={list}
              id={id}
              role="menu"
              aria-label={label}
              onKeyDown={onListKey}
              style={{
                width: WIDTH,
                top: position?.top ?? 0,
                left: position?.left ?? 0,
                visibility: position ? 'visible' : 'hidden',
              }}
              className="fixed z-[75] animate-fade-in rounded-2xl border border-white/10 bg-ink-900 p-1.5 shadow-lift motion-reduce:animate-none"
            >
              {items.map((item, index) => {
                if (item === 'separator')
                  return (
                    <div
                      key={`sep-${index}`}
                      role="separator"
                      className="my-1 h-px bg-white/[0.06]"
                    />
                  );
                if (item.href && !item.disabled) {
                  const shared = {
                    role: 'menuitem',
                    tabIndex: -1,
                    className: itemClass(item.danger),
                    onClick: () => close(false),
                  } as const;
                  return item.external ? (
                    <a
                      key={item.label}
                      href={item.href}
                      target="_blank"
                      rel="noreferrer"
                      {...shared}
                    >
                      {content(item)}
                    </a>
                  ) : (
                    <Link key={item.label} href={item.href} {...shared}>
                      {content(item)}
                    </Link>
                  );
                }
                return (
                  <button
                    key={item.label}
                    type="button"
                    role="menuitem"
                    tabIndex={-1}
                    // Disabled items stay focusable, so their hint (why) can be reached.
                    aria-disabled={item.disabled || undefined}
                    onClick={() => {
                      if (item.disabled) return;
                      close(true);
                      item.onSelect?.();
                    }}
                    className={itemClass(item.danger)}
                  >
                    {content(item)}
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function menuItems(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>('[role="menuitem"]'));
}
