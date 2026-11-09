import { MapPinIcon, ScreenIcon, SeatIcon } from '../../components/ui/icons';
import { demoVenues } from './demo-data';

const screens = demoVenues.length * 2;
const seats = demoVenues.reduce((sum, venue) => sum + venue.seats, 0);

export function Venues() {
  return (
    <section id="venues" className="border-t border-ink-800 bg-ink-900/30">
      <div className="container-x py-16 sm:py-24">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-end lg:gap-16">
          <div>
            <p className="section-label">Where you sit</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-ink-50 sm:text-4xl">
              Two cities, six screens, every seat mapped
            </h2>
            <p className="mt-4 text-ink-300">
              Each screen is generated from a row and column count, so the map on the site is the same
              geometry the box office works from.
            </p>

            <dl className="mt-8 flex flex-wrap gap-x-10 gap-y-4">
              <div>
                <dt className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-ink-500">
                  <ScreenIcon className="h-4 w-4" /> Screens
                </dt>
                <dd className="mt-1 font-display text-3xl text-ink-50">{screens}</dd>
              </div>
              <div>
                <dt className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-ink-500">
                  <SeatIcon className="h-4 w-4" /> Seats
                </dt>
                <dd className="mt-1 font-display text-3xl text-ink-50 tabular-nums">{seats}</dd>
              </div>
            </dl>
          </div>

          <ul className="card divide-y divide-ink-800">
            {demoVenues.map((venue) => (
              <li key={venue.name} className="flex flex-wrap items-center justify-between gap-4 p-5">
                <div className="min-w-0">
                  <h3 className="truncate font-display text-lg text-ink-50">{venue.name}</h3>
                  <p className="mt-1 flex items-center gap-2 text-xs text-ink-400">
                    <MapPinIcon className="h-3.5 w-3.5 shrink-0 text-brand-400" />
                    {venue.address}, {venue.city}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="chip">{venue.screens} screens</span>
                  <span className="chip">
                    {venue.seats}
                    <span className="text-ink-500">seats</span>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
