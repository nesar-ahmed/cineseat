import type { Metadata } from 'next';
import { PasswordSettings } from '../../../../../features/account/settings/password-settings';

export const metadata: Metadata = {
  title: 'Password · Settings — CineSeat',
  robots: { index: false, follow: false },
};

export default function Page() {
  return <PasswordSettings />;
}
