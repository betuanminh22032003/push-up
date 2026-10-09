import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  RATE_OPTIONS,
  alertKind,
  blockingMode,
  effectiveSites,
  formatAmount,
  formatPerRep,
  searchKey,
  statusKey,
  watcherReady,
} from '../blocker/blockerLogic';
import { AppIcon } from '../components/AppIcon';
import { AppPickerModal } from '../components/AppPickerModal';
import { Button } from '../components/Button';
import { Chips, Row, Section, Toggle } from '../components/SettingsRows';
import { CLASSIC_EXERCISE_IDS, getExercise } from '../exercises/exercises';
import { useT } from '../i18n/I18nContext';
import { requestNotificationPermission } from '../notifications/reminders';
import { useBlocker } from '../state/BlockerContext';
import { useSettings } from '../state/SettingsContext';
import { colors, font, radius, spacing, type } from '../theme/theme';
import { formatDuration } from '../utils/time';

/** The hold the rate note uses as its example. */
const PLANK = getExercise('plank');

const KEEP_STEPS = ['blocker.keep1', 'blocker.keep2', 'blocker.keep3', 'blocker.keep4'];

/** "3 apps and 4 sites" — whatever is being blocked. */
function blockingPhrase(state, t) {
  const parts = [];
  const apps = state.blocked.length;
  const sites = state.sites.length;
  if (apps) parts.push(apps === 1 ? t('blocker.appOne') : t('blocker.appMany', { n: apps }));
  if (sites) parts.push(sites === 1 ? t('blocker.siteOne') : t('blocker.siteMany', { n: sites }));
  return parts.join(` ${t('blocker.and')} `);
}

const CALM_STATUS = ['blocker.statusOff', 'blocker.statusOn', 'blocker.statusOnApps', 'blocker.statusStarting'];

/** One line on what the blocker is doing right now, most urgent gap first. */
function statusLine(state, stalled, t) {
  const key = statusKey(state, stalled);
  // Without Accessibility only apps are blocked, so only they are named.
  const apps = blockingPhrase(key === 'blocker.statusOnApps' ? { ...state, sites: [] } : state, t);
  return { text: t(key, { apps }), warn: !CALM_STATUS.includes(key) };
}

/** The warning card's copy and buttons for each kind of stop (see alertKind). */
const ALERTS = {
  watcher: { body: ['blocker.alertWatcher'], fix: 'battery' },
  stalled: { body: ['blocker.alertStalled', 'blocker.alertPrevent'], fix: 'accessibility' },
  switchedOff: { body: ['blocker.alertSwitchedOff'], fix: 'turnOn' },
};

/** Which disclosure each permission is asked with. */
const DISCLOSURES = {
  accessibility: {
    title: 'blocker.disclosureTitle',
    body: 'blocker.disclosureBody',
    bullets: ['blocker.disclosure1', 'blocker.disclosure2', 'blocker.disclosure3'],
    steps: 'blocker.disclosureSteps',
  },
  usage: {
    title: 'blocker.usageDisclosureTitle',
    body: 'blocker.usageDisclosureBody',
    bullets: ['blocker.usageDisclosure1', 'blocker.usageDisclosure2', 'blocker.usageDisclosure3'],
    steps: 'blocker.usageDisclosureSteps',
  },
};

/**
 * The app blocker: the fun time banked, the apps and sites it guards, the
 * system permissions it runs on, and what keeps it from being stopped behind
 * the user's back. Two ways to block: usage access plus "display over other
 * apps" (apps only, and banking apps keep working), or Accessibility (websites
 * too, but many banking apps refuse to open next to it). Reps turn into time
 * on the workout screen; this screen is where it is all set up.
 */
