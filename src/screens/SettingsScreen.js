import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Switch, Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, spacing, radius, fontSize } from '../theme';
import { useAuth, ROLE_PERMISSIONS } from '../services/AuthContext';
import { execSQL, getSyncQueueCount } from '../services/database';
import { syncAll } from '../services/SyncService';
import { Row, Btn } from '../components/UI';

const SETTINGS_KEY = 'isp_app_settings';

const defaultSettings = {
  currency: 'ر.ي',
  dateFormat: 'DD/MM/YYYY',
  language: 'ar',
  rtl: true,
  darkMode: true,
  showSyncBar: true,
  defaultInvoiceType: 'credit',
  notifications: true,
  autoSync: true,
  companyName: 'نظام الكروت',
};

export default function SettingsScreen() {
  const { user, logout } = useAuth();
  const [settings, setSettings] = useState(defaultSettings);
  const [pendingSync, setPendingSync] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [dbInfo, setDbInfo] = useState({});

  useEffect(() => {
    loadSettings();
    loadDbInfo();
  }, []);

  const loadSettings = async () => {
    try {
      const stored = await AsyncStorage.getItem(SETTINGS_KEY);
      if (stored) setSettings({ ...defaultSettings, ...JSON.parse(stored) });
    } catch(e) {}
  };

  const saveSettings = async (newSettings) => {
    setSettings(newSettings);
    try {
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(newSettings));
    } catch(e) {}
  };

  const toggle = (key) => saveSettings({ ...settings, [key]: !settings[key] });
  const setValue = (key, value) => saveSettings({ ...settings, [key]: value });

  const loadDbInfo = async () => {
    try {
      const [invR, colR, posR, walR, qR] = await Promise.all([
        execSQL('SELECT COUNT(*) as cnt FROM invoices WHERE active=1'),
        execSQL('SELECT COUNT(*) as cnt FROM collections WHERE active=1'),
        execSQL('SELECT COUNT(*) as cnt FROM pos_customers WHERE active=1'),
        execSQL('SELECT COUNT(*) as cnt FROM agent_wallets WHERE active=1'),
        execSQL('SELECT COUNT(*) as cnt FROM sync_queue'),
      ]);
      setDbInfo({
        invoices: invR.rows._array[0]?.cnt||0,
        collections: colR.rows._array[0]?.cnt||0,
        pos: posR.rows._array[0]?.cnt||0,
        wallets: walR.rows._array[0]?.cnt||0,
        queue: qR.rows._array[0]?.cnt||0,
      });
      setPendingSync(qR.rows._array[0]?.cnt||0);
    } catch(e) {}
  };

  const handleManualSync = async () => {
    setSyncing(true);
    await syncAll();
    await loadDbInfo();
    setSyncing(false);
    Alert.alert('✅ تمت المزامنة','تم مزامنة البيانات مع الخادم');
  };

  const handleClearQueue = () => {
    Alert.alert('مسح طابور المزامنة','هل تريد مسح العمليات المعلقة؟',[
      {text:'إلغاء',style:'cancel'},
      {text:'مسح',style:'destructive',onPress:async()=>{
        await execSQL('DELETE FROM sync_queue');
        loadDbInfo();
        Alert.alert('✅ تم','تم مسح طابور المزامنة');
      }},
    ]);
  };

  const roleColor = { admin:colors.purple, cashier:colors.blue, agent:colors.green }[user?.role]||colors.blue;

  return (
    <ScrollView style={s.screen} contentContainerStyle={{ padding:spacing.md, paddingBottom:90 }}>

      {/* ══ معلومات المستخدم ══ */}
      <View style={s.userCard}>
        <View style={[s.userAvatar, { backgroundColor: roleColor+'33' }]}>
          <Text style={[s.userAvatarTxt, { color: roleColor }]}>{user?.name?.charAt(0)||'؟'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.userName}>{user?.name||'مستخدم'}</Text>
          <Text style={{ fontSize:fontSize.xs, color:roleColor, fontWeight:'600', marginTop:3 }}>
            {ROLE_PERMISSIONS[user?.role]?.label||user?.role}
          </Text>
          <Text style={{ fontSize:fontSize.xs, color:colors.t3, marginTop:2 }}>@{user?.username}</Text>
        </View>
        <TouchableOpacity style={s.logoutBtn} onPress={() =>
          Alert.alert('تسجيل الخروج','هل تريد الخروج؟',[
            {text:'إلغاء',style:'cancel'},
            {text:'🚪 خروج',style:'destructive',onPress:logout},
          ])
        }>
          <Text style={s.logoutTxt}>🚪 خروج</Text>
        </TouchableOpacity>
      </View>

      {/* ══ مزامنة البيانات ══ */}
      <Text style={s.sectionTitle}>🔄 المزامنة</Text>
      <View style={s.section}>
        <Row style={s.row}>
          <Text style={s.rowLabel}>عمليات معلقة</Text>
          <View style={[s.badge, {backgroundColor: pendingSync>0?colors.orange+'22':colors.green+'22'}]}>
            <Text style={{color:pendingSync>0?colors.orange:colors.green,fontWeight:'700',fontSize:fontSize.sm}}>{pendingSync}</Text>
          </View>
        </Row>
        <Row style={s.row}>
          <Text style={s.rowLabel}>مزامنة تلقائية</Text>
          <Switch value={settings.autoSync} onValueChange={()=>toggle('autoSync')}
            trackColor={{false:colors.border2,true:colors.blue+'66'}} thumbColor={settings.autoSync?colors.blue:colors.t3}/>
        </Row>
        <Btn label={syncing?'جاري المزامنة...':'🔄 مزامنة الآن'}
          variant="primary" size="sm" onPress={handleManualSync} disabled={syncing}
          style={{marginTop:spacing.sm}}/>
        {pendingSync>0&&(
          <Btn label="🗑️ مسح طابور المزامنة"
            variant="danger" size="sm" onPress={handleClearQueue}
            style={{marginTop:spacing.xs}}/>
        )}
      </View>

      {/* ══ إعدادات العرض ══ */}
      <Text style={s.sectionTitle}>🎨 إعدادات العرض</Text>
      <View style={s.section}>
        <Row style={s.row}>
          <Text style={s.rowLabel}>الوضع الداكن</Text>
          <Switch value={settings.darkMode} onValueChange={()=>toggle('darkMode')}
            trackColor={{false:colors.border2,true:colors.blue+'66'}} thumbColor={settings.darkMode?colors.blue:colors.t3}/>
        </Row>
        <Row style={s.row}>
          <Text style={s.rowLabel}>شريط حالة المزامنة</Text>
          <Switch value={settings.showSyncBar} onValueChange={()=>toggle('showSyncBar')}
            trackColor={{false:colors.border2,true:colors.blue+'66'}} thumbColor={settings.showSyncBar?colors.blue:colors.t3}/>
        </Row>
        <View style={s.row}>
          <Text style={[s.rowLabel,{marginBottom:spacing.sm}]}>العملة</Text>
          <Row style={{gap:spacing.sm}}>
            {['ر.ي','USD','SAR'].map(c=>(
              <TouchableOpacity key={c}
                style={[s.optBtn, settings.currency===c&&s.optBtnActive]}
                onPress={()=>setValue('currency',c)}>
                <Text style={[s.optTxt,settings.currency===c&&{color:colors.blue,fontWeight:'700'}]}>{c}</Text>
              </TouchableOpacity>
            ))}
          </Row>
        </View>
        <View style={s.row}>
          <Text style={[s.rowLabel,{marginBottom:spacing.sm}]}>نوع الفاتورة الافتراضي</Text>
          <Row style={{gap:spacing.sm}}>
            {[{v:'credit',l:'آجل'},{v:'cash',l:'نقدي'}].map(opt=>(
              <TouchableOpacity key={opt.v}
                style={[s.optBtn, settings.defaultInvoiceType===opt.v&&s.optBtnActive]}
                onPress={()=>setValue('defaultInvoiceType',opt.v)}>
                <Text style={[s.optTxt,settings.defaultInvoiceType===opt.v&&{color:colors.blue,fontWeight:'700'}]}>{opt.l}</Text>
              </TouchableOpacity>
            ))}
          </Row>
        </View>
      </View>

      {/* ══ الإشعارات ══ */}
      <Text style={s.sectionTitle}>🔔 الإشعارات</Text>
      <View style={s.section}>
        <Row style={s.row}>
          <Text style={s.rowLabel}>تفعيل الإشعارات</Text>
          <Switch value={settings.notifications} onValueChange={()=>toggle('notifications')}
            trackColor={{false:colors.border2,true:colors.blue+'66'}} thumbColor={settings.notifications?colors.blue:colors.t3}/>
        </Row>
      </View>

      {/* ══ إحصائيات قاعدة البيانات ══ */}
      <Text style={s.sectionTitle}>🗄️ قاعدة البيانات المحلية</Text>
      <View style={s.section}>
        {[
          {l:'الفواتير', v:dbInfo.invoices||0, icon:'🧾'},
          {l:'التحصيلات', v:dbInfo.collections||0, icon:'💰'},
          {l:'نقاط البيع', v:dbInfo.pos||0, icon:'🏪'},
          {l:'المحافظ', v:dbInfo.wallets||0, icon:'👜'},
        ].map((item,i)=>(
          <Row key={i} style={[s.row, i===3&&{borderBottomWidth:0}]}>
            <Text style={s.rowLabel}>{item.icon} {item.l}</Text>
            <Text style={{color:colors.cyan,fontWeight:'700',fontSize:fontSize.md}}>{item.v} سجل</Text>
          </Row>
        ))}
      </View>

      {/* ══ معلومات التطبيق ══ */}
      <Text style={s.sectionTitle}>ℹ️ عن التطبيق</Text>
      <View style={s.section}>
        {[
          {l:'اسم التطبيق', v:'نظام كروت الإنترنت'},
          {l:'الإصدار', v:'1.0.0'},
          {l:'العملة', v:'ريال يمني (ر.ي)'},
          {l:'الدولة', v:'الجمهورية اليمنية'},
        ].map((item,i)=>(
          <Row key={i} style={[s.row, i===3&&{borderBottomWidth:0}]}>
            <Text style={s.rowLabel}>{item.l}</Text>
            <Text style={{color:colors.t2,fontSize:fontSize.sm}}>{item.v}</Text>
          </Row>
        ))}
      </View>

    </ScrollView>
  );
}

