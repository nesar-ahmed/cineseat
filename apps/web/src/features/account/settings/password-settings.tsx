'use client';

import { useState, type FormEvent } from 'react';
import { ChangePasswordSchema } from '@cineseat/shared';
import { CheckIcon, ShieldIcon } from '../../../components/ui/icons';
import { ApiClientError, changePassword } from '../../../lib/api';
import { Notice } from '../notice';
import { Field, focusFirstError, Panel, PasswordInput, useUnsavedChangesWarning } from './form-kit';

type Key = 'currentPassword' | 'newPassword' | 'confirm';
const EMPTY: Record<Key, string> = { currentPassword: '', newPassword: '', confirm: '' };
const ID: Record<Key, string> = {
  currentPassword: 'pw-current',
  newPassword: 'pw-new',
  confirm: 'pw-confirm',
};

/** The rules of `PasswordSchema` (packages/shared/src/auth.ts), as a live checklist. */
function rulesFor(values: Record<Key, string>) {
  const next = values.newPassword;
  return [
    { label: '8 to 72 characters', met: next.length >= 8 && next.length <= 72 },
    { label: 'At least one letter', met: /[A-Za-z]/.test(next) },
    { label: 'At least one number', met: /[0-9]/.test(next) },
    {
      label: 'Different from your current password',
      met: next.length > 0 && next !== values.currentPassword,
    },
  ];
}

/** Password settings (`POST /users/me/password`): current password, then the new one twice. */
export function PasswordSettings() {
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<Key, string>>>({});
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useUnsavedChangesWarning(Object.values(values).some(Boolean));

  const rules = rulesFor(values);

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
    const parsed = ChangePasswordSchema.safeParse({
      currentPassword: values.currentPassword,
      newPassword: values.newPassword,
    });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0]) as Key;
        found[key] ??= issue.message;
      }
    }
    if (!found.newPassword && values.newPassword === values.currentPassword)
      found.newPassword = 'Choose a password you are not using now.';
    if (!values.confirm) found.confirm = 'Type the new password again.';
    else if (values.confirm !== values.newPassword) found.confirm = 'The passwords don’t match.';
    if (Object.keys(found).length > 0 || !parsed.success) return fail(found);

    setBusy(true);
    try {
      await changePassword(parsed.data);
      setValues(EMPTY);
      setErrors({});
      setNotice({
        kind: 'success',
        text: 'Password changed. Use it the next time you sign in. Devices that are already signed in stay signed in until their session ends.',
      });
    } catch (error) {
      if (error instanceof ApiClientError && /current password/i.test(error.message)) {
        return fail({ currentPassword: 'That password isn’t right.' });
      }
      setNotice({
        kind: 'error',
        text:
          error instanceof ApiClientError && error.status === 429
            ? 'Too many attempts. Wait a minute, then try again.'
            : error instanceof ApiClientError
              ? error.message
              : 'Could not change your password — try again.',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate>
      <Panel
        id="change-password"
        title="Change password"
        description="Use a password you don’t use on other sites."
        footer={
          <button
            type="submit"
            disabled={busy}
            className="btn-primary w-full px-5 py-2.5 disabled:opacity-60 sm:w-auto"
          >
            {busy ? 'Changing…' : 'Change password'}
          </button>
        }
      >
        <div className="flex flex-col gap-5">
          {notice ? <Notice kind={notice.kind}>{notice.text}</Notice> : null}
          <Field id={ID.currentPassword} label="Current password" error={errors.currentPassword}>
            <PasswordInput
              id={ID.currentPassword}
              autoComplete="current-password"
              value={values.currentPassword}
              onChange={(event) => set('currentPassword', event.target.value)}
              disabled={busy}
              error={errors.currentPassword}
            />
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field id={ID.newPassword} label="New password" error={errors.newPassword}>
              <PasswordInput
                id={ID.newPassword}
                autoComplete="new-password"
                value={values.newPassword}
                onChange={(event) => set('newPassword', event.target.value)}
                disabled={busy}
                error={errors.newPassword}
                // The checklist below is the field's description when there is no error.
                aria-describedby={errors.newPassword ? `${ID.newPassword}-error` : 'pw-rules'}
              />
            </Field>
            <Field id={ID.confirm} label="Confirm new password" error={errors.confirm}>
              <PasswordInput
                id={ID.confirm}
                autoComplete="new-password"
                value={values.confirm}
                onChange={(event) => set('confirm', event.target.value)}
                disabled={busy}
                error={errors.confirm}
              />
            </Field>
          </div>

          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-ink-100">
              <ShieldIcon className="h-4 w-4 text-gold-300" />
              Your new password needs
            </p>
            <ul id="pw-rules" className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              {rules.map((rule) => (
                <li
                  key={rule.label}
                  className={`flex items-center gap-2 ${rule.met ? 'text-emerald-200' : 'text-ink-400'}`}
                >
                  <span
                    aria-hidden="true"
                    className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                      rule.met
                        ? 'border-emerald-400/50 bg-emerald-400/15'
                        : 'border-white/15 bg-transparent'
                    }`}
                  >
                    {rule.met ? <CheckIcon className="h-3 w-3" /> : null}
                  </span>
                  {rule.label}
                  <span className="sr-only">{rule.met ? ' (done)' : ' (not yet)'}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Panel>
    </form>
  );
}
