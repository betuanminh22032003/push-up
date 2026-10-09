import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppIcon } from './AppIcon';
import { Button } from './Button';
import { filterApps, isSuggested } from '../blocker/blockerLogic';
import { useT } from '../i18n/I18nContext';
import { colors, radius, spacing, type } from '../theme/theme';

/**
 * Full-screen list of installed apps to tick. The selection stays local until
 * Save, so backing out leaves the blocked list exactly as it was.
 */
export function AppPickerModal({ visible, apps, loading, selected, onSave, onClose }) {
  const t = useT();
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState(() => new Set(selected));

  // Start from the current list every time the picker opens.
  useEffect(() => {
    if (!visible) return;
    setPicked(new Set(selected));
    setQuery('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const rows = useMemo(() => {
    const list = apps ?? [];
    if (query.trim()) return filterApps(list, query).map((app) => ({ key: app.packageName, app }));
    const suggested = list.filter(isSuggested);
    const rest = list.filter((app) => !isSuggested(app));
    const out = [];
    if (suggested.length) {
      out.push({ key: 'header-suggested', header: t('picker.suggested') });
      suggested.forEach((app) => out.push({ key: app.packageName, app }));
    }
    if (rest.length) {
      out.push({ key: 'header-all', header: t('picker.all') });
      rest.forEach((app) => out.push({ key: app.packageName, app }));
    }
    return out;
  }, [apps, query, t]);

  const toggle = (pkg) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(pkg)) next.delete(pkg);
      else next.add(pkg);
      return next;
    });

  const renderItem = ({ item }) => {
    if (item.header) return <Text style={styles.header}>{item.header}</Text>;
    const { app } = item;
    const on = picked.has(app.packageName);
    return (
      <Pressable
        onPress={() => toggle(app.packageName)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: on }}
        accessibilityLabel={app.label}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      >
        <AppIcon app={app} size={40} />
        <Text style={styles.label} numberOfLines={1}>
          {app.label}
        </Text>
        <View style={[styles.check, on && styles.checkOn]}>
          {on ? <Text style={styles.checkMark}>✓</Text> : null}
        </View>
      </Pressable>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <SafeAreaView style={styles.screen}>
        <View style={styles.top}>
          <Text style={styles.title}>{t('appPicker.title')}</Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button">
            <Text style={styles.cancel}>{t('common.cancel')}</Text>
          </Pressable>
        </View>

        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('picker.search')}
          placeholderTextColor={colors.textFaint}
          style={styles.search}
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="while-editing"
        />

        {loading || !apps ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.hint}>{t('picker.loading')}</Text>
          </View>
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(item) => item.key}
            renderItem={renderItem}
            keyboardShouldPersistTaps="handled"
            initialNumToRender={20}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <Text style={styles.hint}>
                {query.trim() ? t('picker.empty', { query: query.trim() }) : t('picker.none')}
              </Text>
            }
          />
        )}

        <View style={styles.footer}>
          <Button label={t('picker.save', { n: picked.size })} onPress={() => onSave([...picked])} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  title: { ...type.title, color: colors.text, flex: 1 },
  cancel: { fontSize: 15, color: colors.textDim },
  search: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 15,
  },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  header: { ...type.label, color: colors.textFaint, marginTop: spacing.lg, marginBottom: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  pressed: { opacity: 0.6 },
  label: { flex: 1, fontSize: 15, color: colors.text },
  check: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { borderColor: colors.accent, backgroundColor: colors.accent },
  checkMark: { fontSize: 14, fontWeight: '800', color: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  hint: { ...type.body, color: colors.textDim, textAlign: 'center', marginTop: spacing.lg },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md },
});
