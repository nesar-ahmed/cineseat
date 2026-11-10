import { Suspense } from 'react';
import type { Metadata } from 'next';
import { LoginForm } from '../../../features/auth/auth-forms';

export const metadata: Metadata = {
  title: 'Sign in — CineSeat',
  description: 'Sign in to your CineSeat account.',
};

// LoginForm reads ?next (where to return after a protected route bounced us
// here), so it is wrapped in Suspense for the static shell.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
