import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RATE_OPTIONS, formatAmount, searchKey } from '../blocker/blockerLogic';
import { AppIcon } from '../components/AppIcon';
import { AppPickerModal } from '../components/AppPickerModal';
import { Button } from '../components/Button';
import { Chips, Row, Section, Toggle } from '../components/SettingsRows';
import { useT } from '../i18n/I18nContext';
import { useBlocker } from '../state/BlockerContext';
import { useSettings } from '../state/SettingsContext';
import { colors, radius, spacing, type } from '../theme/theme';
import { formatDuration } from '../utils/time';

/** One line on what the blocker is doing right now, most urgent gap first. */
function statusLine(state, t) {
  if (!state.enabled) return { text: t('blocker.statusOff'), warn: false };
  if (state.blocked.length === 0) return { text: t('blocker.statusNoApps'), warn: true };
  if (!state.serviceEnabled) return { text: t('blocker.statusNoService'), warn: true };
  if (!state.serviceRunning) return { text: t('blocker.statusStarting'), warn: false };
  const n = state.blocked.length;
  return {
    text: t('blocker.statusOn', { apps: n === 1 ? t('blocker.appOne') : t('blocker.appMany', { n }) }),
    warn: false,
  };
}

/**
 * The app blocker: the fun time banked, the apps it guards, and the one
 * system permission it needs. Reps turn into time on the workout screen; this
 * screen is where it is all set up.
 */
export function BlockerScreen({ onGoWorkout }) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const { updateSettings } = useSettings();
  const {
    available,
    unavailableReason,
    state,
    rate,
    apps,
    appsLoading,
    loadApps,
    setEnabled,
    setShowTimer,
    setBlockedApps,
    openAccessibilitySettings,
    openAppSettings,
  } = useBlocker();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [disclosureOpen, setDisclosureOpen] = useState(false);

  // Names and icons for the blocked list come from the installed-app list.
  useEffect(() => {
    if (available && state.blocked.length > 0 && apps === null && !appsLoading) loadApps();
  }, [available, state.blocked.length, apps, appsLoading, loadApps]);

  const blockedApps = useMemo(() => {
    const byPackage = new Map((apps ?? []).map((app) => [app.packageName, app]));
    return state.blocked
      .map((pkg) => byPackage.get(pkg) ?? { packageName: pkg, label: pkg, icon: null })
      .sort((a, b) => searchKey(a.label).localeCompare(searchKey(b.label)));
  }, [apps, state.blocked]);

  const openPicker = () => {
    setPickerOpen(true);
    if (apps === null && !appsLoading) loadApps();
  };

  const savePicker = (packages) => {
    setBlockedApps(packages);
    setPickerOpen(false);
  };

  const unblock = (pkg) => setBlockedApps(state.blocked.filter((p) => p !== pkg));

  const agreeAndOpen = () => {
    setDisclosureOpen(false);
    openAccessibilitySettings();
  };

  const status = statusLine(state, t);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md }]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>{t('blocker.title')}</Text>
      <Text style={styles.subtitle}>{t('blocker.subtitle', { rate: formatAmount(rate, t) })}</Text>

      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>{t('blocker.balance')}</Text>
        <Text style={styles.balanceValue} allowFontScaling={false}>
          {formatDuration(state.balanceSeconds)}
        </Text>
        {available ? (
          <Text style={[styles.status, status.warn && styles.statusWarn]}>{status.text}</Text>
        ) : null}
        <Button label={t('blocker.earn')} onPress={onGoWorkout} style={styles.earnButton} />
      </View>

      {!available ? (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>{t(unavailableReason)}</Text>
        </View>
      ) : (
        <>
          <Section label={t('blocker.sectionBlocking')}>
            <Row title={t('blocker.toggle')}>
              <Toggle value={state.enabled} onChange={setEnabled} label={t('blocker.toggle')} />
            </Row>
            <Row
              title={t('blocker.permission')}
              body={state.serviceEnabled ? t('blocker.permissionOn') : t('blocker.permissionOff')}
              bodyWarn={!state.serviceEnabled}
            >
              {state.serviceEnabled ? (
                <Text style={styles.okMark}>✓</Text>
              ) : (
                <SmallButton label={t('blocker.permissionButton')} onPress={() => setDisclosureOpen(true)} />
              )}
            </Row>
            {state.serviceEnabled ? null : (
              <View style={styles.hintRow}>
                <Text style={styles.hint}>{t('blocker.restrictedHint')}</Text>
                <Pressable onPress={openAppSettings} hitSlop={8} accessibilityRole="button">
                  <Text style={styles.link}>{t('blocker.openAppInfo')}</Text>
                </Pressable>
              </View>
            )}
          </Section>

          <Section label={t('blocker.sectionApps', { n: state.blocked.length })}>
            {blockedApps.length === 0 ? (
              <Text style={styles.empty}>{t('blocker.noApps')}</Text>
            ) : (
              blockedApps.map((app) => (
                <View key={app.packageName} style={styles.appRow}>
                  <AppIcon app={app} size={32} />
                  <Text style={styles.appLabel} numberOfLines={1}>
                    {app.label}
                  </Text>
                  <Pressable
                    onPress={() => unblock(app.packageName)}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={t('blocker.remove', { app: app.label })}
                    style={({ pressed }) => [styles.remove, pressed && styles.pressed]}
                  >
                    <Text style={styles.removeText}>✕</Text>
                  </Pressable>
                </View>
              ))
            )}
            <Pressable
              onPress={openPicker}
              accessibilityRole="button"
              style={({ pressed }) => [styles.addRow, pressed && styles.pressed]}
            >
              <Text style={styles.addText}>
                {blockedApps.length === 0 ? `+ ${t('blocker.addApps')}` : t('blocker.editApps')}
              </Text>
            </Pressable>
          </Section>

          <Section label={t('blocker.sectionRate')}>
            <Row title={t('blocker.rate')} stacked>
              <Chips
                options={RATE_OPTIONS.map((s) => ({ id: s, label: formatAmount(s, t) }))}
                selected={rate}
                onSelect={(blockerSecondsPerRep) => updateSettings({ blockerSecondsPerRep })}
              />
            </Row>
            <Row title={t('blocker.timer')} body={t('blocker.timerBody')}>
              <Toggle value={state.showTimer} onChange={setShowTimer} label={t('blocker.timer')} />
            </Row>
          </Section>
        </>
      )}

      <Section label={t('blocker.howTitle')}>
        <Text style={styles.paragraph}>{t('blocker.howBody')}</Text>
        <Text style={styles.paragraph}>{t('blocker.privacy')}</Text>
      </Section>

      <Disclosure visible={disclosureOpen} onAgree={agreeAndOpen} onClose={() => setDisclosureOpen(false)} />
      <AppPickerModal
        visible={pickerOpen}
        apps={apps}
        loading={appsLoading}
        selected={state.blocked}
        onSave={savePicker}
        onClose={() => setPickerOpen(false)}
      />
    </ScrollView>
  );
}

