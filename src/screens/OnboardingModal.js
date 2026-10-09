import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '../components/Button';
import { useT } from '../i18n/I18nContext';
import { colors, font, radius, spacing, type } from '../theme/theme';
import { Icon } from '../components/Icon';

const STEPS = [
  { key: 's1', icon: 'camera-outline' },
  { key: 's2', icon: 'timer-outline' },
  { key: 's3', icon: 'flame-outline' },
];

/** Three cards on first launch (and from Settings): how to place the phone and what the app does. */
export function OnboardingModal({ visible, onClose }) {
  const t = useT();
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <SafeAreaView style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.brand}>Hít Đất AI</Text>
          <Text style={styles.title}>{t('onboarding.title')}</Text>
          {STEPS.map((step) => (
            <View key={step.key} style={styles.card}>
              <View style={styles.iconWrap}>
                <Icon name={step.icon} size={22} color={colors.accent} />
              </View>
              <View style={styles.cardText}>
                <Text style={styles.cardTitle}>{t(`onboarding.${step.key}.title`)}</Text>
                <Text style={styles.cardBody}>{t(`onboarding.${step.key}.body`)}</Text>
              </View>
            </View>
          ))}
        </ScrollView>
        <View style={styles.footer}>
          <Button label={t('onboarding.cta')} onPress={onClose} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.lg },
  brand: { fontSize: 15, ...font('700'), color: colors.accent, letterSpacing: 0.2 },
  title: { fontSize: 28, ...font('700'), color: colors.text, marginTop: spacing.xs, marginBottom: spacing.lg },
  card: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: { flex: 1 },
  cardTitle: { fontSize: 17, ...font('600'), color: colors.text },
  cardBody: { ...type.body, color: colors.textDim, marginTop: spacing.xs, lineHeight: 21 },
  footer: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
});
