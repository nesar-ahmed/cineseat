'use client';

import Link from 'next/link';
import { ArrowRightIcon, MapPinIcon, ScreenIcon, SeatIcon } from '../../components/ui/icons';
import { SectionHeading } from '../../components/ui/section-heading';
import { cinemaToday } from '../catalog/format';
import { useTheaters } from '../catalog/queries';

/** Cinema cards from GET /theaters: amenities, capacity and today's programme. */
export function Cinemas() {
  const theaters = useTheaters();
  const today = cinemaToday();
  const cities = new Set((theaters.data ?? []).map((theater) => theater.city)).size;

  return (
    <section
      id="cinemas"
      aria-labelledby="cinemas-title"
      className="container-x scroll-mt-24 pt-24 sm:pt-32"
    >
      <SectionHeading
        id="cinemas-title"
        eyebrow="Our cinemas"
        title={
          theaters.data
            ? `${cities === 1 ? 'One city' : `${cities} cities`}, ${theaters.data.length} halls near you`
            : 'Halls near you'
        }
        description="Every cinema has a recliner row in each hall and 3D shows on Screen 1."
      />

      <ul className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {theaters.isError && !theaters.data ? (
          <li className="card rounded-3xl p-6 text-sm text-ink-400 md:col-span-2 lg:col-span-3">
            Couldn’t load our cinemas right now.{' '}
            <button
              type="button"
              onClick={() => void theaters.refetch()}
              className="font-semibold text-brand-300 hover:text-brand-200"
            >
              Try again
            </button>
          </li>
        ) : null}
        {!theaters.data && !theaters.isError
          ? Array.from({ length: 3 }, (_, i) => (
              <li
                key={i}
                aria-hidden="true"
                className="card h-72 animate-pulse rounded-3xl motion-reduce:animate-none"
              />
            ))
          : null}
        {(theaters.data ?? []).map((cinema) => {
          return (
            <li
              key={cinema.id}
              className="card group relative flex flex-col overflow-hidden rounded-3xl p-6 transition hover:border-white/15"
            >
              <div
                aria-hidden="true"
                className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-400/40 to-transparent"
              />
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-300">
                <MapPinIcon className="h-3.5 w-3.5" /> {cinema.city}
              </p>
              <p className="mt-3 font-display text-2xl font-semibold text-ink-50">
                {cinema.name.replace('CineSeat ', '')}
              </p>
              <p className="mt-1 text-sm text-ink-400">{cinema.address}</p>

              <dl className="mt-6 grid grid-cols-3 gap-3 border-t border-white/[0.06] pt-5 text-sm">
                <div>
                  <dt className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.16em] text-ink-400">
                    <ScreenIcon className="h-3.5 w-3.5" /> Screens
                  </dt>
                  <dd className="mt-1 font-semibold text-ink-100">{cinema.screenCount}</dd>
                </div>
                <div>
                  <dt className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.16em] text-ink-400">
                    <SeatIcon className="h-3.5 w-3.5" /> Seats
                  </dt>
                  <dd className="mt-1 font-semibold text-ink-100">{cinema.seatCount}</dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase tracking-[0.16em] text-ink-400">Today</dt>
                  <dd className="mt-1 font-semibold text-ink-100">{cinema.today.movies} films</dd>
                </div>
              </dl>
              <ul className="mt-4 flex flex-wrap gap-1.5">
                {cinema.amenities.map((item) => (
                  <li key={item} className="chip">
                    {item}
                  </li>
                ))}
              </ul>
              <Link
                href={`/movies?cinema=${cinema.id}&date=${today}`}
                className="btn-ghost mt-6 w-full border-white/10 bg-white/[0.03] group-hover:border-brand-500/50"
              >
                Today’s showtimes ({cinema.today.shows}) <ArrowRightIcon className="h-4 w-4" />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
