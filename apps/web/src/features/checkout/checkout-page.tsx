'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import type { Booking } from '@cineseat/shared';
import {
  ChevronLeftIcon,
  InfoIcon,
  MapPinIcon,
  ShieldIcon,
  UserIcon,
} from '../../components/ui/icons';
import { useHydrated } from '../../hooks/use-hydrated';
import { ApiClientError, fieldError } from '../../lib/api';
import { useAuth } from '../auth/auth-provider';
import { dayInfo, money, runtime, time12 } from '../catalog/format';
import { PosterArt } from '../catalog/poster-art';
import { useMovie } from '../catalog/queries';
import { CATEGORY_LABEL } from '../seats/seat-grid';
import { useCountdown } from '../seats/use-countdown';
import { bookingHref, bookingKey, isNotFound, useBooking } from '../bookings/queries';
import { CheckoutSteps } from './checkout-steps';
import { OfferCode } from './offer-code';
import { SummaryBar, SummaryPanel, type SummaryProps } from './order-summary';
import { isGone, isPayable, useApplyCode, useQuote, useStartPayment } from './queries';
import { ACCOUNT_ROUTES } from '../account/links';

/** After this long without word from the provider, the buyer may go back to checkout. */
const SLOW_CONFIRMATION_MS = 20_000;

type Props = {
  bookingId: string;
  /** `?payment=` — set when the gateway sends the buyer back. */
  returnedRef: string | null;
};

/**
 * Checkout for a hold, and where the payment gateway sends the buyer back.
 * Everything on it is private and live, so it renders in the browser only.
 */
export function CheckoutPage(props: Props) {
  return useHydrated() ? <Checkout {...props} /> : <PageSkeleton />;
}

