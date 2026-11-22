'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import type { ShowDetail, ShowSeat } from '@cineseat/shared';
import { ChevronLeftIcon, InfoIcon, MapPinIcon } from '../../components/ui/icons';
import { useHydrated } from '../../hooks/use-hydrated';
import { useNow } from '../../hooks/use-now';
import { ApiClientError } from '../../lib/api';
import { useAuth } from '../auth/auth-provider';
import type { CatalogMovie } from '../catalog/art';
import { dayInfo, runtime, time12 } from '../catalog/format';
import { movieHref } from '../catalog/links';
import { PosterArt } from '../catalog/poster-art';
import { CERTIFICATE_LABEL } from '../landing/content';
import { hasStarted } from '../movies/showtime-button';
import { SummaryBar, SummaryPanel, type SummaryProps } from './hold-summary';
import {
  currentHoldKey,
  seatMapKey,
  useCurrentHold,
  usePlaceHold,
  useReleaseHold,
  useSeatMap,
} from './queries';
import { SeatGrid, type SeatView } from './seat-grid';
import { useCountdown } from './use-countdown';

type Notice = { tone: 'info' | 'success' | 'error'; text: string };

type Props = {
  show: ShowDetail;
  movie: CatalogMovie;
  /** Seats picked before a detour through sign-in (`?seats=`). */
  initialSeats: string[];
};

/**
 * Pick seats for one show and hold them. The show and movie come from the
 * server render; seat states and the buyer's hold are live, so the map itself
 * is drawn in the browser only.
 */
export function SeatPicker({ show, movie, initialSeats }: Props) {
  const hydrated = useHydrated();
  return (
    <div>
      <ShowHeader show={show} movie={movie} />
      {hydrated ? <Picker show={show} initialSeats={initialSeats} /> : <PickerSkeleton />}
    </div>
  );
}

