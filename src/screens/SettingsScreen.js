import { useCallback, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chips, LinkRow, Row, Section, Toggle } from '../components/SettingsRows';
import { PRIVACY_URL, SOURCE_URL } from '../config';
import { useT } from '../i18n/I18nContext';
import {
  cancelDailyReminder,
  remindersSupported,
  requestReminderPermission,
} from '../notifications/reminders';
import { useBlocker } from '../state/BlockerContext';
import { useSessions } from '../state/SessionsContext';
import { useSettings } from '../state/SettingsContext';
import { colors, spacing, type } from '../theme/theme';
import { confirm } from '../utils/confirm';
import { formatClock } from '../utils/time';

const COUNTDOWN_OPTIONS = [0, 3, 5, 10];
const REST_OPTIONS = [30, 60, 90, 120];
const GOAL_STEP = 10;
const GOAL_MIN = 10;
const GOAL_MAX = 500;
const LANGUAGE_OPTIONS = [
  { id: 'auto', key: 'settings.langAuto' },
  { id: 'en', key: 'settings.langEn' },
  { id: 'vi', key: 'settings.langVi' },
];

export function SettingsScreen({ onShowOnboarding }) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const { settings, updateSettings, resetSettings } = useSettings();
  const { eraseEverything } = useSessions();
  const { reset: resetBlocker } = useBlocker();
  const [reminderDenied, setReminderDenied] = useState(false);

  const toggleReminder = useCallback(
    async (on) => {
      if (!on) {
        updateSettings({ reminderEnabled: false });
        await cancelDailyReminder();
        return;
      }
      const granted = await requestReminderPermission();
      setReminderDenied(!granted);
      // Scheduling itself happens in the app shell, which re-schedules from
      // settings so the text always matches the current language.
      if (granted) updateSettings({ reminderEnabled: true });
    },
    [updateSettings],
  );

  const shiftGoal = (delta) => {
    const next = Math.min(GOAL_MAX, Math.max(GOAL_MIN, settings.dailyGoal + delta));
    updateSettings({ dailyGoal: next });
  };

  const shiftHour = (delta) => updateSettings({ reminderHour: (settings.reminderHour + delta + 24) % 24 });
  const shiftMinute = (delta) =>
    updateSettings({ reminderMinute: (settings.reminderMinute + delta + 60) % 60 });

  const confirmClear = () => {
    confirm({
      title: t('confirm.clearTitle'),
      message: t('confirm.clearBody'),
      confirmText: t('confirm.deleteAll'),
      cancelText: t('common.cancel'),
      destructive: true,
      onConfirm: async () => {
        await cancelDailyReminder();
        await eraseEverything();
        resetBlocker();
        resetSettings();
      },
    });
  };

  const version = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md }]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>{t('settings.title')}</Text>

      <Section label={t('settings.workout')}>
        <Row title={t('settings.dailyGoal')} body={t('settings.dailyGoalBody')}>
          <Stepper
            value={settings.dailyGoal}
            onDown={() => shiftGoal(-GOAL_STEP)}
            onUp={() => shiftGoal(GOAL_STEP)}
            downDisabled={settings.dailyGoal <= GOAL_MIN}
            upDisabled={settings.dailyGoal >= GOAL_MAX}
          />
        </Row>
        <Row title={t('settings.countdown')} body={t('settings.countdownBody')} stacked>
          <Chips
            options={COUNTDOWN_OPTIONS.map((s) => ({
              id: s,
              label: s === 0 ? t('common.off') : t('common.seconds', { n: s }),
            }))}
            selected={settings.countdownSeconds}
            onSelect={(countdownSeconds) => updateSettings({ countdownSeconds })}
          />
        </Row>
        <Row title={t('settings.rest')} body={t('settings.restBody')} stacked>
          <Chips
            options={REST_OPTIONS.map((s) => ({ id: s, label: t('common.seconds', { n: s }) }))}
            selected={settings.restSeconds}
            onSelect={(restSeconds) => updateSettings({ restSeconds })}
          />
        </Row>
      </Section>

      <Section label={t('settings.feedback')}>
        <Row title={t('settings.voice')} body={t('settings.voiceBody')}>
          <Toggle
            value={settings.voiceEnabled}
            onChange={(voiceEnabled) => updateSettings({ voiceEnabled })}
            label={t('settings.voice')}
          />
        </Row>
        <Row title={t('settings.sound')}>
          <Toggle
            value={settings.soundEnabled}
            onChange={(soundEnabled) => updateSettings({ soundEnabled })}
            label={t('settings.sound')}
          />
        </Row>
        <Row title={t('settings.haptics')}>
          <Toggle
            value={settings.hapticsEnabled}
            onChange={(hapticsEnabled) => updateSettings({ hapticsEnabled })}
            label={t('settings.haptics')}
          />
        </Row>
      </Section>

      <Section label={t('settings.reminder')}>
        {remindersSupported ? (
          <>
            <Row
              title={t('settings.reminderToggle')}
              body={reminderDenied ? t('settings.reminderDenied') : t('settings.reminderBody')}
              bodyWarn={reminderDenied}
            >
              <Toggle
                value={settings.reminderEnabled}
                onChange={toggleReminder}
                label={t('settings.reminderToggle')}
              />
            </Row>
            {settings.reminderEnabled ? (
              <Row title={t('settings.reminderTime')} stacked>
                <View style={styles.clockRow}>
                  <Stepper
                    value={formatClock(settings.reminderHour, 0).slice(0, 2)}
                    onDown={() => shiftHour(-1)}
                    onUp={() => shiftHour(1)}
                  />
                  <Text style={styles.clockColon}>:</Text>
                  <Stepper
                    value={formatClock(0, settings.reminderMinute).slice(3)}
                    onDown={() => shiftMinute(-15)}
                    onUp={() => shiftMinute(15)}
                  />
                </View>
              </Row>
            ) : null}
          </>
        ) : (
          <Row
            title={t('settings.reminderToggle')}
            body={t(Platform.OS === 'web' ? 'settings.reminderWeb' : 'settings.reminderExpoGo')}
          />
        )}
      </Section>

      <Section label={t('settings.general')}>
        <Row title={t('settings.language')} stacked>
          <Chips
            options={LANGUAGE_OPTIONS.map((o) => ({ id: o.id, label: t(o.key) }))}
            selected={settings.language}
            onSelect={(language) => updateSettings({ language })}
          />
        </Row>
        <LinkRow title={t('settings.howItWorks')} onPress={onShowOnboarding} />
      </Section>

      <Section label={t('settings.data')}>
        <Text style={styles.privacyNote}>{t('settings.privacyNote')}</Text>
        <LinkRow title={t('settings.clearAll')} body={t('settings.clearAllBody')} onPress={confirmClear} danger />
      </Section>

      <Section label={t('settings.about')}>
        <LinkRow title={t('settings.privacy')} onPress={() => Linking.openURL(PRIVACY_URL)} />
        <LinkRow title={t('settings.sourceCode')} onPress={() => Linking.openURL(SOURCE_URL)} />
        <Text style={styles.version}>
          {t('settings.version', { version })}
          {Platform.OS !== 'web' ? ` · ${Platform.OS}` : ''}
        </Text>
      </Section>
    </ScrollView>
  );
}