function Checkout({ bookingId, returnedRef }: Props) {
  const { status } = useAuth();
  const [waiting, setWaiting] = useState(returnedRef !== null);
  const query = useBooking(bookingId, (booking) =>
    Boolean(waiting && booking?.status === 'PENDING' && booking.payment?.status === 'PENDING'),
  );
  const booking = query.data;

  // The last booking seen: if the hold runs out unpaid it is deleted (404), and
  // the page still knows which show to send the buyer back to.
  const lastSeen = useRef<Booking | null>(null);
  if (booking) lastSeen.current = booking;

  // A settled payment needs no ?payment= in the address any more.
  useEffect(() => {
    if (returnedRef && booking && booking.payment?.status !== 'PENDING') {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, [returnedRef, booking]);

  if (status === 'loading' || (query.isPending && !query.isError)) return <PageSkeleton />;
  if (status === 'unauthenticated') {
    return (
      <Message
        title="Sign in to continue"
        body="Your session has ended. Sign in again to get back to your seats."
        actions={
          <Link
            href={`/login?next=${encodeURIComponent(`/checkout/${bookingId}`)}`}
            className="btn-primary"
          >
            Sign in
          </Link>
        }
      />
    );
  }
  if (isNotFound(query.error)) return <HoldEnded booking={lastSeen.current} />;
  if (!booking) {
    return (
      <Message
        title="Couldn’t load your checkout"
        body={query.error?.message ?? 'Please try again.'}
        actions={
          <button type="button" onClick={() => void query.refetch()} className="btn-primary">
            Try again
          </button>
        }
      />
    );
  }

  if (booking.status === 'CONFIRMED')
    return <ToTicket bookingId={booking.id} fresh={returnedRef !== null} />;
  if (booking.status === 'FAILED' || booking.status === 'CANCELLED') {
    return <NotCompleted booking={booking} />;
  }
  if (waiting && booking.payment?.status === 'PENDING') {
    return <Confirming onGiveUp={() => setWaiting(false)} />;
  }
  if (!isPayable(booking, Date.now())) return <HoldEnded booking={booking} />;

  const lastAttempt =
    returnedRef && booking.payment?.status === 'FAILED' ? booking.payment.failureReason : null;
  const stillOpen = !waiting && returnedRef !== null && booking.payment?.status === 'PENDING';
  return <CheckoutForm booking={booking} lastAttempt={lastAttempt} stillOpen={stillOpen} />;
}

// ── Paying ───────────────────────────────────────────────────────────────────

function CheckoutForm({
  booking,
  lastAttempt,
  stillOpen,
}: {
  booking: Booking;
  /** Why the last payment did not go through, when the buyer just came back from it. */
  lastAttempt: string | null;
  /** The provider has not answered about the last payment yet. */
  stillOpen: boolean;
}) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  // An offer chosen before (it is kept on the booking once payment starts) stays applied.
  const [code, setCode] = useState<string | null>(booking.coupon?.code ?? null);
  const [notice, setNotice] = useState<string | null>(null);
  const quote = useQuote(booking.id, code, true);
  const applyCode = useApplyCode(booking.id);
  const pay = useStartPayment(booking.id);

  const refresh = () => void queryClient.invalidateQueries({ queryKey: bookingKey(booking.id) });
  const secondsLeft = useCountdown(booking.expiresAt, refresh);
  const holdSeconds = Math.max(
    1,
    (Date.parse(booking.expiresAt ?? booking.createdAt) - Date.parse(booking.createdAt)) / 1000,
  );

  // A code applied earlier may have stopped applying (say, fully redeemed): drop it, say why.
  useEffect(() => {
    const reason = fieldError(quote.error, 'couponCode');
    if (code && reason) {
      setCode(null);
      setNotice(`${code} was removed: ${reason}`);
    } else if (isGone(quote.error)) {
      refresh();
    }
    // Keyed on the quote's error alone: this reacts to a failed price check, nothing else.
  }, [quote.error]);

  const price = quote.data ?? {
    subtotal: booking.subtotal,
    discount: 0,
    total: booking.subtotal,
    coupon: null,
  };

  const onApply = async (candidate: string): Promise<string | null> => {
    try {
      await applyCode.mutateAsync(candidate);
      setCode(candidate);
      setNotice(null);
      return null;
    } catch (error) {
      if (isGone(error)) refresh();
      return fieldError(error, 'couponCode') ?? (error as Error).message;
    }
  };

  const onPay = () => {
    setNotice(null);
    pay.mutate(code ? { couponCode: code } : {}, {
      // The gateway is "another site": leave the app the way a real provider would be reached.
      onSuccess: (session) => window.location.assign(session.redirectUrl),
      onError: (error) => {
        if (error instanceof ApiClientError && [404, 409, 410].includes(error.status)) {
          refresh();
          return;
        }
        const reason = fieldError(error, 'couponCode');
        if (reason) setCode(null);
        setNotice(reason ? `${code} was removed: ${reason}` : error.message);
      },
    });
  };

  // The clock ran out. Until the expiry job runs, the API still says PENDING (the same
  // data, so nothing above re-renders): this view decides for itself.
  if (secondsLeft === 0) return <HoldEnded booking={booking} />;

  const summary: SummaryProps = {
    booking,
    subtotal: price.subtotal,
    discount: price.discount,
    total: price.total,
    code,
    secondsLeft,
    holdSeconds,
    pricing: quote.isFetching || applyCode.isPending,
    paying: pay.isPending || pay.isSuccess,
    onPay,
  };

  return (
    <>
      <Header booking={booking} step={1} />
      <div className="container-x grid gap-8 pb-4 pt-8 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-10">
        <div className="min-w-0 space-y-5">
          {lastAttempt ? (
            <Banner tone="error">
              <strong className="font-semibold">Payment not completed.</strong> {lastAttempt} Your
              seats are still held — you can try again.
            </Banner>
          ) : null}
          {stillOpen ? (
            <Banner tone="info">
              We haven’t heard back about your last payment yet. If it went through, this page
              updates by itself; otherwise you can pay again.
            </Banner>
          ) : null}
          {notice ? (
            <div role="alert">
              <Banner tone="error">{notice}</Banner>
            </div>
          ) : null}

          <ShowCard booking={booking} />
          <OfferCode
            applied={
              code && quote.data?.coupon
                ? { ...quote.data.coupon, discount: quote.data.discount }
                : null
            }
            onApply={onApply}
            onRemove={() => {
              setCode(null);
              setNotice(null);
            }}
            busy={applyCode.isPending}
            disabled={pay.isPending}
          />
          <section aria-labelledby="contact-title" className="card rounded-3xl p-6">
            <h2
              id="contact-title"
              className="flex items-center gap-2 font-sans text-base font-semibold text-ink-50"
            >
              <UserIcon className="h-4 w-4 text-ink-400" />
              Booking for
            </h2>
            <p className="mt-3 text-sm text-ink-100">
              {user?.name} · <span className="text-ink-300">{user?.email}</span>
              {user?.phone ? <span className="text-ink-300"> · {user.phone}</span> : null}
            </p>
            <p className="mt-1 text-xs text-ink-400">
              The booking is saved to your account, under My bookings.{' '}
              <Link href="/account" className="font-semibold text-ink-300 hover:text-ink-100">
                Edit details
              </Link>
            </p>
          </section>
          <section aria-labelledby="pay-how-title" className="card rounded-3xl p-6">
            <h2
              id="pay-how-title"
              className="flex items-center gap-2 font-sans text-base font-semibold text-ink-50"
            >
              <ShieldIcon className="h-4 w-4 text-ink-400" />
              How you pay
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-ink-300">
              Next you go to <span className="font-semibold text-ink-100">CineSeat Test Pay</span>,
              our test payment page, and come straight back here. Pay with a test card such as{' '}
              <span className="font-mono text-ink-100">4242 4242 4242 4242</span> or a bKash/Nagad
              test code — no real money moves and real cards are not accepted.
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

function ShowCard({ booking }: { booking: Booking }) {
  const { show } = booking;
  const movie = useMovie(show.movie.id).data;
  return (
    <section aria-labelledby="show-title" className="card rounded-3xl p-6">
      <div className="flex gap-5">
        {movie ? (
          <PosterArt
            movie={movie}
            showTitle={false}
            className="aspect-[2/3] w-20 shrink-0 rounded-xl ring-1 ring-white/10"
          />
        ) : (
          <div
            aria-hidden="true"
            className="aspect-[2/3] w-20 shrink-0 rounded-xl bg-white/[0.05]"
          />
        )}
        <div className="min-w-0 flex-1">
          <h2
            id="show-title"
            className="truncate text-2xl font-semibold tracking-tight text-ink-50"
          >
            {show.movie.title}
          </h2>
          <p className="mt-1 text-sm font-semibold text-ink-100">
            {dayInfo(show.date).long} · {time12(show.time)}
          </p>
          <p className="mt-1 flex items-center gap-1 text-sm text-ink-300">
            <MapPinIcon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {show.theater.name}, {show.screen.name} · {show.theater.city}
            </span>
          </p>
          <p className="mt-1 text-xs text-ink-400">
            {show.format} · {show.language} · {show.movie.certificate} ·{' '}
            {runtime(show.movie.durationMin)}
          </p>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-4">
        <ul aria-label="Your seats" className="flex flex-wrap gap-2">
          {booking.seats.map((seat) => (
            <li
              key={seat.id}
              className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm"
            >
              <span className="font-bold text-ink-50">{seat.label}</span>{' '}
              <span className="text-xs text-ink-400">{CATEGORY_LABEL[seat.category]}</span>
            </li>
          ))}
        </ul>
        <Link
          href={`/shows/${encodeURIComponent(show.id)}/seats`}
          className="text-sm font-semibold text-brand-300 hover:text-brand-200"
        >
          Change seats
        </Link>
      </div>
    </section>
  );
}

// ── After the gateway ──────────────────────────────────────────────────────────

function Confirming({ onGiveUp }: { onGiveUp: () => void }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setSlow(true), SLOW_CONFIRMATION_MS);
    return () => window.clearTimeout(id);
  }, []);
  return (
    <>
      <Header step={2} />
      <div
        className="container-x flex flex-col items-center py-20 text-center sm:py-28"
        aria-busy="true"
      >
        <span
          aria-hidden="true"
          className="h-14 w-14 animate-spin rounded-full border-2 border-white/10 border-t-brand-400 motion-reduce:animate-none"
        />
        <h1 role="status" className="mt-8 text-3xl font-semibold tracking-tight text-ink-50">
          Confirming your payment…
        </h1>
        <p className="mt-3 max-w-md text-ink-400">
          The payment provider is telling us how it went. This takes a few seconds — please keep
          this page open.
        </p>
        {slow ? (
          <div className="mt-8 max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-sm text-ink-300">
            <p>
              This is taking longer than usual. If you completed the payment, the page updates by
              itself as soon as we hear back.
            </p>
            <button type="button" onClick={onGiveUp} className="btn-ghost mt-4">
              Back to checkout
            </button>
          </div>
        ) : null}
      </div>
    </>
  );
}