function SmallButton({ label, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.smallButton, pressed && styles.pressed]}
    >
      <Text style={styles.smallButtonText}>{label}</Text>
    </Pressable>
  );
}

/**
 * Google Play requires this before an app sends anyone to switch on its
 * accessibility service: what the service can see, what it does with it, and
 * an explicit yes. Declining leaves everything as it was.
 */
function Disclosure({ visible, onAgree, onClose }) {
  const t = useT();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={styles.dialog}>
          <ScrollView contentContainerStyle={styles.dialogContent} showsVerticalScrollIndicator={false}>
            <Text style={styles.dialogTitle}>{t('blocker.disclosureTitle')}</Text>
            <Text style={styles.dialogBody}>{t('blocker.disclosureBody')}</Text>
            {['blocker.disclosure1', 'blocker.disclosure2', 'blocker.disclosure3'].map((key) => (
              <View key={key} style={styles.bullet}>
                <Text style={styles.bulletDot}>•</Text>
                <Text style={styles.bulletText}>{t(key)}</Text>
              </View>
            ))}
            <Text style={styles.dialogSteps}>{t('blocker.disclosureSteps')}</Text>
          </ScrollView>
          <Button label={t('blocker.disclosureAgree')} onPress={onAgree} />
          <Button
            label={t('blocker.disclosureLater')}
            variant="secondary"
            onPress={onClose}
            style={styles.dialogSecond}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  pressed: { opacity: 0.5 },
  title: { ...type.title, color: colors.text },
  subtitle: { ...type.body, color: colors.textDim, marginTop: spacing.xs, lineHeight: 21 },

  balanceCard: {
    marginTop: spacing.lg,
    alignItems: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.accentDim,
    backgroundColor: colors.surface,
  },
  balanceLabel: { ...type.label, color: colors.accent, textTransform: 'uppercase' },
  balanceValue: {
    fontSize: 64,
    fontWeight: '200',
    letterSpacing: -2,
    color: colors.text,
    marginTop: spacing.xs,
    fontVariant: ['tabular-nums'],
  },
  status: { fontSize: 13, color: colors.textDim, textAlign: 'center' },
  statusWarn: { color: colors.warn },
  earnButton: { alignSelf: 'stretch', marginTop: spacing.lg },

  notice: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.warn,
    backgroundColor: colors.surface,
  },
  noticeText: { ...type.body, color: colors.text, lineHeight: 21 },

  okMark: { fontSize: 20, fontWeight: '700', color: colors.accent },
  hintRow: { paddingVertical: spacing.md, gap: spacing.sm },
  hint: { fontSize: 13, color: colors.textDim, lineHeight: 18 },
  link: { fontSize: 13, fontWeight: '600', color: colors.accent },

  smallButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  smallButtonText: { fontSize: 14, fontWeight: '700', color: colors.bg },

  empty: { fontSize: 14, color: colors.textDim, paddingVertical: spacing.md },
  appRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  appLabel: { flex: 1, fontSize: 15, color: colors.text },
  remove: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  removeText: { fontSize: 13, color: colors.textDim },
  addRow: { paddingVertical: spacing.md },
  addText: { fontSize: 15, fontWeight: '600', color: colors.accent },

  paragraph: { fontSize: 14, color: colors.textDim, lineHeight: 20, paddingVertical: spacing.sm },

  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  dialog: {
    maxHeight: '90%',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  dialogContent: { paddingBottom: spacing.md },
  dialogTitle: { ...type.title, color: colors.text },
  dialogBody: { ...type.body, color: colors.text, marginTop: spacing.md, lineHeight: 21 },
  bullet: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  bulletDot: { ...type.body, color: colors.accent, lineHeight: 21 },
  bulletText: { ...type.body, flex: 1, color: colors.textDim, lineHeight: 21 },
  dialogSteps: { ...type.body, color: colors.text, marginTop: spacing.md, lineHeight: 21 },
  dialogSecond: { marginTop: spacing.sm },
});