export function BlockerScreen({ onGoWorkout }) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const { updateSettings } = useSettings();
  const {
    available,
    unavailableReason,
    loaded,
    state,
    rate,
    customSites,
    serviceStalled,
    apps,
    appsLoading,
    loadApps,
    setEnabled,
    setShowTimer,
    setBlockedApps,
    addSite,
    removeSite,
    switchOffAccessibility,
    openAccessibilitySettings,
    openUsageAccessSettings,
    openOverlaySettings,
    openDeveloperSettings,
    openAppSettings,
    openBatterySettings,
    openAutostartSettings,
  } = useBlocker();
  const [pickerOpen, setPickerOpen] = useState(false);
  // The permission waiting behind its disclosure: 'accessibility', 'usage' or 'overlay'.
  const [asking, setAsking] = useState(null);
  const [siteDraft, setSiteDraft] = useState('');
  const [siteError, setSiteError] = useState(false);

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

  // The blocked apps' own sites, shown apart from the ones the user added.
  const appSites = useMemo(() => effectiveSites(state.blocked, []), [state.blocked]);
  const extraSites = customSites.filter((d) => !appSites.includes(d));

  const openPicker = () => {
    setPickerOpen(true);
    if (apps === null && !appsLoading) loadApps();
  };

  const savePicker = (packages) => {
    setBlockedApps(packages);
    setPickerOpen(false);
  };

  const unblock = (pkg) => setBlockedApps(state.blocked.filter((p) => p !== pkg));

  const submitSite = () => {
    if (!siteDraft.trim()) return;
    if (addSite(siteDraft)) {
      setSiteDraft('');
      setSiteError(false);
    } else {
      setSiteError(true);
    }
  };

  const openers = {
    accessibility: openAccessibilitySettings,
    usage: openUsageAccessSettings,
    overlay: openOverlaySettings,
  };

  /** Settings for one permission, behind its disclosure. One covers both usage-way permissions. */
  const ask = (permission) => {
    if (permission !== 'accessibility' && (state.usageAccess || state.overlayAllowed)) {
      openers[permission]();
    } else {
      setAsking(permission);
    }
  };

  const agreeAndOpen = async () => {
    const permission = asking;
    setAsking(null);
    // The watcher runs as a foreground service whose notification says
    // blocking is on; Android 13+ hides it unless notifications are allowed.
    if (permission !== 'accessibility') await requestNotificationPermission();
    openers[permission]?.();
  };

  const status = statusLine(state, serviceStalled, t);
  const alert = ALERTS[alertKind(state, serviceStalled)];
  const mode = blockingMode(state);
  const ready = watcherReady(state);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md }]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
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
      ) : !loaded ? (
        <ActivityIndicator color={colors.accent} style={styles.loading} />
      ) : (
        <>
          {alert ? (
            <View style={styles.alert}>
              <Text style={styles.alertTitle}>{t('blocker.alertTitle')}</Text>
              {alert.body.map((key) => (
                <Text key={key} style={styles.alertBody}>
                  {t(key)}
                </Text>
              ))}
              {alert.fix === 'turnOn' ? (
                <Text style={styles.alertBody}>{t(ready ? 'blocker.alertPrevent' : 'blocker.alertOrUsage')}</Text>
              ) : null}
              <View style={styles.alertButtons}>
                {alert.fix === 'battery' ? (
                  <SmallButton label={t('blocker.keepBattery')} onPress={openBatterySettings} />
                ) : alert.fix === 'turnOn' ? (
                  <>
                    {/* Often switched off for a banking app: offer the way that app accepts first. */}
                    {ready ? null : (
                      <SmallButton
                        label={t('blocker.alertUseUsage')}
                        onPress={() => ask(state.usageAccess ? 'overlay' : 'usage')}
                      />
                    )}
                    <SmallButton label={t('blocker.alertTurnOn')} onPress={() => ask('accessibility')} secondary={!ready} />
                  </>
                ) : (
                  <SmallButton label={t('blocker.alertOpen')} onPress={openAccessibilitySettings} />
                )}
                <SmallButton label={t('blocker.keepAutostart')} onPress={openAutostartSettings} secondary />
              </View>
            </View>
          ) : null}

          <Section label={t('blocker.sectionBlocking')}>
            <Row title={t('blocker.toggle')}>
              <Toggle value={state.enabled} onChange={setEnabled} label={t('blocker.toggle')} />
            </Row>
            <Text style={styles.sectionNote}>{t('blocker.waysNote')}</Text>
            <Permission
              title={t('blocker.usage')}
              body={t(state.usageAccess ? 'blocker.usageOn' : 'blocker.usageOff')}
              granted={state.usageAccess}
              warn={!mode}
              onGrant={() => ask('usage')}
            />
            <Permission
              title={t('blocker.overlay')}
              body={t(state.overlayAllowed ? 'blocker.overlayOn' : 'blocker.overlayOff')}
              granted={state.overlayAllowed}
              warn={!mode}
              onGrant={() => ask('overlay')}
            />
            <Row
              title={t('blocker.permission')}
              body={t(
                !state.serviceEnabled
                  ? 'blocker.permissionOff'
                  : ready
                    ? 'blocker.permissionOn'
                    : 'blocker.permissionOnOnly',
              )}
            >
              {!state.serviceEnabled ? (
                <SmallButton
                  label={t('blocker.permissionButton')}
                  onPress={() => ask('accessibility')}
                  secondary
                />
              ) : ready ? (
                // Banking apps refuse to open while it is on; the other way keeps apps blocked.
                <SmallButton label={t('blocker.permissionSwitchOff')} onPress={switchOffAccessibility} secondary />
              ) : (
                <SmallButton label={t('blocker.permissionManage')} onPress={openAccessibilitySettings} secondary />
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
            {/* The next thing a banking app objects to, and nothing this app can switch off. */}
            {state.developerOptions ? (
              <Row title={t('blocker.devOptions')} body={t('blocker.devOptionsOn')} bodyWarn>
                <SmallButton label={t('blocker.devOptionsButton')} onPress={openDeveloperSettings} secondary />
              </Row>
            ) : null}
            {state.batteryOptimized ? (
              <Row title={t('blocker.battery')} body={t('blocker.batteryOn')} bodyWarn>
                <SmallButton label={t('blocker.batteryButton')} onPress={openBatterySettings} />
              </Row>
            ) : null}
          </Section>

          <Section label={t('blocker.sectionApps', { n: state.blocked.length })}>
            {blockedApps.length === 0 ? (
              <Text style={styles.empty}>{t('blocker.noApps')}</Text>
            ) : (
              blockedApps.map((app) => (
                <View key={app.packageName} style={styles.itemRow}>
                  <AppIcon app={app} size={32} />
                  <Text style={styles.itemLabel} numberOfLines={1}>
                    {app.label}
                  </Text>
                  <RemoveButton
                    label={t('blocker.remove', { app: app.label })}
                    onPress={() => unblock(app.packageName)}
                  />
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

          <Section label={t('blocker.sectionSites', { n: state.sites.length })}>
            <Text style={styles.sectionNote}>{t('blocker.sitesBody')}</Text>
            {mode === 'accessibility' ? null : (
              <Text style={[styles.sectionNote, styles.noteWarn]}>{t('blocker.sitesNeedA11y')}</Text>
            )}
            {appSites.map((domain) => (
              <View key={domain} style={styles.itemRow}>
                <Text style={styles.itemLabel} numberOfLines={1}>
                  {domain}
                </Text>
                <Text style={styles.autoTag}>{t('blocker.siteAuto')}</Text>
              </View>
            ))}
            {extraSites.map((domain) => (
              <View key={domain} style={styles.itemRow}>
                <Text style={styles.itemLabel} numberOfLines={1}>
                  {domain}
                </Text>
                <RemoveButton label={t('blocker.removeSite', { site: domain })} onPress={() => removeSite(domain)} />
              </View>
            ))}
            <View style={styles.siteInputRow}>
              <TextInput
                value={siteDraft}
                onChangeText={(text) => {
                  setSiteDraft(text);
                  if (siteError) setSiteError(false);
                }}
                onSubmitEditing={submitSite}
                placeholder={t('blocker.sitePlaceholder')}
                placeholderTextColor={colors.textFaint}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                returnKeyType="done"
                style={styles.siteInput}
              />
              <SmallButton label={t('blocker.siteAdd')} onPress={submitSite} />
            </View>
            {siteError ? <Text style={styles.siteError}>{t('blocker.siteInvalid')}</Text> : null}
          </Section>

          <Section label={t('blocker.sectionRate')}>
            <Row title={t('blocker.rate')} stacked>
              <Chips
                options={RATE_OPTIONS.map((s) => ({ id: s, label: formatAmount(s, t) }))}
                selected={rate}
                onSelect={(blockerSecondsPerRep) => updateSettings({ blockerSecondsPerRep })}
              />
              {/*
                The rate is per push-up; lighter exercises earn a share of it.
                The four classics stand for the rest: forty would bury the note.
              */}
              <Text style={styles.sectionNote}>
                {t('blocker.ratePerExercise', {
                  list: CLASSIC_EXERCISE_IDS.map(getExercise).map(
                    (e) =>
                      `${e.icon} ${t(`exercise.${e.id}`)} ${formatPerRep(rate * e.creditWeight, t)}`,
                  ).join(' · '),
                })}
                {/* Holds are paid by the second, which the list above cannot show. */}
                {` ${t('blocker.ratePerHold', {
                  name: `${PLANK.icon} ${t(`exercise.${PLANK.id}`)}`,
                  amount: formatPerRep(rate * PLANK.creditWeight, t),
                })}`}
              </Text>
            </Row>
            <Row title={t('blocker.timer')} body={t('blocker.timerBody')}>
              <Toggle value={state.showTimer} onChange={setShowTimer} label={t('blocker.timer')} />
            </Row>
          </Section>

          <Section label={t('blocker.keepTitle')}>
            <Text style={styles.sectionNote}>{t('blocker.keepBody')}</Text>
            {KEEP_STEPS.map((key, i) => (
              <View key={key} style={styles.step}>
                <Text style={styles.stepNumber}>{i + 1}</Text>
                <Text style={styles.stepText}>{t(key)}</Text>
              </View>
            ))}
            <View style={styles.keepButtons}>
              <SmallButton label={t('blocker.keepAutostart')} onPress={openAutostartSettings} secondary />
              <SmallButton label={t('blocker.keepBattery')} onPress={openBatterySettings} secondary />
              <SmallButton label={t('blocker.keepAppInfo')} onPress={openAppSettings} secondary />
            </View>
          </Section>
        </>
      )}

      <Section label={t('blocker.howTitle')}>
        <Text style={styles.paragraph}>{t('blocker.howBody')}</Text>
        <Text style={styles.paragraph}>{t('blocker.privacy')}</Text>
      </Section>

      <Disclosure
        copy={DISCLOSURES[asking === 'accessibility' ? 'accessibility' : 'usage']}
        visible={asking !== null}
        onAgree={agreeAndOpen}
        onClose={() => setAsking(null)}
      />
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

function SmallButton({ label, onPress, secondary, style }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.smallButton,
        secondary && styles.smallButtonSecondary,
        pressed && styles.pressed,
        style,
      ]}
    >
      <Text style={[styles.smallButtonText, secondary && styles.smallButtonTextSecondary]}>{label}</Text>
    </Pressable>
  );
}

/** One system permission: what it is for, and a tick or the button that asks for it. */
function Permission({ title, body, granted, warn, onGrant }) {
  const t = useT();
  return (
    <Row title={title} body={body} bodyWarn={warn && !granted}>
      {granted ? (
        <Text style={styles.okMark}>✓</Text>
      ) : (
        <SmallButton label={t('blocker.permissionButton')} onPress={onGrant} />
      )}
    </Row>
  );
}

function RemoveButton({ label, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.remove, pressed && styles.pressed]}
    >
      <Text style={styles.removeText}>✕</Text>
    </Pressable>
  );
}

