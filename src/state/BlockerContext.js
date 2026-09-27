import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import {
  DEFAULT_RATE_SECONDS,
  EARN_REQUEST_TTL_MS,
  EMPTY_STATE,
  ICON_PX,
  creditFor,
  effectiveSites,
  formatAmount,
  isSetUp,
  normalizeApps,
  normalizeDomain,
  normalizeState,
  sortApps,
} from '../blocker/blockerLogic';
import { NativeBlocker, unavailableReason } from '../blocker/nativeBlocker';
import { useI18n } from '../i18n/I18nContext';
import { useSettings } from './SettingsContext';

const BlockerContext = createContext(null);

/** How long to wait before re-reading a service the system has not bound yet. */
const SERVICE_RECHECK_MS = 1500;

const read = async () => normalizeState(await NativeBlocker.getState());

/**
 * The app blocker as the screens see it: the native state (balance, blocked
 * apps and sites, whether the accessibility service runs) plus the actions.
 *
 * The state lives in the blocker's own process, which keeps blocking while
 * the app is closed, so every call is async and every action sets state from
 * what the call returns. Everything is re-read whenever the app comes back to
 * the foreground, for instance from the accessibility settings.
 */
export function BlockerProvider({ children }) {
  const { settings, updateSettings } = useSettings();
  const { t } = useI18n();
  const rate = settings.blockerSecondsPerRep ?? DEFAULT_RATE_SECONDS;
  const customSites = settings.blockerSites ?? [];

  const [state, setState] = useState(EMPTY_STATE);
  const [loaded, setLoaded] = useState(!NativeBlocker);
  const [apps, setApps] = useState(null); // null until the picker first needs them
  const [appsLoading, setAppsLoading] = useState(false);
  // Bumped when the block screen's "earn time" button brought the app up, so
  // the shell can switch to the workout tab.
  const [earnSignal, setEarnSignal] = useState(0);
  // On in the system settings, yet still not running after a second look.
  const [serviceStalled, setServiceStalled] = useState(false);
  const recheckTimer = useRef(null);

  /** Take a state from the native side, unless its process could not be reached. */
  const accept = useCallback((next) => {
    if (!next.reachable) return next;
    setState(next);
    setLoaded(true);
    return next;
  }, []);

  const refresh = useCallback(async () => {
    if (!NativeBlocker) return;
    try {
      const next = accept(await read());
      // Just switched on in system settings: the system binds the service a
      // moment later, so look again before calling it stuck.
      clearTimeout(recheckTimer.current);
      if (next.serviceEnabled && !next.serviceRunning) {
        recheckTimer.current = setTimeout(async () => {
          try {
            const later = accept(await read());
            setServiceStalled(later.serviceEnabled && !later.serviceRunning);
          } catch {
            // the next refresh tries again
          }
        }, SERVICE_RECHECK_MS);
      } else {
        setServiceStalled(false);
      }
    } catch {
      // keep the last state; the next foreground refresh tries again
    }
  }, [accept]);

  const apply = useCallback(
    async (call) => {
      if (!NativeBlocker) return;
      try {
        accept(normalizeState(await call(NativeBlocker)));
      } catch {
        // keep the last state
      }
    },
    [accept],
  );

  // Sites blocked in browsers: the blocked apps' own plus the user's. Pushed
  // whenever either changes, since the service reads them natively.
  const sites = useMemo(
    () => effectiveSites(state.blocked, customSites),
    [state.blocked, customSites],
  );
  const sitesKey = sites.join(' ');
  useEffect(() => {
    if (loaded) apply((n) => n.setBlockedSites(sites));
    // sitesKey stands for sites, whose identity changes on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sitesKey, loaded]);

  const consumeEarnRequest = useCallback(async () => {
    if (!NativeBlocker) return;
    try {
      const at = await NativeBlocker.consumeEarnRequest();
      if (at && Date.now() - at < EARN_REQUEST_TTL_MS) setEarnSignal((n) => n + 1);
    } catch {
      // nothing to consume
    }
  }, []);

  useEffect(() => {
    refresh();
    consumeEarnRequest();
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      refresh();
      consumeEarnRequest();
    });
    return () => {
      sub.remove();
      clearTimeout(recheckTimer.current);
    };
  }, [refresh, consumeEarnRequest]);

  // The block screen and the countdown are native, so they get their copy
  // from here, in the app's language rather than the phone's.
  useEffect(() => {
    if (!NativeBlocker) return;
    Promise.resolve(
      NativeBlocker.setLabels({
        blockTitle: t('native.blockTitle'),
        timeUpTitle: t('native.timeUpTitle'),
        blockBody: t('native.blockBody', { rate: formatAmount(rate, t) }),
        earnButton: t('native.earnButton'),
        homeButton: t('native.homeButton'),
        lowTime: t('native.lowTime'),
        blockedToast: t('native.blockedToast'),
      }),
    ).catch(() => {});
  }, [t, rate]);

  const setEnabled = useCallback((on) => apply((n) => n.setEnabled(on)), [apply]);
  const setShowTimer = useCallback((on) => apply((n) => n.setShowTimer(on)), [apply]);
  const reset = useCallback(() => apply((n) => n.reset()), [apply]);

  const setBlockedApps = useCallback(
    (packages) =>
      apply(async (n) => {
        const before = normalizeState(await n.getState());
        const next = await n.setBlockedApps(packages);
        // Picking the first apps means "block these": switch blocking on too.
        return before.blocked.length === 0 && packages.length > 0 && !before.enabled
          ? n.setEnabled(true)
          : next;
      }),
    [apply],
  );

  /**
   * Turn a saved workout into fun time. Only while the blocker is set up:
   * banking hours before it is switched on would defeat it on day one.
   * @returns {Promise<number>} seconds credited (0 when nothing was)
   */
  const creditReps = useCallback(
    async (reps) => {
      if (!NativeBlocker) return 0;
      try {
        if (!isSetUp(await read())) return 0;
        const seconds = creditFor(reps, rate);
        if (seconds <= 0) return 0;
        const next = accept(normalizeState(await NativeBlocker.addCredit(seconds)));
        return next.reachable ? seconds : 0;
      } catch {
        return 0;
      }
    },
    [rate, accept],
  );

  const openAccessibilitySettings = useCallback(() => {
    if (!NativeBlocker) return false;
    const opened = NativeBlocker.openAccessibilitySettings();
    refresh();
    return opened;
  }, [refresh]);

  const openAppSettings = useCallback(() => NativeBlocker?.openAppSettings() ?? false, []);
  const openBatterySettings = useCallback(() => NativeBlocker?.openBatterySettings() ?? false, []);
  const openAutostartSettings = useCallback(
    () => NativeBlocker?.openAutostartSettings() ?? false,
    [],
  );

  /**
   * Add a site the user typed. @returns {boolean} false when it is not a domain.
   * Like picking the first apps, adding the first site switches blocking on.
   */
  const addSite = useCallback(
    (text) => {
      const domain = normalizeDomain(text);
      if (!domain) return false;
      if (!customSites.includes(domain)) {
        updateSettings({ blockerSites: [...customSites, domain] });
        if (!state.enabled && state.blocked.length === 0 && customSites.length === 0) {
          apply((n) => n.setEnabled(true));
        }
      }
      return true;
    },
    [customSites, updateSettings, state.enabled, state.blocked.length, apply],
  );

  const removeSite = useCallback(
    (domain) => updateSettings({ blockerSites: customSites.filter((d) => d !== domain) }),
    [customSites, updateSettings],
  );

  const loadApps = useCallback(async () => {
    if (!NativeBlocker) return;
    setAppsLoading(true);
    try {
      setApps(sortApps(normalizeApps(await NativeBlocker.getInstalledApps(ICON_PX))));
    } catch {
      setApps([]);
    } finally {
      setAppsLoading(false);
    }
  }, []);

  const value = useMemo(
    () => ({
      available: !!NativeBlocker,
      unavailableReason,
      loaded,
      state,
      rate,
      customSites,
      serviceStalled,
      apps,
      appsLoading,
      earnSignal,
      refresh,
      setEnabled,
      setShowTimer,
      setBlockedApps,
      addSite,
      removeSite,
      creditReps,
      reset,
      openAccessibilitySettings,
      openAppSettings,
      openBatterySettings,
      openAutostartSettings,
      loadApps,
    }),
    [
      loaded,
      state,
      rate,
      customSites,
      serviceStalled,
      apps,
      appsLoading,
      earnSignal,
      refresh,
      setEnabled,
      setShowTimer,
      setBlockedApps,
      addSite,
      removeSite,
      creditReps,
      reset,
      openAccessibilitySettings,
      openAppSettings,
      openBatterySettings,
      openAutostartSettings,
      loadApps,
    ],
  );
  return <BlockerContext.Provider value={value}>{children}</BlockerContext.Provider>;
}

export function useBlocker() {
  const ctx = useContext(BlockerContext);
  if (!ctx) throw new Error('useBlocker must be used inside BlockerProvider');
  return ctx;
}
