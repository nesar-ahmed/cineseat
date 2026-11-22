'use client';

import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, keepPreviousData } from '@tanstack/react-query';
import { ApiClientError } from '../lib/api';
import { AuthProvider } from '../features/auth/auth-provider';

/** Client-side providers for the whole app: server data cache + session. */
export function Providers({ children }: { children: ReactNode }) {
  // One client per browser session (never shared between server requests).
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            // Keep showing the last results while new filters load — no flashing.
            placeholderData: keepPreviousData,
            // A 4xx will not fix itself; a dropped connection might.
            retry: (failures, error) =>
              failures < 1 &&
              !(error instanceof ApiClientError && error.status >= 400 && error.status < 500),
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}
