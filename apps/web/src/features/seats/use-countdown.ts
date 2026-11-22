'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Whole seconds left until `deadline` (ISO), ticking; null without a deadline.
 * It reads the clock on every tick rather than counting down, so a throttled
 * background tab still shows the right time when it comes back. `onEnd` runs
 * once when the time is up.
 */
export function useCountdown(deadline: string | null, onEnd?: () => void): number | null {
  const [left, setLeft] = useState<number | null>(null);
  const onEndRef = useRef(onEnd);
  useEffect(() => {
    onEndRef.current = onEnd;
  });

  useEffect(() => {
    if (!deadline) {
      setLeft(null);
      return;
    }
    const end = Date.parse(deadline);
    let ended = false;
    const tick = () => {
      const seconds = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      setLeft(seconds);
      if (seconds === 0 && !ended) {
        ended = true;
        onEndRef.current?.();
      }
    };
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [deadline]);

  return left;
}

/** `272` → `4:32`. */
export function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
