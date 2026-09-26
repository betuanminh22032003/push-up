import { createContext, useCallback, useContext, useMemo } from 'react';
import { getLocales } from 'expo-localization';

import { SPEECH_TAGS, resolveLanguage, translate } from './strings';
import { useSettings } from '../state/SettingsContext';

const I18nContext = createContext(null);

/** Device language codes, read once: the app restarts on an OS language change anyway. */
function deviceLanguages() {
  try {
    return getLocales().map((l) => l.languageCode || l.languageTag);
  } catch {
    return [];
  }
}

export function I18nProvider({ children }) {
  const { settings } = useSettings();
  const language = useMemo(
    () => resolveLanguage(settings.language, deviceLanguages()),
    [settings.language],
  );

  const t = useCallback((key, params) => translate(language, key, params), [language]);

  const value = useMemo(
    () => ({ language, t, speechTag: SPEECH_TAGS[language] }),
    [language, t],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}

/** Shorthand for the one thing nearly every component needs. */
export function useT() {
  return useI18n().t;
}
