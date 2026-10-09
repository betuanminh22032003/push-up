import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '../storage/sessions';

const SettingsContext = createContext(null);

/**
 * App settings, shared by every tab. Reads once at launch; every update is
 * written through immediately, so a setting changed on one screen is what
 * the workout screen sees on its next render.
 */
export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = await loadSettings();
      if (cancelled) return;
      setSettings(stored);
      setIsLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const updateSettings = useCallback((patch) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  /** Back to the defaults after "delete all data", written so it lasts past a restart. */
  const resetSettings = useCallback(() => {
    const next = { ...DEFAULT_SETTINGS, onboardingDone: true };
    setSettings(next);
    saveSettings(next);
  }, []);

  /** Read the stored settings again, after a backup was restored underneath us. */
  const reload = useCallback(async () => {
    setSettings(await loadSettings());
  }, []);

  const value = useMemo(
    () => ({ settings, isLoaded, updateSettings, resetSettings, reload }),
    [settings, isLoaded, updateSettings, resetSettings, reload],
  );
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider');
  return ctx;
}