function Picker({ show, initialSeats }: { show: ShowDetail; initialSeats: string[] }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, status } = useAuth();
  const userId = user?.id ?? null;
  const now = useNow();

  const seatMap = useSeatMap(show.id);
  const current = useCurrentHold(userId);
  const place = usePlaceHold(show.id, userId);
  const release = useReleaseHold(show.id, userId);

  const map = seatMap.data;
  const hold = current.data ?? null;
  const holdHere = hold?.showId === show.id ? hold : null;
  const holdElsewhere = hold && hold.showId !== show.id ? hold : null;
  const heldIds = useMemo(() => new Set(holdHere?.seats.map((seat) => seat.id)), [holdHere]);
  const byId = useMemo(() => new Map(map?.seats.map((seat) => [seat.id, seat])), [map]);
  const maxSeats = map?.rules.maxSeats ?? 0;

  // `picked` stays null until the buyer touches the map; until then the picks are
  // their seats on hold, or the ones they chose before signing in.
  const [picked, setPicked] = useState<string[] | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [announcement, setAnnouncement] = useState('');

  /** Free to pick: on sale, or already held by this buyer. */
  const isOpen = useCallback(
    (id: string) => byId.get(id)?.status === 'AVAILABLE' || heldIds.has(id),
    [byId, heldIds],
  );
  const seed = useMemo(
    () =>
      holdHere
        ? holdHere.seats.map((seat) => seat.id)
        : initialSeats.filter((id) => byId.get(id)?.status === 'AVAILABLE').slice(0, maxSeats),
    [holdHere, initialSeats, byId, maxSeats],
  );
  const selection = picked ?? seed;
  const ready = map !== undefined && status !== 'loading' && !(userId && current.isPending);

  // The picks carried through sign-in have done their job; keep the address clean.
  useEffect(() => {
    if (ready && initialSeats.length > 0) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, [ready, initialSeats.length]);

  // Someone else took a seat this buyer had picked (seen on a refresh of the map):
  // drop it and say so. Skipped while a hold is being placed, when the map may
  // already show the new hold before the app knows it is this buyer's.
  useEffect(() => {
    if (!map || place.isPending || picked === null) return;
    const lost = picked.filter((id) => !isOpen(id));
    if (lost.length === 0) return;
    setPicked(picked.filter((id) => isOpen(id)));
    const labels = listOf(lost.map((id) => byId.get(id)?.label ?? 'A seat'));
    setNotice({
      tone: 'error',
      text: `${labels} ${lost.length === 1 ? 'was' : 'were'} just taken by someone else and removed from your picks.`,
    });
    // Deliberately keyed on fresh maps only, judged with the hold as known right then.
  }, [map, place.isPending]);

  const secondsLeft = useCountdown(holdHere?.expiresAt ?? null, () => {
    // Refresh the map first: the seats read as free the moment the hold lapses,
    // so the buyer's picks survive and can be reserved again in one tap.
    setPicked(selection);
    void queryClient.refetchQueries({ queryKey: seatMapKey(show.id) }).then(() => {
      queryClient.setQueryData(currentHoldKey(userId), null);
      setNotice({
        tone: 'error',
        text: 'Your hold ran out and the seats went back on sale. Reserve again to keep the ones still free.',
      });
    });
  });

  const closed = hasStarted(show, now);
  const seats = selection
    .map((id) => byId.get(id))
    .filter((seat): seat is ShowSeat => seat !== undefined)
    .sort((a, b) => a.row - b.row || a.number - b.number);
  const total = seats.reduce((sum, seat) => sum + seat.price, 0);
  const changed = !holdHere || !sameSet(selection, heldIds);

  const viewOf = useCallback(
    (seat: ShowSeat): SeatView =>
      selection.includes(seat.id)
        ? 'selected'
        : isOpen(seat.id)
          ? 'free'
          : seat.status === 'HELD'
            ? 'held'
            : 'booked',
    [selection, isOpen],
  );

  const pick = (seat: ShowSeat) => {
    const view = viewOf(seat);
    if (closed) {
      setNotice({ tone: 'info', text: 'This show has started, so seats can no longer be booked.' });
    } else if (view === 'held') {
      setNotice({
        tone: 'info',
        text: `${seat.label} is on hold for another buyer. It comes back if they do not book in time.`,
      });
    } else if (view === 'booked') {
      setNotice({ tone: 'info', text: `${seat.label} is sold.` });
    } else if (view === 'selected') {
      setPicked(selection.filter((id) => id !== seat.id));
      setNotice(null);
      setAnnouncement(`${seat.label} removed. ${selection.length - 1} picked.`);
    } else if (selection.length >= maxSeats) {
      setNotice({ tone: 'info', text: `You can book up to ${maxSeats} seats at a time.` });
    } else {
      setPicked([...selection, seat.id]);
      setNotice(null);
      setAnnouncement(`${seat.label} picked. ${selection.length + 1} picked.`);
    }
  };

  const signIn = (seatIds: string[]) => {
    const back = `/shows/${show.id}/seats${seatIds.length ? `?seats=${seatIds.join(',')}` : ''}`;
    router.push(`/login?next=${encodeURIComponent(back)}`);
  };

  const reserve = () => {
    if (status !== 'authenticated') return signIn(selection);
    place.mutate(
      { showId: show.id, seatIds: selection },
      {
        onSuccess: (placed) => {
          setPicked(placed.seats.map((seat) => seat.id));
          const minutes = Math.round(
            (Date.parse(placed.expiresAt) - Date.parse(placed.createdAt)) / 60_000,
          );
          setNotice({
            tone: 'success',
            text: `${listOf(placed.seats.map((seat) => seat.label))} ${placed.seats.length === 1 ? 'is' : 'are'} yours for the next ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`,
          });
        },
        onError: (error) => {
          if (error instanceof ApiClientError && error.status === 401) return signIn(selection);
          setNotice({ tone: 'error', text: error.message });
        },
      },
    );
  };

  const releaseSeats = () => {
    if (!holdHere) return;
    release.mutate(holdHere.id, {
      onSuccess: () => {
        setPicked([]);
        setNotice({ tone: 'info', text: 'Your seats were released.' });
      },
      onError: (error) => setNotice({ tone: 'error', text: error.message }),
    });
  };

  if (seatMap.isError && !map) {
    return (
      <div className="container-x py-16 text-center">
        <p className="text-ink-300">Couldn’t load the seat map. {seatMap.error.message}</p>
        <button type="button" onClick={() => void seatMap.refetch()} className="btn-primary mt-6">
          Try again
        </button>
      </div>
    );
  }
  if (!ready || !map) return <PickerSkeleton />;

  const summary: SummaryProps = {
    seats,
    total,
    maxSeats,
    holdMinutes: map.rules.holdMinutes,
    prices: map.prices,
    hold: holdHere,
    secondsLeft,
    changed,
    signedIn: status === 'authenticated',
    closed,
    reserving: place.isPending,
    releasing: release.isPending,
    onReserve: reserve,
    onRelease: releaseSeats,
  };

  return (
    <>
      <div className="container-x grid gap-8 pt-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-10">
        <div className="min-w-0 space-y-4">
          {closed ? (
            <Banner tone="error">
              This show has started and booking is closed.{' '}
              <Link href={movieHref(show.movieId)} className="font-semibold underline">
                Pick another showtime
              </Link>
            </Banner>
          ) : map.counts.available === 0 && !holdHere ? (
            <Banner tone="error">
              This show is sold out right now. Seats on hold come back if they are not booked in
              time.
            </Banner>
          ) : null}
          {holdElsewhere ? (
            <Banner tone="info">
              You are holding {holdElsewhere.seats.length}{' '}
              {holdElsewhere.seats.length === 1 ? 'seat' : 'seats'} for another showtime. Reserving
              here releases {holdElsewhere.seats.length === 1 ? 'it' : 'them'}.{' '}
              <Link
                href={`/shows/${encodeURIComponent(holdElsewhere.showId)}/seats`}
                className="font-semibold underline"
              >
                Go to those seats
              </Link>
            </Banner>
          ) : null}

          <div aria-live="polite" aria-atomic="true">
            {notice ? <Banner tone={notice.tone}>{notice.text}</Banner> : null}
          </div>
          <p aria-live="polite" className="sr-only">
            {announcement}
          </p>

          <section aria-labelledby="seat-map-title" className="card rounded-3xl px-3 py-8 sm:px-8">
            <h2 id="seat-map-title" className="sr-only">
              Seat map
            </h2>
            <SeatGrid map={map} viewOf={viewOf} onPick={pick} />
            <p className="mt-6 text-center text-xs text-ink-500">
              {map.counts.available} of {map.seats.length} seats free · updates live
            </p>
          </section>
        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-28">
            <SummaryPanel {...summary} />
          </div>
        </aside>
      </div>
      <SummaryBar {...summary} />
    </>
  );
}

