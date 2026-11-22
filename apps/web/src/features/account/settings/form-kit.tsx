'use client';

import { useEffect, useState, type InputHTMLAttributes, type ReactNode } from 'react';

/**
 * The pieces every settings page is made of, so profile, email and password
 * look and behave the same: a titled panel, a labelled field that wires its
 * hint and error to the input for screen readers, and a password input with a
 * show/hide toggle.
 */

export function Panel({
  title,
  description,
  children,
  footer,
  id,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  id?: string;
}) {
  const titleId = id ? `${id}-title` : undefined;
  return (
    <section id={id} aria-labelledby={titleId} className="card overflow-hidden rounded-3xl">
      <header className="border-b border-white/[0.06] px-5 py-5 sm:px-7">
        <h2 id={titleId} className="text-xl font-semibold tracking-tight text-ink-50">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 text-sm leading-relaxed text-ink-400">{description}</p>
        ) : null}
      </header>
      <div className="px-5 py-6 sm:px-7">{children}</div>
      {footer ? (
        <footer className="flex flex-wrap items-center justify-end gap-3 border-t border-white/[0.06] bg-white/[0.015] px-5 py-4 sm:px-7">
          {footer}
        </footer>
      ) : null}
    </section>
  );
}

/**
 * The id for `aria-describedby`, matching what `Field` renders: the error when
 * there is one (it replaces the hint), otherwise the hint.
 */
export function describedBy(id: string, { hint, error }: { hint?: ReactNode; error?: string }) {
  if (error) return `${id}-error`;
  return hint ? `${id}-hint` : undefined;
}

export function Field({
  id,
  label,
  hint,
  error,
  optional = false,
  children,
}: {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="field-label flex items-baseline justify-between gap-3">
        <span>{label}</span>
        {optional ? (
          <span className="text-[11px] font-medium normal-case tracking-normal text-ink-500">
            Optional
          </span>
        ) : null}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="field-error">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="field-hint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** A text input that shows its value on request; the toggle is a real, labelled button. */
export function PasswordInput({
  id,
  error,
  hint,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'id'> & {
  id: string;
  error?: string;
  hint?: ReactNode;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        {...props}
        id={id}
        type={visible ? 'text' : 'password'}
        className="input pr-20"
        aria-invalid={error ? true : undefined}
        aria-describedby={props['aria-describedby'] ?? describedBy(id, { hint, error })}
        spellCheck={false}
        autoCapitalize="off"
      />
      <button
        type="button"
        onClick={() => setVisible((value) => !value)}
        aria-pressed={visible}
        aria-controls={id}
        className="absolute inset-y-1 right-1 rounded-lg px-3 text-xs font-semibold text-ink-300 transition hover:bg-white/[0.06] hover:text-ink-50 motion-reduce:transition-none"
      >
        {visible ? 'Hide' : 'Show'}
        <span className="sr-only"> password</span>
      </button>
    </div>
  );
}

/**
 * Asks before a reload or tab close throws away edits. (Links inside the app
 * are not intercepted: the App Router has no navigation-blocking API.)
 */
export function useUnsavedChangesWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);
}

/**
 * Moves focus to the first field with an error, so keyboard and screen-reader
 * users land on it. Waits a frame: after a server error the inputs are still
 * disabled (saving) until React re-renders, and a disabled input cannot take focus.
 */
export function focusFirstError(ids: string[]) {
  window.requestAnimationFrame(() => {
    const first = ids.map((id) => document.getElementById(id)).find(Boolean);
    first?.focus();
  });
}
