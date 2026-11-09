import { MapPinIcon, StarIcon } from '../../components/ui/icons';
import { comingSoonCount, demoMovies } from './demo-data';

/**
 * Poster tiles are painted with CSS gradients instead of images: nothing to
 * download, nothing to 404, and the phase 2 catalog can drop straight in —
 * `MovieSchema` already carries `posterPath` for when real art exists on disk.
 */
export function NowShowing() {
  const genres = Array.from(new Set(demoMovies.map((movie) => movie.genre)));

  return (
    <section id="browse" className="container-x py-16 sm:py-24">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="section-label">Tonight &amp; this week</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-ink-50 sm:text-4xl">
            Now showing
          </h2>
        </div>
        <p className="max-w-xs text-sm text-ink-400">
          {demoMovies.length} of 10 seeded titles, plus {comingSoonCount} coming soon. Times come from
          the show calendar, not a hand-written list.
        </p>
      </div>

      <ul
        className="mt-8 flex flex-wrap gap-2"
        aria-label="Genres showing this week"
      >
        {genres.map((genre) => (
          <li key={genre} className="chip">
            {genre}
          </li>
        ))}
        <li className="chip border-gold-400/40 text-gold-300">
          <MapPinIcon className="h-3.5 w-3.5" /> Dhaka · Chattogram
        </li>
      </ul>

      <ul className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 lg:grid-cols-6">
        {demoMovies.map((movie) => (
          <li key={movie.id} className="group">
            <article className="card grain relative overflow-hidden rounded-2xl p-0 transition duration-200 hover:-translate-y-1 hover:shadow-lift motion-reduce:transition-none motion-reduce:hover:translate-y-0">
              <div
                aria-hidden="true"
                className="relative flex aspect-[2/3] flex-col justify-end p-3.5"
                style={{ backgroundImage: `linear-gradient(160deg, ${movie.gradient[0]}, ${movie.gradient[1]})` }}
              >
                <span className="chip absolute right-2.5 top-2.5 border-gold-400/40 bg-ink-950/50 text-gold-300">
                  <StarIcon className="h-3 w-3" />
                  {movie.rating.toFixed(1)}
                </span>
                <h3 className="font-display text-base font-semibold leading-snug text-white drop-shadow-sm sm:text-lg">
                  {movie.title}
                </h3>
                <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-white/70">
                  {movie.genre} · {movie.durationMin} min
                </p>
              </div>

              <div className="space-y-2 px-3.5 py-3.5">
                <p className="text-[11px] text-ink-500">{movie.language}</p>
                <ul className="flex flex-wrap gap-1.5">
                  {movie.showtimes.map((time) => (
                    <li
                      key={time}
                      className="rounded-lg border border-ink-700 px-2 py-1 font-mono text-[11px] text-ink-200 transition group-hover:border-brand-500/60 group-hover:text-ink-50 motion-reduce:transition-none"
                    >
                      {time}
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          </li>
        ))}
      </ul>

      <p className="mt-6 text-xs text-ink-500">
        Sample titles from <code className="font-mono text-ink-400">apps/api/prisma/seed.ts</code> —
        the catalog endpoints replace them in phase 2.
      </p>
    </section>
  );
}
