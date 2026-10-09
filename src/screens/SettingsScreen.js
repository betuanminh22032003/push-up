import { useCallback, useEffect, useState } from 'react';
import { Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Constants from 'expo-constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { exportAppData, readBackup, restoreAppData } from '../backup/appData';
import { MAX_BACKUP_BYTES, backupFileName } from '../backup/backup';
import { pickTextFile, shareTextFile } from '../backup/files';
import { cleanName } from '../challenge/codec';
import { Button } from '../components/Button';
import { Chips, LinkRow, Row, Section, Toggle } from '../components/SettingsRows';
import { PRIVACY_URL, SOURCE_URL } from '../config';
import { appInfo, deviceInfo } from '../diagnostics/device';
import { loadErrors } from '../diagnostics/errorLog';
import { formatReport } from '../diagnostics/report';
import { useI18n } from '../i18n/I18nContext';
import { STORAGE_KEYS } from '../storage/sessions';
import { useChallenges } from '../state/ChallengesContext';
import { shareText } from '../utils/share';
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
  const { t, language } = useI18n();
  const insets = useSafeAreaInsets();
  const { settings, updateSettings, resetSettings, reload: reloadSettings } = useSettings();
  const { eraseEverything, reload: reloadSessions } = useSessions();
  const { reload: reloadChallenges } = useChallenges();
  const { reset: resetBlocker } = useBlocker();
  const [reminderDenied, setReminderDenied] = useState(false);

  // --- backup -------------------------------------------------------------------
  // What the last backup action said, under the rows: { tone, text }.
  const [backupNote, setBackupNote] = useState(null);
  // A checked file waiting for the user to choose merge or replace.
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);

  const exportBackup = useCallback(async () => {
    setBusy(true);
    try {
      const text = await exportAppData({ appVersion: appInfo().version });
      const outcome = await shareTextFile(backupFileName(), text, { dialogTitle: t('backup.dialogTitle') });
      setBackupNote(
        outcome === 'shared'
          ? { tone: 'ok', text: t('backup.exported') }
          : { tone: 'warn', text: t('backup.unavailable') },
      );
    } catch (e) {
      setBackupNote({ tone: 'warn', text: t('backup.failed', { reason: e?.message || String(e) }) });
    } finally {
      setBusy(false);
    }
  }, [t]);

  const importBackup = useCallback(async () => {
    try {
      const file = await pickTextFile({ maxBytes: MAX_BACKUP_BYTES });
      if (!file) return;
      const result = file.tooLarge ? { ok: false, error: 'tooLarge' } : readBackup(file.text);
      if (!result.ok) {
        setBackupNote({ tone: 'warn', text: t(`backup.error.${result.error}`) });
        return;
      }
      setBackupNote(null);
      setPreview({ ...result, fileName: file.name });
    } catch (e) {
      setBackupNote({ tone: 'warn', text: t('backup.failed', { reason: e?.message || String(e) }) });
    }
  }, [t]);

  const restore = useCallback(
    async (mode) => {
      const pending = preview;
      setPreview(null);
      if (!pending) return;
      setBusy(true);
      try {
        const { added } = await restoreAppData(pending.backup, mode);
        await Promise.all([reloadSettings(), reloadSessions(), reloadChallenges()]);
        setBackupNote({
          tone: 'ok',
          text:
            mode === 'merge'
              ? t('backup.merged', { n: added[STORAGE_KEYS.sessions] ?? 0 })
              : t('backup.replaced', { n: pending.summary.sessions }),
        });
      } catch (e) {
        setBackupNote({ tone: 'warn', text: t('backup.failed', { reason: e?.message || String(e) }) });
      } finally {
        setBusy(false);
      }
    },
    [preview, reloadSettings, reloadSessions, reloadChallenges, t],
  );

  const confirmReplace = () => {
    confirm({
      title: t('backup.replaceTitle'),
      message: t('backup.replaceBody'),
      confirmText: t('backup.replace'),
      cancelText: t('common.cancel'),
      destructive: true,
      onConfirm: () => restore('replace'),
    });
  };

  // --- feedback -----------------------------------------------------------------
  const [errorCount, setErrorCount] = useState(0);
  useEffect(() => {
    loadErrors().then((errors) => setErrorCount(errors.length));
  }, []);

  const sendFeedback = useCallback(async () => {
    const errors = await loadErrors();
    setErrorCount(errors.length);
    shareText(
      formatReport({ intro: t('feedback.intro'), app: appInfo(), device: deviceInfo(), errors, language }),
    );
  }, [t, language]);

  // --- challenge name -------------------------------------------------------------
  const [nameDraft, setNameDraft] = useState(settings.challengeName ?? '');
  useEffect(() => {
    setNameDraft(settings.challengeName ?? '');
  }, [settings.challengeName]);
  const saveName = () => {
    const name = cleanName(nameDraft);
    setNameDraft(name);
    if (name !== settings.challengeName) updateSettings({ challengeName: name });
  };

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
        await resetBlocker();
        resetSettings();
        await reloadChallenges();
        setErrorCount(0);
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
            label={t('settings.dailyGoal')}
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
        <Row title={t('settings.coachVoice')} body={t('settings.coachVoiceBody')}>
          <Toggle
            value={settings.coachVoiceEnabled !== false}
            onChange={(coachVoiceEnabled) => updateSettings({ coachVoiceEnabled })}
            label={t('settings.coachVoice')}
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
            {reminderDenied ? (
              <Pressable
                onPress={() => Linking.openSettings().catch(() => {})}
                hitSlop={8}
                accessibilityRole="button"
                style={styles.inlineLink}
              >
                <Text style={styles.inlineLinkText}>{t('settings.openAppSettings')}</Text>
              </Pressable>
            ) : null}
            {settings.reminderEnabled ? (
              <Row title={t('settings.reminderTime')} stacked>
                <View style={styles.clockRow}>
                  <Stepper
                    value={formatClock(settings.reminderHour, 0).slice(0, 2)}
                    onDown={() => shiftHour(-1)}
                    onUp={() => shiftHour(1)}
                    label={t('settings.hour')}
                  />
                  <Text style={styles.clockColon}>:</Text>
                  <Stepper
                    value={formatClock(0, settings.reminderMinute).slice(3)}
                    onDown={() => shiftMinute(-15)}
                    onUp={() => shiftMinute(15)}
                    label={t('settings.minute')}
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
        <Row title={t('challenge.nameSetting')} body={t('challenge.nameNote')} stacked>
          <TextInput
            value={nameDraft}
            onChangeText={setNameDraft}
            onBlur={saveName}
            onSubmitEditing={saveName}
            maxLength={24}
            placeholder={t('challenge.namePlaceholder')}
            placeholderTextColor={colors.textFaint}
            style={styles.input}
            accessibilityLabel={t('challenge.nameSetting')}
            returnKeyType="done"
          />
        </Row>
        <LinkRow title={t('settings.howItWorks')} onPress={onShowOnboarding} />
      </Section>

      <Section label={t('backup.section')}>
        <LinkRow title={t('backup.export')} body={t('backup.exportBody')} onPress={busy ? undefined : exportBackup} />
        <LinkRow title={t('backup.import')} body={t('backup.importBody')} onPress={busy ? undefined : importBackup} />
        {backupNote ? (
          <Text style={[styles.backupNote, backupNote.tone === 'warn' && styles.backupNoteWarn]}>{backupNote.text}</Text>
        ) : null}
      </Section>

      <Section label={t('settings.data')}>
        <Text style={styles.privacyNote}>{t('settings.privacyNote')}</Text>
        <LinkRow title={t('settings.clearAll')} body={t('settings.clearAllBody')} onPress={confirmClear} danger />
      </Section>

      <Section label={t('settings.about')}>
        <LinkRow
          title={t('feedback.title')}
          body={t('feedback.body', { n: errorCount })}
          onPress={sendFeedback}
        />
        <LinkRow title={t('settings.privacy')} onPress={() => Linking.openURL(PRIVACY_URL)} />
        <LinkRow title={t('settings.sourceCode')} onPress={() => Linking.openURL(SOURCE_URL)} />
        <Text style={styles.version}>
          {t('settings.version', { version })}
          {Platform.OS !== 'web' ? ` · ${Platform.OS}` : ''}
        </Text>
      </Section>

      <BackupPreview
        preview={preview}
        onMerge={() => restore('merge')}
        onReplace={confirmReplace}
        onCancel={() => setPreview(null)}
      />
    </ScrollView>
  );
}

