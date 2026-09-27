/**
 * The app blocker's pure rules: what reps are worth, how state from the
 * native side is read, and how the app picker sorts and searches.
 *
 * No React Native imports, so the Node suite runs this file as-is.
 */

/** Seconds of fun time one rep can buy, as offered on the blocker screen. */
export const RATE_OPTIONS = [30, 60, 120, 300];
export const DEFAULT_RATE_SECONDS = 60;

/** Icon edge, in pixels, that the native side renders app icons at. */
export const ICON_PX = 96;

/** An "earn time" tap from the block screen older than this is stale. */
export const EARN_REQUEST_TTL_MS = 2 * 60 * 1000;

/**
 * Apps people most often want to rein in, put at the top of the picker when
 * installed. Package names, since that is all Android identifies apps by.
 */
export const SUGGESTED_PACKAGES = [
  'com.ss.android.ugc.trill', // TikTok (Asia)
  'com.zhiliaoapp.musically', // TikTok
  'com.facebook.katana', // Facebook
  'com.facebook.lite', // Facebook Lite
  'com.google.android.youtube', // YouTube
  'com.instagram.android', // Instagram
  'com.instagram.barcelona', // Threads
  'com.twitter.android', // X
  'com.reddit.frontpage', // Reddit
  'com.snapchat.android', // Snapchat
  'com.pinterest', // Pinterest
  'com.netflix.mediaclient', // Netflix
  'tv.twitch.android.app', // Twitch
  'com.garena.game.kgvn', // Liên Quân Mobile
  'com.dts.freefireth', // Free Fire
  'com.vng.pubgmobile', // PUBG Mobile VN
  'com.roblox.client', // Roblox
];

export const EMPTY_STATE = Object.freeze({
  serviceEnabled: false,
  serviceRunning: false,
  enabled: false,
  blocked: [],
  balanceSeconds: 0,
  showTimer: true,
  earnRequestedAt: 0,
});

const finite = (value, fallback = 0) => (Number.isFinite(value) ? value : fallback);

/** Whatever the native side hands back, as a complete state a render can trust. */
export function normalizeState(raw) {
  if (!raw || typeof raw !== 'object') return EMPTY_STATE;
  return {
    serviceEnabled: raw.serviceEnabled === true,
    serviceRunning: raw.serviceRunning === true,
    enabled: raw.enabled === true,
    blocked: Array.isArray(raw.blocked) ? raw.blocked.filter((p) => typeof p === 'string') : [],
    balanceSeconds: Math.max(0, finite(raw.balanceSeconds)),
    showTimer: raw.showTimer !== false,
    earnRequestedAt: finite(raw.earnRequestedAt),
  };
}

/** Set up to block: switched on with at least one app. Only then do reps earn time. */
export function isSetUp(state) {
  return state.enabled && state.blocked.length > 0;
}

/** Actually blocking right now: set up, and the system has the service bound. */
export function isBlocking(state) {
  return isSetUp(state) && state.serviceEnabled && state.serviceRunning;
}

/** Seconds of fun time a workout of `reps` earns at `secondsPerRep`. */
export function creditFor(reps, secondsPerRep) {
  const count = Math.max(0, Math.round(finite(reps)));
  const rate = Math.max(0, finite(secondsPerRep));
  return count * rate;
}

/**
 * "12 min", "45 sec", "7 min 30 sec" — for amounts of time earned or on
 * offer, where a clock face ("07:30") would read as a duration.
 */
export function formatAmount(seconds, t) {
  const total = Math.max(0, Math.round(finite(seconds)));
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m > 0 && s > 0) return t('time.minSec', { m, s });
  if (m > 0) return t('time.min', { n: m });
  return t('time.sec', { n: s });
}

/** Case- and accent-insensitive: "lien quan" finds "Liên Quân", "tik" finds TikTok. */
export function searchKey(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .trim();
}

export function filterApps(apps, query) {
  const q = searchKey(query);
  if (!q) return apps;
  return apps.filter((app) => searchKey(app.label).includes(q) || app.packageName.toLowerCase().includes(q));
}

/** One installed app as the picker uses it. Anything malformed is dropped. */
export function normalizeApps(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const apps = [];
  for (const item of raw) {
    const packageName = item?.packageName;
    if (typeof packageName !== 'string' || !packageName || seen.has(packageName)) continue;
    seen.add(packageName);
    apps.push({
      packageName,
      label: typeof item.label === 'string' && item.label.trim() ? item.label.trim() : packageName,
      icon: typeof item.icon === 'string' && item.icon ? item.icon : null,
    });
  }
  return apps;
}

/** Suggested apps first, in the order above, then everything else by name. */
export function sortApps(apps) {
  const rank = (app) => {
    const i = SUGGESTED_PACKAGES.indexOf(app.packageName);
    return i === -1 ? SUGGESTED_PACKAGES.length : i;
  };
  return [...apps].sort(
    (a, b) => rank(a) - rank(b) || searchKey(a.label).localeCompare(searchKey(b.label)),
  );
}

export function isSuggested(app) {
  return SUGGESTED_PACKAGES.includes(app.packageName);
}
