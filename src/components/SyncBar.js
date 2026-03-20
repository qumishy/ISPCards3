import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useSync } from '../hooks/useSync';
import { colors, fontSize, spacing } from '../theme';

export default function SyncBar() {
  const { online, pending, syncing, manualSync } = useSync();

  // إذا أونلاين ولا يوجد عمليات معلقة — لا تعرض شيئاً
  if (online && pending === 0 && !syncing) return null;

  const bg = online ? (pending > 0 ? colors.orange : colors.green) : colors.red;
  const icon = online ? (syncing ? '🔄' : pending > 0 ? '📤' : '✅') : '📵';

  const msg = !online
    ? 'أوفلاين — البيانات تُحفظ محلياً'
    : syncing
    ? 'جاري المزامنة...'
    : `${pending} عملية بانتظار الرفع`;

  return (
    <TouchableOpacity
      style={[styles.bar, { backgroundColor: bg + '22', borderBottomColor: bg + '55' }]}
      onPress={online && pending > 0 ? manualSync : undefined}
      activeOpacity={online && pending > 0 ? 0.7 : 1}
    >
      <View style={styles.content}>
        {syncing
          ? <ActivityIndicator size="small" color={bg} style={{ marginLeft: 6 }} />
          : <Text style={styles.icon}>{icon}</Text>
        }
        <Text style={[styles.text, { color: bg }]}>{msg}</Text>
        {online && pending > 0 && !syncing && (
          <View style={[styles.badge, { backgroundColor: bg }]}>
            <Text style={styles.badgeText}>{pending}</Text>
          </View>
        )}
        {online && pending > 0 && !syncing && (
          <Text style={[styles.action, { color: bg }]}>اضغط للمزامنة</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  bar: {
    borderBottomWidth: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  content: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
  },
  icon: { fontSize: 14 },
  text: { flex: 1, fontSize: fontSize.sm, fontWeight: '600' },
  badge: {
    width: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  action: { fontSize: fontSize.xs, fontWeight: '700', opacity: 0.8 },
});
