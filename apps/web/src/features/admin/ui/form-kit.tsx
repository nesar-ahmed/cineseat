'use client';

import { useId, useState, type KeyboardEvent, type ReactNode } from 'react';
import { AlertIcon, CloseIcon, LockIcon, StarIcon } from '../../../components/ui/icons';
import { ApiClientError } from '../../../lib/api';
import { describedBy } from '../../account/settings/form-kit';

/**
 * The pieces the admin forms are made of (movies, theaters, screens, shows), on
 * top of the account settings' `Field`: titled sections, chip lists, segmented
 * and card choices, and the mapping of the API's `field: message` errors.
 */

/**
 * `field: message` answers from the API (400 validation, 409 rules), by field;
 * anything else is `rest`. `alias` maps API field names to form fields
 * (`startsAt` → `date`).
 */
export function serverFieldErrors<F extends string>(
  error: unknown,
  fields: readonly F[],
  alias: Partial<Record<string, F>> = {},
): { fields: Partial<Record<F, string>>; rest: string[] } {
  const found: Partial<Record<F, string>> = {};
  const rest: string[] = [];
  const messages =
    error instanceof ApiClientError ? error.messages : [String((error as Error)?.message ?? error)];
  for (const message of messages) {
    const match = /^([A-Za-z]+)(?:\.\d+)?: (.+)$/.exec(message);
    const name = match?.[1];
    const field = (name && (alias[name] ?? name)) as F | undefined;
    if (field && fields.includes(field)) found[field] ??= match![2];
    else rest.push(message);
  }
  return { fields: found, rest };
}

/** "Couldn't save …" with the server's words, above a form. */
export function FormErrorBanner({ title, messages }: { title: string; messages: string[] }) {
  if (messages.length === 0) return null;
  return (
    <div
      role="alert"
      className="flex gap-3 rounded-2xl border border-brand-500/40 bg-brand-500/10 px-4 py-3 text-sm text-brand-100"
    >
      <AlertIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand-300" />
      <div>
        <p className="font-semibold">{title}</p>
        {messages.map((message) => (
          <p key={message} className="mt-0.5 text-brand-200/90">
            {message}
          </p>
        ))}
      </div>
    </div>
  );
}

export function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/[0.07] bg-white/[0.025] shadow-inset">
      <header className="border-b border-white/[0.06] px-5 py-4 sm:px-6">
        <h2 className="text-base font-semibold text-ink-50">{title}</h2>
        <p className="mt-0.5 text-xs text-ink-400">{description}</p>
      </header>
      <div className="flex flex-col gap-5 px-5 py-5 sm:px-6">{children}</div>
    </section>
  );
}

/** "One line under the title. · 42/160" */
export function Counter({ text, max, lead }: { text: string; max: number; lead: string }) {
  const used = text.trim().length;
  return (
    <span className="flex justify-between gap-3">
      <span>{lead}</span>
      <span className={`tabular-nums ${used > max * 0.9 ? 'text-gold-300' : ''}`}>
        {used.toLocaleString('en-US')}/{max.toLocaleString('en-US')}
      </span>
    </span>
  );
}

/**
 * A list of short values as removable chips, with a text box to add more
 * (Enter or comma; Backspace on an empty box removes the last). With `primary`,
 * the first value is marked ★ and any other can be made first.
 */
export function TagInput({
  id,
  values,
  onChange,
  max,
  maxLength,
  suggestions = [],
  placeholder,
  error,
  primary = false,
}: {
  id: string;
  values: string[];
  onChange: (values: string[]) => void;
  max: number;
  maxLength: number;
  suggestions?: string[];
  placeholder: string;
  error?: string;
  primary?: boolean;
}) {
  const listId = useId();
  const [text, setText] = useState('');
  const full = values.length >= max;

  const add = (raw: string) => {
    const value = raw.trim().replace(/\s+/g, ' ');
    setText('');
    if (!value || full) return;
    if (values.some((item) => item.toLowerCase() === value.toLowerCase())) return;
    onChange([...values, value]);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      add(text);
    } else if (event.key === 'Backspace' && text === '' && values.length) {
      onChange(values.slice(0, -1));
    }
  };

  return (
    <div
      aria-invalid={error ? true : undefined}
      className="input flex min-h-[2.875rem] flex-wrap items-center gap-1.5 py-1.5 pl-1.5 has-[input:focus-visible]:outline has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-[3px] has-[input:focus-visible]:outline-gold-400"
    >
      {values.map((value, index) => (
        <span
          key={value}
          className={`inline-flex items-center gap-1 rounded-lg py-1 pl-2.5 pr-1 text-sm ${
            primary && index === 0
              ? 'bg-gold-400/15 text-gold-100 ring-1 ring-inset ring-gold-400/30'
              : 'bg-white/[0.07] text-ink-100'
          }`}
        >
          {primary && index === 0 ? (
            <StarIcon className="h-3.5 w-3.5 text-gold-300" aria-label="Primary" />
          ) : null}
          {value}
          {primary && index > 0 ? (
            <button
              type="button"
              onClick={() => onChange([value, ...values.filter((item) => item !== value)])}
              aria-label={`Make ${value} the primary genre`}
              title="Make primary"
              className="inline-flex h-5 w-5 items-center justify-center rounded text-ink-400 hover:bg-white/10 hover:text-gold-300"
            >
              <StarIcon className="h-3 w-3" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => onChange(values.filter((item) => item !== value))}
            aria-label={`Remove ${value}`}
            className="inline-flex h-5 w-5 items-center justify-center rounded text-ink-400 hover:bg-white/10 hover:text-ink-50"
          >
            <CloseIcon className="h-3.5 w-3.5" />
          </button>
        </span>
      ))}
      <input
        id={id}
        list={suggestions.length ? listId : undefined}
        value={text}
        onChange={(event) => {
          // A suggestion picked from the list (not typed) is added right away.
          // Browsers report that pick as a replacement, or as a plain Event.
          const next = event.target.value;
          const native = event.nativeEvent;
          const picked =
            !('inputType' in native) ||
            (native as InputEvent).inputType === 'insertReplacementText';
          if (picked && suggestions.includes(next)) add(next);
          else setText(next);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => add(text)}
        disabled={full}
        maxLength={maxLength}
        placeholder={full ? `That’s the maximum (${max})` : placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, { hint: true, error })}
        className="min-w-[9rem] flex-1 bg-transparent px-2 py-1 text-sm text-ink-100 outline-none placeholder:text-ink-500 focus-visible:outline-none disabled:cursor-not-allowed"
      />
      {suggestions.length ? (
        <datalist id={listId}>
          {suggestions
            .filter((item) => !values.some((value) => value.toLowerCase() === item.toLowerCase()))
            .map((item) => (
              <option key={item} value={item} />
            ))}
        </datalist>
      ) : null}
    </div>
  );
}