/**
 * Google Play requires this before an app sends anyone to switch on its
 * accessibility service, and it is shown the same way for usage access: what
 * the permission lets the app see, what it does with it, and an explicit yes.
 * Declining leaves everything as it was.
 */
function Disclosure({ copy, visible, onAgree, onClose }) {
  const t = useT();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={styles.dialog}>
          <ScrollView contentContainerStyle={styles.dialogContent} showsVerticalScrollIndicator={false}>
            <Text style={styles.dialogTitle}>{t(copy.title)}</Text>
            <Text style={styles.dialogBody}>{t(copy.body)}</Text>
            {copy.bullets.map((key) => (
              <View key={key} style={styles.bullet}>
                <Text style={styles.bulletDot}>•</Text>
                <Text style={styles.bulletText}>{t(key)}</Text>
              </View>
            ))}
            <Text style={styles.dialogSteps}>{t(copy.steps)}</Text>
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
    backgroundColor: colors.surface,
  },
  balanceLabel: { ...type.label, fontSize: 13, color: colors.accent },
  balanceValue: {
    fontSize: 64,
    ...font('300'),
    letterSpacing: -2,
    color: colors.text,
    marginTop: spacing.xs,
    fontVariant: ['tabular-nums'],
  },
  status: { ...font('400'), fontSize: 13, color: colors.textDim, textAlign: 'center' },
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

  alert: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.danger,
    backgroundColor: colors.surface,
  },
  alertTitle: { fontSize: 16, ...font('700'), color: colors.danger },
  alertBody: { ...type.body, color: colors.text, marginTop: spacing.xs, lineHeight: 21 },
  alertButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  loading: { marginTop: spacing.xl },

  okMark: { fontSize: 20, ...font('700'), color: colors.accent },
  hintRow: { paddingVertical: spacing.md, gap: spacing.sm },
  hint: { ...font('400'), fontSize: 13, color: colors.textDim, lineHeight: 18 },
  link: { fontSize: 13, ...font('600'), color: colors.accent },

  smallButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  smallButtonSecondary: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  smallButtonText: { fontSize: 14, ...font('700'), color: colors.bg },
  smallButtonTextSecondary: { color: colors.text },

  empty: { ...font('400'), fontSize: 14, color: colors.textDim, paddingVertical: spacing.md },
  sectionNote: { ...font('400'), fontSize: 13, color: colors.textDim, lineHeight: 18, paddingTop: spacing.md },
  noteWarn: { color: colors.warn },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 46,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  itemLabel: { ...font('400'), flex: 1, fontSize: 15, color: colors.text },
  autoTag: { ...font('400'), fontSize: 12, color: colors.textFaint },
  remove: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  removeText: { ...font('400'), fontSize: 13, color: colors.textDim },
  addRow: { paddingVertical: spacing.md },
  addText: { fontSize: 15, ...font('600'), color: colors.accent },

  siteInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  siteInput: {
    ...font('400'),
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    color: colors.text,
    fontSize: 15,
  },
  siteError: { ...font('400'), fontSize: 13, color: colors.warn, paddingBottom: spacing.md },

  step: { flexDirection: 'row', gap: spacing.sm, paddingTop: spacing.sm },
  stepNumber: {
    width: 20,
    height: 20,
    borderRadius: 10,
    overflow: 'hidden',
    textAlign: 'center',
    fontSize: 12,
    ...font('700'),
    lineHeight: 20,
    color: colors.bg,
    backgroundColor: colors.accent,
  },
  stepText: { ...font('400'), flex: 1, fontSize: 14, color: colors.text, lineHeight: 20 },
  keepButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingVertical: spacing.md },

  paragraph: { ...font('400'), fontSize: 14, color: colors.textDim, lineHeight: 20, paddingVertical: spacing.sm },

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