/**
 * Paid: the ticket lives in the user panel. Straight from the gateway it opens
 * with "You're booked!"; an old checkout link just leads to the ticket.
 */
function ToTicket({ bookingId, fresh }: { bookingId: string; fresh: boolean }) {
  const router = useRouter();
  useEffect(() => {
    router.replace(bookingHref(bookingId, { confirmed: fresh }));
  }, [router, bookingId, fresh]);
  return (
    <>
      <Header step={4} />
      <div className="container-x flex flex-col items-center py-20 text-center sm:py-28">
        <p role="status" className="text-2xl font-semibold tracking-tight text-ink-50">
          Payment confirmed — opening your ticket…
        </p>
        <Link href={bookingHref(bookingId)} className="btn-ghost mt-6">
          Open my ticket
        </Link>
      </div>
    </>
  );
}

function NotCompleted({ booking }: { booking: Booking }) {
  const refunded = booking.payment?.status === 'REFUNDED';
  return (
    <Message
      title="Booking not completed"
      body={
        <>
          {booking.payment?.failureReason ?? 'The seat hold ended before the payment went through.'}{' '}
          {refunded
            ? `The ${money(booking.payment!.amount)} you paid has been refunded in full (test mode — no real money moved).`
            : 'You were not charged.'}
        </>
      }
      actions={<BackToSeats booking={booking} />}
    />
  );
}

