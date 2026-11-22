'use client';

import { useId, type ComponentType, type ReactNode, type SVGProps } from 'react';
import { Overlay } from './overlay';

type Tone = 'default' | 'danger';

/**
 * A centred modal dialog (a bottom sheet on phones) on top of `Overlay`, which
 * brings the portal, Escape, focus trap, focus restore and scroll lock. Clicks
 * beside the panel reach the backdrop and close it, like Escape.
 *
 * Put `data-autofocus` on the control that should take focus first — for a
 * destructive confirmation, that is "Cancel", never the destructive button.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  icon: Icon,
  tone = 'default',
  size = 'md',
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
  tone?: Tone;
  size?: 'md' | 'lg' | 'xl';
  children?: ReactNode;
  footer?: ReactNode;
}) {
  const id = useId();
  return (
    <Overlay
      open={open}
      onClose={onClose}
      labelledBy={`${id}-title`}
      className="pointer-events-none absolute inset-0 flex items-end justify-center sm:items-center sm:p-6"
    >
      <div
        aria-describedby={description ? `${id}-description` : undefined}
        className={`pointer-events-auto flex max-h-[92vh] w-full animate-sheet-up flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-ink-900 shadow-lift motion-reduce:animate-none sm:animate-fade-up sm:rounded-3xl ${
          size === 'xl' ? 'sm:max-w-3xl' : size === 'lg' ? 'sm:max-w-xl' : 'sm:max-w-md'
        }`}
      >
        <div className="flex gap-4 px-5 pb-2 pt-6 sm:px-6">
          {Icon ? (
            <span
              className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ${
                tone === 'danger'
                  ? 'bg-brand-500/15 text-brand-300 ring-brand-500/30'
                  : 'bg-white/[0.06] text-ink-200 ring-white/10'
              }`}
            >
              <Icon className="h-5 w-5" />
            </span>
          ) : null}
          <div className="min-w-0">
            <h2
              id={`${id}-title`}
              className="font-sans text-lg font-semibold tracking-tight text-ink-50"
            >
              {title}
            </h2>
            {description ? (
              <div id={`${id}-description`} className="mt-1 text-sm leading-relaxed text-ink-400">
                {description}
              </div>
            ) : null}
          </div>
        </div>
        {children ? (
          <div className="min-h-0 overflow-y-auto px-5 py-3 sm:px-6">{children}</div>
        ) : null}
        {footer ? (
          <div className="mt-2 flex flex-col-reverse gap-2 border-t border-white/[0.06] bg-white/[0.015] px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
            {footer}
          </div>
        ) : null}
      </div>
    </Overlay>
  );
}

/**
 * "Are you sure?" with Cancel focused first. While `busy`, the dialog stays
 * open (Escape and the backdrop are ignored) and the buttons are disabled, so
 * the answer is never lost halfway.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  icon,
  confirmLabel,
  busyLabel,
  tone = 'default',
  busy = false,
  disabled = false,
  error,
  children,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: ReactNode;
  description?: ReactNode;
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
  confirmLabel: string;
  busyLabel?: string;
  tone?: Tone;
  busy?: boolean;
  /** The action cannot be taken (the body says why); only Cancel is offered. */
  disabled?: boolean;
  error?: string | null;
  children?: ReactNode;
}) {
  return (
    <Dialog
      open={open}
      onClose={() => (busy ? undefined : onClose())}
      title={title}
      description={description}
      icon={icon}
      tone={tone}
      footer={
        <>
          <button
            type="button"
            data-autofocus
            onClick={onClose}
            disabled={busy}
            className="btn-ghost py-2.5 disabled:opacity-50"
          >
            {disabled ? 'Close' : 'Cancel'}
          </button>
          {disabled ? null : (
            <button
              type="button"
              onClick={onConfirm}
              disabled={busy}
              className={`inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition disabled:opacity-60 motion-reduce:transition-none ${
                tone === 'danger'
                  ? 'bg-brand-600 text-white hover:bg-brand-500'
                  : 'bg-brand-500 text-white shadow-glow hover:bg-brand-400'
              }`}
            >
              {busy ? (busyLabel ?? 'Working…') : confirmLabel}
            </button>
          )}
        </>
      }
    >
      {children || error ? (
        <div className="flex flex-col gap-3">
          {children}
          {error ? (
            <p
              role="alert"
              className="rounded-xl border border-brand-500/40 bg-brand-500/10 px-3.5 py-2.5 text-sm text-brand-200"
            >
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </Dialog>
  );
}
