'use client';

import { useState, type FormEvent } from 'react';
import { UpdateProfileSchema, type UpdateProfileInput } from '@cineseat/shared';
import { useAuth } from '../auth/auth-provider';
import { ApiClientError, assetUrl, updateProfile, uploadAvatar } from '../../lib/api';
import { Notice } from './notice';

/**
 * Profile tab — edits `PATCH /users/me` and uploads the avatar
 * (`POST /users/me/avatar`). Only fields that actually changed are sent:
 * `UpdateProfileSchema` rejects an empty patch, and a minimal diff is also
 * the honest thing to send.
 */

/** Mirrors `MAX_AVATAR_BYTES` and the type allowlist in apps/api/src/users/avatar.storage.ts. */
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const firstFieldErrors = (error: { issues: readonly { path: readonly (string | number | symbol)[]; message: string }[] }) => {
  const out: Record<string, string> = {};
  for (const issue of error.issues) out[String(issue.path[0] ?? 'form')] ??= issue.message;
  return out;
};

export function ProfileForm() {
  const { user, setUser } = useAuth();
  const [values, setValues] = useState(() => ({
    name: user?.name ?? '',
    phone: user?.phone ?? '',
    preferredCity: user?.preferredCity ?? '',
    preferredGenres: user?.preferredGenres.join(', ') ?? '',
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);

  if (!user) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setNotice(null);

    const genres = values.preferredGenres
      .split(',')
      .map((g) => g.trim())
      .filter(Boolean);

    // Optional fields are simply omitted while empty — the API has no "clear
    // phone" rule, so an empty string must never be sent as one.
    const raw: Record<string, unknown> = {
      name: values.name.trim(),
      preferredGenres: genres,
      ...(values.phone.trim() && { phone: values.phone.trim() }),
      ...(values.preferredCity.trim() && { preferredCity: values.preferredCity.trim() }),
    };

    const parsed = UpdateProfileSchema.safeParse(raw);
    if (!parsed.success) {
      setErrors(firstFieldErrors(parsed.error));
      return;
    }
    setErrors({});

    // Diff against the live profile; send only what changed.
    const d = parsed.data;
    const patch: Record<string, unknown> = {};
    if (d.name !== undefined && d.name !== user.name) patch.name = d.name;
    if (d.phone !== undefined && d.phone !== user.phone) patch.phone = d.phone;
    if (d.preferredCity !== undefined && d.preferredCity !== user.preferredCity) patch.preferredCity = d.preferredCity;
    if (d.preferredGenres !== undefined && d.preferredGenres.join('|') !== user.preferredGenres.join('|'))
      patch.preferredGenres = d.preferredGenres;

    const keys = Object.keys(patch);
    if (keys.length === 0) {
      setNotice({ kind: 'error', text: 'Nothing changed — edit a field first.' });
      return;
    }

    setBusy(true);
    try {
      const updated = await updateProfile(patch as UpdateProfileInput);
      setUser(updated);
      setNotice({ kind: 'success', text: 'Profile saved.' });
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof ApiClientError ? error.message : 'Could not save — try again.' });
    } finally {
      setBusy(false);
    }
  };

  const onPickAvatar = async (file: File | null) => {
    if (!file) return;
    setNotice(null);
    if (!AVATAR_TYPES.includes(file.type)) {
      setNotice({ kind: 'error', text: 'Avatar must be a JPEG, PNG or WebP image.' });
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      setNotice({ kind: 'error', text: 'Avatar must be 2 MB or smaller.' });
      return;
    }
    setAvatarBusy(true);
    try {
      const { avatarUrl } = await uploadAvatar(file);
      setUser({ ...user, avatarUrl });
      setNotice({ kind: 'success', text: 'Avatar updated.' });
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof ApiClientError ? error.message : 'Upload failed — try again.' });
    } finally {
      setAvatarBusy(false);
    }
  };

  const avatar = assetUrl(user.avatarUrl);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-4">
        <span className="inline-flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border border-ink-700 bg-ink-800 font-display text-xl text-ink-100">
          {avatar ? <img src={avatar} alt="" className="h-full w-full object-cover" /> : initialsOf(user.name)}
        </span>
        <div className="flex flex-col gap-1">
          <label htmlFor="avatar-file" className="btn-ghost cursor-pointer px-4 py-2 text-sm">
            {avatarBusy ? 'Uploading…' : avatar ? 'Change avatar' : 'Upload avatar'}
          </label>
          <input
            id="avatar-file"
            type="file"
            accept={AVATAR_TYPES.join(',')}
            className="sr-only"
            disabled={avatarBusy}
            onChange={(event) => {
              void onPickAvatar(event.target.files?.[0] ?? null);
              event.target.value = '';
            }}
          />
          <p className="text-xs text-ink-400">JPEG, PNG or WebP · up to 2 MB</p>
        </div>
      </div>

      {notice ? <Notice kind={notice.kind}>{notice.text}</Notice> : null}

      <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        <FormField id="pf-name" label="Name" error={errors.name}>
          <input
            id="pf-name"
            className="input"
            value={values.name}
            disabled={busy}
            autoComplete="name"
            onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
          />
        </FormField>
        <FormField id="pf-phone" label="Phone" error={errors.phone}>
          <input
            id="pf-phone"
            className="input"
            value={values.phone}
            disabled={busy}
            autoComplete="tel"
            placeholder="01700000001"
            onChange={(e) => setValues((v) => ({ ...v, phone: e.target.value }))}
          />
        </FormField>
        <FormField id="pf-city" label="Preferred city" error={errors.preferredCity}>
          <input
            id="pf-city"
            className="input"
            value={values.preferredCity}
            disabled={busy}
            placeholder="Dhaka"
            onChange={(e) => setValues((v) => ({ ...v, preferredCity: e.target.value }))}
          />
        </FormField>
        <FormField id="pf-genres" label="Preferred genres" error={errors.preferredGenres} hint="Comma-separated, up to 10. Leave empty to clear.">
          <input
            id="pf-genres"
            className="input"
            value={values.preferredGenres}
            disabled={busy}
            placeholder="Action, Drama, Thriller"
            onChange={(e) => setValues((v) => ({ ...v, preferredGenres: e.target.value }))}
          />
        </FormField>
        <div className="sm:col-span-2">
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </div>
  );
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0] ?? '')
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function FormField({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      {children}
      {(error || hint) && (
        <p className={error ? 'field-error' : 'field-hint'}>{error ?? hint}</p>
      )}
    </div>
  );
}
