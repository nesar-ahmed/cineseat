'use client';

import { useState, type FormEvent } from 'react';
import { ChangeEmailSchema } from '@cineseat/shared';
import { InfoIcon, MailIcon } from '../../../components/ui/icons';
import { ApiClientError, changeEmail, fieldError } from '../../../lib/api';
import { useAuth } from '../../auth/auth-provider';
import { Notice } from '../notice';
import {
  describedBy,
  Field,
  focusFirstError,
  Panel,
  PasswordInput,
  useUnsavedChangesWarning,
} from './form-kit';

type Key = 'email' | 'confirm' | 'currentPassword';
const EMPTY: Record<Key, string> = { email: '', confirm: '', currentPassword: '' };
const ID: Record<Key, string> = {
  email: 'em-new',
  confirm: 'em-confirm',
  currentPassword: 'em-password',
};

/**
 * Email settings (`PATCH /users/me/email`). The email is the sign-in name and no
 * confirmation email is sent, so the new address is typed twice — a typo here
 * would lock the account — and the current password proves it is the owner.
 */
export function EmailSettings() {
  const { user, setUser } = useAuth();
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<Key, string>>>({});
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useUnsavedChangesWarning(Object.values(values).some(Boolean));

  if (!user) return null;

  const set = (key: Key, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const fail = (found: Partial<Record<Key, string>>) => {
    setErrors(found);
    focusFirstError((Object.keys(ID) as Key[]).filter((key) => found[key]).map((key) => ID[key]));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setNotice(null);

    const found: Partial<Record<Key, string>> = {};
    const parsed = ChangeEmailSchema.safeParse({
      email: values.email,
      currentPassword: values.currentPassword,
    });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0]) as Key;
        found[key] ??= issue.message;
      }
    }
    const wanted = normalise(values.email);
    if (!found.email && wanted === user.email) found.email = 'This is already your email address.';
    if (!values.confirm.trim()) found.confirm = 'Type the new address again.';
    else if (normalise(values.confirm) !== wanted) found.confirm = 'The two addresses don’t match.';
    if (Object.keys(found).length > 0 || !parsed.success) return fail(found);

    setBusy(true);
    try {
      const updated = await changeEmail(parsed.data);
      setUser(updated);
      setValues(EMPTY);
      setErrors({});
      setNotice({
        kind: 'success',
        text: `Email updated. Sign in with ${updated.email} from now on.`,
      });
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 409) {
        return fail({ email: 'Another account already uses this address.' });
      }
      if (error instanceof ApiClientError && /current password/i.test(error.message)) {
        return fail({ currentPassword: 'That password isn’t right.' });
      }
      const onEmail = fieldError(error, 'email');
      if (onEmail) return fail({ email: onEmail });
      setNotice({
        kind: 'error',
        text:
          error instanceof ApiClientError && error.status === 429
            ? 'Too many attempts. Wait a minute, then try again.'
            : error instanceof ApiClientError
              ? error.message
              : 'Could not update your email — try again.',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Panel id="current-email" title="Current email">
        <div className="flex items-center gap-4">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gold-400/15 text-gold-200 ring-1 ring-gold-400/30">
            <MailIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="break-all font-semibold text-ink-50">{user.email}</p>
            <p className="mt-0.5 text-sm text-ink-400">
              You sign in with this address, and booking updates are sent for it.
            </p>
          </div>
        </div>
      </Panel>

      <form onSubmit={submit} noValidate>
        <Panel
          id="change-email"
          title="Change email"
          description="Enter the new address twice, then confirm with your password."
          footer={
            <button
              type="submit"
              disabled={busy}
              className="btn-primary w-full px-5 py-2.5 disabled:opacity-60 sm:w-auto"
            >
              {busy ? 'Updating…' : 'Update email'}
            </button>
          }
        >
          <div className="flex flex-col gap-5">
            {notice ? <Notice kind={notice.kind}>{notice.text}</Notice> : null}
            <div className="grid gap-5 sm:grid-cols-2">
              <Field id={ID.email} label="New email" error={errors.email}>
                <input
                  id={ID.email}
                  className="input"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  spellCheck={false}
                  autoCapitalize="off"
                  placeholder="you@example.com"
                  value={values.email}
                  onChange={(event) => set('email', event.target.value)}
                  disabled={busy}
                  aria-invalid={errors.email ? true : undefined}
                  aria-describedby={describedBy(ID.email, { error: errors.email })}
                />
              </Field>
              <Field id={ID.confirm} label="Confirm new email" error={errors.confirm}>
                <input
                  id={ID.confirm}
                  className="input"
                  type="email"
                  inputMode="email"
                  autoComplete="off"
                  spellCheck={false}
                  autoCapitalize="off"
                  value={values.confirm}
                  onChange={(event) => set('confirm', event.target.value)}
                  disabled={busy}
                  aria-invalid={errors.confirm ? true : undefined}
                  aria-describedby={describedBy(ID.confirm, { error: errors.confirm })}
                />
              </Field>
            </div>
            <Field
              id={ID.currentPassword}
              label="Current password"
              hint={PASSWORD_HINT}
              error={errors.currentPassword}
            >
              <PasswordInput
                id={ID.currentPassword}
                autoComplete="current-password"
                value={values.currentPassword}
                onChange={(event) => set('currentPassword', event.target.value)}
                disabled={busy}
                hint={PASSWORD_HINT}
                error={errors.currentPassword}
              />
            </Field>
            <p className="flex items-start gap-2.5 rounded-2xl border border-white/[0.07] bg-white/[0.025] px-4 py-3 text-sm text-ink-300">
              <InfoIcon className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" />
              <span>
                You’ll stay signed in here. Next time, sign in with the new address and your current
                password.
              </span>
            </p>
          </div>
        </Panel>
      </form>
    </div>
  );
}

const PASSWORD_HINT = 'We ask for it so only you can change where you sign in.';

/** The API trims and lowercases emails; compare the same way. */
function normalise(email: string): string {
  return email.trim().toLowerCase();
}
