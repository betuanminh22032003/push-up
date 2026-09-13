import { useCallback, useEffect, useRef, useState } from 'react';

const TICK_MS = 250;

/**
 * Elapsed workout time, driven by wall-clock spans rather than by counting
 * ticks. Interval callbacks are throttled while the app is backgrounded, so a
 * tick-counting timer would silently lose time during a set; measuring
 * `Date.now()` deltas keeps the duration honest no matter what the OS does to
 * our timers.
 *
 * @param {'idle'|'active'|'paused'} status
 */
export function useWorkoutTimer(status) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const accumulatedMsRef = useRef(0);
  const spanStartedAtRef = useRef(null);

  const readElapsedMs = useCallback(() => {
    const openSpan = spanStartedAtRef.current ? Date.now() - spanStartedAtRef.current : 0;
    return accumulatedMsRef.current + openSpan;
  }, []);

  const reset = useCallback(() => {
    accumulatedMsRef.current = 0;
    spanStartedAtRef.current = null;
    setElapsedSeconds(0);
  }, []);

  useEffect(() => {
    if (status === 'active') {
      if (spanStartedAtRef.current === null) spanStartedAtRef.current = Date.now();
    } else if (spanStartedAtRef.current !== null) {
      // Close the open span so paused time is never billed to the workout.
      accumulatedMsRef.current += Date.now() - spanStartedAtRef.current;
      spanStartedAtRef.current = null;
    }

    if (status === 'idle') {
      accumulatedMsRef.current = 0;
      setElapsedSeconds(0);
      return undefined;
    }

    setElapsedSeconds(Math.floor(readElapsedMs() / 1000));
    if (status !== 'active') return undefined;

    const id = setInterval(() => {
      setElapsedSeconds(Math.floor(readElapsedMs() / 1000));
    }, TICK_MS);
    return () => clearInterval(id);
  }, [status, readElapsedMs]);

  return { elapsedSeconds, readElapsedMs, reset };
}
