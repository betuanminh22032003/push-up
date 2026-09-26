import { useEffect, useRef, useState } from 'react';

const TICK_MS = 100;

/**
 * A wall-clock countdown for the pre-set "get ready" and the rest between
 * sets. Measures against an end timestamp rather than counting ticks, for the
 * same reason the workout timer does: intervals are throttled in the
 * background and a tick-counting countdown would run long.
 *
 * Restarts whenever `runKey` changes while `active` — so `${status}-${set}`
 * as the key gives one fresh countdown per phase per set.
 *
 * @param {object}   opts
 * @param {number}   opts.seconds   length; 0 completes on the next tick
 * @param {boolean}  opts.active    whether a countdown should be running
 * @param {string}   opts.runKey    identity of this run
 * @param {Function} opts.onTick    called with each new whole second remaining
 * @param {Function} opts.onDone    called once when it reaches zero
 * @returns {number} whole seconds remaining (ceil), 0 when idle or done
 */
export function useCountdown({ seconds, active, runKey, onTick, onDone }) {
  const [remaining, setRemaining] = useState(0);

  const onTickRef = useRef(onTick);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onTickRef.current = onTick;
    onDoneRef.current = onDone;
  }, [onTick, onDone]);

  useEffect(() => {
    if (!active) {
      setRemaining(0);
      return undefined;
    }

    const endAt = Date.now() + Math.max(0, seconds) * 1000;
    let last = null;
    let finished = false;

    const step = () => {
      if (finished) return;
      const left = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
      if (left !== last) {
        last = left;
        setRemaining(left);
        if (left > 0) onTickRef.current?.(left);
      }
      if (left === 0) {
        finished = true;
        clearInterval(id);
        onDoneRef.current?.();
      }
    };

    const id = setInterval(step, TICK_MS);
    step();
    return () => {
      finished = true;
      clearInterval(id);
    };
    // `seconds` is read once at the start of a run on purpose: changing the
    // rest length in settings must not stretch a countdown already running.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, runKey]);

  return remaining;
}
