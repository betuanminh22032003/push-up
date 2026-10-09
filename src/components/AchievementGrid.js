import { StyleSheet, Text, View } from 'react-native';

import { ACHIEVEMENTS } from '../achievements/achievements';
import { ExerciseGlyph } from './ExerciseGlyph';
import { Icon } from './Icon';
import { useT } from '../i18n/I18nContext';
import { colors, font, radius, spacing } from '../theme/theme';

/** Every badge, earned ones lit and the rest dimmed with how to get them. */
export function AchievementGrid({ unlocked }) {
  const t = useT();
  const have = new Set(unlocked);
  return (
    <View style={styles.grid}>
      {ACHIEVEMENTS.map((a) => {
        const on = have.has(a.id);
        return (
          <View
            key={a.id}
            style={[styles.cell, on && styles.cellOn]}
            accessibilityLabel={`${t(`ach.${a.id}.title`)}: ${t(`ach.${a.id}.body`)}`}
            accessibilityState={{ checked: on }}
          >
            <View style={!on && styles.iconOff}>
              {a.exercise ? (
                <ExerciseGlyph exerciseId={a.exercise} size={36} />
              ) : (
                <View style={styles.iconDisc}>
                  <Icon name={a.icon} size={19} color={colors.accent} />
                </View>
              )}
            </View>
            <Text style={[styles.title, on && styles.titleOn]} numberOfLines={1}>
              {t(`ach.${a.id}.title`)}
            </Text>
            <Text style={styles.body} numberOfLines={2}>
              {t(`ach.${a.id}.body`)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  cell: {
    width: '31%',
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.sm,
    alignItems: 'center',
    minHeight: 96,
  },
  cellOn: { backgroundColor: colors.surfaceAlt },
  iconDisc: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconOff: { opacity: 0.3 },
  title: { fontSize: 12, ...font('600'), color: colors.textFaint, marginTop: spacing.xs },
  titleOn: { color: colors.text },
  body: { ...font('400'), fontSize: 10, color: colors.textFaint, textAlign: 'center', marginTop: 2, lineHeight: 13 },
});
