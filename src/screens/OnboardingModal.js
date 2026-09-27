import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '../components/Button';
import { useT } from '../i18n/I18nContext';
import { colors, radius, spacing, type } from '../theme/theme';

const STEPS = [
  { key: 's1', icon: '📷' },
  { key: 's2', icon: '⏱️' },
  { key: 's3', icon: '🔥' },
];

/** Three cards on first launch (and from Settings): how to place the phone and what the app does. */
export function OnboardingModal({ visible, onClose }) {
  const t = useT();
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <SafeAreaView style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.brand}>HÍT ĐẤT AI</Text>
          <Text style={styles.title}>{t('onboarding.title')}</Text>
          {STEPS.map((step) => (
            <View key={step.key} style={styles.card}>
              <Text style={styles.icon}>{step.icon}</Text>
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
  brand: { fontSize: 14, fontWeight: '800', color: colors.accent, letterSpacing: 3 },
  title: { fontSize: 28, fontWeight: '700', color: colors.text, marginTop: spacing.xs, marginBottom: spacing.lg },
  card: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  icon: { fontSize: 28, marginTop: 2 },
  cardText: { flex: 1 },
  cardTitle: { fontSize: 17, fontWeight: '600', color: colors.text },
  cardBody: { ...type.body, color: colors.textDim, marginTop: spacing.xs, lineHeight: 21 },
  footer: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
});
