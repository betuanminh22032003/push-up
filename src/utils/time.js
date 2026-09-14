/** Seconds -> "MM:SS" (or "H:MM:SS" past an hour). */
export function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`;
}

/** Local-calendar day key, "YYYY-MM-DD". Local (not UTC) so streaks match the user's midnight. */
export function dayKey(timestamp) {
  const d = new Date(timestamp);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Day key shifted by `offset` days from the local day containing `timestamp`. */
export function shiftDayKey(timestamp, offset) {
  const d = new Date(timestamp);
  d.setHours(12, 0, 0, 0); // midday anchor: immune to DST jumps
  d.setDate(d.getDate() + offset);
  return dayKey(d.getTime());
}

/** "Today 14:32" / "Yesterday 08:05" / "12 Mar 18:44" */
export function formatSessionDate(timestamp, now = Date.now()) {
  const key = dayKey(timestamp);
  const time = new Date(timestamp).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  if (key === dayKey(now)) return `Today ${time}`;
  if (key === shiftDayKey(now, -1)) return `Yesterday ${time}`;
  const d = new Date(timestamp);
  const month = d.toLocaleDateString(undefined, { month: 'short' });
  return `${d.getDate()} ${month} ${time}`;
}
