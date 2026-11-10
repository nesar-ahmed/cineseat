'use client';

import { useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LoginSchema, SignupSchema } from '@cineseat/shared';
import { LogoMark } from '../../components/ui/icons';
import { ApiClientError } from '../../lib/api';
import { useAuth } from './auth-provider';

/**
 * Login and signup forms. Validation runs through the same Zod schemas the
 * API enforces (`LoginSchema`, `SignupSchema`), so client and server never
 * disagree about what a valid account is — no second rules file to drift.
 */

/** First message per field, keyed by the schema property name. */
function fieldErrors(error: { issues: readonly { path: readonly (string | number | symbol)[]; message: string }[] }): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? 'form');
    out[key] ??= issue.message;
  }
  return out;
}

function messageFor(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  return 'Something went wrong — please try again.';
}

/** Only same-site paths are safe to redirect to after a successful sign-in. */
function safeNext(raw: string | null): string {
  return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/account';
}

function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="mx-auto w-full max-w-md px-5 py-12 sm:py-16">
      <div className="card p-6 sm:p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <LogoMark />
          <h1 className="mt-4 font-display text-2xl text-ink-50">{title}</h1>
          <p className="mt-1 text-sm text-ink-300">{subtitle}</p>
        </div>
        {children}
      </div>
    </section>
  );
}

type FieldProps = {
  id: string;
  label: string;
  type: string;
  autoComplete: string;
  value: string;
  error?: string;
  hint?: string;
  disabled: boolean;
  onChange: (value: string) => void;
};

function Field({ id, label, type, autoComplete, value, error, hint, disabled, onChange }: FieldProps) {
  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        autoComplete={autoComplete}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${id}-msg` : undefined}
        className="input"
      />
      {(error || hint) && (
        <p id={`${id}-msg`} className={error ? 'field-error' : 'field-hint'}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

function FormError({ message }: { message: string }) {
  return (
    <p role="alert" className="rounded-xl border border-brand-500/40 bg-brand-500/10 px-3.5 py-2.5 text-sm text-brand-200">
      {message}
    </p>
  );
}

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { login } = useAuth();
  const [values, setValues] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    const parsed = LoginSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await login(parsed.data);
      router.replace(safeNext(params.get('next')));
    } catch (error) {
      setFormError(messageFor(error));
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to pick your seats.">
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        {formError ? <FormError message={formError} /> : null}
        <Field
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          value={values.email}
          error={errors.email}
          disabled={busy}
          onChange={(email) => setValues((v) => ({ ...v, email }))}
        />
        <Field
          id="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          value={values.password}
          error={errors.password}
          disabled={busy}
          onChange={(password) => setValues((v) => ({ ...v, password }))}
        />
        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p className="mt-5 text-center text-sm text-ink-300">
        New to CineSeat?{' '}
        <a href="/signup" className="font-semibold text-brand-400 hover:text-brand-300">
          Create an account
        </a>
      </p>
    </AuthShell>
  );
}

export function SignupForm() {
  const router = useRouter();
  const { signup } = useAuth();
  const [values, setValues] = useState({ name: '', email: '', password: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    const parsed = SignupSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await signup(parsed.data);
      router.replace('/account');
    } catch (error) {
      setFormError(messageFor(error));
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Create your account" subtitle="One seat, one buyer — starting with you.">
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        {formError ? <FormError message={formError} /> : null}
        <Field
          id="name"
          label="Name"
          type="text"
          autoComplete="name"
          value={values.name}
          error={errors.name}
          disabled={busy}
          onChange={(name) => setValues((v) => ({ ...v, name }))}
        />
        <Field
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          value={values.email}
          error={errors.email}
          disabled={busy}
          onChange={(email) => setValues((v) => ({ ...v, email }))}
        />
        <Field
          id="password"
          label="Password"
          type="password"
          autoComplete="new-password"
          value={values.password}
          error={errors.password}
          hint="8–72 characters, at least one letter and one digit."
          disabled={busy}
          onChange={(password) => setValues((v) => ({ ...v, password }))}
        />
        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? 'Creating account…' : 'Sign up'}
        </button>
      </form>
      <p className="mt-5 text-center text-sm text-ink-300">
        Already have an account?{' '}
        <a href="/login" className="font-semibold text-brand-400 hover:text-brand-300">
          Sign in
        </a>
      </p>
    </AuthShell>
  );
}
