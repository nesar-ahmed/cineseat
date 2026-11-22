import Link from 'next/link';
import {
  ArrowRightIcon,
  BoltIcon,
  ClockIcon,
  GlassesIcon,
  SeatIcon,
  ShieldIcon,
  TicketIcon,
} from '../../components/ui/icons';
import { SectionHeading } from '../../components/ui/section-heading';
import { EXPERIENCES } from './content';
import { taka } from '../catalog/format';
import { SeatMapCard } from './seat-map';

const promises = [
  {
    icon: ClockIcon,
    title: 'Five minutes to check out',
    body: 'Reserve your seats and they are yours for five minutes while you pay — the timer is always on screen.',
  },
  {
    icon: ShieldIcon,
    title: 'Nobody else can take them',
    body: 'Held seats cannot be reserved or paid for by anyone else, so two people never pay for the same seat.',
  },
  {
    icon: BoltIcon,
    title: 'The map keeps up',
    body: 'Held and sold seats appear on the map every few seconds while you choose.',
  },
  {
    icon: TicketIcon,
    title: 'Up to six together',
    body: 'Book the whole row for friends and family in one checkout.',
  },
];

/** Seat rows per tier in the little diagrams: many standard rows, one premium, one recliner. */
const ROWS: Record<(typeof EXPERIENCES)[number]['id'], number> = {
  standard: 3,
  premium: 1,
  recliner: 1,
};

export function SeatExperience() {
  return (
    <section
      aria-labelledby="seats-title"
      className="relative mt-24 overflow-hidden border-y border-white/[0.06] bg-ink-900/30 sm:mt-32"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-40 top-10 h-[420px] w-[520px] rounded-full bg-brand-600/10 blur-[120px]"
      />

      <div className="container-x relative grid items-center gap-14 py-20 sm:py-28 lg:grid-cols-[0.95fr_1.05fr] lg:gap-16">
        <div>
          <SectionHeading
            id="seats-title"
            eyebrow="Choose your seat"
            title={
              <>
                The seat you pick
                <span className="block italic text-brand-500">is the seat you get.</span>
              </>
            }
            description="See every seat in the hall before you pay: what’s free, what’s held and what’s sold. Try it on the sample hall."
          />

          <ul className="mt-9 grid gap-6 sm:grid-cols-2">
            {promises.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-brand-400">
                  <Icon className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="font-sans text-[15px] font-semibold text-ink-50">{title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-ink-400">{body}</p>
                </div>
              </li>
            ))}
          </ul>

          <Link href="/movies" className="btn-primary mt-10">
            Find a show
            <ArrowRightIcon className="h-4 w-4" />
          </Link>
        </div>

        <div className="relative">
          <SeatMapCard />
        </div>
      </div>

      <div className="container-x relative pb-20 sm:pb-28">
        <h3 className="font-sans text-xs font-semibold uppercase tracking-[0.22em] text-ink-400">
          Every hall, three ways to sit
        </h3>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {EXPERIENCES.map((tier) => (
            <li key={tier.id} className="card flex flex-col rounded-3xl p-6">
              <div aria-hidden="true" className="flex h-12 flex-col justify-end gap-1">
                {Array.from({ length: ROWS[tier.id] }, (_, row) => (
                  <div key={row} className="flex gap-1">
                    {Array.from({ length: tier.id === 'recliner' ? 4 : 7 }, (_, seat) => (
                      <span
                        key={seat}
                        className={`seat border ${
                          tier.id === 'standard'
                            ? 'h-2.5 w-4 border-ink-600 bg-seat-free'
                            : tier.id === 'premium'
                              ? 'h-3 w-5 border-gold-400/60 bg-gold-400/15'
                              : 'h-4 w-8 border-gold-300 bg-gold-400/30'
                        }`}
                      />
                    ))}
                  </div>
                ))}
              </div>
              <p className="mt-5 flex items-baseline justify-between gap-3">
                <span className="font-display text-2xl font-semibold text-ink-50">{tier.name}</span>
                <span className="text-sm text-ink-400">
                  {tier.surcharge ? (
                    <>
                      + <span className="font-semibold text-ink-100">{taka(tier.surcharge)}</span>
                    </>
                  ) : (
                    'Show price'
                  )}
                </span>
              </p>
              <p className="mt-2 text-sm leading-relaxed text-ink-400">{tier.blurb}</p>
              <p className="mt-4">
                <span className="chip">{tier.where}</span>
              </p>
            </li>
          ))}
          <li className="relative flex flex-col overflow-hidden rounded-3xl border border-gold-400/25 bg-gradient-to-br from-gold-500/15 via-ink-900/60 to-ink-900/60 p-6 shadow-card">
            <span className="flex h-12 items-end text-gold-300">
              <GlassesIcon className="h-10 w-10" />
            </span>
            <p className="mt-5 flex items-baseline justify-between gap-3">
              <span className="font-display text-2xl font-semibold text-ink-50">3D</span>
              <span className="text-sm text-ink-400">Priced per show</span>
            </p>
            <p className="mt-2 text-sm leading-relaxed text-ink-400">
              Selected shows play in 3D on Screen 1 at every cinema. Look for the 3D tag on the
              showtime.
            </p>
            <p className="mt-4 flex items-center gap-2 text-xs text-gold-300">
              <SeatIcon className="h-4 w-4" /> Every seat tier, in 2D and 3D
            </p>
          </li>
        </ul>
      </div>
    </section>
  );
}
