'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { UpdateProfileSchema, type PublicUser, type UpdateProfileInput } from '@cineseat/shared';
import { CheckIcon } from '../../../components/ui/icons';
import { ApiClientError, assetUrl, updateProfile, uploadAvatar } from '../../../lib/api';
import { useAuth } from '../../auth/auth-provider';
import { useCatalogFilters } from '../../catalog/queries';
import { Notice } from '../notice';
import { describedBy, Field, focusFirstError, Panel, useUnsavedChangesWarning } from './form-kit';

/** Mirrors `MAX_AVATAR_BYTES` and the type allowlist in apps/api/src/users/avatar.storage.ts. */
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
/** Mirrors `preferredGenres: z.array(GenreSchema).max(10)` in the shared schema. */
const MAX_GENRES = 10;

/**
 * Profile settings: the photo (uploaded on pick, `POST /users/me/avatar`) and
 * the details form (`PATCH /users/me`, only the fields that changed).
 */
export function ProfileSettings() {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <div className="flex flex-col gap-6">
      <PhotoPanel user={user} />
      <DetailsForm user={user} />
    </div>
  );
}

/* ----------------------------------------------------------------- photo */

function PhotoPanel({ user }: { user: PublicUser }) {
  const { setUser } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  // The object URL for the local preview is released once it is replaced.
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setNotice(null);
    if (!AVATAR_TYPES.includes(file.type)) {
      setNotice({ kind: 'error', text: 'Choose a JPEG, PNG or WebP image.' });
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      setNotice({ kind: 'error', text: 'That image is larger than 2 MB — choose a smaller one.' });
      return;
    }
    setPreview(URL.createObjectURL(file));
    setBusy(true);
    try {
      const { avatarUrl } = await uploadAvatar(file);
      setUser({ ...user, avatarUrl });
      setNotice({ kind: 'success', text: 'Profile photo updated.' });
    } catch (error) {
      setNotice({
        kind: 'error',
        text: error instanceof ApiClientError ? error.message : 'Upload failed — try again.',
      });
    } finally {
      setPreview(null);
      setBusy(false);
    }
  };

  const saved = assetUrl(user.avatarUrl);
  const shown = preview ?? saved;

  return (
    <Panel
      id="photo"
      title="Profile photo"
      description="Shown in the header and on your account page."
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <span className="relative inline-flex shrink-0 self-start rounded-full bg-gradient-to-br from-gold-300 via-gold-500/60 to-brand-500/60 p-[2px] sm:self-center">
          <span className="inline-flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-ink-900 font-display text-3xl font-semibold text-ink-50">
            {shown ? (
              <img src={shown} alt="" className="h-full w-full object-cover" />
            ) : (
              initialsOf(user.name)
            )}
          </span>
          {busy ? (
            <span className="absolute inset-[2px] flex items-center justify-center rounded-full bg-ink-950/60">
              <span className="h-6 w-6 animate-spin rounded-full border-2 border-white/30 border-t-white motion-reduce:animate-none" />
            </span>
          ) : null}
        </span>
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="btn-ghost px-4 py-2.5 disabled:opacity-60"
            >
              {busy ? 'Uploading…' : saved ? 'Change photo' : 'Upload photo'}
            </button>
          </div>
          <p className="text-xs text-ink-400">JPEG, PNG or WebP, up to 2 MB. Square works best.</p>
          <input
            ref={inputRef}
            type="file"
            accept={AVATAR_TYPES.join(',')}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(event) => {
              void pick(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
        </div>
      </div>
      {notice ? (
        <div className="mt-5">
          <Notice kind={notice.kind}>{notice.text}</Notice>
        </div>
      ) : null}
    </Panel>
  );
}

/* --------------------------------------------------------------- details */

type Values = { name: string; phone: string; city: string; genres: string[] };

function DetailsForm({ user }: { user: PublicUser }) {
  const { setUser } = useAuth();
  const filters = useCatalogFilters();
  // What is saved now; after a save it follows the updated profile.
  const initial = useMemo(() => valuesOf(user), [user]);
  const [values, setValues] = useState<Values>(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof Values, string>>>({});
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const patch = diff(initial, values);
  const clearedPhone = Boolean(initial.phone) && !values.phone.trim();
  const dirty = Object.keys(patch).length > 0 || clearedPhone;
  useUnsavedChangesWarning(dirty);

  // The catalog's own lists, plus whatever the account already has that they lack.
  const cities = union(filters.data?.cities ?? [], user.preferredCity ? [user.preferredCity] : []);
  const genres = union(filters.data?.genres ?? [], user.preferredGenres);

  const set = <K extends keyof Values>(key: K, value: Values[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    setNotice(null);
  };

  const toggleGenre = (genre: string) => {
    const on = values.genres.includes(genre);
    if (!on && values.genres.length >= MAX_GENRES) return;
    set('genres', on ? values.genres.filter((g) => g !== genre) : [...values.genres, genre]);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setNotice(null);

    const found: Partial<Record<keyof Values, string>> = {};
    // The API can change these but has no way to clear them, so say so rather than ignore it.
    if (clearedPhone) found.phone = 'Enter a phone number — it can be changed, but not removed.';
    const parsed = UpdateProfileSchema.safeParse(patch);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = FIELD_OF[String(issue.path[0])];
        if (key) found[key] ??= issue.message;
      }
    }
    if (Object.keys(found).length > 0) {
      setErrors(found);
      focusFirstError(ORDER.filter((key) => found[key]).map((key) => `pf-${key}`));
      return;
    }
    if (!dirty || !parsed.success) return;

    setBusy(true);
    try {
      const updated = await updateProfile(parsed.data as UpdateProfileInput);
      setUser(updated);
      setValues(valuesOf(updated)); // the form is clean again, from what was saved
      setNotice({ kind: 'success', text: 'Profile saved.' });
    } catch (error) {
      setNotice({
        kind: 'error',
        text: error instanceof ApiClientError ? error.message : 'Could not save — try again.',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-6">
      <Panel
        id="details"
        title="Personal details"
        description="How we address you, and how the cinema can reach you about a booking."
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="pf-name" label="Full name" error={errors.name}>
            <input
              id="pf-name"
              className="input"
              value={values.name}
              onChange={(event) => set('name', event.target.value)}
              autoComplete="name"
              maxLength={80}
              disabled={busy}
              aria-invalid={errors.name ? true : undefined}
              aria-describedby={describedBy('pf-name', { error: errors.name })}
            />
          </Field>
          <Field
            id="pf-phone"
            label="Phone"
            optional={!initial.phone}
            hint={PHONE_HINT}
            error={errors.phone}
          >
            <input
              id="pf-phone"
              className="input"
              type="tel"
              inputMode="tel"
              value={values.phone}
              onChange={(event) => set('phone', event.target.value)}
              autoComplete="tel"
              placeholder="01700000001"
              disabled={busy}
              aria-invalid={errors.phone ? true : undefined}
              aria-describedby={describedBy('pf-phone', { hint: PHONE_HINT, error: errors.phone })}
            />
          </Field>
        </div>
      </Panel>

      <Panel
        id="preferences"
        title="Preferences"
        description="Used to suggest showtimes near you and movies you will like."
      >
        <div className="flex flex-col gap-6">
          <Field id="pf-city" label="Preferred city" optional={!initial.city} error={errors.city}>
            <select
              id="pf-city"
              className="select sm:max-w-xs"
              value={values.city}
              onChange={(event) => set('city', event.target.value)}
              disabled={busy}
              aria-invalid={errors.city ? true : undefined}
              aria-describedby={describedBy('pf-city', { error: errors.city })}
            >
              {/* Only an account without a city can stay without one (the API cannot clear it). */}
              {!initial.city ? <option value="">No preference</option> : null}
              {cities.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </select>
          </Field>

          <fieldset aria-describedby="pf-genres-hint">
            <legend className="field-label flex w-full items-baseline justify-between gap-3">
              <span>Favourite genres</span>
              <span className="text-[11px] font-medium normal-case tracking-normal text-ink-500">
                {values.genres.length}/{MAX_GENRES}
              </span>
            </legend>
            {filters.isPending ? (
              <div className="flex flex-wrap gap-2" aria-hidden="true">
                {Array.from({ length: 8 }, (_, i) => (
                  <span
                    key={i}
                    className="h-9 w-20 animate-pulse rounded-full bg-white/[0.05] motion-reduce:animate-none"
                  />
                ))}
              </div>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {genres.map((genre) => {
                  const on = values.genres.includes(genre);
                  const full = !on && values.genres.length >= MAX_GENRES;
                  return (
                    <li key={genre}>
                      <button
                        type="button"
                        onClick={() => toggleGenre(genre)}
                        aria-pressed={on}
                        disabled={busy || full}
                        className="pill disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {on ? <CheckIcon className="h-3.5 w-3.5" /> : null}
                        {genre}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <p id="pf-genres-hint" className="field-hint">
              {errors.genres ?? `Pick up to ${MAX_GENRES}. Tap again to remove one.`}
            </p>
          </fieldset>
        </div>
      </Panel>

      {/* With unsaved changes the bar stays in view while scrolling, so saving never
          needs a hunt; otherwise it rests at the end of the form. */}
      <div
        className={`z-10 flex flex-col gap-3 rounded-2xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5 ${
          dirty
            ? 'sticky bottom-4 border-gold-400/30 bg-ink-900/95 shadow-lift backdrop-blur-xl'
            : 'border-white/[0.07] bg-white/[0.02]'
        }`}
      >
        <div aria-live="polite" className="min-w-0 text-sm">
          {notice ? (
            <Notice kind={notice.kind}>{notice.text}</Notice>
          ) : (
            <p className={dirty ? 'font-semibold text-gold-200' : 'text-ink-400'}>
              {dirty ? 'You have unsaved changes' : 'Everything is saved'}
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-3">
          <button
            type="button"
            onClick={() => {
              setValues(initial);
              setErrors({});
              setNotice(null);
            }}
            disabled={!dirty || busy}
            className="btn-ghost flex-1 px-4 py-2.5 disabled:opacity-40 sm:flex-none"
          >
            Discard
          </button>
          <button
            type="submit"
            disabled={!dirty || busy}
            className="btn-primary flex-1 px-5 py-2.5 disabled:opacity-50 disabled:shadow-none sm:flex-none"
          >
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </form>
  );
}

/* --------------------------------------------------------------- helpers */

const ORDER: (keyof Values)[] = ['name', 'phone', 'city', 'genres'];
const FIELD_OF: Record<string, keyof Values> = {
  name: 'name',
  phone: 'phone',
  preferredCity: 'city',
  preferredGenres: 'genres',
};

/** Only what changed, in the API's field names; empty optional fields are never sent. */
function diff(initial: Values, values: Values): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const name = values.name.trim();
  const phone = values.phone.trim();
  if (name !== initial.name) out.name = name;
  if (phone && phone !== initial.phone) out.phone = phone;
  if (values.city && values.city !== initial.city) out.preferredCity = values.city;
  if (sameSet(values.genres, initial.genres) === false) out.preferredGenres = values.genres;
  return out;
}

const PHONE_HINT = 'Digits only, e.g. 01700000001 or +8801700000001.';

function valuesOf(user: PublicUser): Values {
  return {
    name: user.name,
    phone: user.phone ?? '',
    city: user.preferredCity ?? '',
    genres: user.preferredGenres,
  };
}

function sameSet(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((item) => b.includes(item));
}

function union(first: string[], second: string[]): string[] {
  return Array.from(new Set([...first, ...second]));
}

function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((part) => part[0] ?? '')
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
