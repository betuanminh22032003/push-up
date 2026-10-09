import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Platform, StyleSheet, View } from 'react-native';
import * as Linking from 'expo-linking';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';

import { decodeChallenge, extractChallengeToken } from '../challenge/codec';
import { TabBar } from '../components/TabBar';
import { Toast } from '../components/Toast';
import { useT } from '../i18n/I18nContext';
import { cancelDailyReminder, configureNotifications, scheduleDailyReminder } from '../notifications/reminders';
import { BlockerScreen } from '../screens/BlockerScreen';
import { ChallengeScreen } from '../screens/ChallengeScreen';
import { OnboardingModal } from '../screens/OnboardingModal';
import { ProgramScreen } from '../screens/ProgramScreen';
import { ProgressScreen } from '../screens/ProgressScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { WorkoutScreen } from '../screens/WorkoutScreen';
import { useBlocker } from '../state/BlockerContext';
import { useSessions } from '../state/SessionsContext';
import { useSettings } from '../state/SettingsContext';
import { colors } from '../theme/theme';

const TAB_IDS = ['workout', 'program', 'progress', 'blocker', 'settings'];
const TAB_ICONS = { workout: '💪', program: '📘', progress: '📈', blocker: '🔒', settings: '⚙️' };

configureNotifications();

/**
 * The shell: five tabs, a toast lane, first-run onboarding, and the daily
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
  const { earnSignal } = useBlocker();

  const [tab, setTab] = useState('workout');
  const [plan, setPlan] = useState(null);
  const [workoutBusy, setWorkoutBusy] = useState(false);
  // { id, text }: the id keeps two toasts with the same text apart.
  const [toasts, setToasts] = useState([]);
  const toastId = useRef(0);
  const pushToasts = useCallback((texts) => {
    setToasts((prev) => [...prev, ...texts.map((text) => ({ id: (toastId.current += 1), text }))]);
  }, []);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const workoutControls = useRef(null);
  // The challenge sheet: null, { mode: 'new', exerciseId } or { mode: 'received', challenge }.
  const [challenge, setChallenge] = useState(null);
  // A challenge link that arrived mid-workout waits for the workout to end:
  // two screens cannot share the camera.
  const [pendingChallenge, setPendingChallenge] = useState(null);

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
  // Cancelled whenever settings say off, not only by the toggle: a restored
  // backup can switch it off too.
  const { reminderEnabled, reminderHour, reminderMinute } = settings;
  useEffect(() => {
    if (!settingsLoaded) return;
    if (!reminderEnabled) {
      cancelDailyReminder();
      return;
    }
    scheduleDailyReminder({
      hour: reminderHour,
      minute: reminderMinute,
      title: t('reminder.title'),
      body: t('reminder.body'),
      channelName: t('reminder.channel'),
    });
  }, [settingsLoaded, reminderEnabled, reminderHour, reminderMinute, t]);

  // --- "Do push-ups now" on the block screen opens the app on the workout tab --
  useEffect(() => {
    if (earnSignal > 0) setTab('workout');
  }, [earnSignal]);

  // --- challenge links: hitdat://challenge?c=..., or #c=... on the web build ------
  const handleLink = (url) => {
    const token = extractChallengeToken(url);
    if (!token) return;
    const decoded = decodeChallenge(token);
    if (decoded.ok) {
      setPendingChallenge({ mode: 'received', challenge: decoded.challenge });
    } else {
      pushToasts([t('challenge.badLink')]);
    }
    // On the web the link lives in the address bar; drop it so a reload does
    // not open the same challenge again.
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.history?.replaceState) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  };
  const handleLinkRef = useRef(handleLink);
  handleLinkRef.current = handleLink;
  useEffect(() => {
    // The link the app was opened with, once: cleared after reading, so the
    // error screen's Try again (which remounts this) does not open it again.
    const initial = Linking.getLinkingURL();
    Linking.clearInitialURL();
    if (initial) handleLinkRef.current(initial);
    // Every later link, the same one tapped again after "Later" included.
    // Android also keeps each of these as the "initial" link; cleared too.
    const sub = Linking.addEventListener('url', ({ url }) => {
      Linking.clearInitialURL();
      handleLinkRef.current(url);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    // After first-run onboarding, too: a friend's link is often how someone
    // first opens the app, and two sheets at once would fight for the screen.
    // One sheet at a time: a second link waits until the open one is closed.
    if (pendingChallenge && !challenge && ready && !workoutBusy && !onboardingOpen && settings.onboardingDone) {
      setChallenge(pendingChallenge);
      setPendingChallenge(null);
    }
  }, [pendingChallenge, challenge, ready, workoutBusy, onboardingOpen, settings.onboardingDone]);

  const openChallenge = useCallback((exerciseId) => setChallenge({ mode: 'new', exerciseId }), []);
  const closeChallenge = useCallback(() => setChallenge(null), []);

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
  const openBlocker = useCallback(() => setTab('blocker'), []);
  const openWorkout = useCallback(() => setTab('workout'), []);

  const handleStatus = useCallback((status) => setWorkoutBusy(status !== 'idle'), []);

  const celebrate = useCallback((messages) => pushToasts(messages), [pushToasts]);
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
          onOpenBlocker={openBlocker}
          onOpenChallenge={openChallenge}
          controlsRef={workoutControls}
        />
      </View>
      <View style={[styles.screen, tab !== 'program' && styles.hidden]}>
        <ProgramScreen onStartPlan={startPlan} />
      </View>
      <View style={[styles.screen, tab !== 'progress' && styles.hidden]}>
        <ProgressScreen onOpenChallenge={openChallenge} />
      </View>
      <View style={[styles.screen, tab !== 'blocker' && styles.hidden]}>
        <BlockerScreen onGoWorkout={openWorkout} />
      </View>
      <View style={[styles.screen, tab !== 'settings' && styles.hidden]}>
        <SettingsScreen onShowOnboarding={() => setOnboardingOpen(true)} />
      </View>

      {workoutBusy ? null : <TabBar tabs={tabs} activeId={tab} onSelect={setTab} />}

      <Toast message={toasts[0]?.text ?? null} id={toasts[0]?.id} onHide={popToast} />
      <OnboardingModal visible={onboardingOpen} onClose={closeOnboarding} />
      <ChallengeScreen request={challenge} onClose={closeChallenge} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  screen: { flex: 1 },
  hidden: { display: 'none' },
});
