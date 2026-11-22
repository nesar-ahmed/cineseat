import type { Metadata } from 'next';
import { AccountOverview } from '../../../features/account/account-overview';

export const metadata: Metadata = {
  title: 'My account — CineSeat',
  description: 'Your CineSeat account: tickets, invoices, notifications and account settings.',
  robots: { index: false, follow: false },
};

// The route stays thin (guideline 5.2): the overview reads the session from
// AuthProvider and links to every other page of the user panel.
export default function AccountPage() {
  return (
    <div className="container-x py-8 sm:py-12">
      <AccountOverview />
    </div>
  );
}
