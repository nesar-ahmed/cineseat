import { Suspense } from 'react';
import type { Metadata } from 'next';
import { SignupForm } from '../../../features/auth/auth-forms';

export const metadata: Metadata = {
  title: 'Create an account — CineSeat',
  description: 'Create your CineSeat account and start booking.',
};

// SignupForm reads ?next (where to return once the account exists), like LoginForm.
export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupForm />
    </Suspense>
  );
}
