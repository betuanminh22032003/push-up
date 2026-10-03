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
  'com.zhiliaoapp.musically.go', // TikTok Lite
  'com.facebook.katana', // Facebook
  'com.facebook.lite', // Facebook Lite
  'com.google.android.youtube', // YouTube
  'com.instagram.android', // Instagram
  'com.instagram.lite', // Instagram Lite
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

/**
 * Each suggested app's own websites, blocked in browsers along with the app:
 * otherwise a blocked TikTok is one tap away as tiktok.com.
 */
export const APP_DOMAINS = {
  'com.ss.android.ugc.trill': ['tiktok.com'],
  'com.zhiliaoapp.musically': ['tiktok.com'],
  'com.zhiliaoapp.musically.go': ['tiktok.com'],
  'com.facebook.katana': ['facebook.com', 'fb.com', 'fb.watch'],
  'com.facebook.lite': ['facebook.com', 'fb.com', 'fb.watch'],
  'com.google.android.youtube': ['youtube.com', 'youtu.be'],
  'com.instagram.android': ['instagram.com'],
  'com.instagram.lite': ['instagram.com'],
  'com.instagram.barcelona': ['threads.net', 'threads.com'],
  'com.twitter.android': ['x.com', 'twitter.com'],
  'com.reddit.frontpage': ['reddit.com'],
  'com.snapchat.android': ['snapchat.com'],
  'com.pinterest': ['pinterest.com'],
  'com.netflix.mediaclient': ['netflix.com'],
  'tv.twitch.android.app': ['twitch.tv'],
  'com.roblox.client': ['roblox.com'],
};

export const EMPTY_STATE = Object.freeze({
  reachable: true,
  serviceEnabled: false,
  serviceRunning: false,
  serviceConnectedAt: 0,
  usageAccess: false,
  overlayAllowed: false,
  watcherRunning: false,
  batteryOptimized: false,
  developerOptions: false,
  enabled: false,
  blocked: [],
  sites: [],
  balanceSeconds: 0,
  showTimer: true,
  earnRequestedAt: 0,
});

const finite = (value, fallback = 0) => (Number.isFinite(value) ? value : fallback);
const strings = (value) => (Array.isArray(value) ? value.filter((v) => typeof v === 'string') : []);

/**
 * Whatever the native side hands back, as a complete state a render can trust.
 * `reachable` is false when the blocker's process did not answer, so the
 * caller keeps what it had instead of showing everything switched off.
 */
export function normalizeState(raw) {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_STATE, reachable: false };
  return {
    reachable: raw.reachable !== false,
    serviceEnabled: raw.serviceEnabled === true,
    serviceRunning: raw.serviceRunning === true,
    serviceConnectedAt: finite(raw.serviceConnectedAt),
    usageAccess: raw.usageAccess === true,
    overlayAllowed: raw.overlayAllowed === true,
    watcherRunning: raw.watcherRunning === true,
    batteryOptimized: raw.batteryOptimized === true,
    // Developer options or USB debugging on: many banking apps close then, whatever this app does.
    developerOptions: raw.developerOptions === true,
    enabled: raw.enabled === true,
    blocked: strings(raw.blocked),
    sites: strings(raw.sites),
    balanceSeconds: Math.max(0, finite(raw.balanceSeconds)),
    showTimer: raw.showTimer !== false,
    earnRequestedAt: finite(raw.earnRequestedAt),
  };
}

/** Set up to block: switched on with at least one app or site. Only then do reps earn time. */
export function isSetUp(state) {
  return state.enabled && (state.blocked.length > 0 || state.sites.length > 0);
}

/**
 * The accessibility service ran once and is now off in the system settings.
 * Android does this when an app is force-stopped, which aggressive OEM builds
 * (realme, OPPO, Xiaomi…) do to background apps; people also switch it off
 * themselves, because many banking apps refuse to open while it is on.
 */
export function wasSwitchedOff(state) {
  return isSetUp(state) && !state.serviceEnabled && state.serviceConnectedAt > 0;
}

/**
 * Both permissions of the way to block without the accessibility service:
 * usage access and "display over other apps". Banking apps do not object to
 * them, but this way blocks apps only, not websites.
 */
export function watcherReady(state) {
  return state.usageAccess && state.overlayAllowed;
}

/** The accessibility-free watcher has work: blocking on, apps chosen, both permissions granted. */
export function wantsWatcher(state) {
  return state.enabled && state.blocked.length > 0 && watcherReady(state);
}

/**
 * Which way is blocking right now: 'accessibility' (apps and websites),
 * 'usage' (apps only; banking apps keep working) or null. The accessibility
 * service goes first when both run; the other one waits.
 */
export function blockingMode(state) {
  if (!isSetUp(state)) return null;
  if (state.serviceEnabled && state.serviceRunning) return 'accessibility';
  if (wantsWatcher(state) && state.watcherRunning) return 'usage';
  return null;
}