function Banner({ tone, children }: { tone: Notice['tone']; children: React.ReactNode }) {
  const styles = {
    info: 'border-white/10 bg-white/[0.04] text-ink-200',
    success: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100',
    error: 'border-gold-400/40 bg-gold-400/10 text-gold-100',
  }[tone];
  return (
    <p className={`flex items-start gap-2.5 rounded-2xl border px-4 py-3 text-sm ${styles}`}>
      <InfoIcon className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

/** Which show this is: rendered on the server, so it paints before the map loads. */
function ShowHeader({ show, movie }: { show: ShowDetail; movie: CatalogMovie }) {
  return (
    <section className="relative overflow-hidden border-b border-white/[0.06]">
      <div aria-hidden="true" className="absolute inset-0 opacity-40">
        <PosterArt
          movie={movie}
          variant="backdrop"
          showTitle={false}
          className="h-full w-full blur-md saturate-[1.2]"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-ink-950 via-ink-950/85 to-ink-950/60" />
      </div>
      <div className="container-x relative py-6 sm:py-8">
        <Link
          href={movieHref(movie.id, { city: show.theater.city, date: show.date, show: show.id })}
          className="inline-flex items-center gap-1 text-sm text-ink-400 hover:text-ink-100"
        >
          <ChevronLeftIcon className="h-4 w-4" />
          Showtimes
        </Link>
        <div className="mt-4 flex items-center gap-4 sm:gap-5">
          <PosterArt
            movie={movie}
            showTitle={false}
            className="aspect-[2/3] w-14 shrink-0 rounded-xl ring-1 ring-white/15 sm:w-16"
          />
          <div className="min-w-0">
            <p className="section-label">Choose your seats</p>
            <h1 className="mt-1.5 truncate text-2xl font-semibold tracking-tight text-ink-50 sm:text-4xl">
              {movie.title}
            </h1>
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-300">
              <span className="font-semibold text-ink-50">
                {dayInfo(show.date).long} · {time12(show.time)}
              </span>
              <span className="flex items-center gap-1">
                <MapPinIcon className="h-3.5 w-3.5" />
                {show.theater.name}, {show.screen.name}
              </span>
              <span>
                {show.format} · {show.language}
              </span>
              <span
                title={CERTIFICATE_LABEL[movie.certificate]}
                className="rounded border border-white/25 px-1.5 text-xs font-bold text-ink-50"
              >
                {movie.certificate}
              </span>
              <span>{runtime(movie.durationMin)}</span>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function PickerSkeleton() {
  return (
    <div
      aria-busy="true"
      className="container-x grid animate-pulse gap-8 pt-8 motion-reduce:animate-none lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-10"
    >
      <span className="sr-only">Loading the seat map</span>
      <div aria-hidden="true" className="card h-[30rem] rounded-3xl" />
      <div aria-hidden="true" className="card hidden h-80 rounded-3xl lg:block" />
    </div>
  );
}

function sameSet(ids: string[], set: Set<string>): boolean {
  return ids.length === set.size && ids.every((id) => set.has(id));
}

/** "A1", "A1 and A2", "A1, A2 and A3". */
function listOf(labels: string[]): string {
  return labels.length <= 1
    ? (labels[0] ?? '')
    : `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}