/** What a picked backup holds, and the choice of what to do with it. */
function BackupPreview({ preview, onMerge, onReplace, onCancel }) {
  const { t } = useI18n();
  if (!preview) return null;
  const s = preview.summary;
  const date = (ms) => (Number.isFinite(ms) ? new Date(ms).toLocaleDateString() : '—');
  const exported = s.exportedAt ? new Date(s.exportedAt) : null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>{t('backup.previewTitle')}</Text>
          <Text style={styles.sheetFile} numberOfLines={1}>{preview.fileName}</Text>
          <Text style={styles.sheetLine}>{t('backup.previewSessions', { n: s.sessions })}</Text>
          {s.sessions ? (
            <Text style={styles.sheetLine}>
              {t('backup.previewRange', { from: date(s.firstAt), to: date(s.lastAt) })}
            </Text>
          ) : null}
          <Text style={styles.sheetLine}>{t('backup.previewStreak', { n: s.streak })}</Text>
          {exported && !Number.isNaN(exported.getTime()) ? (
            <Text style={styles.sheetLine}>{t('backup.previewExported', { date: exported.toLocaleString() })}</Text>
          ) : null}
          {preview.dropped ? (
            <Text style={[styles.sheetLine, styles.backupNoteWarn]}>{t('backup.previewDropped', { n: preview.dropped })}</Text>
          ) : null}
          <Text style={styles.sheetHint}>{t('backup.previewHint')}</Text>
          <Button label={t('backup.merge')} onPress={onMerge} style={styles.sheetButton} />
          <Button label={t('backup.replace')} variant="danger" onPress={onReplace} style={styles.sheetButtonSmall} />
          <Button label={t('common.cancel')} variant="secondary" onPress={onCancel} style={styles.sheetButtonSmall} />
        </View>
      </View>
    </Modal>
  );
}

