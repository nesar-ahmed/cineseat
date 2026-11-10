'use client';

import { useState, type FormEvent } from 'react';
import { ChangePasswordSchema } from '@cineseat/shared';
import { ApiClientError, changePassword } from '../../lib/api';
import { Notice } from './notice';
import { FormField } from './profile-form';

/**
 * Security tab — `POST /users/me/password`. The API checks the current
 * password before accepting the new one; "repeat password" is checked here
 * only, because it is a typing safeguard, not an account rule.
 */
export function PasswordForm() {
  const [values, setValues] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setNotice(null);
    const parsed = ChangePasswordSchema.safeParse({
      currentPassword: values.currentPassword,
      newPassword: values.newPassword,
    });
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.success ? [] : parsed.error.issues) {
      fieldErrors[String(issue.path[0] ?? 'form')] ??= issue.message;
    }
    if (values.newPassword && values.newPassword !== values.confirmPassword) {
      fieldErrors.confirmPassword = 'Passwords do not match';
    }
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length > 0) return;

    setBusy(true);
    try {
      await changePassword(parsed.data as { currentPassword: string; newPassword: string });
      setValues({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setNotice({ kind: 'success', text: 'Password changed — existing sessions stay valid until their token expires.' });
    } catch (error) {
      setNotice({
        kind: 'error',
        text: error instanceof ApiClientError ? error.message : 'Could not change the password — try again.',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="flex max-w-md flex-col gap-4">
      {notice ? <Notice kind={notice.kind}>{notice.text}</Notice> : null}
      <FormField id="pw-current" label="Current password" error={errors.currentPassword}>
        <input
          id="pw-current"
          type="password"
          className="input"
          autoComplete="current-password"
          value={values.currentPassword}
          disabled={busy}
          onChange={(e) => setValues((v) => ({ ...v, currentPassword: e.target.value }))}
        />
      </FormField>
      <FormField
        id="pw-new"
        label="New password"
        error={errors.newPassword}
        hint="8–72 characters, at least one letter and one digit."
      >
        <input
          id="pw-new"
          type="password"
          className="input"
          autoComplete="new-password"
          value={values.newPassword}
          disabled={busy}
          onChange={(e) => setValues((v) => ({ ...v, newPassword: e.target.value }))}
        />
      </FormField>
      <FormField id="pw-confirm" label="Repeat new password" error={errors.confirmPassword}>
        <input
          id="pw-confirm"
          type="password"
          className="input"
          autoComplete="new-password"
          value={values.confirmPassword}
          disabled={busy}
          onChange={(e) => setValues((v) => ({ ...v, confirmPassword: e.target.value }))}
        />
      </FormField>
      <div>
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? 'Changing…' : 'Change password'}
        </button>
      </div>
    </form>
  );
}
