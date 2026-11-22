import type { MovieStatus } from '@cineseat/shared';
import { Badge } from '../ui/bits';

/** What is particular to movies; shared pieces live in `../ui`. */

export const STATUS_LABEL: Record<MovieStatus, string> = {
  NOW_SHOWING: 'Now showing',
  COMING_SOON: 'Coming soon',
};

/** The other status — what the quick switch moves a movie to. */
export const otherStatus = (status: MovieStatus): MovieStatus =>
  status === 'NOW_SHOWING' ? 'COMING_SOON' : 'NOW_SHOWING';

export function StatusBadge({ status }: { status: MovieStatus }) {
  return <Badge tone={status === 'NOW_SHOWING' ? 'green' : 'blue'}>{STATUS_LABEL[status]}</Badge>;
}
