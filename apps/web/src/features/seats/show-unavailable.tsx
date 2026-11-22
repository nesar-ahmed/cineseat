import Link from 'next/link';
import { SeatIcon } from '../../components/ui/icons';

/** An unknown or cancelled showtime (404), or an API that cannot be reached right now. */
export function ShowUnavailable({ reason }: { reason: 'missing' | 'unreachable' }) {
  const missing = reason === 'missing';
  return (
    <div className="container-x flex flex-col items-center py-24 text-center sm:py-32">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/[0.05] text-ink-300">
        <SeatIcon className="h-7 w-7" />
      </span>
      <h1 className="mt-8 text-3xl font-semibold tracking-tight text-ink-50 sm:text-4xl">
        {missing ? 'This showtime isn’t available' : 'Couldn’t load this showtime'}
      </h1>
      <p className="mt-4 max-w-md text-ink-400">
        {missing
          ? 'It may have been cancelled, or the link is mistyped. Pick another time from the movie’s page.'
          : 'The box office is not answering right now. Try again in a moment.'}
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        {missing ? null : (
          // A full reload: the page is rendered on the server.
          <a href="" className="btn-primary">
            Try again
          </a>
        )}
        <Link href="/movies" className={missing ? 'btn-primary' : 'btn-ghost'}>
          Browse movies
        </Link>
      </div>
    </div>
  );
}
