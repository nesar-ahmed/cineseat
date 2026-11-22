import type { Metadata } from 'next';
import { BookingDetails } from '../../../../../features/bookings/booking-details';

export const metadata: Metadata = {
  title: 'Your booking · CineSeat',
  robots: { index: false, follow: false },
};

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * A booking in the user panel — the ticket once paid. Checkout sends the buyer
 * here after a successful payment (`?confirmed=1`). Signed-in only (proxy.ts).
 */
export default async function BookingRoute({ params, searchParams }: Props) {
  const [{ id }, search] = await Promise.all([params, searchParams]);
  return <BookingDetails key={id} bookingId={id} justBooked={search.confirmed === '1'} />;
}
