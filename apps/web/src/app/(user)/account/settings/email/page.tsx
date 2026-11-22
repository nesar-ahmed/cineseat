import type { Metadata } from 'next';
import { EmailSettings } from '../../../../../features/account/settings/email-settings';

export const metadata: Metadata = {
  title: 'Email address · Settings — CineSeat',
  robots: { index: false, follow: false },
};

export default function Page() {
  return <EmailSettings />;
}
