import { ArrowRightIcon, CheckIcon, QrIcon, ShieldIcon } from '../../components/ui/icons';
import { SeatMapCard } from './seat-map';

export function Hero() {
  return (
    <section id="top" className="relative overflow-hidden">
      {/* Two soft stage lights behind the copy; decorative, so hidden from AT. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-32 left-[-10%] h-[420px] w-[520px] rounded-full bg-brand-600/20 blur-[120px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-[-8%] top-24 h-[320px] w-[380px] rounded-full bg-gold-500/10 blur-[110px]"
      />

      <div className="container-x relative grid items-center gap-12 py-14 sm:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:py-28">
        <div>
          <p className="eyebrow">
            <span className="h-1.5 w-1.5 rounded-full bg-gold-400 animate-seat-pulse motion-reduce:animate-none" />
            Now booking · Dhaka &amp; Chattogram
          </p>

          <h1 className="mt-6 text-[2.6rem] font-semibold leading-[1.04] tracking-tight text-ink-50 xs:text-5xl sm:text-6xl lg:text-[4.1rem]">
            One seat.
            <br />
            One buyer.
            <br />
            <span className="italic text-brand-500">At any moment.</span>
          </h1>

          <p className="mt-6 max-w-xl text-base leading-relaxed text-ink-300 sm:text-lg">
            CineSeat is a ticketing platform built around the one problem that breaks cinemas online:
            two people paying for the same chair. Pick a seat and it is yours for five minutes — held
            in the database, not in a browser tab.
          </p>

          <div className="mt-8 flex flex-col gap-3 xs:flex-row xs:flex-wrap">
            <a href="#browse" className="btn-primary">
              Browse shows
              <ArrowRightIcon className="h-4 w-4" />
            </a>
            <a href="#how" className="btn-ghost">
              See how a hold works
            </a>
          </div>

          <p className="mt-6 flex items-start gap-2 text-sm text-ink-400">
            <ShieldIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" />
            A seat you pick is a seat you get: the hold is a conditional write, so a double booking is
            impossible rather than unlikely.
          </p>
        </div>

        <div className="relative">
          <SeatMapCard />

          {/* A ticket stub floating over the map — the payoff of the whole flow.
              It sits above the card edge so the seat map header stays readable. */}
          <div className="absolute -left-4 -top-11 hidden rotate-[-5deg] sm:block animate-float motion-reduce:animate-none">
            <div className="ticket-edge card flex items-center gap-3 bg-ink-900/95 px-4 py-3 shadow-lift">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gold-400/15 text-gold-300">
                <QrIcon className="h-5 w-5" />
              </span>
              <div className="leading-tight">
                <p className="text-sm font-semibold text-ink-50">Row C · Seat 7</p>
                <p className="text-[11px] text-ink-400">Confirmed · 8:30 PM · Screen 1</p>
              </div>
              <CheckIcon className="h-4 w-4 text-brand-400" />
            </div>
          </div>

          <div className="absolute -bottom-7 right-2 hidden lg:block">
            <p className="chip bg-ink-950/90 shadow-card">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-500 animate-seat-pulse motion-reduce:animate-none" />
              3 seats just held in Screen 2
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
