import type { ReactNode } from 'react';

/**
 * One-line result banner used by every account-panel form.
 * Success and failure read differently, but share the shape.
 */
export function Notice({ kind, children }: { kind: 'success' | 'error'; children: ReactNode }) {
  const styles =
    kind === 'success'
      ? 'border-gold-500/40 bg-gold-500/10 text-gold-200'
      : 'border-brand-500/40 bg-brand-500/10 text-brand-200';
  return (
    <p role={kind === 'error' ? 'alert' : 'status'} className={`rounded-xl border px-3.5 py-2.5 text-sm ${styles}`}>
      {children}
    </p>
  );
}