function HoldEnded({ booking }: { booking: Booking | null }) {
  // Without a booking we never saw this checkout: it ended before the page opened, or it is not ours.
  return booking ? (
    <Message
      title="Your seat hold has ended"
      body="The seats went back on sale. If they are still free, you can pick them again in a moment."
      actions={<BackToSeats booking={booking} />}
    />
  ) : (
    <Message
      title="This checkout is not available"
      body="The seat hold may have run out, or the link belongs to another account. Your own bookings are in My bookings."
      actions={
        <>
          <Link href={ACCOUNT_ROUTES.tickets} className="btn-ghost">
            My tickets
          </Link>
          <BackToSeats booking={null} />
        </>
      }
    />
  );
}

function BackToSeats({ booking }: { booking: Booking | null }) {
  return (
    <>
      {booking ? (
        <Link href={`/shows/${encodeURIComponent(booking.show.id)}/seats`} className="btn-primary">
          Pick seats again
        </Link>
      ) : null}
      <Link href="/movies" className={booking ? 'btn-ghost' : 'btn-primary'}>
        Browse movies
      </Link>
    </>
  );
}

// ── Chrome ────────────────────────────────────────────────────────────────────

function Header({ booking, step }: { booking?: Booking; step: 1 | 2 | 4 }) {
  return (
    <div className="border-b border-white/[0.06]">
      <div className="container-x flex flex-wrap items-center justify-between gap-4 py-5">
        {booking ? (
          <Link
            href={`/shows/${encodeURIComponent(booking.show.id)}/seats`}
            className="inline-flex items-center gap-1 text-sm text-ink-400 hover:text-ink-100"
          >
            <ChevronLeftIcon className="h-4 w-4" />
            Seats
          </Link>
        ) : (
          <span />
        )}
        <CheckoutSteps current={step} />
      </div>
      {step === 1 ? (
        <div className="container-x pb-2">
          <h1 className="text-3xl font-semibold tracking-tight text-ink-50 sm:text-4xl">
            Checkout
          </h1>
        </div>
      ) : null}
    </div>
  );
}

function Message({ title, body, actions }: { title: string; body: ReactNode; actions: ReactNode }) {
  return (
    <div className="container-x flex flex-col items-center py-20 text-center sm:py-28">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.05] text-ink-300">
        <InfoIcon className="h-6 w-6" />
      </span>
      <h1 className="mt-6 text-3xl font-semibold tracking-tight text-ink-50">{title}</h1>
      <p className="mt-3 max-w-md text-ink-400">{body}</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">{actions}</div>
    </div>
  );
}

function Banner({ tone, children }: { tone: 'info' | 'error'; children: ReactNode }) {
  return (
    <p
      className={`flex items-start gap-2.5 rounded-2xl border px-4 py-3 text-sm ${
        tone === 'error'
          ? 'border-gold-400/40 bg-gold-400/10 text-gold-100'
          : 'border-white/10 bg-white/[0.04] text-ink-200'
      }`}
    >
      <InfoIcon className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

function PageSkeleton() {
  return (
    <div
      aria-busy="true"
      className="container-x grid animate-pulse gap-8 py-10 motion-reduce:animate-none lg:grid-cols-[minmax(0,1fr)_380px]"
    >
      <span className="sr-only">Loading your checkout</span>
      <div aria-hidden="true" className="space-y-5">
        <div className="h-10 w-48 rounded-xl bg-white/[0.06]" />
        <div className="card h-44 rounded-3xl" />
        <div className="card h-36 rounded-3xl" />
      </div>
      <div aria-hidden="true" className="card hidden h-96 rounded-3xl lg:block" />
    </div>
  );
}
