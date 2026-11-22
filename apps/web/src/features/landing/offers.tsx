'use client';

import { useState } from 'react';
import { CheckIcon, CopyIcon, PercentIcon } from '../../components/ui/icons';
import { SectionHeading } from '../../components/ui/section-heading';
import { OFFERS } from './content';

const TONES = {
  brand: {
    panel: 'from-brand-600/35 via-brand-900/20',
    text: 'text-brand-300',
    icon: 'bg-brand-500/20 text-brand-300',
  },
  gold: {
    panel: 'from-gold-500/25 via-gold-700/10',
    text: 'text-gold-300',
    icon: 'bg-gold-400/20 text-gold-300',
  },
  ink: {
    panel: 'from-sky-500/20 via-indigo-900/10',
    text: 'text-sky-300',
    icon: 'bg-sky-400/15 text-sky-300',
  },
} as const;

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** The coupons the API seeds, shown as ticket stubs with a one-tap copy. */
export function Offers() {
  const [copied, setCopied] = useState<string | null>(null);

  const onCopy = async (code: string) => {
    if (await copyText(code)) {
      setCopied(code);
      window.setTimeout(() => setCopied((current) => (current === code ? null : current)), 2000);
    }
  };

  return (
    <section
      id="offers"
      aria-labelledby="offers-title"
      className="container-x scroll-mt-24 pt-24 sm:pt-32"
    >
      <SectionHeading
        id="offers-title"
        eyebrow="Deals & offers"
        title="Better nights, smaller bills"
        description="Enter a code at checkout and the discount shows up before you pay."
      />

      <ul className="mt-10 grid gap-5 md:grid-cols-3">
        {OFFERS.map((offer) => {
          const tone = TONES[offer.tone];
          return (
            <li
              key={offer.code}
              className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-ink-900/70 shadow-card"
            >
              <div
                aria-hidden="true"
                className={`absolute inset-0 bg-gradient-to-br ${tone.panel} to-transparent`}
              />
              <div className="relative p-6 pb-5">
                <span
                  className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${tone.icon}`}
                >
                  <PercentIcon className="h-5 w-5" />
                </span>
                <p
                  className={`mt-5 font-display text-4xl font-semibold tracking-tight ${tone.text}`}
                >
                  {offer.headline}
                </p>
                <h3 className="mt-2 font-sans text-lg font-semibold text-ink-50">{offer.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-400">{offer.detail}</p>
              </div>

              {/* Perforation: two notches and a dashed tear line, like a ticket stub. */}
              <div aria-hidden="true" className="relative flex items-center">
                <span className="-ml-3 h-6 w-6 rounded-full bg-ink-950" />
                <span className="h-px flex-1 border-t border-dashed border-white/15" />
                <span className="-mr-3 h-6 w-6 rounded-full bg-ink-950" />
              </div>

              <div className="relative flex items-center justify-between gap-3 p-6 pt-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-400">
                    Code
                  </p>
                  <p className="font-mono text-lg font-semibold tracking-wider text-ink-50">
                    {offer.code}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onCopy(offer.code)}
                  className="btn-ghost border-white/10 bg-white/[0.05] px-4 py-2 text-xs"
                  aria-label={`Copy code ${offer.code}`}
                >
                  {copied === offer.code ? (
                    <CheckIcon className="h-4 w-4 text-emerald-400" />
                  ) : (
                    <CopyIcon className="h-4 w-4" />
                  )}
                  {copied === offer.code ? 'Copied' : 'Copy'}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <p aria-live="polite" className="sr-only">
        {copied ? `Code ${copied} copied to the clipboard` : ''}
      </p>
    </section>
  );
}
