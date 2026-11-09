'use client';

import { useState } from 'react';
import { underTheHood } from './demo-data';

/** Comments get their own tone so a code panel reads at a glance. */
function CodeBlock({ code }: { code: string }) {
  return (
    <pre className="overflow-x-auto px-5 py-5 font-mono text-[12.5px] leading-relaxed text-ink-200 sm:text-[13px]">
      <code>
        {code.split('\n').map((line, index) => {
          const commentAt = line.indexOf('//');
          const before = commentAt === -1 ? line : line.slice(0, commentAt);
          const comment = commentAt === -1 ? '' : line.slice(commentAt);
          return (
            <span key={`${line}-${index}`} className="block whitespace-pre">
              {before}
              {comment ? <span className="text-ink-500">{comment}</span> : null}
            </span>
          );
        })}
      </code>
    </pre>
  );
}

export function UnderTheHood() {
  const [active, setActive] = useState(0);
  const panel = underTheHood[active];

  return (
    <section id="engineering" className="container-x py-16 sm:py-24">
      <div className="max-w-2xl">
        <p className="section-label">Under the hood</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight text-ink-50 sm:text-4xl">
          Boring guarantees, written down
        </h2>
        <p className="mt-4 text-ink-300">
          The interesting parts of ticketing are not the screens — they are the guarantees. Three of
          them, with the code that makes them true.
        </p>
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:gap-12">
        <div>
          <div role="tablist" aria-label="Guarantees" className="flex flex-wrap gap-2">
            {underTheHood.map((item, index) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                id={`tab-${item.id}`}
                aria-selected={active === index}
                aria-controls={`panel-${item.id}`}
                onClick={() => setActive(index)}
                className={
                  active === index
                    ? 'btn-primary px-4 py-2 text-xs'
                    : 'btn-ghost px-4 py-2 text-xs'
                }
              >
                {item.tab}
              </button>
            ))}
          </div>

          <div
            role="tabpanel"
            id={`panel-${panel.id}`}
            aria-labelledby={`tab-${panel.id}`}
            className="mt-7"
          >
            <h3 className="font-display text-2xl leading-snug text-ink-50">{panel.headline}</h3>
            <p className="mt-3 text-sm leading-relaxed text-ink-400">{panel.body}</p>
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="flex items-center justify-between gap-4 border-b border-ink-800 px-5 py-3">
            <div className="flex items-center gap-1.5" aria-hidden="true">
              <span className="h-2.5 w-2.5 rounded-full bg-brand-500/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-gold-400/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-ink-600" />
            </div>
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-500">
              {panel.language}
            </p>
          </div>
          <CodeBlock code={panel.code} />
        </div>
      </div>
    </section>
  );
}
