import type { Metadata } from 'next';
import { SignupForm } from '../../../features/auth/auth-forms';

export const metadata: Metadata = {
  title: 'Create an account — CineSeat',
  description: 'Create your CineSeat account and start booking.',
};

export default function SignupPage() {
  return <SignupForm />;
}