const s = StyleSheet.create({
  screen:{flex:1,backgroundColor:colors.bg},
  userCard:{flexDirection:'row',alignItems:'center',gap:spacing.md,backgroundColor:colors.card,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,padding:spacing.lg,marginBottom:spacing.lg},
  userAvatar:{width:52,height:52,borderRadius:26,alignItems:'center',justifyContent:'center'},
  userAvatarTxt:{fontSize:22,fontWeight:'800'},
  userName:{fontSize:fontSize.xl,fontWeight:'800',color:colors.t1},
  logoutBtn:{backgroundColor:colors.red+'15',borderRadius:radius.sm,padding:spacing.sm,paddingHorizontal:spacing.md},
  logoutTxt:{color:colors.red,fontWeight:'700',fontSize:fontSize.sm},
  sectionTitle:{fontSize:fontSize.sm,fontWeight:'700',color:colors.t3,letterSpacing:1,marginBottom:spacing.sm,marginTop:spacing.md,paddingHorizontal:spacing.xs},
  section:{backgroundColor:colors.card,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,paddingHorizontal:spacing.md,marginBottom:spacing.sm},
  row:{justifyContent:'space-between',alignItems:'center',paddingVertical:spacing.md,borderBottomWidth:1,borderBottomColor:colors.border},
  rowLabel:{fontSize:fontSize.md,color:colors.t2,flex:1},
  badge:{paddingHorizontal:spacing.md,paddingVertical:spacing.xs,borderRadius:radius.full},
  optBtn:{paddingHorizontal:spacing.md,paddingVertical:spacing.sm,borderRadius:radius.sm,borderWidth:1,borderColor:colors.border2,backgroundColor:colors.bg},
  optBtnActive:{borderColor:colors.blue,backgroundColor:colors.blue+'11'},
  optTxt:{fontSize:fontSize.sm,color:colors.t2},
});
