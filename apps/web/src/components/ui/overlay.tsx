'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

type Props = {
  open: boolean;
  onClose: () => void;
  /** Accessible name: id of the visible heading, or a plain label. */
  labelledBy?: string;
  label?: string;
  /** Layout of the panel wrapper (position, size, animation). */
  className?: string;
  /** Extra classes for the dimmed backdrop. */
  backdropClassName?: string;
  children: ReactNode;
};

/**
 * Modal layer (today: the catalog's filter drawer on small screens).
 * Rendered into <body> (the sticky header's backdrop-filter would
 * otherwise trap `position: fixed`), with Escape to close, a focus trap, focus
 * restored on close and the page scroll locked underneath.
 */
export function Overlay({
  open,
  onClose,
  labelledBy,
  label,
  className = '',
  backdropClassName = '',
  children,
}: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const onCloseRef = useRef(onClose);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const { overflow, paddingRight } = document.body.style;
    // Keep the layout from shifting when the scrollbar disappears.
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (scrollbar > 0) document.body.style.paddingRight = `${scrollbar}px`;

    const frame = window.requestAnimationFrame(() => {
      const root = panel.current;
      if (!root || root.contains(document.activeElement)) return;
      const preferred = root.querySelector<HTMLElement>('[data-autofocus]');
      (preferred ?? root.querySelector<HTMLElement>(FOCUSABLE) ?? root).focus();
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !panel.current) return;
      const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (item) => item.offsetParent !== null || item === document.activeElement,
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = overflow;
      document.body.style.paddingRight = paddingRight;
      previous?.focus?.();
    };
  }, [open]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[70]">
      <div
        aria-hidden="true"
        onClick={() => onCloseRef.current()}
        className={`absolute inset-0 animate-fade-in bg-ink-950/75 backdrop-blur-sm motion-reduce:animate-none ${backdropClassName}`}
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={labelledBy ? undefined : label}
        tabIndex={-1}
        className={`outline-none ${className}`}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
