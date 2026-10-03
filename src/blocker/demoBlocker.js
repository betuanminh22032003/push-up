/**
 * An in-memory stand-in for the native blocker, for the development web build
 * only: it lets the blocker screen be laid out, driven and screenshotted in a
 * browser. It blocks nothing and never ships to a phone.
 *
 * Starting state can be seeded through localStorage (`pupg:blockerDemo`), which
 * is how the store-screenshot script shows a blocker that is already set up.
 */

const DEMO_APPS = [
  ['com.ss.android.ugc.trill', 'TikTok'],
  ['com.facebook.katana', 'Facebook'],
  ['com.google.android.youtube', 'YouTube'],
  ['com.instagram.android', 'Instagram'],
  ['com.netflix.mediaclient', 'Netflix'],
  ['com.garena.game.kgvn', 'Liên Quân Mobile'],
  ['com.android.chrome', 'Chrome'],
  ['com.google.android.gm', 'Gmail'],
  ['com.google.android.apps.maps', 'Maps'],
  ['com.spotify.music', 'Spotify'],
  ['com.shopee.vn', 'Shopee'],
  ['com.zing.zalo', 'Zalo'],
];

const SEED_KEY = 'pupg:blockerDemo';

function seededState() {
  try {
    const raw = globalThis.localStorage?.getItem(SEED_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function createDemoBlocker() {
  const state = {
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
    ...seededState(),
  };
  // The watcher runs whenever it has work and both of its permissions, as on a phone.
  const snapshot = () => ({
    ...state,
    watcherRunning: state.enabled && state.blocked.length > 0 && state.usageAccess && state.overlayAllowed,
    blocked: [...state.blocked],
    sites: [...state.sites],
  });

  return {
    getState: snapshot,
    setEnabled(value) {
      state.enabled = !!value;
      return snapshot();
    },
    setBlockedApps(packages) {
      state.blocked = [...packages];
      return snapshot();
    },
    setBlockedSites(domains) {
      state.sites = [...domains];
      return snapshot();
    },
    addCredit(seconds) {
      state.balanceSeconds = Math.min(24 * 3600, state.balanceSeconds + seconds);
      return snapshot();
    },
    setShowTimer(value) {
      state.showTimer = !!value;
      return snapshot();
    },
    setLabels() {},
    consumeEarnRequest() {
      return 0;
    },
    reset() {
      Object.assign(state, { enabled: false, blocked: [], sites: [], balanceSeconds: 0, earnRequestedAt: 0 });
      return snapshot();
    },
    // Stands in for the user switching the service on in system settings.
    openAccessibilitySettings() {
      state.serviceEnabled = true;
      state.serviceRunning = true;
      state.serviceConnectedAt = Date.now();
      return true;
    },
    switchOffAccessibility() {
      state.serviceEnabled = false;
      state.serviceRunning = false;
      return true;
    },
    // Stands in for the user switching Developer options off.
    openDeveloperSettings() {
      state.developerOptions = false;
      return true;
    },
    // Stand in for the user granting each permission in system settings.
    openUsageAccessSettings() {
      state.usageAccess = true;
      return true;
    },
    openOverlaySettings() {
      state.overlayAllowed = true;
      return true;
    },
    openAppSettings() {
      return true;
    },
    openBatterySettings() {
      state.batteryOptimized = false;
      return true;
    },
    openAutostartSettings() {
      return true;
    },
    async getInstalledApps() {
      return DEMO_APPS.map(([packageName, label]) => ({ packageName, label, icon: null }));
    },
  };
}
