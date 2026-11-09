import { steps } from './demo-data';

export function HowItWorks() {
  return (
    <section id="how" className="border-y border-ink-800 bg-ink-900/30">
      <div className="container-x py-16 sm:py-24">
        <div className="max-w-2xl">
          <p className="section-label">The journey</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-ink-50 sm:text-4xl">
            From “I want that seat” to walking in
          </h2>
        </div>

        <ol className="relative mt-12 grid gap-10 lg:grid-cols-4 lg:gap-8">
          {/* Connector line, desktop only. */}
          <span
            aria-hidden="true"
            className="absolute left-0 top-6 hidden h-px w-full bg-gradient-to-r from-brand-500/60 via-ink-700 to-transparent lg:block"
          />
          {steps.map((step, index) => (
            <li key={step.title} className="relative">
              <span className="relative z-10 flex h-12 w-12 items-center justify-center rounded-full border border-ink-700 bg-ink-950 font-display text-lg text-gold-400">
                {index + 1}
              </span>
              <h3 className="mt-5 font-display text-xl text-ink-50">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-400">{step.body}</p>
            </li>
          ))}
        </ol>

        <p className="mt-12 text-xs text-ink-500">
          Steps 1–2 are live in the API today; checkout, tickets and the admin panel follow in the
          next phases.
        </p>
      </div>
    </section>
  );
}