function Stepper({ value, onDown, onUp, downDisabled, upDisabled }) {
  return (
    <View style={styles.stepper}>
      <Pressable
        onPress={onDown}
        disabled={downDisabled}
        accessibilityRole="button"
        accessibilityLabel="−"
        style={({ pressed }) => [styles.stepBtn, (pressed || downDisabled) && styles.pressed]}
      >
        <Text style={styles.stepGlyph}>−</Text>
      </Pressable>
      <Text style={styles.stepValue}>{value}</Text>
      <Pressable
        onPress={onUp}
        disabled={upDisabled}
        accessibilityRole="button"
        accessibilityLabel="+"
        style={({ pressed }) => [styles.stepBtn, (pressed || upDisabled) && styles.pressed]}
      >
        <Text style={styles.stepGlyph}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  pressed: { opacity: 0.5 },
  title: { ...type.title, color: colors.text },
  privacyNote: { fontSize: 13, color: colors.textDim, paddingVertical: spacing.md, lineHeight: 18 },
  version: { fontSize: 12, color: colors.textFaint, paddingVertical: spacing.md },

  stepper: { flexDirection: 'row', alignItems: 'center' },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepGlyph: { fontSize: 20, color: colors.text, lineHeight: 24 },
  stepValue: {
    minWidth: 48,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '600',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  clockRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  clockColon: { fontSize: 20, color: colors.textDim, marginHorizontal: spacing.xs },
});
