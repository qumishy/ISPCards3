import React from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator,
  StyleSheet, TextInput,
} from 'react-native';
import { colors, spacing, radius, fontSize } from '../theme';
import { statusLabel, statusColor } from '../utils/helpers';

// ── Card ─────────────────────────────────────────
export function Card({ children, style, onPress }) {
  if (onPress) {
    return (
      <TouchableOpacity style={[styles.card, style]} onPress={onPress} activeOpacity={0.8}>
        {children}
      </TouchableOpacity>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

export function CardHeader({ title, subtitle, right }) {
  return (
    <View style={styles.cardHeader}>
      <View style={{ flex: 1 }}>
        <Text style={styles.cardTitle}>{title}</Text>
        {subtitle ? <Text style={styles.cardSub}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

// ── Badge ─────────────────────────────────────────
export function Badge({ status, label }) {
  const col = statusColor(status);
  const lbl = label || statusLabel(status);
  return (
    <View style={[styles.badge, { backgroundColor: col + '22', borderColor: col + '44' }]}>
      <View style={[styles.badgeDot, { backgroundColor: col }]} />
      <Text style={[styles.badgeText, { color: col }]}>{lbl}</Text>
    </View>
  );
}

// ── Button ────────────────────────────────────────
export function Btn({ label, onPress, variant = 'primary', size = 'md', icon, disabled, style }) {
  const bg = {
    primary: colors.blue, success: colors.green,
    danger: colors.red, outline: 'transparent', ghost: 'transparent',
  }[variant];
  const tc = (variant === 'outline' || variant === 'ghost') ? colors.t2 : '#fff';
  const border = variant === 'outline' ? colors.border2 : 'transparent';
  const pad = size === 'sm' ? { paddingVertical: 6, paddingHorizontal: 12 }
    : size === 'xs' ? { paddingVertical: 4, paddingHorizontal: 8 }
    : { paddingVertical: 10, paddingHorizontal: 18 };
  const fs = size === 'sm' || size === 'xs' ? fontSize.sm : fontSize.md;

  return (
    <TouchableOpacity
      style={[styles.btn, { backgroundColor: bg, borderColor: border, borderWidth: 1, ...pad }, style]}
      onPress={onPress} disabled={disabled} activeOpacity={0.8}
    >
      {icon ? <Text style={{ fontSize: fs + 2, marginLeft: 4 }}>{icon}</Text> : null}
      <Text style={[styles.btnText, { color: tc, fontSize: fs }]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ── Input ─────────────────────────────────────────
export function Input({ label, value, onChangeText, placeholder, keyboardType, multiline, style }) {
  return (
    <View style={[{ marginBottom: spacing.md }, style]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        style={[styles.input, multiline && { height: 80, textAlignVertical: 'top' }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.t3}
        keyboardType={keyboardType || 'default'}
        multiline={multiline}
      />
    </View>
  );
}

// ── Loading ───────────────────────────────────────
export function Loading({ text = 'جاري التحميل...' }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.blue} size="large" />
      <Text style={styles.loadingText}>{text}</Text>
    </View>
  );
}

// ── Empty State ───────────────────────────────────
export function Empty({ icon = '📭', title, sub, action, onAction }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyIcon}>{icon}</Text>
      <Text style={styles.emptyTitle}>{title}</Text>
      {sub ? <Text style={styles.emptySub}>{sub}</Text> : null}
      {action ? <Btn label={action} onPress={onAction} style={{ marginTop: spacing.lg }} /> : null}
    </View>
  );
}

// ── Section Header ────────────────────────────────
export function SectionHeader({ title, right }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {right}
    </View>
  );
}

// ── Progress Bar ──────────────────────────────────
export function ProgressBar({ percent, color = colors.blue, height = 5 }) {
  return (
    <View style={[styles.progressTrack, { height }]}>
      <View style={[styles.progressFill, {
        width: percent + '%', backgroundColor: color, height,
      }]} />
    </View>
  );
}

// ── Divider ───────────────────────────────────────
export function Divider() {
  return <View style={styles.divider} />;
}

// ── Row ───────────────────────────────────────────
export function Row({ children, style }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center' }, style]}>{children}</View>;
}

// ── KPI Card ──────────────────────────────────────
export function KpiCard({ value, label, color = colors.t1, style }) {
  return (
    <View style={[styles.kpiCard, style]}>
      <Text style={[styles.kpiValue, { color }]}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.lg, marginBottom: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row', alignItems: 'center',
    padding: spacing.lg, paddingBottom: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  cardTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.t1 },
  cardSub: { fontSize: fontSize.xs, color: colors.t3, marginTop: 2 },

  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: 3, paddingHorizontal: 8,
    borderRadius: radius.full, borderWidth: 1,
    alignSelf: 'flex-start',
  },
  badgeDot: { width: 5, height: 5, borderRadius: 3 },
  badgeText: { fontSize: fontSize.xs, fontWeight: '700' },

  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: radius.sm, gap: 4,
  },
  btnText: { fontWeight: '700' },

  label: { fontSize: fontSize.sm, fontWeight: '700', color: colors.t2, marginBottom: 5 },
  input: {
    backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border2,
    borderRadius: radius.sm, padding: spacing.md,
    color: colors.t1, fontSize: fontSize.md,
    textAlign: 'right',
  },

  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xxl },
  loadingText: { color: colors.t3, fontSize: fontSize.md },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyIcon: { fontSize: 44, marginBottom: spacing.md },
  emptyTitle: { fontSize: fontSize.xl, fontWeight: '700', color: colors.t2, marginBottom: spacing.sm, textAlign: 'center' },
  emptySub: { fontSize: fontSize.sm, color: colors.t3, textAlign: 'center' },

  sectionHeader: {
    flexDirection: 'row', alignItems: 'center',
    marginBottom: spacing.sm, marginTop: spacing.sm,
  },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: '800', color: colors.t1, flex: 1 },

  progressTrack: { backgroundColor: colors.border, borderRadius: 3, overflow: 'hidden' },
  progressFill: { borderRadius: 3 },

  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },

  kpiCard: {
    flex: 1, backgroundColor: colors.card,
    borderRadius: radius.md, padding: spacing.md,
    alignItems: 'center', borderWidth: 1, borderColor: colors.border,
  },
  kpiValue: { fontSize: fontSize.xxl, fontWeight: '800' },
  kpiLabel: { fontSize: fontSize.xs, color: colors.t3, marginTop: 3, textAlign: 'center' },
});
