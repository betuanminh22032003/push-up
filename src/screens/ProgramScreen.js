import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../components/Button';
import { ExerciseGuideButton } from '../components/ExerciseGuide';
import { ExercisePicker } from '../components/ExercisePicker';
import { ProgressBar } from '../components/ProgressBar';
import { getExercise } from '../exercises/exercises';
import { useT } from '../i18n/I18nContext';
import {
  PROGRAM_LEVELS,
  PROGRAM_WEEKS,
  SLOTS,
  TRAINING_DAYS_TOTAL,
  countCompleted,
  currentWeek,
  dayPlan,
  isProgramComplete,
  needsRetest,
  nextProgramDay,
  normalizeLevel,
  planSets,
  planTotals,
  programDayKey,
  testPlan,
  weekPlan,
  weekProgress,
} from '../program/program';
import { useSessions } from '../state/SessionsContext';
import { useSettings } from '../state/SettingsContext';
import { HealthCheckCard, HealthNote, MethodCard } from '../components/TrainingInfo';
import { colors, font, radius, spacing, type } from '../theme/theme';
import { confirm } from '../utils/confirm';
import { ExerciseGlyph } from '../components/ExerciseGlyph';
import { Icon } from '../components/Icon';

/** A level as one, two or three rising bars, like signal strength. */
function LevelBars({ level }) {
  return (
    <View style={styles.levelBars}>
      {[8, 13, 18].map((h, i) => (
        <View key={h} style={[styles.levelBar, { height: h }, i < level && styles.levelBarOn]} />
      ))}
    </View>
  );
}

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
  const { schedule, startSchedule, startNextCycle, resetSchedule } = useSessions();
  const { settings, updateSettings } = useSettings();
  const health = settings.healthCheck;

  const level = schedule ? normalizeLevel(schedule.level) : null;
  const completed = schedule?.completed ?? {};
  const upcoming = schedule ? nextProgramDay(completed) : null;
  const finished = !!schedule && isProgramComplete(completed);
  const thisWeek = currentWeek(completed);
  const doneCount = countCompleted(completed);

  // The week on show: the current one, until another is picked.
  const [shownWeek, setShownWeek] = useState(thisWeek);
  useEffect(() => setShownWeek(thisWeek), [thisWeek]);
  // What a day plan needs besides the level: where each exercise stands, the
  // comeback rule's clock, jump-free cardio, and the lighter first week of a
  // later cycle.
  const slots = schedule?.slots;
  const cycle = schedule?.cycle ?? 1;
  const lowImpact = !!health?.lowImpact;
  const optionsFor = (week) => ({ slots, now: Date.now(), lowImpact, light: cycle > 1 && week === 1 });
  const days = useMemo(
    () => (level ? weekPlan(level, shownWeek, optionsFor(shownWeek)) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [level, shownWeek, slots, cycle, lowImpact],
  );
  const retestDue = !!schedule && !finished && needsRetest(slots, Date.now());
  const [openDay, setOpenDay] = useState(null);

  /** The workout tab runs every set of the day in order. */
  const startDay = (plan) => onStartPlan({ kind: 'program', ...plan, sets: planSets(plan) });
  /** The placement test; a yes on the health check leaves the maximal plank out. */
  const startTest = () => onStartPlan(testPlan({ cautious: !!health?.anyYes }));
  const redoHealth = () => updateSettings({ healthCheck: null });

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
  const nextPlan = upcoming ? dayPlan(level, upcoming.week, upcoming.day, optionsFor(upcoming.week)) : null;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md }]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>{t('program.title')}</Text>
      <Text style={styles.intro}>{t('program.intro')}</Text>

      {!schedule && !health ? (
        <HealthCheckCard onDone={(check) => updateSettings({ healthCheck: check })} />
      ) : !schedule ? (
        <>
          <HealthNote check={health} onRedo={redoHealth} />
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('program.test.title')}</Text>
            <Text style={styles.cardBody}>{t('program.test.body')}</Text>
            <Button label={t('program.test.start')} onPress={startTest} style={styles.cardButton} />
          </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('program.test.or')}</Text>
          {PROGRAM_LEVELS.map((id) => (
            <Pressable
              key={id}
              onPress={() => pickLevel(id)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.levelRow, pressed && styles.pressed]}
            >
              <LevelBars level={PROGRAM_LEVELS.indexOf(id) + 1} />
              <View style={styles.grow}>
                <Text style={styles.levelName}>{t(`program.level.${id}`)}</Text>
                <Text style={styles.cardBody}>{t(`program.levelBody.${id}`)}</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          ))}
          <Text style={styles.note}>{t('program.progression')}</Text>
        </View>
        </>
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
                <Text style={styles.cardBody}>
                  {t(level === 'advanced' ? 'program.completeBodyTop' : 'program.completeBody')}
                </Text>
                <Button label={t('program.retest')} onPress={startTest} style={styles.cardButton} />
                <Button
                  label={t('program.levelUp')}
                  variant="secondary"
                  onPress={() => startNextCycle()}
                  style={styles.cardButton}
                />
              </>
            ) : nextPlan ? (
              <>
                {retestDue ? (
                  <>
                    <Text style={styles.warnLine}>{t('program.retestDue')}</Text>
                    <Button
                      label={t('program.retest')}
                      variant="secondary"
                      onPress={startTest}
                      style={styles.cardButton}
                    />
                  </>
                ) : null}
                {nextPlan.light ? <Text style={styles.nextLine}>{t('program.light')}</Text> : null}
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
            <Text style={styles.sectionMeta}>{t('program.weekDone', week)}</Text>
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
                    {isDone ? (
                      <Icon name="checkmark" size={18} color={colors.bg} />
                    ) : (
                      <Text style={styles.dayBadgeText}>{plan.day}</Text>
                    )}
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
                    {plan.items.some((item) => item.warmup) ? (
                      <View style={styles.item}>
                        <View style={styles.grow}>
                          <Text style={styles.itemName}>{t('program.warmup')}</Text>
                          <Text style={styles.itemCue}>
                            {plan.items
                              .filter((item) => item.warmup)
                              .map((item) => t(`exercise.${item.exerciseId}`))
                              .join(' · ')}
                          </Text>
                          <Text style={styles.itemWhy}>{t('program.why.warmup')}</Text>
                        </View>
                      </View>
                    ) : null}
                    {plan.items.filter((item) => !item.warmup).map((item, i) => {
                      const e = getExercise(item.exerciseId);
                      const ladder = item.slot ? SLOTS[item.slot].ladder : null;
                      let why = null;
                      if (item.role === 'cardio') why = i === 0 ? 'program.why.cardio' : null;
                      else if (item.role === 'hold') why = 'program.why.hold';
                      else if (i === 0) why = 'program.why.main';
                      return (
                        <View key={`${item.exerciseId}-${i}`} style={styles.item}>
                          <ExerciseGlyph exerciseId={e.id} size={36} />
                          <View style={styles.grow}>
                            <Text style={styles.itemName}>{t(`exercise.${e.id}`)}</Text>
                            {ladder && ladder.length > 1 ? (
                              <Text style={styles.itemStep}>
                                {t('program.rung', {
                                  n: ladder.indexOf(item.exerciseId) + 1,
                                  total: ladder.length,
                                })}
                              </Text>
                            ) : null}
                            <Text style={styles.itemCue} numberOfLines={2}>
                              {t(`exercise.${e.id}.cue`)}
                            </Text>
                            {item.slot && !item.hold ? (
                              <Text style={styles.itemStep}>{t('program.amrap')}</Text>
                            ) : null}
                            {why ? <Text style={styles.itemWhy}>{t(why)}</Text> : null}
                          </View>
                          <ExerciseGuideButton exerciseId={e.id} compact />
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
          <HealthNote check={health} onRedo={redoHealth} />

          <Pressable onPress={confirmRestart} hitSlop={8} accessibilityRole="button" style={styles.restart}>
            <Text style={styles.restartText}>{t('program.restart')}</Text>
          </Pressable>
        </>
      )}
      <MethodCard />
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
  note: { ...font('400'), fontSize: 12, color: colors.textFaint, marginTop: spacing.md, textAlign: 'center' },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  cardRow: { flexDirection: 'row', alignItems: 'flex-start' },
  cardTitle: { fontSize: 18, ...font('600'), color: colors.text },
  cardBody: { ...type.body, color: colors.textDim, marginTop: spacing.xs, lineHeight: 21 },
  cardButton: { marginTop: spacing.md },
  progressText: { ...font('400'), fontSize: 13, color: colors.textDim },
  progressBar: { marginTop: spacing.md },
  complete: { fontSize: 17, ...font('600'), color: colors.accent, marginTop: spacing.md },
  warnLine: { ...font('500'), fontSize: 14, color: colors.warn, marginTop: spacing.md, lineHeight: 20 },
  nextLine: { ...font('400'), fontSize: 14, color: colors.text, marginTop: spacing.md },

  levelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: spacing.sm,
  },
  levelBars: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accentSoft,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 3,
    paddingBottom: 13,
    marginRight: spacing.md,
  },
  levelBar: { width: 5, borderRadius: 2, backgroundColor: colors.border },
  levelBarOn: { backgroundColor: colors.accent },
  levelName: { fontSize: 16, ...font('700'), color: colors.text },
  chevron: { ...font('400'), fontSize: 22, color: colors.textDim, paddingLeft: spacing.sm },

  sectionRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  sectionLabel: { ...type.heading, color: colors.text, marginTop: spacing.lg, marginBottom: spacing.sm },
  sectionMeta: { ...font('500'), fontSize: 13, color: colors.textDim },
  weekChips: { marginBottom: spacing.md },

  dayCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    marginBottom: spacing.sm,
  },
  dayCardNext: { borderColor: colors.accent },
  dayHead: { flexDirection: 'row', alignItems: 'center', padding: spacing.md },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  restRow: { borderStyle: 'dashed', backgroundColor: 'transparent' },
  restTitle: { fontSize: 15, ...font('600'), color: colors.textDim },
  dayBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  dayBadgeDone: { backgroundColor: colors.accent },
  dayBadgeText: { fontSize: 14, ...font('600'), color: colors.textDim },
  dayTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  dayTitle: { fontSize: 15, ...font('600'), color: colors.text },
  nextTag: {
    fontSize: 10,
    ...font('600'),
    color: colors.accent,
    borderWidth: 1,
    borderColor: colors.accentDim,
    borderRadius: radius.pill,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  dayMeta: { ...font('400'), fontSize: 12, color: colors.textFaint, marginTop: 2 },

  items: { paddingHorizontal: spacing.md, paddingBottom: spacing.md },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  itemName: { fontSize: 14, ...font('600'), color: colors.text },
  itemCue: { ...font('400'), fontSize: 12, color: colors.textDim, marginTop: 1, lineHeight: 16 },
  itemStep: { ...font('600'), fontSize: 11, color: colors.accent, marginTop: 1 },
  itemWhy: { ...font('400'), fontSize: 11, color: colors.textFaint, marginTop: 2, lineHeight: 15 },
  itemTarget: { fontSize: 15, ...font('600'), color: colors.accent, fontVariant: ['tabular-nums'] },
  dayButton: { marginTop: spacing.sm },

  restart: { alignSelf: 'center', marginTop: spacing.lg, padding: spacing.sm },
  restartText: { ...font('400'), fontSize: 14, color: colors.danger },
});
