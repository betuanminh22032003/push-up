import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getExercise } from '../exercises/exercises';
import { useT } from '../i18n/I18nContext';
import { colors, radius, spacing, type } from '../theme/theme';
import { ExerciseDemo3D } from './ExerciseDemo3D';

/**
 * "How to do it" for one exercise: the 3D mannequin doing it, the steps, and the
 * mistakes to avoid. Opened from the small button next to wherever an
 * exercise is chosen or named, because a name like "Fire hydrants" says
 * nothing about the movement.
 */
export function ExerciseGuideSheet({ visible, exerciseId, onClose }) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const [slow, setSlow] = useState(false);
  const exercise = getExercise(exerciseId);
  const hold = exercise.kind === 'hold';
  const stageW = Math.min(screenW, 560) - spacing.lg * 2;
  const stageH = Math.round(Math.min(stageW * 0.9, screenH * 0.4));
  const lines = (key) => t(key).split('\n').filter(Boolean);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.dismiss} onPress={onClose} accessibilityLabel={t('common.close')} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
          <View style={styles.header}>
            <Text style={styles.icon}>{exercise.icon}</Text>
            <View style={styles.grow}>
              <Text style={styles.kicker}>{t('guide.title')}</Text>
              <Text style={styles.title} numberOfLines={1}>
                {t(`exercise.${exercise.id}`)}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('common.close')}>
              <Text style={styles.close}>×</Text>
            </Pressable>
          </View>

          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            <View style={styles.stage}>
              {visible ? (
                <ExerciseDemo3D exerciseId={exercise.id} width={stageW} height={stageH} speed={slow ? 0.4 : 1} />
              ) : null}
              <View style={styles.stageBar}>
                <Text style={styles.dragHint}>↔ {t('guide.drag')}</Text>
                <Pressable
                  onPress={() => setSlow((s) => !s)}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: slow }}
                  aria-checked={slow}
                  hitSlop={8}
                  style={({ pressed }) => [styles.speed, slow && styles.speedOn, pressed && styles.pressed]}
                >
                  <Text style={[styles.speedText, slow && styles.speedTextOn]}>
                    {slow ? `🐢 ${t('guide.slow')}` : `▶ ${t('guide.normal')}`}
                  </Text>
                </Pressable>
              </View>
            </View>

            <Text style={styles.meta}>
              {[...exercise.parts.map((p) => t(`part.${p}`)), t(`view.${exercise.view}`)].join(' · ')}
            </Text>

            <Text style={styles.section}>{t('guide.steps')}</Text>
            {lines(`guide.${exercise.id}.steps`).map((step, i) => (
              <View key={i} style={styles.step}>
                <View style={styles.stepNum}>
                  <Text style={styles.stepNumText}>{i + 1}</Text>
                </View>
                <Text style={styles.stepText}>{step}</Text>
              </View>
            ))}
            <Text style={styles.breathe}>💨 {t(hold ? 'guide.breatheHold' : 'guide.breatheReps')}</Text>

            <Text style={styles.section}>{t('guide.mistakes')}</Text>
            {lines(`guide.${exercise.id}.mistakes`).map((m, i) => (
              <View key={i} style={styles.step}>
                <Text style={styles.cross}>✕</Text>
                <Text style={styles.stepText}>{m}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/**
 * A small "How to" button that opens the guide for `exerciseId`.
 * `compact` shows just the "?" for tight rows; `label` replaces the text.
 */
export function ExerciseGuideButton({ exerciseId, compact = false, label, style }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        hitSlop={compact ? 10 : 4}
        accessibilityRole="button"
        accessibilityLabel={t('guide.open', { name: t(`exercise.${getExercise(exerciseId).id}`) })}
        style={({ pressed }) => [compact ? styles.compact : styles.button, pressed && styles.pressed, style]}
      >
        <Text style={compact ? styles.compactText : styles.buttonText}>
          {compact ? '?' : label ?? `▶ ${t('guide.button')}`}
        </Text>
      </Pressable>
      <ExerciseGuideSheet visible={open} exerciseId={exerciseId} onClose={() => setOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  pressed: { opacity: 0.7 },

  button: {
    justifyContent: 'center',
    minHeight: 32,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.surface,
  },
  buttonText: { fontSize: 13, fontWeight: '700', color: colors.accent },
  compact: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.accent,
  },
  compactText: { fontSize: 14, fontWeight: '700', color: colors.accent },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  dismiss: { flex: 1 },
  sheet: {
    maxHeight: '92%',
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
  icon: { fontSize: 30 },
  kicker: { ...type.label, color: colors.accent },
  title: { ...type.title, color: colors.text },
  close: { fontSize: 30, lineHeight: 32, color: colors.textDim, paddingHorizontal: spacing.sm },
  scroll: { flexGrow: 0 },
  scrollContent: { paddingBottom: spacing.md },

  stage: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  stageBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  dragHint: { fontSize: 12, color: colors.textDim },
  speed: {
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  speedOn: { borderColor: colors.warn },
  speedText: { fontSize: 12, color: colors.textDim },
  speedTextOn: { color: colors.warn, fontWeight: '600' },

  meta: { fontSize: 12, color: colors.accent, marginTop: spacing.sm },
  section: { ...type.label, color: colors.textDim, marginTop: spacing.md, marginBottom: spacing.sm },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: spacing.sm },
  stepNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stepNumText: { fontSize: 12, fontWeight: '700', color: colors.text },
  stepText: { flex: 1, fontSize: 15, lineHeight: 21, color: colors.text },
  cross: { width: 22, textAlign: 'center', fontSize: 14, fontWeight: '700', color: colors.danger, marginTop: 2 },
  breathe: { fontSize: 13, color: colors.textDim, marginTop: spacing.xs },
});

/**
 * The guide while working out: a small 3D figure in a corner of the stage, to
 * copy the movement without leaving the set, or a pill that opens it. Counting
 * goes on underneath. "Details" asks the parent for the full sheet (which
 * pauses the set first, see WorkoutScreen).
 *
 * @param {string}   exerciseId
 * @param {boolean}  open        figure shown (true) or just the pill
 * @param {Function} onToggle    called with the new `open`
 * @param {Function} onDetails   open the full guide
 * @param {boolean}  [upNext]    label it as the next exercise (between sets)
 */
export function GuideDock({ exerciseId, open, onToggle, onDetails, upNext = false, style }) {
  const t = useT();
  const exercise = getExercise(exerciseId);
  const name = t(`exercise.${exercise.id}`);

  if (!open) {
    return (
      <Pressable
        onPress={() => onToggle(true)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={t('guide.open', { name })}
        style={({ pressed }) => [dockStyles.dockPill, pressed && styles.pressed, style]}
      >
        <Text style={dockStyles.dockPillText}>▶ {t('guide.button')}</Text>
      </Pressable>
    );
  }

  return (
    <View style={[dockStyles.dock, style]}>
      <View style={dockStyles.dockHead}>
        <Text style={dockStyles.dockName} numberOfLines={1}>
          {upNext ? `${t('guide.upNext')} · ` : ''}
          {exercise.icon} {name}
        </Text>
        <Pressable
          onPress={() => onToggle(false)}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t('guide.hide')}
        >
          <Text style={dockStyles.dockClose}>×</Text>
        </Pressable>
      </View>
      <ExerciseDemo3D exerciseId={exercise.id} width={DOCK_W} height={DOCK_H} lite />
      <Pressable
        onPress={onDetails}
        accessibilityRole="button"
        accessibilityLabel={t('guide.open', { name })}
        style={({ pressed }) => [dockStyles.dockDetails, pressed && styles.pressed]}
      >
        <Text style={dockStyles.dockDetailsText}>{t('guide.details')} ⤢</Text>
      </Pressable>
    </View>
  );
}

const DOCK_W = 148;
const DOCK_H = 150;

const dockStyles = StyleSheet.create({
  dockPill: {
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: 'rgba(10,10,11,0.75)',
  },
  dockPillText: { fontSize: 13, fontWeight: '700', color: colors.accent },
  dock: {
    width: DOCK_W,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  dockHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: spacing.sm,
    paddingRight: 6,
    paddingVertical: 4,
  },
  dockName: { flex: 1, fontSize: 11, fontWeight: '600', color: colors.text },
  dockClose: { fontSize: 20, lineHeight: 20, color: colors.textDim, paddingHorizontal: 2 },
  dockDetails: {
    alignItems: 'center',
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  dockDetailsText: { fontSize: 12, fontWeight: '600', color: colors.accent },
});