function Stepper({ value, onDown, onUp, label, downDisabled, upDisabled }) {
  const { t } = useI18n();
  return (
    <View style={styles.stepper}>
      <Pressable
        onPress={onDown}
        disabled={downDisabled}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${t('settings.less')}, ${value}`}
        style={({ pressed }) => [styles.stepBtn, (pressed || downDisabled) && styles.pressed]}
      >
        <Text style={styles.stepGlyph}>−</Text>
      </Pressable>
      <Text style={styles.stepValue}>{value}</Text>
      <Pressable
        onPress={onUp}
        disabled={upDisabled}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${t('settings.more')}, ${value}`}
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
  input: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    color: colors.text,
    fontSize: 15,
  },
  backupNote: { fontSize: 13, color: colors.accent, paddingVertical: spacing.md, lineHeight: 18 },
  backupNoteWarn: { color: colors.warn },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: spacing.lg },
  sheet: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  sheetTitle: { ...type.title, fontSize: 19, color: colors.text },
  sheetFile: { fontSize: 12, color: colors.textFaint, marginTop: 2, marginBottom: spacing.sm },
  sheetLine: { ...type.body, color: colors.text, marginTop: spacing.xs },
  sheetHint: { fontSize: 13, color: colors.textDim, marginTop: spacing.md, lineHeight: 19 },
  sheetButton: { marginTop: spacing.lg },
  sheetButtonSmall: { marginTop: spacing.sm },

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
  inlineLink: { alignSelf: 'flex-start', paddingHorizontal: spacing.md, paddingBottom: spacing.md },
  inlineLinkText: { fontSize: 14, fontWeight: '600', color: colors.accent },
});
