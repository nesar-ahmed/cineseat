'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AlertIcon, CheckIcon, CloseIcon, InfoIcon } from '../../components/ui/icons';

type Tone = 'success' | 'error' | 'info';

export type ToastInput = {
  message: ReactNode;
  /** A second line: what happened in more detail. */
  detail?: ReactNode;
  tone?: Tone;
  /** One follow-up, e.g. Undo. Running it dismisses the toast. */
  action?: { label: string; onClick: () => void };
};

type Toast = ToastInput & { id: number; tone: Tone };

type ToastApi = { toast: (input: ToastInput) => void; dismiss: (id: number) => void };

const ToastContext = createContext<ToastApi | null>(null);

/** How long a toast stays; one with an action stays longer, so there is time to use it. */
const DURATION = { plain: 5_000, action: 9_000 };
const MAX_VISIBLE = 4;

/**
 * Short confirmations for admin actions ("Moved to Now showing · Undo"), in the
 * top-right corner under the top bar — clear of the bulk-action bar at the
 * bottom. Announced politely to screen readers (errors assertively); a toast
 * pauses while hovered or focused, and never carries the only copy of
 * anything important: pages show results in place too.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((toast) => toast.id !== id));
  }, []);

  const toast = useCallback((input: ToastInput) => {
    const id = next.current++;
    setToasts((list) =>
      [...list, { ...input, id, tone: input.tone ?? 'success' }].slice(-MAX_VISIBLE),
    );
  }, []);

  const api = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-3 top-20 z-[80] flex flex-col items-center gap-2 sm:inset-x-auto sm:right-6 sm:items-end"
      >
        {toasts.map((item) => (
          <ToastCard key={item.id} toast={item} dismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({ toast, dismiss }: { toast: Toast; dismiss: (id: number) => void }) {
  const [paused, setPaused] = useState(false);
  const { id, action } = toast;
  const onDismiss = useCallback(() => dismiss(id), [dismiss, id]);
  useEffect(() => {
    if (paused) return;
    const timer = window.setTimeout(onDismiss, action ? DURATION.action : DURATION.plain);
    return () => window.clearTimeout(timer);
  }, [paused, onDismiss, action]);

  const Icon = toast.tone === 'error' ? AlertIcon : toast.tone === 'info' ? InfoIcon : CheckIcon;
  return (
    <div
      role={toast.tone === 'error' ? 'alert' : 'status'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="pointer-events-auto flex w-full max-w-sm animate-fade-up items-start gap-3 rounded-2xl border border-white/10 bg-ink-900/95 p-3.5 pr-2 shadow-lift backdrop-blur-xl motion-reduce:animate-none"
    >
      <span
        className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
          toast.tone === 'error'
            ? 'bg-brand-500/20 text-brand-300'
            : toast.tone === 'info'
              ? 'bg-white/[0.08] text-ink-200'
              : 'bg-emerald-400/15 text-emerald-300'
        }`}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-medium text-ink-50">{toast.message}</p>
        {toast.detail ? <div className="mt-0.5 text-ink-400">{toast.detail}</div> : null}
      </div>
      {toast.action ? (
        <button
          type="button"
          onClick={() => {
            toast.action?.onClick();
            onDismiss();
          }}
          className="shrink-0 rounded-full px-3 py-1 text-sm font-semibold text-gold-300 hover:bg-white/[0.06]"
        >
          {toast.action.label}
        </button>
      ) : null}
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-400 hover:bg-white/[0.06] hover:text-ink-100"
      >
        <CloseIcon className="h-4 w-4" />
      </button>
    </div>
  );
}

/** Shows a toast. Only inside the admin panel (AdminShell provides it). */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast must be used inside <ToastProvider>');
  return api;
}
