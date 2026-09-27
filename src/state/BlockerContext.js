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

const readNative = () => (NativeBlocker ? normalizeState(NativeBlocker.getState()) : EMPTY_STATE);

/**
 * The app blocker as the screens see it: the native state (balance, blocked
 * apps, whether the accessibility service is on) plus the actions on it.
 *
 * The native side is the source of truth — the service spends the balance
 * while the app is closed — so every action sets state from what the native
 * call returns, and everything is re-read whenever the app comes back to the
 * foreground (for instance from the accessibility settings).
 */
export function BlockerProvider({ children }) {
  const { settings, updateSettings } = useSettings();
  const { t } = useI18n();
  const rate = settings.blockerSecondsPerRep ?? DEFAULT_RATE_SECONDS;
  const customSites = settings.blockerSites ?? [];

  const [state, setState] = useState(readNative);
  const [apps, setApps] = useState(null); // null until the picker first needs them
  const [appsLoading, setAppsLoading] = useState(false);
  // Bumped when the block screen's "earn time" button brought the app up, so
  // the shell can switch to the workout tab.
  const [earnSignal, setEarnSignal] = useState(0);
  // On in the system settings, yet still not running after a second look.
  const [serviceStalled, setServiceStalled] = useState(false);
  const recheckTimer = useRef(null);

  const refresh = useCallback(() => {
    if (!NativeBlocker) return;
    const next = readNative();
    setState(next);
    // Just switched on in system settings: the system binds the service a
    // moment later, so look again before calling it stuck.
    clearTimeout(recheckTimer.current);
    if (next.serviceEnabled && !next.serviceRunning) {
      recheckTimer.current = setTimeout(() => {
        const later = readNative();
        setState(later);
        setServiceStalled(later.serviceEnabled && !later.serviceRunning);
      }, SERVICE_RECHECK_MS);
    } else {
      setServiceStalled(false);
    }
  }, []);

  // Sites blocked in browsers: the blocked apps' own plus the user's. Pushed
  // whenever either changes, since the service reads them natively.
  const sites = useMemo(
    () => effectiveSites(state.blocked, customSites),
    [state.blocked, customSites],
  );
  const sitesKey = sites.join(' ');
  useEffect(() => {
    if (!NativeBlocker) return;
    setState(normalizeState(NativeBlocker.setBlockedSites(sites)));
    // sitesKey stands for sites, whose identity changes on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sitesKey]);

  const consumeEarnRequest = useCallback(() => {
    if (!NativeBlocker) return;
    const at = NativeBlocker.consumeEarnRequest();
    if (at && Date.now() - at < EARN_REQUEST_TTL_MS) setEarnSignal((n) => n + 1);
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
    NativeBlocker.setLabels({
      blockTitle: t('native.blockTitle'),
      timeUpTitle: t('native.timeUpTitle'),
      blockBody: t('native.blockBody', { rate: formatAmount(rate, t) }),
      earnButton: t('native.earnButton'),
      homeButton: t('native.homeButton'),
      lowTime: t('native.lowTime'),
      blockedToast: t('native.blockedToast'),
    });
  }, [t, rate]);

  const apply = useCallback((call) => {
    if (!NativeBlocker) return;
    setState(normalizeState(call(NativeBlocker)));
  }, []);

  const setEnabled = useCallback((on) => apply((n) => n.setEnabled(on)), [apply]);
  const setShowTimer = useCallback((on) => apply((n) => n.setShowTimer(on)), [apply]);
  const reset = useCallback(() => apply((n) => n.reset()), [apply]);

  const setBlockedApps = useCallback(
    (packages) =>
      apply((n) => {
        const before = normalizeState(n.getState());
        const next = n.setBlockedApps(packages);
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
   * @returns {number} seconds credited (0 when nothing was)
   */
  const creditReps = useCallback(
    (reps) => {
      if (!NativeBlocker) return 0;
      if (!isSetUp(normalizeState(NativeBlocker.getState()))) return 0;
      const seconds = creditFor(reps, rate);
      if (seconds <= 0) return 0;
      setState(normalizeState(NativeBlocker.addCredit(seconds)));
      return seconds;
    },
    [rate],
  );

  const openAccessibilitySettings = useCallback(() => {
    if (!NativeBlocker) return false;
    const opened = NativeBlocker.openAccessibilitySettings();
    refresh();
    return opened;
  }, [refresh]);

  const openAppSettings = useCallback(() => NativeBlocker?.openAppSettings() ?? false, []);
  const openBatterySettings = useCallback(() => NativeBlocker?.openBatterySettings() ?? false, []);

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
        const now = readNative();
        if (NativeBlocker && !now.enabled && now.blocked.length === 0 && customSites.length === 0) {
          setState(normalizeState(NativeBlocker.setEnabled(true)));
        }
      }
      return true;
    },
    [customSites, updateSettings],
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
      loadApps,
    }),
    [
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
