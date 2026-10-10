import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from './Button';
import { useT } from '../i18n/I18nContext';
import { HEALTH_QUESTIONS, METHOD_RULES, healthOutcome } from '../program/method';
import { colors, font, radius, spacing, type } from '../theme/theme';

/**
 * The pre-exercise health check: yes/no questions in the spirit of the
 * PAR-Q+. Nothing is blocked by a yes; the user is told to see a doctor
 * first, and the schedule goes gentler (no maximal hold in the test, and
 * jump-free cardio for joint problems and pregnancy).
 *
 * @param {Function} onDone  ({ at, anyYes, lowImpact }) once every question is answered
 */
export function HealthCheckCard({ onDone }) {
  const t = useT();
  const [answers, setAnswers] = useState({});
  const complete = HEALTH_QUESTIONS.every((id) => typeof answers[id] === 'boolean');

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{t('health.title')}</Text>
      <Text style={styles.body}>{t('health.intro')}</Text>
      {HEALTH_QUESTIONS.map((id) => (
        <View key={id} style={styles.question}>
          <Text style={styles.questionText}>{t(`health.q.${id}`)}</Text>
          <View style={styles.answers}>
            {[true, false].map((value) => {
              const selected = answers[id] === value;
              return (
                <Pressable
                  key={String(value)}
                  onPress={() => setAnswers((prev) => ({ ...prev, [id]: value }))}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  hitSlop={4}
                  style={[styles.answer, selected && (value ? styles.answerYes : styles.answerNo)]}
                >
                  <Text style={[styles.answerText, selected && styles.answerTextOn]}>
                    {t(value ? 'health.yes' : 'health.no')}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
      <Text style={styles.note}>{t('health.basis')}</Text>
      <Button
        label={t('health.save')}
        disabled={!complete}
        onPress={() => onDone({ at: Date.now(), ...healthOutcome(answers) })}
        style={styles.button}
      />
    </View>
  );
}

/** What the answers meant, with the stop signs; and a way to answer again. */
export function HealthNote({ check, onRedo }) {
  const t = useT();
  if (!check) return null;
  return (
    <View style={[styles.card, check.anyYes && styles.cardWarn]}>
      <Text style={[styles.body, check.anyYes && styles.warnText]}>
        {t(check.anyYes ? 'health.adviceYes' : 'health.adviceNo')}
        {check.lowImpact ? ` ${t('health.adviceLowImpact')}` : ''}
      </Text>
      <Text style={styles.stop}>{t('health.stop')}</Text>
      <Pressable onPress={onRedo} hitSlop={8} accessibilityRole="button">
        <Text style={styles.link}>{t('health.redo')}</Text>
      </Pressable>
    </View>
  );
}

/** "Why the schedule looks like this": each rule in a line, with its sources to tap. */
export function MethodCard() {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.card}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={styles.head}
      >
        <Text style={[styles.title, styles.grow]}>{t('program.method.title')}</Text>
        <Text style={styles.chevron}>{open ? '⌃' : '⌄'}</Text>
      </Pressable>
      {open ? (
        <>
          {METHOD_RULES.map((rule) => (
            <View key={rule.id} style={styles.rule}>
              <Text style={styles.ruleText}>{t(`program.method.${rule.id}`)}</Text>
              <View style={styles.sources}>
                <Text style={styles.sourceLabel}>{t('program.method.source')}:</Text>
                {rule.sources.map((source) => (
                  <Pressable
                    key={source.url}
                    onPress={() => Linking.openURL(source.url)}
                    hitSlop={6}
                    accessibilityRole="link"
                  >
                    <Text style={styles.sourceLink}>{source.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ))}
          <Text style={styles.note}>{t('program.method.honest')}</Text>
          <Text style={styles.note}>{t('health.disclaimer')}</Text>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  cardWarn: { borderWidth: 1, borderColor: colors.warn },
  head: { flexDirection: 'row', alignItems: 'center' },
  grow: { flex: 1 },
  chevron: { ...font('400'), fontSize: 22, color: colors.textDim, paddingLeft: spacing.sm },
  title: { fontSize: 17, ...font('600'), color: colors.text },
  body: { ...type.body, color: colors.textDim, marginTop: spacing.xs, lineHeight: 21 },
  warnText: { color: colors.warn },
  question: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
  },
  questionText: { ...font('500'), fontSize: 14, color: colors.text, lineHeight: 20 },
  answers: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  answer: {
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  answerYes: { backgroundColor: colors.warn, borderColor: colors.warn },
  answerNo: { backgroundColor: colors.accent, borderColor: colors.accent },
  answerText: { ...font('600'), fontSize: 14, color: colors.textDim },
  answerTextOn: { color: colors.bg },
  button: { marginTop: spacing.md },
  stop: { ...font('500'), fontSize: 13, color: colors.text, marginTop: spacing.sm, lineHeight: 19 },
  link: { ...font('600'), fontSize: 13, color: colors.accent, marginTop: spacing.sm },
  note: { ...font('400'), fontSize: 12, color: colors.textFaint, marginTop: spacing.md, lineHeight: 17 },
  rule: { borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: spacing.sm, marginTop: spacing.sm },
  ruleText: { ...font('400'), fontSize: 14, color: colors.text, lineHeight: 20 },
  sources: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: spacing.sm },
  sourceLink: { ...font('600'), fontSize: 13, color: colors.accent },
  sourceLabel: { ...font('400'), fontSize: 12, color: colors.textFaint },
});
