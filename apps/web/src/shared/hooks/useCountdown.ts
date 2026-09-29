import { useCallback, useEffect, useState } from "react";

/** Counts down whole seconds. `start(30)` begins a 30 second wait and
 * `remaining` drops to 0 by itself. It uses the clock, not a counter, so
 * switching tabs doesn't make it fall behind. */
export function useCountdown(): { remaining: number; start: (seconds: number) => void } {
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (endsAt === null) return;
    const timer = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= endsAt) setEndsAt(null);
    }, 250);
    return () => window.clearInterval(timer);
  }, [endsAt]);

  const start = useCallback((seconds: number) => {
    const current = Date.now();
    setNow(current);
    setEndsAt(current + seconds * 1000);
  }, []);

  const remaining = endsAt === null ? 0 : Math.max(0, Math.ceil((endsAt - now) / 1000));
  return { remaining, start };
}
