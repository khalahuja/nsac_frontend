import { useEffect, useState } from 'react';

/**
 * Return `value` delayed by `delayMs`, resetting the timer on every change.
 *
 * Used to keep typing in the latitude/longitude/time fields from firing an
 * analysis request per keystroke.
 *
 * @param value - The rapidly changing source value.
 * @param delayMs - Quiet period required before the value is published.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
