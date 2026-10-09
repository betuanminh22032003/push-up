import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { dayKey } from '../utils/time';

/**
 * Today's local day key ('2026-10-09'), changing at midnight.
 *
 * Every tab stays mounted and the app can sit in the background overnight,
 * so anything memoised on "today" (today's reps, the streak, the chart) has
 * to depend on this, or yesterday's numbers would still show in the morning.
 * Checked once a minute while the app is open and whenever it comes back to
 * the foreground; setting the same key again does not re-render.
 */
export function useDayKey() {
  const [key, setKey] = useState(() => dayKey(Date.now()));
  useEffect(() => {
    const check = () => setKey(dayKey(Date.now()));
    const timer = setInterval(check, 60 * 1000);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, []);
  return key;
}
