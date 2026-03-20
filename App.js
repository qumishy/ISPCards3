import React from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StatusBar, StyleSheet,
} from 'react-native';
import { AuthProvider } from './src/services/AuthContext';
import AppNavigator from './src/navigation/AppNavigator';

// ── Error Screen ──────────────────────────────────
function ErrorScreen({ error, onReset }) {
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
      <Text style={s.icon}>⚠️</Text>
      <Text style={s.title}>حدث خطأ في التطبيق</Text>
      <View style={s.box}>
        <Text style={s.msg}>{error?.message || 'خطأ غير معروف'}</Text>
        <Text style={s.stack}>{error?.stack?.slice(0, 800)}</Text>
      </View>
      <TouchableOpacity style={s.btn} onPress={onReset}>
        <Text style={s.btnText}>🔄 إعادة التشغيل</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ── Error Boundary ────────────────────────────────
class ErrorBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) {
    console.log('APP ERROR:', error.message);
    console.log('STACK:', error.stack);
  }
  render() {
    if (this.state.error) {
      return (
        <ErrorScreen
          error={this.state.error}
          onReset={() => this.setState({ error: null })}
        />
      );
    }
    return this.props.children;
  }
}

// ── App ───────────────────────────────────────────
export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <View style={{ flex: 1, backgroundColor: '#0a0f1e' }}>
          <StatusBar barStyle="light-content" backgroundColor="#0d1528" />
          <AppNavigator />
        </View>
      </AuthProvider>
    </ErrorBoundary>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0a0f1e' },
  content: { padding: 24, paddingTop: 60, alignItems: 'center' },
  icon: { fontSize: 60, marginBottom: 16 },
  title: { fontSize: 20, fontWeight: '800', color: '#f1f5f9', marginBottom: 20, textAlign: 'center' },
  box: {
    backgroundColor: '#111827', borderWidth: 1, borderColor: '#ef4444',
    borderRadius: 12, padding: 16, width: '100%', marginBottom: 24,
  },
  msg: { fontSize: 14, fontWeight: '700', color: '#ef4444', marginBottom: 10 },
  stack: { fontSize: 9, color: '#94a3b8', lineHeight: 15 },
  btn: { backgroundColor: '#3b82f6', paddingVertical: 13, paddingHorizontal: 36, borderRadius: 10 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
