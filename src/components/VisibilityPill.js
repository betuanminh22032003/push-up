import { StyleSheet, Text, View } from 'react-native';

import { useT } from '../i18n/I18nContext';
import { colors, font, radius, spacing } from '../theme/theme';
import { Icon } from './Icon';

/**
 * What the visibility gate is waiting for, over the camera: which body parts
 * are out of frame, or "hold still" with a bar filling over the last second.
 * Renders nothing once the gate is open.
 *
 * @param {{ready, missing, progress}|null} visibility  from PoseStage's onVisibility
 */
export function VisibilityPill({ visibility, style }) {
  const t = useT();
  if (!visibility || visibility.ready) return null;
  const missing = visibility.missing || [];
  const text = missing.length
    ? t('vis.missing', { parts: missing.map((part) => t(`vis.part.${part}`)).join(', ') })
    : t('vis.hold');
  return (
    <View style={[styles.pill, missing.length ? styles.pillWarn : styles.pillOk, style]} accessibilityLiveRegion="polite">
      <View style={styles.row}>
        <Icon
          name={missing.length ? 'eye-outline' : 'hand-left-outline'}
          size={22}
          color={missing.length ? colors.warn : colors.accent}
        />
        <Text style={[styles.text, missing.length ? styles.textWarn : styles.textOk]}>{text}</Text>
      </View>
      {missing.length ? <Text style={styles.sub}>{t('vis.hint')}</Text> : null}
      {missing.length ? null : (
        <View style={styles.bar}>
          <View style={[styles.fill, { width: `${Math.round((visibility.progress || 0) * 100)}%` }]} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  pill: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    right: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: 'rgba(10,10,11,0.86)',
    borderWidth: 1,
    alignItems: 'center',
    zIndex: 5,
  },
  pillWarn: { borderColor: colors.warn },
  pillOk: { borderColor: colors.accent },
  // Read from a few metres away, where the camera sees the whole body.
  text: { fontSize: 22, ...font('800'), textAlign: 'center' },
  textWarn: { color: colors.warn },
  textOk: { color: colors.accent },
  sub: { ...font('400'), fontSize: 15, color: colors.textDim, marginTop: 4, textAlign: 'center' },
  bar: {
    alignSelf: 'stretch',
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginTop: spacing.sm,
    overflow: 'hidden',
  },
  fill: { height: '100%', backgroundColor: colors.accent },
});
