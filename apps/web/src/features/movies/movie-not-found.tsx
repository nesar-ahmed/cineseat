import Link from 'next/link';
import { FilmIcon } from '../../components/ui/icons';

/** An unknown or removed movie: say so plainly and point back to what is showing. */
export function MovieNotFound() {
  return (
    <div className="container-x flex flex-col items-center py-24 text-center sm:py-32">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/[0.05] text-ink-300">
        <FilmIcon className="h-7 w-7" />
      </span>
      <p className="section-label mt-8">Error 404</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight text-ink-50 sm:text-5xl">
        This movie isn’t in the catalog
      </h1>
      <p className="mt-4 max-w-md text-ink-400">
        It may have been removed, or the link is mistyped. Here’s what’s showing instead.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/movies" className="btn-primary">
          Browse movies
        </Link>
        <Link href="/movies?tab=soon" className="btn-ghost">
          Coming soon
        </Link>
      </div>
    </div>
  );
}
