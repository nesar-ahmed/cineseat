import type { Metadata } from 'next';
import { AccountPanel } from '../../../features/account/account-panel';

export const metadata: Metadata = {
  title: 'My account — CineSeat',
  description: 'Your CineSeat profile, avatar, password and (for admins) the user directory.',
};

// The route itself stays thin (guideline 5.2); the panel reads the session
// from AuthProvider and talks to the phase-1 auth/users endpoints.
export default function AccountPage() {
  return (
    <div className="container-x py-10 sm:py-14">
      <div className="mx-auto w-full max-w-3xl">
        <AccountPanel />
      </div>
    </div>
  );
}
