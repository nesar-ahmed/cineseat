'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Paginated, PublicUser } from '@cineseat/shared';
import { ApiClientError, assetUrl, listUsers } from '../../lib/api';
import { Notice } from './notice';

/**
 * Admin tab — pages through `GET /users`, the route the API blocks for USER
 * accounts. The tab itself only renders for ADMIN, and the guard is still on
 * the server; this is just the front door.
 */
const PAGE_SIZE = 10;

export function AdminUsers() {
  const [data, setData] = useState<Paginated<PublicUser> | null>(null);
  const [page, setPage] = useState(1);
  const [role, setRole] = useState('');
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await listUsers({ page, pageSize: PAGE_SIZE, role: role || undefined, search: appliedSearch || undefined }));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not load users.');
    } finally {
      setLoading(false);
    }
  }, [page, role, appliedSearch]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="flex flex-col gap-4">
      {error ? <Notice kind="error">{error}</Notice> : null}

      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setAppliedSearch(search.trim());
        }}
      >
        <div className="min-w-48 flex-1">
          <label htmlFor="au-search" className="field-label">
            Search name or email
          </label>
          <input id="au-search" className="input" value={search} placeholder="rina" onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div>
          <label htmlFor="au-role" className="field-label">
            Role
          </label>
          <select
            id="au-role"
            className="input sm:w-36"
            value={role}
            onChange={(e) => {
              setPage(1);
              setRole(e.target.value);
            }}
          >
            <option value="">All</option>
            <option value="USER">USER</option>
            <option value="ADMIN">ADMIN</option>
          </select>
        </div>
        <button type="submit" className="btn-ghost px-4 py-2.5">
          Search
        </button>
      </form>

      <div className="overflow-x-auto rounded-2xl border border-ink-800">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-ink-800 text-xs uppercase tracking-[0.14em] text-ink-400">
              <th className="px-4 py-3 font-semibold">User</th>
              <th className="px-4 py-3 font-semibold">Email</th>
              <th className="px-4 py-3 font-semibold">Role</th>
              <th className="px-4 py-3 font-semibold">City</th>
              <th className="px-4 py-3 font-semibold">Joined</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-ink-400">
                  Loading…
                </td>
              </tr>
            ) : data && data.items.length > 0 ? (
              data.items.map((u) => (
                <tr key={u.id} className="border-b border-ink-800/60 last:border-none hover:bg-ink-900/60">
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2.5">
                      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-ink-700 bg-ink-800 text-xs text-ink-200">
                        {assetUrl(u.avatarUrl) ? (
                          <img src={assetUrl(u.avatarUrl) as string} alt="" className="h-full w-full object-cover" />
                        ) : (
                          u.name.slice(0, 1).toUpperCase()
                        )}
                      </span>
                      <span className="text-ink-100">{u.name}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3 text-ink-300">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className={u.role === 'ADMIN' ? 'chip border-gold-500/40 text-gold-300' : 'chip'}>{u.role}</span>
                  </td>
                  <td className="px-4 py-3 text-ink-300">{u.preferredCity ?? '—'}</td>
                  <td className="px-4 py-3 text-ink-300">{formatDay(u.createdAt)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-ink-400">
                  No accounts match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-3 text-sm text-ink-300">
        <span>
          {data ? `${data.total} account${data.total === 1 ? '' : 's'}` : '—'} · page {page} of {totalPages}
        </span>
        <span className="flex gap-2">
          <button type="button" className="btn-ghost px-4 py-2" disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            Previous
          </button>
          <button
            type="button"
            className="btn-ghost px-4 py-2"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </button>
        </span>
      </div>
    </div>
  );
}

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
