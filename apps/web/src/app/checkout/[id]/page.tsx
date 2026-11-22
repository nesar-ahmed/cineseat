import type { Metadata } from 'next';
import { CheckoutPage } from '../../../features/checkout/checkout-page';

export const metadata: Metadata = {
  title: 'Checkout · CineSeat',
  robots: { index: false, follow: false },
};

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * A hold's checkout, and the page the payment gateway returns the buyer to
 * (`?payment=<ref>`). Signed-in only (see proxy.ts); the page itself is private,
 * live data, rendered in the browser.
 */
export default async function CheckoutRoute({ params, searchParams }: Props) {
  const [{ id }, search] = await Promise.all([params, searchParams]);
  const payment = Array.isArray(search.payment) ? search.payment[0] : search.payment;
  return (
    <CheckoutPage
      key={id}
      bookingId={id}
      returnedRef={payment && payment.length <= 64 ? payment : null}
    />
  );
}
