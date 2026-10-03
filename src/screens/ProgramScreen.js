import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../components/Button';
import { ExercisePicker } from '../components/ExercisePicker';
import { ProgressBar } from '../components/ProgressBar';
import { getExercise } from '../exercises/exercises';
import { useT } from '../i18n/I18nContext';
import {
  PROGRAM_LEVELS,
  PROGRAM_WEEKS,
  TRAINING_DAYS_TOTAL,
  countCompleted,
  currentWeek,
  dayPlan,
  isProgramComplete,
  nextProgramDay,
  normalizeLevel,
  planSets,
  planTotals,
  programDayKey,
  weekPlan,
  weekProgress,
} from '../program/program';
import { useSessions } from '../state/SessionsContext';
import { colors, radius, spacing, type } from '../theme/theme';
import { confirm } from '../utils/confirm';

/**
 * The training schedule (lịch tập): pick a level, then a week at a time of
 * five workouts and two rest days. The next workout is one tap away; any day
 * can be opened and started, so a missed or failed day can be redone without
 * ceremony. Each day lists its exercises with sets and targets, and the
 * workout tab runs them in order with the camera counting.
 *
 * @param {Function} onStartPlan  hand a day to the workout tab
 */
export function ProgramScreen({ onStartPlan }) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const { schedule, startSchedule, resetSchedule } = useSessions();

  const level = schedule ? normalizeLevel(schedule.level) : null;
  const completed = schedule?.completed ?? {};
  const upcoming = schedule ? nextProgramDay(completed) : null;
  const finished = !!schedule && isProgramComplete(completed);
  const thisWeek = currentWeek(completed);
  const doneCount = countCompleted(completed);

  // The week on show: the current one, until another is picked.
  const [shownWeek, setShownWeek] = useState(thisWeek);
  useEffect(() => setShownWeek(thisWeek), [thisWeek]);
  const days = useMemo(() => (level ? weekPlan(level, shownWeek) : []), [level, shownWeek]);
  const [openDay, setOpenDay] = useState(null);

  /** The workout tab runs every set of the day in order. */
  const startDay = (plan) => onStartPlan({ kind: 'program', ...plan, sets: planSets(plan) });

  const pickLevel = (next) => {
    if (!schedule) {
      startSchedule(next);
      return;
    }
    if (next === level) return;
    confirm({
      title: t('confirm.levelTitle'),
      message: t('confirm.levelBody'),
      confirmText: t('confirm.levelChange'),
      cancelText: t('common.cancel'),
      onConfirm: () => startSchedule(next, { keepProgress: true }),
    });
  };

  const confirmRestart = () => {
    confirm({
      title: t('confirm.restartTitle'),
      message: t('confirm.restartBody'),
      confirmText: t('confirm.restart'),
      cancelText: t('common.cancel'),
      destructive: true,
      onConfirm: resetSchedule,
    });
  };

  const levelChips = PROGRAM_LEVELS.map((id) => ({ id, label: t(`program.level.${id}`) }));
  const weekChips = Array.from({ length: PROGRAM_WEEKS }, (_, i) => ({
    id: i + 1,
    label: i + 1 === thisWeek && !finished ? `${t('program.week', { week: i + 1 })} •` : t('program.week', { week: i + 1 }),
  }));
  const week = weekProgress(completed, shownWeek);
  const nextPlan = upcoming ? dayPlan(level, upcoming.week, upcoming.day) : null;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md }]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>{t('program.title')}</Text>
      <Text style={styles.intro}>{t('program.intro')}</Text>

      {!schedule ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('program.chooseLevel')}</Text>
          {PROGRAM_LEVELS.map((id) => (
            <Pressable
              key={id}
              onPress={() => pickLevel(id)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.levelRow, pressed && styles.pressed]}
            >
              <View style={styles.grow}>
                <Text style={styles.levelName}>{t(`program.level.${id}`)}</Text>
                <Text style={styles.cardBody}>{t(`program.levelBody.${id}`)}</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          ))}
          <Text style={styles.note}>{t('program.progression')}</Text>
        </View>
      ) : (
        <>
          <View style={styles.card}>
            <View style={styles.cardRow}>
              <View style={styles.grow}>
                <Text style={styles.cardTitle}>{t(`program.level.${level}`)}</Text>
                <Text style={styles.cardBody}>
                  {t('program.overall', { done: doneCount, total: TRAINING_DAYS_TOTAL })}
                </Text>
              </View>
              <Text style={styles.progressText}>
                {t('program.weekProgress', {
                  done: weekProgress(completed, thisWeek).done,
                  total: weekProgress(completed, thisWeek).total,
                })}
              </Text>
            </View>
            <ProgressBar value={doneCount} max={TRAINING_DAYS_TOTAL} style={styles.progressBar} />

            {finished ? (
              <>
                <Text style={styles.complete}>{t('program.complete')}</Text>
                <Text style={styles.cardBody}>{t('program.completeBody')}</Text>
                {level !== 'advanced' ? (
                  <Button
                    label={t('program.levelUp')}
                    onPress={() => startSchedule(PROGRAM_LEVELS[PROGRAM_LEVELS.indexOf(level) + 1])}
                    style={styles.cardButton}
                  />
                ) : null}
              </>
            ) : nextPlan ? (
              <>
                <Text style={styles.nextLine}>
                  {`${t('program.next')}: ${t('workout.programDay', nextPlan)} · ${t(`program.focus.${nextPlan.focus}`)}`}
                </Text>
                <Button
                  label={t('btn.startProgramDay', nextPlan)}
                  onPress={() => startDay(nextPlan)}
                  style={styles.cardButton}
                />
              </>
            ) : null}
          </View>

          <Text style={styles.sectionLabel}>{t('program.changeLevel')}</Text>
          <ExercisePicker
            options={levelChips}
            selected={level}
            onSelect={pickLevel}
            label={t('program.changeLevel')}
            align="start"
            bleed={spacing.lg}
          />

          <View style={styles.sectionRow}>
            <Text style={styles.sectionLabel}>{t('program.week', { week: shownWeek })}</Text>
            <Text style={styles.sectionMeta}>{t('program.weekProgress', week)}</Text>
          </View>
          <ExercisePicker
            options={weekChips}
            selected={shownWeek}
            onSelect={setShownWeek}
            label={t('program.week', { week: shownWeek })}
            align="start"
            bleed={spacing.lg}
            style={styles.weekChips}
          />

          {days.map((plan) => {
            const key = programDayKey(plan.week, plan.day);
            const isDone = !!completed[key];
            const isNext = !!upcoming && upcoming.week === plan.week && upcoming.day === plan.day;
            const open = openDay === key || (openDay === null && isNext);
            if (plan.rest) {
              return (
                <View key={key} style={[styles.dayRow, styles.restRow]}>
                  <View style={styles.dayBadge}>
                    <Text style={styles.dayBadgeText}>{plan.day}</Text>
                  </View>
                  <View style={styles.grow}>
                    <Text style={styles.restTitle}>{t('program.focus.rest')}</Text>
                    <Text style={styles.dayMeta}>{t('program.restBody')}</Text>
                  </View>
                </View>
              );
            }
            const totals = planTotals(plan);
            return (
              <View key={key} style={[styles.dayCard, isNext && styles.dayCardNext]}>
                <Pressable
                  onPress={() => setOpenDay(open ? '' : key)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: open }}
                  style={({ pressed }) => [styles.dayHead, pressed && styles.pressed]}
                >
                  <View style={[styles.dayBadge, isDone && styles.dayBadgeDone]}>
                    <Text style={[styles.dayBadgeText, isDone && styles.dayBadgeTextDone]}>
                      {isDone ? '✓' : plan.day}
                    </Text>
                  </View>
                  <View style={styles.grow}>
                    <View style={styles.dayTitleRow}>
                      <Text style={styles.dayTitle}>{t(`program.focus.${plan.focus}`)}</Text>
                      {isNext ? <Text style={styles.nextTag}>{t('program.next')}</Text> : null}
                    </View>
                    <Text style={styles.dayMeta}>
                      {`${t('program.day', { day: plan.day })} · ${t('program.dayMeta', {
                        n: totals.exercises,
                        sets: totals.sets,
                      })} · ${t('program.rest', { seconds: plan.restSeconds })}`}
                    </Text>
                  </View>
                  <Text style={styles.chevron}>{open ? '⌃' : '⌄'}</Text>
                </Pressable>

                {open ? (
                  <View style={styles.items}>
                    {plan.items.map((item) => {
                      const e = getExercise(item.exerciseId);
                      return (
                        <View key={item.exerciseId} style={styles.item}>
                          <Text style={styles.itemIcon}>{e.icon}</Text>
                          <View style={styles.grow}>
                            <Text style={styles.itemName}>{t(`exercise.${e.id}`)}</Text>
                            <Text style={styles.itemCue} numberOfLines={2}>
                              {t(`exercise.${e.id}.cue`)}
                            </Text>
                          </View>
                          <Text style={styles.itemTarget}>
                            {t(item.hold ? 'program.targetHold' : 'program.targetReps', {
                              sets: item.sets,
                              n: item.target,
                            })}
                          </Text>
                        </View>
                      );
                    })}
                    <Button
                      label={t('program.start.day')}
                      variant={isNext ? 'primary' : 'secondary'}
                      onPress={() => startDay(plan)}
                      style={styles.dayButton}
                    />
                  </View>
                ) : null}
              </View>
            );
          })}

          <Text style={styles.note}>{t('program.progression')}</Text>

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
  title: { ...type.title, color: colors.text },
  intro: { ...type.body, color: colors.textDim, marginTop: spacing.xs, lineHeight: 21 },
  note: { fontSize: 12, color: colors.textFaint, marginTop: spacing.md, textAlign: 'center' },

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
  nextLine: { fontSize: 14, color: colors.text, marginTop: spacing.md },

  levelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: spacing.sm,
  },
  levelName: { fontSize: 16, fontWeight: '600', color: colors.text },
  chevron: { fontSize: 22, color: colors.textDim, paddingLeft: spacing.sm },

  sectionRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  sectionLabel: { ...type.label, color: colors.textFaint, marginTop: spacing.lg, marginBottom: spacing.sm },
  sectionMeta: { fontSize: 12, color: colors.textDim },
  weekChips: { marginBottom: spacing.md },

  dayCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  dayCardNext: { borderColor: colors.accent },
  dayHead: { flexDirection: 'row', alignItems: 'center', padding: spacing.md },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  restRow: { borderStyle: 'dashed', backgroundColor: 'transparent' },
  restTitle: { fontSize: 15, fontWeight: '600', color: colors.textDim },
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
  dayTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
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
  dayMeta: { fontSize: 12, color: colors.textFaint, marginTop: 2 },

  items: { paddingHorizontal: spacing.md, paddingBottom: spacing.md },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  itemIcon: { fontSize: 20, width: 28, textAlign: 'center' },
  itemName: { fontSize: 14, fontWeight: '600', color: colors.text },
  itemCue: { fontSize: 12, color: colors.textDim, marginTop: 1, lineHeight: 16 },
  itemTarget: { fontSize: 15, fontWeight: '600', color: colors.accent, fontVariant: ['tabular-nums'] },
  dayButton: { marginTop: spacing.sm },

  restart: { alignSelf: 'center', marginTop: spacing.lg, padding: spacing.sm },
  restartText: { fontSize: 14, color: colors.danger },
});
