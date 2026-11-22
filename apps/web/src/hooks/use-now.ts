'use client';

import { useEffect, useState } from 'react';

/**
 * The current time, but only after hydration: `null` on the server and on the
 * first client render, so time-dependent UI ("this show already started") can
 * never make the two renders disagree. Ticks every `intervalMs`.
 */
export function useNow(intervalMs = 60_000): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
