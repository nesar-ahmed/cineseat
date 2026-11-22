import type { Metadata } from 'next';
import { ProfileSettings } from '../../../../../features/account/settings/profile-settings';

export const metadata: Metadata = {
  title: 'Profile · Settings — CineSeat',
  robots: { index: false, follow: false },
};

export default function Page() {
  return <ProfileSettings />;
}
