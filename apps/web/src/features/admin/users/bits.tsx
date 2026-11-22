import type { UserRole } from '@cineseat/shared';
import { assetUrl } from '../../../lib/api';
import { Badge } from '../ui/bits';

/** The account's picture, or its initials on a tinted disc. */
export function Avatar({
  user,
  className = 'h-9 w-9 text-xs',
}: {
  user: { name: string; avatarUrl: string | null };
  className?: string;
}) {
  const src = assetUrl(user.avatarUrl);
  if (src)
    return (
      // A plain <img>: uploads are served by the API from disk, not by Next.
      <img
        src={src}
        alt=""
        className={`shrink-0 rounded-full object-cover ring-1 ring-white/10 ${className}`}
      />
    );
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-white/[0.06] font-bold text-ink-200 ring-1 ring-white/10 ${className}`}
    >
      {initials(user.name)}
    </span>
  );
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0] ?? '')
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export const ROLE_LABEL: Record<UserRole, string> = { USER: 'Customer', ADMIN: 'Admin' };

export function RoleBadge({ role }: { role: UserRole }) {
  return <Badge tone={role === 'ADMIN' ? 'gold' : 'gray'}>{ROLE_LABEL[role]}</Badge>;
}
