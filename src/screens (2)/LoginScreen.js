import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  ScrollView, ActivityIndicator,
} from 'react-native';
import { useAuth } from '../services/AuthContext';
import { colors, spacing, radius, fontSize } from '../theme';

export default function LoginScreen() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPass, setShowPass] = useState(false);

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      setError('يرجى إدخال اسم المستخدم وكلمة المرور');
      return;
    }
    setLoading(true);
    setError('');
    const result = await login(username.trim(), password);
    setLoading(false);
    if (!result.success) setError(result.error);
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        {/* Logo */}
        <View style={styles.logoWrap}>
          <View style={styles.logoIcon}>
            <Text style={{ fontSize: 36 }}>🌐</Text>
          </View>
          <Text style={styles.logoTitle}>نظام إدارة الكروت</Text>
          <Text style={styles.logoSub}>تسجيل الدخول</Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>⚠️ {error}</Text>
            </View>
          ) : null}

          <View style={styles.inputGroup}>
            <Text style={styles.label}>اسم المستخدم</Text>
            <View style={styles.inputWrap}>
              <Text style={styles.inputIcon}>👤</Text>
              <TextInput
                style={styles.input}
                value={username}
                onChangeText={setUsername}
                placeholder="أدخل اسم المستخدم"
                placeholderTextColor={colors.t3}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>كلمة المرور</Text>
            <View style={styles.inputWrap}>
              <Text style={styles.inputIcon}>🔒</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="أدخل كلمة المرور"
                placeholderTextColor={colors.t3}
                secureTextEntry={!showPass}
                autoCapitalize="none"
              />
              <TouchableOpacity onPress={() => setShowPass(!showPass)} style={styles.eyeBtn}>
                <Text style={{ fontSize: 16 }}>{showPass ? '🙈' : '👁️'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.loginBtn, loading && styles.loginBtnDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.loginBtnText}>تسجيل الدخول</Text>
            }
          </TouchableOpacity>
        </View>

        {/* Roles hint */}
        <View style={styles.rolesHint}>
          <Text style={styles.rolesTitle}>الأدوار المتاحة</Text>
          {[
            { role: 'مدير عام', icon: '👑', desc: 'صلاحية كاملة' },
            { role: 'محاسب', icon: '💼', desc: 'التحصيلات والتقارير' },
            { role: 'مندوب', icon: '🚗', desc: 'الفواتير والقبض' },
          ].map((r, i) => (
            <View key={i} style={styles.roleItem}>
              <Text style={{ fontSize: 16 }}>{r.icon}</Text>
              <View>
                <Text style={styles.roleName}>{r.role}</Text>
                <Text style={styles.roleDesc}>{r.desc}</Text>
              </View>
            </View>
          ))}
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.xl, paddingTop: 60, flexGrow: 1 },

  logoWrap: { alignItems: 'center', marginBottom: 40 },
  logoIcon: {
    width: 80, height: 80, borderRadius: 20,
    backgroundColor: colors.blue + '22',
    borderWidth: 2, borderColor: colors.blue + '44',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  logoTitle: { fontSize: 22, fontWeight: '800', color: colors.t1, marginBottom: 6 },
  logoSub: { fontSize: fontSize.md, color: colors.t3 },

  form: {
    backgroundColor: colors.card2,
    borderWidth: 1, borderColor: colors.border2,
    borderRadius: radius.xl, padding: spacing.xl,
    marginBottom: spacing.xl,
  },

  errorBox: {
    backgroundColor: colors.red + '15',
    borderWidth: 1, borderColor: colors.red + '44',
    borderRadius: radius.sm, padding: spacing.md,
    marginBottom: spacing.md,
  },
  errorText: { color: colors.red, fontSize: fontSize.sm, fontWeight: '600' },

  inputGroup: { marginBottom: spacing.lg },
  label: { fontSize: fontSize.sm, fontWeight: '700', color: colors.t2, marginBottom: 8 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border2,
    borderRadius: radius.sm, paddingHorizontal: spacing.md,
  },
  inputIcon: { fontSize: 16, marginLeft: spacing.sm },
  input: {
    flex: 1, color: colors.t1, fontSize: fontSize.lg,
    paddingVertical: 13, textAlign: 'right',
  },
  eyeBtn: { padding: spacing.sm },

  loginBtn: {
    backgroundColor: colors.blue, borderRadius: radius.md,
    paddingVertical: 14, alignItems: 'center', marginTop: spacing.sm,
  },
  loginBtnDisabled: { opacity: 0.6 },
  loginBtnText: { color: '#fff', fontSize: fontSize.xl, fontWeight: '800' },

  rolesHint: {
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, padding: spacing.lg,
  },
  rolesTitle: {
    fontSize: fontSize.sm, fontWeight: '700', color: colors.t3,
    marginBottom: spacing.md, textAlign: 'center',
  },
  roleItem: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  roleName: { fontSize: fontSize.md, fontWeight: '700', color: colors.t1 },
  roleDesc: { fontSize: fontSize.xs, color: colors.t3, marginTop: 2 },
});