/** A way to block is switched on, running or not. False: a permission is still to grant. */
export function hasWayToBlock(state) {
  return state.serviceEnabled || wantsWatcher(state);
}

/**
 * Set up and switched on, yet nothing blocking: stopped by the phone, or
 * still starting. The context looks twice before calling it stuck.
 */
export function looksStalled(state) {
  return isSetUp(state) && blockingMode(state) === null && hasWayToBlock(state);
}

/**
 * The blocker tab's one-line status, as a translation key, most urgent gap
 * first. `stalled` is the context's confirmed second look.
 */
export function statusKey(state, stalled) {
  if (!state.enabled) return 'blocker.statusOff';
  if (state.blocked.length === 0 && state.sites.length === 0) return 'blocker.statusNoApps';
  const mode = blockingMode(state);
  if (mode === 'accessibility') return 'blocker.statusOn';
  if (mode === 'usage') return 'blocker.statusOnApps';
  if (hasWayToBlock(state)) return stalled ? 'blocker.statusStalled' : 'blocker.statusStarting';
  if (wasSwitchedOff(state)) return 'blocker.statusSwitchedOff';
  if (state.blocked.length === 0) return 'blocker.statusSitesNeedA11y';
  return 'blocker.statusNeedsPermission';
}

/**
 * Which warning card the tab shows, if any: 'watcher' (both permissions
 * granted, the phone stopped it), 'stalled' (accessibility on, not running)
 * or 'switchedOff' (accessibility turned off, nothing else to block with).
 * Switched off with both permissions granted, the watcher is taking over,
 * so there is no alarm unless the second look finds it did not.
 */
export function alertKind(state, stalled) {
  if (!isSetUp(state) || blockingMode(state) !== null) return null;
  if (stalled && wantsWatcher(state)) return 'watcher';
  if (stalled && state.serviceEnabled) return 'stalled';
  if (wasSwitchedOff(state) && !wantsWatcher(state)) return 'switchedOff';
  return null;
}

/**
 * "https://www.YouTube.com/watch?v=1" -> "youtube.com". Null for anything that
 * is not a domain, so the add-a-site field can refuse it.
 */
export function normalizeDomain(text) {
  let s = String(text ?? '').trim().toLowerCase();
  if (!s || /\s/.test(s)) return null;
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  s = s.split(/[/?#]/)[0];
  s = s.slice(s.lastIndexOf('@') + 1).split(':')[0].replace(/\.+$/, '');
  // ASCII letters, digits, dots and dashes, plus any non-ASCII letter (tuổitrẻ.vn).
  if (!s.includes('.') || s.startsWith('.') || /[^a-z0-9.\- -￿]/.test(s)) return null;
  return s.replace(/^www\./, '');
}

/** The blocked apps' own domains plus the user's, each once, for the native side. */
export function effectiveSites(blockedPackages, customSites) {
  const out = new Set();
  for (const pkg of blockedPackages) for (const d of APP_DOMAINS[pkg] ?? []) out.add(d);
  for (const site of customSites ?? []) {
    const d = normalizeDomain(site);
    if (d) out.add(d);
  }
  return [...out].sort();
}

/** Actually blocking right now, one way or the other. */
export function isBlocking(state) {
  return blockingMode(state) !== null;
}

/**
 * Seconds of fun time a workout of `reps` earns at `secondsPerRep`.
 *
 * `weight` is the exercise's `creditWeight` (src/exercises/exercises.js): a
 * squat earns half what a push-up does. Left out it is 1, so a caller that
 * predates exercises pays push-up rates. Anything else that is not a finite
 * number, or is negative, earns nothing, like a missing rate: a weight that
 * went wrong must not hand out time the blocker cannot take back. Rates and
 * weights multiply to fractions (3 jumping jacks at 30 s x 0.25), so the
 * result is rounded to whole seconds: what is credited is then exactly what
 * the "earned" toast says.
 */
export function creditFor(reps, secondsPerRep, weight = 1) {
  const count = Math.max(0, Math.round(finite(reps)));
  const rate = Math.max(0, finite(secondsPerRep));
  const factor = Math.max(0, finite(weight));
  return Math.round(count * rate * factor);
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

/**
 * What one rep earns, unrounded: "7.5 sec" ("7,5 giây"). A workout is
 * credited once, on its total (see creditFor), so ten 7.5-second jumping
 * jacks earn 75 seconds; showing one rep rounded to 8 would promise 80.
 * Amounts of a minute or more are whole seconds at every rate on offer.
 */
export function formatPerRep(seconds, t) {
  const tenths = Math.round(Math.max(0, finite(seconds)) * 10) / 10;
  if (Number.isInteger(tenths) || tenths >= 60) return formatAmount(tenths, t);
  return t('time.sec', { n: String(tenths).replace('.', t('time.decimal')) });
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
