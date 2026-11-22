import type { Metadata } from 'next';
import { AdminBookingDetailPage } from '../../../../features/admin/bookings/booking-detail';

export const metadata: Metadata = { title: 'Booking' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AdminBookingDetailPage id={id} />;
}
