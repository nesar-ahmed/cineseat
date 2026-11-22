import { Suspense } from 'react';
import type { Metadata } from 'next';
import { SchedulePage } from '../../../../features/admin/shows/schedule-page';

export const metadata: Metadata = { title: 'Schedule shows' };

// `?movie=&theater=&screen=` preselect (links from the movie, theater and board pages).
export default function Page() {
  return (
    <Suspense fallback={null}>
      <SchedulePage />
    </Suspense>
  );
}