/** Two or three options as one row of buttons (radio group). */
export function Segmented<T extends string>({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div
      id={id}
      role="radiogroup"
      aria-label={label}
      tabIndex={-1}
      className="grid grid-cols-2 gap-1 rounded-xl border border-ink-700 bg-ink-950/70 p-1"
    >
      {options.map((option) => (
        <label
          key={option.value}
          className={`flex cursor-pointer items-center justify-center rounded-lg px-3 py-[0.4375rem] text-sm font-semibold transition has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-gold-400 motion-reduce:transition-none ${
            value === option.value
              ? 'bg-brand-500/20 text-ink-50 ring-1 ring-brand-500/50'
              : 'text-ink-300 hover:text-ink-50'
          }`}
        >
          <input
            type="radio"
            name={id}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
            className="sr-only"
          />
          {option.label}
        </label>
      ))}
    </div>
  );
}

/** Options as cards with a line of explanation; radio (one) or checkbox (several). */
export function CardChoice<T extends string>({
  id,
  label,
  type,
  options,
  chosen,
  onToggle,
}: {
  id: string;
  label: string;
  type: 'radio' | 'checkbox';
  options: { value: T; title: string; text: string; locked?: boolean }[];
  chosen: T[];
  onToggle: (value: T) => void;
}) {
  return (
    <div
      id={id}
      role={type === 'radio' ? 'radiogroup' : 'group'}
      aria-label={label}
      tabIndex={-1}
      className={`grid gap-2 ${options.length === 3 ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-2'}`}
    >
      {options.map((option) => {
        const on = chosen.includes(option.value);
        return (
          <label
            key={option.value}
            className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 transition has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-gold-400 motion-reduce:transition-none ${
              on
                ? 'border-brand-500/60 bg-brand-500/10'
                : 'border-ink-700 bg-ink-950/50 hover:border-ink-600'
            } ${option.locked ? 'cursor-not-allowed' : ''}`}
          >
            <input
              type={type}
              name={id}
              value={option.value}
              checked={on}
              disabled={option.locked}
              onChange={() => onToggle(option.value)}
              className="mt-0.5 h-4 w-4 accent-brand-500"
            />
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-ink-50">
                {option.title}
                {option.locked ? <LockIcon className="h-3.5 w-3.5 text-gold-300" /> : null}
              </span>
              <span className="block text-xs text-ink-400">{option.text}</span>
            </span>
          </label>
        );
      })}
    </div>
  );
}

/**
 * A whole number with − and + buttons (the input still takes typing). The
 * buttons are a convenience; the value is checked by the form's schema.
 */
export function NumberStepper({
  id,
  value,
  onChange,
  min,
  max,
  disabled = false,
  error,
  hint,
  label,
}: {
  id: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  disabled?: boolean;
  error?: string;
  hint?: ReactNode;
  /** For the buttons' names ("Fewer rows" / "More rows"). */
  label: { less: string; more: string };
}) {
  const clamp = (next: number) => Math.min(max, Math.max(min, next));
  const button =
    'inline-flex h-full w-10 shrink-0 items-center justify-center text-lg text-ink-300 transition hover:bg-white/[0.06] hover:text-ink-50 disabled:pointer-events-none disabled:opacity-30 motion-reduce:transition-none';
  return (
    <div
      aria-invalid={error ? true : undefined}
      className={`input flex h-11 items-stretch overflow-hidden p-0 ${disabled ? 'opacity-60' : ''}`}
    >
      <button
        type="button"
        onClick={() => onChange(clamp(value - 1))}
        disabled={disabled || value <= min}
        aria-label={label.less}
        className={`${button} border-r border-ink-700`}
      >
        −
      </button>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={1}
        value={Number.isNaN(value) ? '' : value}
        disabled={disabled}
        onChange={(event) =>
          onChange(event.target.value === '' ? Number.NaN : Number(event.target.value))
        }
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, { hint, error })}
        className="min-w-0 flex-1 bg-transparent text-center text-sm tabular-nums text-ink-100 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <button
        type="button"
        onClick={() => onChange(clamp((Number.isNaN(value) ? min - 1 : value) + 1))}
        disabled={disabled || value >= max}
        aria-label={label.more}
        className={`${button} border-l border-ink-700`}
      >
        +
      </button>
    </div>
  );
}
