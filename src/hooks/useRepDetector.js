import { useCallback, useEffect, useRef, useState } from 'react';

/** Minimum gap between two counted reps. Anything faster is sensor noise. */
export const REP_DEBOUNCE_MS = 500;

/** The sensor must stay covered this long for the dip to count as a real rep. */
const MIN_NEAR_MS = 80;

/**
 * Turns a stream of near/far proximity states into counted reps.
 *
 * A rep is one complete cycle: near (chest down, sensor covered) followed by
 * far (pushed back up). Counting on the *up* edge is what makes the count match
 * completed reps rather than attempts.
 *
 * Two guards protect the count:
 *   MIN_NEAR_MS       rejects a graze that never really covered the sensor
 *   REP_DEBOUNCE_MS   rejects a second rep arriving impossibly soon after one
 *
 * @param {object}   source        a source from src/sensors/sources.js
 * @param {object}   sourceConfig  calibration values for that source
 * @param {boolean}  active        subscribe only while the workout is running
 * @param {Function} onRep         called once per counted rep
 */
export function useRepDetector({ source, sourceConfig, active, onRep }) {
  const [isNear, setIsNear] = useState(false);

  const nearSinceRef = useRef(0);
  const lastRepAtRef = useRef(0);
  const stateRef = useRef('far');

  // Held in a ref so a new onRep identity never resurrects the subscription
  // mid-set (which would drop the state machine back to 'far').
  const onRepRef = useRef(onRep);
  useEffect(() => {
    onRepRef.current = onRep;
  }, [onRep]);

  const handleProximityChange = useCallback((near) => {
    const now = Date.now();

    if (near) {
      if (stateRef.current === 'near') return;
      stateRef.current = 'near';
      nearSinceRef.current = now;
      setIsNear(true);
      return;
    }

    if (stateRef.current !== 'near') return;
    stateRef.current = 'far';
    setIsNear(false);

    const heldFor = now - nearSinceRef.current;
    if (heldFor < MIN_NEAR_MS) return;
    if (now - lastRepAtRef.current < REP_DEBOUNCE_MS) return;

    lastRepAtRef.current = now;
    onRepRef.current?.();
  }, []);

  useEffect(() => {
    if (!active || !source) return undefined;

    // Always resume from a known state: a set must not inherit a stale "near"
    // left behind when the user paused with the sensor covered.
    stateRef.current = 'far';
    setIsNear(false);

    if (source.isTapDriven) return undefined;

    const unsubscribe = source.subscribe(handleProximityChange, sourceConfig);
    return () => unsubscribe?.();
  }, [active, source, sourceConfig, handleProximityChange]);

  // Touch handlers for tap-driven sources: press = near, release = far, so the
  // screen feeds the same state machine as the hardware path.
  const onTouchStart = useCallback(() => {
    if (active && source?.isTapDriven) handleProximityChange(true);
  }, [active, source, handleProximityChange]);

  const onTouchEnd = useCallback(() => {
    if (active && source?.isTapDriven) handleProximityChange(false);
  }, [active, source, handleProximityChange]);

  const reset = useCallback(() => {
    stateRef.current = 'far';
    nearSinceRef.current = 0;
    lastRepAtRef.current = 0;
    setIsNear(false);
  }, []);

  return { isNear, onTouchStart, onTouchEnd, reset };
}
