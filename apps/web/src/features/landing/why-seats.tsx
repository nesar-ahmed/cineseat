import { BoltIcon, CheckIcon, QrIcon, ShieldIcon } from '../../components/ui/icons';

const points = [
  'A five-minute countdown that starts when you pick, not when you pay.',
  'Six seats maximum, one show per booking — the map never lets you build a fantasy cart.',
  'Premium and recliner rows priced apart, shown as shape and colour, never colour alone.',
  'Every state change is announced, so a screen reader hears "Row C, seat 7, sold".',
];

const pillars = [
  {
    icon: ShieldIcon,
    title: 'The hold is a database write',
    body: 'The update only succeeds while the seat is still free, so two racing browsers cannot both claim it.',
  },
  {
    icon: BoltIcon,
    title: 'The map moves while you watch',
    body: 'Seats are broadcast as a diff over Socket.IO — no polling, no refresh, no stale chairs.',
  },
  {
    icon: QrIcon,
    title: 'The ticket is real, not a receipt',
    body: 'A signed QR plus a PDF, generated locally and checked in from the admin panel.',
  },
];

export function WhySeats() {
  return (
    <section className="container-x py-16 sm:py-24">
      <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
        <div>
          <p className="section-label">The seat map</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-ink-50 sm:text-4xl">
            Four states.
            <br />
            Zero arguments.
          </h2>
          <p className="mt-4 max-w-lg text-ink-300">
            Available, yours, held by someone else, sold. That is the whole vocabulary — and the
            product is judged on how honestly it shows them.
          </p>

          <ul className="mt-7 space-y-3.5">
            {points.map((point) => (
              <li key={point} className="flex gap-3 text-sm leading-relaxed text-ink-200">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-brand-400">
                  <CheckIcon className="h-3.5 w-3.5" />
                </span>
                {point}
              </li>
            ))}
          </ul>

          {/* A quiet strip of the four states, decorative next to the copy above. */}
          <div aria-hidden="true" className="mt-9 flex items-center gap-1.5">
            {['free', 'free', 'selected', 'held', 'held', 'booked', 'free', 'free', 'selected', 'booked'].map(
              (state, index) => (
                <span
                  key={`${state}-${index}`}
                  className={`seat h-7 w-7 border ${
                    state === 'selected'
                      ? 'border-brand-400 bg-brand-500 text-white'
                      : state === 'held'
                        ? 'border-gold-400/70 bg-gold-400/15 text-gold-300'
                        : state === 'booked'
                          ? 'border-ink-800 bg-seat-booked text-ink-600'
                          : 'border-ink-700 bg-seat-free text-ink-400'
                  }`}
                >
                  {state === 'selected' ? '✓' : state === 'held' ? '·' : state === 'booked' ? '×' : ''}
                </span>
              ),
            )}
          </div>
        </div>

        <ol className="relative">
          {pillars.map(({ icon: Icon, title, body }, index) => (
            <li
              key={title}
              className={`flex gap-5 py-6 ${index === 0 ? 'pt-0' : 'border-t border-ink-800'} ${
                index === pillars.length - 1 ? 'pb-0' : ''
              }`}
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-ink-700 bg-ink-900 text-brand-400">
                <Icon className="h-5 w-5" />
              </span>
              <div>
                <h3 className="font-display text-xl text-ink-50">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-400">{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
