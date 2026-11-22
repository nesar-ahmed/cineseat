'use client';

import { useId, useState, type FormEvent } from 'react';
import { CheckIcon, CloseIcon, PercentIcon } from '../../components/ui/icons';
import { money } from '../catalog/format';
import { OFFERS } from '../landing/content';

type Props = {
  /** The code in effect, with what it takes off. */
  applied: { code: string; description: string | null; discount: number } | null;
  /** Checks a code with the API; resolves to an error message, or null when it applies. */
  onApply: (code: string) => Promise<string | null>;
  onRemove: () => void;
  busy: boolean;
  disabled: boolean;
};

/** Offer codes: type one, or pick one of the current offers. The API decides whether it applies. */
export function OfferCode({ applied, onApply, onRemove, busy, disabled }: Props) {
  const id = useId();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const apply = async (code: string) => {
    const clean = code.trim().toUpperCase();
    if (!clean) return setError('Enter an offer code.');
    setError(null);
    const problem = await onApply(clean);
    if (problem) setError(problem);
    else setDraft('');
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void apply(draft);
  };

  return (
    <section aria-labelledby={`${id}-title`} className="card rounded-3xl p-6">
      <h2
        id={`${id}-title`}
        className="flex items-center gap-2 font-sans text-base font-semibold text-ink-50"
      >
        <PercentIcon className="h-4 w-4 text-gold-400" />
        Offer code
      </h2>

      {applied ? (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3">
          <p className="min-w-0 text-sm">
            <span className="flex items-center gap-1.5 font-semibold text-emerald-100">
              <CheckIcon className="h-4 w-4" /> {applied.code} applied
              <span className="font-normal text-emerald-200/80">
                · you save {money(applied.discount)}
              </span>
            </span>
            {applied.description ? (
              <span className="mt-0.5 block truncate text-xs text-emerald-200/70">
                {applied.description}
              </span>
            ) : null}
          </p>
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            aria-label={`Remove offer code ${applied.code}`}
            className="btn-icon h-9 w-9 shrink-0"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <>
          <form onSubmit={submit} noValidate className="mt-4 flex gap-2">
            <label htmlFor={`${id}-code`} className="sr-only">
              Offer code
            </label>
            <input
              id={`${id}-code`}
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value.toUpperCase());
                setError(null);
              }}
              placeholder="e.g. WEEKEND10"
              autoComplete="off"
              spellCheck={false}
              maxLength={32}
              disabled={disabled}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${id}-error` : undefined}
              className="input flex-1 font-mono uppercase tracking-wider placeholder:font-sans placeholder:normal-case placeholder:tracking-normal"
            />
            <button
              type="submit"
              disabled={disabled || busy}
              className="btn-ghost px-5 disabled:opacity-50"
            >
              {busy ? 'Checking…' : 'Apply'}
            </button>
          </form>
          {error ? (
            <p id={`${id}-error`} role="alert" className="field-error">
              {error}
            </p>
          ) : null}
          <div className="mt-4">
            <p className="text-xs text-ink-400">Current offers</p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {OFFERS.map((offer) => (
                <li key={offer.code}>
                  <button
                    type="button"
                    onClick={() => void apply(offer.code)}
                    disabled={disabled || busy}
                    className="pill py-1.5 text-xs disabled:opacity-50"
                  >
                    <span className="font-mono font-semibold text-ink-50">{offer.code}</span>
                    <span className="text-ink-400">{offer.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </section>
  );
}
