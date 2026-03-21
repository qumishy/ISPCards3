import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useSync } from '../hooks/useSync';
import { colors, fontSize, spacing } from '../theme';

export default function SyncBar() {
  const { online, pending, syncing, manualSync } = useSync();

  if (online && pending === 0 && !syncing) return null;

  const bg = online ? (syncing ? colors.blue : pending > 0 ? colors.orange : colors.green) : colors.red;

  let msg = '';
  if (!online) msg = '📵 أوفلاين — البيانات محفوظة محلياً';
  else if (syncing) msg = '🔄 جاري المزامنة...';
  else if (pending > 0) msg = `📤 ${pending} عملية بانتظار الرفع`;

  return (
    <TouchableOpacity
      style={[styles.bar, { backgroundColor: bg + '22', borderBottomColor: bg + '55' }]}
      onPress={online && pending > 0 && !syncing ? manualSync : undefined}
      activeOpacity={online && pending > 0 ? 0.7 : 1}
    >
      <View style={styles.content}>
        {syncing
          ? <ActivityIndicator size="small" color={bg} style={{ marginLeft: 6 }} />
          : null
        }
        <Text style={[styles.text, { color: bg }]}>{msg}</Text>
        {online && pending > 0 && !syncing && (
          <View style={[styles.badge, { backgroundColor: bg }]}>
            <Text style={styles.badgeTxt}>{pending}</Text>
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
  bar: { borderBottomWidth: 1, paddingVertical: spacing.sm, paddingHorizontal: spacing.lg },
  content: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  text: { flex: 1, fontSize: fontSize.sm, fontWeight: '600' },
  badge: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  badgeTxt: { color: '#fff', fontSize: 10, fontWeight: '800' },
  action: { fontSize: fontSize.xs, fontWeight: '700', opacity: 0.8 },
});
