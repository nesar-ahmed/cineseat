import type { Metadata } from 'next';
import { GatewayPage } from '../../../../features/mock-gateway/gateway-page';

export const metadata: Metadata = {
  title: 'CineSeat Test Pay — test mode',
  robots: { index: false, follow: false },
};

type Props = { params: Promise<{ ref: string }> };

/**
 * The mock payment gateway's hosted page (`redirectUrl` from POST /checkout/:id/pay).
 * It stands in for a payment provider's site: public (the reference is the key),
 * rendered without CineSeat's header and footer, test mode only.
 */
export default async function MockPaymentRoute({ params }: Props) {
  const { ref } = await params;
  return <GatewayPage key={ref} reference={ref} />;
}
