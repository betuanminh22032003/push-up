import { useMemo } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native';
import { SessionRow } from '../components/SessionRow';
import { StatTile } from '../components/StatTile';
import { colors, spacing, type } from '../theme/theme';
import { formatDuration } from '../utils/time';

export function HistoryModal({ visible, onClose, sessions, stats, onDelete, onClearAll }) {
  const header = useMemo(
    () => (
      <View style={styles.statsBlock}>
        <View style={styles.statsRow}>
          <StatTile label="Sessions" value={stats.sessionCount} />
          <View style={styles.gap} />
          <StatTile label="Best set" value={stats.bestSession} highlight />
          <View style={styles.gap} />
          <StatTile label="Time" value={formatDuration(stats.totalSeconds)} />
        </View>
        <Text style={styles.sectionLabel}>ALL SESSIONS</Text>
      </View>
    ),
    [stats],
  );

  const confirmDelete = (session) => {
    Alert.alert(
      'Delete session?',
      `${session.totalReps} reps will be removed from your history.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => onDelete(session.id) },
      ],
    );
  };

  const confirmClearAll = () => {
    Alert.alert('Clear all history?', 'Every session will be permanently deleted.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete all', style: 'destructive', onPress: onClearAll },
    ]);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.screen}>
        <View style={styles.topBar}>
          <Text style={styles.title}>History</Text>
          <View style={styles.topBarActions}>
            {sessions.length > 0 ? (
              <Pressable onPress={confirmClearAll} hitSlop={10} accessibilityRole="button">
                <Text style={styles.clearAll}>Clear</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={onClose}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Close history"
            >
              <Text style={styles.close}>Done</Text>
            </Pressable>
          </View>
        </View>

        <FlatList
          data={sessions}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <SessionRow session={item} onDelete={confirmDelete} />}
          ListHeaderComponent={sessions.length > 0 ? header : null}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No sessions yet</Text>
              <Text style={styles.emptyBody}>
                Finish a workout and it will show up here.
              </Text>
            </View>
          }
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  title: { ...type.title, color: colors.text },
  topBarActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  close: { fontSize: 16, fontWeight: '600', color: colors.accent },
  clearAll: { fontSize: 16, color: colors.danger },
  listContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  statsBlock: { paddingTop: spacing.sm },
  statsRow: { flexDirection: 'row' },
  gap: { width: spacing.sm },
  sectionLabel: {
    ...type.label,
    color: colors.textFaint,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  empty: { alignItems: 'center', paddingTop: spacing.xxl * 2 },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: colors.textDim },
  emptyBody: {
    ...type.body,
    color: colors.textFaint,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
});
