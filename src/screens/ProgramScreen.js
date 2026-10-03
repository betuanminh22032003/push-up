import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../components/Button';
import { ProgressBar } from '../components/ProgressBar';
import { EXERCISES, getExercise } from '../exercises/exercises';
import { useT } from '../i18n/I18nContext';
import {
  DAYS_PER_WEEK,
  PROGRAM_DAYS,
  PROGRAM_WEEKS,
  isProgramComplete,
  nextDay,
  programFor,
  totalTargetReps,
} from '../program/program';
import { useSessions } from '../state/SessionsContext';
import { colors, radius, spacing, type } from '../theme/theme';
import { confirm } from '../utils/confirm';

/** The program's exercise: its levels and targets are push-up numbers. */
const PROGRAM_EXERCISE = EXERCISES.find((e) => e.program) ?? getExercise();

/**
 * The 6-week program: take the test, then a day list with the next workout
 * one tap away. Any day can be tapped, so a missed or failed day can be
 * redone without ceremony.
 *
 * @param {Function} onStartPlan  hand a plan (test or day) to the workout tab
 */
export function ProgramScreen({ onStartPlan }) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const { program, resetProgram } = useSessions();

  const days = useMemo(() => (program ? programFor(program.level) : []), [program]);
  const completed = program?.completedDays ?? {};
  const doneCount = Object.keys(completed).length;
  const upcoming = program ? nextDay(completed) : null;
  const finished = !!program && isProgramComplete(completed);

  /** Program days carry their kind so the workout screen can tell them from the test. */
  const startDay = (plan) => onStartPlan({ kind: 'day', ...plan });

  const confirmRestart = () => {
    confirm({
      title: t('confirm.restartTitle'),
      message: t('confirm.restartBody'),
      confirmText: t('confirm.restart'),
      cancelText: t('common.cancel'),
      destructive: true,
      onConfirm: resetProgram,
    });
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Whatever the workout tab is set to, the program and its test are push-ups. */}
      <Text style={styles.kicker}>
        {`${PROGRAM_EXERCISE.icon} ${t(`exercise.${PROGRAM_EXERCISE.id}`)}`}
      </Text>
      <Text style={styles.title}>{t('program.title')}</Text>
      <Text style={styles.intro}>{t('program.intro')}</Text>

      {!program ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('program.testTitle')}</Text>
          <Text style={styles.cardBody}>{t('program.testBody')}</Text>
          <Button
            label={t('program.takeTest')}
            onPress={() => onStartPlan({ kind: 'test' })}
            style={styles.cardButton}
          />
        </View>
      ) : (
        <>
          <View style={styles.card}>
            <View style={styles.cardRow}>
              <View style={styles.grow}>
                <Text style={styles.cardTitle}>{t('program.level', { level: program.level })}</Text>
                {program.testReps != null ? (
                  <Text style={styles.cardBody}>
                    {t('program.testResult', { reps: program.testReps })}
                  </Text>
                ) : null}
              </View>
              <Text style={styles.progressText}>
                {t('program.progress', { done: doneCount, total: PROGRAM_DAYS })}
              </Text>
            </View>
            <ProgressBar value={doneCount} max={PROGRAM_DAYS} style={styles.progressBar} />

            {finished ? (
              <>
                <Text style={styles.complete}>{t('program.complete')}</Text>
                <Text style={styles.cardBody}>{t('program.completeBody')}</Text>
                <Button
                  label={t('program.retest')}
                  onPress={() => onStartPlan({ kind: 'test' })}
                  style={styles.cardButton}
                />
              </>
            ) : (
              <Button
                label={t('btn.startDay', { day: upcoming })}
                onPress={() => startDay(days[upcoming - 1])}
                style={styles.cardButton}
              />
            )}
          </View>

          {Array.from({ length: PROGRAM_WEEKS }).map((_, w) => (
            <View key={w} style={styles.week}>
              <Text style={styles.weekLabel}>{t('program.week', { week: w + 1 })}</Text>
              {days.slice(w * DAYS_PER_WEEK, (w + 1) * DAYS_PER_WEEK).map((plan) => {
                const isDone = !!completed[plan.day];
                const isNext = plan.day === upcoming;
                return (
                  <Pressable
                    key={plan.day}
                    onPress={() => startDay(plan)}
                    accessibilityRole="button"
                    accessibilityLabel={t('program.day', { day: plan.day })}
                    style={({ pressed }) => [
                      styles.dayRow,
                      isNext && styles.dayRowNext,
                      pressed && styles.pressed,
                    ]}
                  >
                    <View style={[styles.dayBadge, isDone && styles.dayBadgeDone]}>
                      <Text style={[styles.dayBadgeText, isDone && styles.dayBadgeTextDone]}>
                        {isDone ? '✓' : plan.day}
                      </Text>
                    </View>
                    <View style={styles.grow}>
                      <View style={styles.dayTitleRow}>
                        <Text style={styles.dayTitle}>{t('program.day', { day: plan.day })}</Text>
                        {isNext ? <Text style={styles.nextTag}>{t('program.next')}</Text> : null}
                      </View>
                      <Text style={styles.daySets}>
                        {plan.sets.map((s) => (s.max ? `${s.target}+` : s.target)).join(' · ')}
                      </Text>
                      <Text style={styles.dayMeta}>
                        {t('program.sets', { sets: plan.sets.length, reps: totalTargetReps(plan) })}
                        {' · '}
                        {t('program.rest', { seconds: plan.restSeconds })}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))}

          <Pressable onPress={confirmRestart} hitSlop={8} accessibilityRole="button" style={styles.restart}>
            <Text style={styles.restartText}>{t('program.restart')}</Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  grow: { flex: 1 },
  pressed: { opacity: 0.7 },
  kicker: { ...type.label, color: colors.accent, textTransform: 'uppercase', marginBottom: 2 },
  title: { ...type.title, color: colors.text },
  intro: { ...type.body, color: colors.textDim, marginTop: spacing.xs, lineHeight: 21 },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  cardRow: { flexDirection: 'row', alignItems: 'flex-start' },
  cardTitle: { fontSize: 18, fontWeight: '600', color: colors.text },
  cardBody: { ...type.body, color: colors.textDim, marginTop: spacing.xs, lineHeight: 21 },
  cardButton: { marginTop: spacing.md },
  progressText: { fontSize: 13, color: colors.textDim },
  progressBar: { marginTop: spacing.md },
  complete: { fontSize: 17, fontWeight: '600', color: colors.accent, marginTop: spacing.md },

  week: { marginTop: spacing.lg },
  weekLabel: { ...type.label, color: colors.textFaint, marginBottom: spacing.sm },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  dayRowNext: { borderColor: colors.accent },
  dayBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  dayBadgeDone: { backgroundColor: colors.accent, borderColor: colors.accent },
  dayBadgeText: { fontSize: 14, fontWeight: '600', color: colors.textDim },
  dayBadgeTextDone: { color: colors.bg },
  dayTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dayTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  nextTag: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.accent,
    borderWidth: 1,
    borderColor: colors.accentDim,
    borderRadius: radius.pill,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  daySets: { fontSize: 15, color: colors.text, marginTop: 2, letterSpacing: 0.5 },
  dayMeta: { fontSize: 12, color: colors.textFaint, marginTop: 2 },

  restart: { alignSelf: 'center', marginTop: spacing.lg, padding: spacing.sm },
  restartText: { fontSize: 14, color: colors.danger },
});
