'use client';

import { useState } from 'react';
import { useAuth } from '../auth/auth-provider';
import { assetUrl } from '../../lib/api';
import { AdminUsers } from './admin-users';
import { PasswordForm } from './password-form';
import { ProfileForm } from './profile-form';

/**
 * The user panel. Everything here runs against phase-1 endpoints only:
 * GET /auth/me (via the auth context), PATCH /users/me, POST /users/me/avatar,
 * POST /users/me/password and the ADMIN-only GET /users.
 */

type Tab = 'profile' | 'security' | 'admin';

export function AccountPanel() {
  const { user, status } = useAuth();
  const [tab, setTab] = useState<Tab>('profile');

  if (status === 'loading') {
    return (
      <div className="card flex items-center gap-4 p-6 motion-reduce:animate-none">
        <span className="h-16 w-16 animate-pulse rounded-full bg-ink-800 motion-reduce:animate-none" aria-hidden="true" />
        <span className="flex flex-1 flex-col gap-2">
          <span className="h-4 w-44 animate-pulse rounded-full bg-ink-800 motion-reduce:animate-none" aria-hidden="true" />
          <span className="h-4 w-64 animate-pulse rounded-full bg-ink-800/70 motion-reduce:animate-none" aria-hidden="true" />
        </span>
      </div>
    );
  }

  // The route guard only checks the cookie exists; an expired one lands here.
  if (!user) {
    return (
      <div className="card flex flex-col items-center gap-4 p-8 text-center">
        <h1 className="font-display text-xl text-ink-50">Your session has ended</h1>
        <p className="text-sm text-ink-300">Sign in again to open your panel.</p>
        <a href="/login?next=/account" className="btn-primary">
          Sign in
        </a>
      </div>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'profile', label: 'Profile' },
    { id: 'security', label: 'Security' },
    ...(user.role === 'ADMIN' ? [{ id: 'admin' as const, label: 'User directory' }] : []),
  ];

  const avatar = assetUrl(user.avatarUrl);

  return (
    <div className="flex flex-col gap-6">
      {/* Identity summary — the "see profile information" card. */}
      <section className="card ticket-edge grain relative overflow-hidden p-6 sm:p-8" aria-label="Your profile">
        <div className="flex flex-wrap items-center gap-5">
          <span className="inline-flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-ink-700 bg-ink-800 font-display text-xl text-ink-100">
            {avatar ? <img src={avatar} alt="" className="h-full w-full object-cover" /> : initialsOf(user.name)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="section-label">Member since {formatDay(user.createdAt)}</p>
            <h1 className="mt-1 truncate font-display text-2xl text-ink-50">{user.name}</h1>
            <p className="truncate text-sm text-ink-300">{user.email}</p>
          </div>
          <div className="flex flex-col items-end gap-2 text-sm text-ink-300">
            <span className={user.role === 'ADMIN' ? 'chip border-gold-500/40 text-gold-300' : 'chip'}>{user.role}</span>
            {user.preferredCity && <span className="chip">{user.preferredCity}</span>}
          </div>
        </div>
        {(user.phone || user.preferredGenres.length > 0) && (
          <dl className="mt-6 grid gap-4 border-t border-ink-800 pt-6 sm:grid-cols-2">
            {user.phone && (
              <div>
                <dt className="field-label">Phone</dt>
                <dd className="text-sm text-ink-100">{user.phone}</dd>
              </div>
            )}
            {user.preferredGenres.length > 0 && (
              <div>
                <dt className="field-label">Preferred genres</dt>
                <dd className="flex flex-wrap gap-1.5">
                  {user.preferredGenres.map((genre) => (
                    <span key={genre} className="chip">
                      {genre}
                    </span>
                  ))}
                </dd>
              </div>
            )}
          </dl>
        )}
      </section>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Account sections">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={tab === t.id ? 'btn-primary px-4 py-2 text-sm' : 'btn-ghost px-4 py-2 text-sm'}
          >
            {t.label}
          </button>
        ))}
      </div>

      <section className="card p-6 sm:p-8" role="tabpanel">
        {tab === 'profile' && <ProfileForm />}
        {tab === 'security' && <PasswordForm />}
        {tab === 'admin' && user.role === 'ADMIN' && <AdminUsers />}
      </section>
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

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}
