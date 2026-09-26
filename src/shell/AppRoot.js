import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Platform, StyleSheet, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';

import { TabBar } from '../components/TabBar';
import { Toast } from '../components/Toast';
import { useT } from '../i18n/I18nContext';
import { configureNotifications, scheduleDailyReminder } from '../notifications/reminders';
import { OnboardingModal } from '../screens/OnboardingModal';
import { ProgramScreen } from '../screens/ProgramScreen';
import { ProgressScreen } from '../screens/ProgressScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { WorkoutScreen } from '../screens/WorkoutScreen';
import { useSessions } from '../state/SessionsContext';
import { useSettings } from '../state/SettingsContext';
import { colors } from '../theme/theme';

const TAB_IDS = ['workout', 'program', 'progress', 'settings'];
const TAB_ICONS = { workout: '💪', program: '📘', progress: '📈', settings: '⚙️' };

configureNotifications();

/**
 * The shell: four tabs, a toast lane, first-run onboarding, and the daily
 * reminder kept in sync with settings.
 *
 * Every tab stays mounted and is hidden rather than unmounted, so scroll
 * positions and the workout screen's last summary survive a tab switch. The
 * tab bar itself disappears while a workout is running — there is nothing to
 * navigate to mid-set, and a stray tap must not tear the camera down.
 */
export function AppRoot() {
  const t = useT();
  const { settings, isLoaded: settingsLoaded, updateSettings } = useSettings();
  const { isLoaded: sessionsLoaded } = useSessions();

  const [tab, setTab] = useState('workout');
  const [plan, setPlan] = useState(null);
  const [workoutBusy, setWorkoutBusy] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const workoutControls = useRef(null);

  // --- splash: hold it until the stored state is in memory ------------------
  const ready = settingsLoaded && sessionsLoaded;
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  // --- first run ---------------------------------------------------------------
  useEffect(() => {
    if (settingsLoaded && !settings.onboardingDone) setOnboardingOpen(true);
  }, [settingsLoaded, settings.onboardingDone]);

  const closeOnboarding = useCallback(() => {
    setOnboardingOpen(false);
    if (!settings.onboardingDone) updateSettings({ onboardingDone: true });
  }, [settings.onboardingDone, updateSettings]);

  // --- reminder: re-schedule from settings so time and language stay current --
  const { reminderEnabled, reminderHour, reminderMinute } = settings;
  useEffect(() => {
    if (!settingsLoaded || !reminderEnabled) return;
    scheduleDailyReminder({
      hour: reminderHour,
      minute: reminderMinute,
      title: t('reminder.title'),
      body: t('reminder.body'),
    });
  }, [settingsLoaded, reminderEnabled, reminderHour, reminderMinute, t]);

  // --- Android back button ------------------------------------------------------
  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (onboardingOpen) {
        closeOnboarding();
        return true;
      }
      if (workoutControls.current?.busy) {
        // Mid-set, back means "hold on", not "leave".
        workoutControls.current.pause();
        return true;
      }
      if (tab !== 'workout') {
        setTab('workout');
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [onboardingOpen, closeOnboarding, tab]);

  const startPlan = useCallback((nextPlan) => {
    setPlan(nextPlan);
    setTab('workout');
  }, []);

  const clearPlan = useCallback(() => setPlan(null), []);

  const handleStatus = useCallback((status) => setWorkoutBusy(status !== 'idle'), []);

  const celebrate = useCallback((messages) => {
    setToasts((prev) => [...prev, ...messages]);
  }, []);
  const popToast = useCallback(() => setToasts((prev) => prev.slice(1)), []);

  const tabs = TAB_IDS.map((id) => ({ id, icon: TAB_ICONS[id], label: t(`tab.${id}`) }));

  if (!ready) return <View style={styles.root} />;

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      <View style={[styles.screen, tab !== 'workout' && styles.hidden]}>
        <WorkoutScreen
          plan={plan}
          onClearPlan={clearPlan}
          onStatusChange={handleStatus}
          onCelebrate={celebrate}
          controlsRef={workoutControls}
        />
      </View>
      <View style={[styles.screen, tab !== 'program' && styles.hidden]}>
        <ProgramScreen onStartPlan={startPlan} />
      </View>
      <View style={[styles.screen, tab !== 'progress' && styles.hidden]}>
        <ProgressScreen />
      </View>
      <View style={[styles.screen, tab !== 'settings' && styles.hidden]}>
        <SettingsScreen onShowOnboarding={() => setOnboardingOpen(true)} />
      </View>

      {workoutBusy ? null : <TabBar tabs={tabs} activeId={tab} onSelect={setTab} />}

      <Toast message={toasts[0] ?? null} onHide={popToast} />
      <OnboardingModal visible={onboardingOpen} onClose={closeOnboarding} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  screen: { flex: 1 },
  hidden: { display: 'none' },
});
