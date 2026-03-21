import React, { useEffect, useState } from 'react';
import {
  View, Text, ActivityIndicator, TouchableOpacity,
  Alert, StyleSheet, ScrollView,
} from 'react-native';
import { NavigationContainer, DrawerActions } from '@react-navigation/native';
import { createDrawerNavigator, DrawerContentScrollView } from '@react-navigation/drawer';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { colors, fontSize, spacing, radius } from '../theme';
import { useAuth } from '../services/AuthContext';
import { initDatabase } from '../services/database';

import LoginScreen from '../screens/LoginScreen';
import DashboardScreen from '../screens/DashboardScreen';
import AdminScreen from '../screens/AdminScreen';
import CashierScreen from '../screens/CashierScreen';
import ReportsScreen from '../screens/ReportsScreen';
import SettingsScreen from '../screens/SettingsScreen';
import {
  InvoicesScreen, CollectionsScreen,
  InventoryScreen, POSScreen, WalletsScreen,
} from '../screens/MainScreens';
import {
  InvoiceDetailScreen, NewInvoiceScreen,
  NewCollectionScreen, AddBatchScreen,
  NewPOSScreen, EditPOSScreen, AssignWalletScreen,
} from '../screens/FormScreens';

const Drawer = createDrawerNavigator();
const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

// ── زر الخروج ─────────────────────────────────────
function LogoutButton() {
  const { logout, user } = useAuth();
  return (
    <TouchableOpacity
      onPress={() => Alert.alert('تسجيل الخروج', `هل تريد الخروج؟\n${user?.name||''}`, [
        { text:'إلغاء', style:'cancel' },
        { text:'🚪 خروج', style:'destructive', onPress: logout },
      ])}
      style={{ marginLeft:14, padding:8 }}
    >
      <Text style={{ fontSize:20 }}>🚪</Text>
    </TouchableOpacity>
  );
}

function MenuButton({ navigation }) {
  return (
    <TouchableOpacity
      onPress={() => navigation.dispatch(DrawerActions.openDrawer())}
      style={{ marginRight:14, padding:8 }}
    >
      <Text style={{ fontSize:22, color:colors.t1 }}>☰</Text>
    </TouchableOpacity>
  );
}

function hMain(title, navigation) {
  return {
    title,
    headerStyle:{ backgroundColor:colors.bg2, elevation:0, shadowOpacity:0 },
    headerTintColor:colors.t1,
    headerTitleStyle:{ fontWeight:'700', fontSize:15 },
    headerRight: () => <LogoutButton />,
    headerLeft: () => <MenuButton navigation={navigation} />,
  };
}
const hSub = (title) => ({
  title,
  headerStyle:{ backgroundColor:colors.bg2, elevation:0, shadowOpacity:0 },
  headerTintColor:colors.t1,
  headerTitleStyle:{ fontWeight:'700', fontSize:15 },
  headerBackTitle:'رجوع',
});

// ══════════════════════════════════════════════════
// القائمة الجانبية
// ══════════════════════════════════════════════════
function CustomDrawer({ navigation, state }) {
  const { user, logout, can } = useAuth();
  const roleColors = { admin:colors.purple, cashier:colors.blue, agent:colors.green };
  const roleLabels = { admin:'مدير عام', cashier:'محاسب', agent:'مندوب' };

  const items = [
    { key:'HomeTab',     icon:'📊', label:'الرئيسية',            show:true },
    { key:'Invoices',    icon:'🧾', label:'الفواتير',             show:can('canViewInvoices') },
    { key:'Collections', icon:'💰', label:'التحصيلات',            show:can('canCreateCollection') },
    { key:'Cashier',     icon:'💼', label:'اعتماد التحصيلات',     show:can('canApproveCollection') },
    { key:'Inventory',   icon:'📦', label:'المخزون',              show:can('canViewInventory') },
    { key:'POS',         icon:'🏪', label:'نقاط البيع',           show:can('canViewPOS') },
    { key:'Wallets',     icon:'👜', label:'المحافظ',              show:true },
    { key:'Reports',     icon:'📈', label:'الاستعلامات',          show:true },
    { key:'Admin',       icon:'⚙️', label:'الإدارة',              show:can('canViewAdmin') },
    { key:'Settings',    icon:'🔧', label:'الإعدادات',            show:true },
  ].filter(i => i.show);

  const activeRoute = state?.routeNames?.[state?.index] || 'HomeTab';
  const roleColor = roleColors[user?.role] || colors.blue;

  return (
    <View style={ds.drawer}>
      <View style={ds.drawerHeader}>
        <View style={[ds.avatar,{backgroundColor:roleColor+'33'}]}>
          <Text style={[ds.avatarTxt,{color:roleColor}]}>{user?.name?.charAt(0)||'؟'}</Text>
        </View>
        <View style={{flex:1}}>
          <Text style={ds.userName}>{user?.name||'مستخدم'}</Text>
          <Text style={[ds.userRole,{color:roleColor}]}>{roleLabels[user?.role]||user?.role}</Text>
        </View>
      </View>

      <ScrollView style={{flex:1}} showsVerticalScrollIndicator={false}>
        <Text style={ds.sectionLabel}>القوائم</Text>
        {items.map(item => {
          const active = activeRoute === item.key;
          return (
            <TouchableOpacity key={item.key}
              style={[ds.menuItem, active&&ds.menuItemActive]}
              onPress={()=>{navigation.navigate(item.key);navigation.closeDrawer();}}
              activeOpacity={0.7}>
              {active&&<View style={ds.activeBar}/>}
              <Text style={ds.menuIcon}>{item.icon}</Text>
              <Text style={[ds.menuLabel,active&&ds.menuLabelActive]}>{item.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <TouchableOpacity style={ds.logoutBtn}
        onPress={()=>Alert.alert('تسجيل الخروج','هل تريد الخروج؟',[
          {text:'إلغاء',style:'cancel'},
          {text:'🚪 خروج',style:'destructive',onPress:logout},
        ])}>
        <Text style={{fontSize:18}}>🚪</Text>
        <Text style={ds.logoutTxt}>تسجيل الخروج</Text>
      </TouchableOpacity>
    </View>
  );
}

// ══════════════════════════════════════════════════
// الشريط السفلي: Dashboard + فواتير + قبوض + اعتماد
// ══════════════════════════════════════════════════
function TabIcon({ emoji, label, focused }) {
  return (
    <View style={{alignItems:'center',width:72}}>
      <View style={{width:44,height:30,borderRadius:15,alignItems:'center',justifyContent:'center',backgroundColor:focused?colors.blue+'22':'transparent'}}>
        <Text style={{fontSize:19}}>{emoji}</Text>
      </View>
      <Text style={{fontSize:10,fontWeight:focused?'700':'500',color:focused?colors.blue:colors.t3,marginTop:2}}>{label}</Text>
    </View>
  );
}

function DashboardStack({ navigation }) {
  return (
    <Stack.Navigator>
      <Stack.Screen name="DashMain" component={DashboardScreen} options={hMain('الرئيسية 📊',navigation)}/>
    </Stack.Navigator>
  );
}
function InvoicesTabStack({ navigation }) {
  return (
    <Stack.Navigator>
      <Stack.Screen name="InvMain" component={InvoicesScreen} options={hMain('الفواتير 🧾',navigation)}/>
      <Stack.Screen name="NewInvoice" component={NewInvoiceScreen} options={hSub('فاتورة جديدة')}/>
      <Stack.Screen name="InvoiceDetail" component={InvoiceDetailScreen} options={hSub('تفاصيل الفاتورة')}/>
    </Stack.Navigator>
  );
}
function CollectionsTabStack({ navigation }) {
  return (
    <Stack.Navigator>
      <Stack.Screen name="ColMain" component={CollectionsScreen} options={hMain('التحصيلات 💰',navigation)}/>
      <Stack.Screen name="NewCollection" component={NewCollectionScreen} options={hSub('إشعار قبض')}/>
    </Stack.Navigator>
  );
}
function CashierTabStack({ navigation }) {
  return (
    <Stack.Navigator>
      <Stack.Screen name="CashierMain" component={CashierScreen} options={hMain('اعتماد التحصيلات 💼',navigation)}/>
    </Stack.Navigator>
  );
}

function BottomTabs({ navigation: drawerNav }) {
  const { can } = useAuth();
  return (
    <Tab.Navigator screenOptions={{
      headerShown:false,
      tabBarStyle:{backgroundColor:colors.bg2,borderTopColor:colors.border,borderTopWidth:1,height:64,paddingBottom:6},
      tabBarShowLabel:false,
    }}>
      <Tab.Screen name="DashTab" component={DashboardStack}
        options={{tabBarIcon:({focused})=><TabIcon emoji="📊" label="الرئيسية" focused={focused}/>}}/>
      {can('canViewInvoices')&&(
        <Tab.Screen name="InvoicesTab" component={InvoicesTabStack}
          options={{tabBarIcon:({focused})=><TabIcon emoji="🧾" label="الفواتير" focused={focused}/>}}/>
      )}
      {can('canCreateCollection')&&(
        <Tab.Screen name="CollectionsTab" component={CollectionsTabStack}
          options={{tabBarIcon:({focused})=><TabIcon emoji="💰" label="التحصيلات" focused={focused}/>}}/>
      )}
      {can('canApproveCollection')&&(
        <Tab.Screen name="CashierTab" component={CashierTabStack}
          options={{tabBarIcon:({focused})=><TabIcon emoji="💼" label="الاعتماد" focused={focused}/>}}/>
      )}
    </Tab.Navigator>
  );
}

// ══════════════════════════════════════════════════
// Stacks للقائمة الجانبية
// ══════════════════════════════════════════════════
function InvoicesStack({ navigation }) {
  return (
    <Stack.Navigator>
      <Stack.Screen name="InvMain" component={InvoicesScreen} options={hMain('الفواتير 🧾',navigation)}/>
      <Stack.Screen name="NewInvoice" component={NewInvoiceScreen} options={hSub('فاتورة جديدة')}/>
      <Stack.Screen name="InvoiceDetail" component={InvoiceDetailScreen} options={hSub('تفاصيل الفاتورة')}/>
    </Stack.Navigator>
  );
}
function CollectionsStack({ navigation }) {
  return (
    <Stack.Navigator>
      <Stack.Screen name="ColMain" component={CollectionsScreen} options={hMain('التحصيلات 💰',navigation)}/>
      <Stack.Screen name="NewCollection" component={NewCollectionScreen} options={hSub('إشعار قبض')}/>
    </Stack.Navigator>
  );
}
function CashierStack({ navigation }) {
  return (
    <Stack.Navigator>
      <Stack.Screen name="CashierMain" component={CashierScreen} options={hMain('اعتماد التحصيلات 💼',navigation)}/>
    </Stack.Navigator>
  );
}
function InventoryStack({ navigation }) {
  return (
    <Stack.Navigator>
      <Stack.Screen name="InvtMain" component={InventoryScreen} options={hMain('المخزون 📦',navigation)}/>
      <Stack.Screen name="AddBatch" component={AddBatchScreen} options={hSub('إضافة دفعة')}/>
    </Stack.Navigator>
  );
}
function POSStack({ navigation }) {
  return (
    <Stack.Navigator>
      <Stack.Screen name="POSMain" component={POSScreen} options={hMain('نقاط البيع 🏪',navigation)}/>
      <Stack.Screen name="NewPOS" component={NewPOSScreen} options={hSub('نقطة بيع جديدة')}/>
      <Stack.Screen name="EditPOS" component={EditPOSScreen} options={hSub('تعديل نقطة البيع')}/>
    </Stack.Navigator>
  );
}
function WalletsStack({ navigation }) {
  return (
    <Stack.Navigator>
      <Stack.Screen name="WalMain" component={WalletsScreen} options={hMain('المحافظ 👜',navigation)}/>
      <Stack.Screen name="AssignWallet" component={AssignWalletScreen} options={hSub('توزيع أوراق')}/>
    </Stack.Navigator>
  );
}
function ReportsStack({ navigation }) {
  return (
    <Stack.Navigator>
      <Stack.Screen name="RepMain" component={ReportsScreen} options={hMain('الاستعلامات 📈',navigation)}/>
    </Stack.Navigator>
  );
}
function AdminStack({ navigation }) {
  return (
    <Stack.Navigator>
      <Stack.Screen name="AdminMain" component={AdminScreen} options={hMain('الإدارة ⚙️',navigation)}/>
      <Stack.Screen name="NewPOS" component={NewPOSScreen} options={hSub('نقطة بيع جديدة')}/>
      <Stack.Screen name="EditPOS" component={EditPOSScreen} options={hSub('تعديل نقطة البيع')}/>
    </Stack.Navigator>
  );
}
function SettingsStack({ navigation }) {
  return (
    <Stack.Navigator>
      <Stack.Screen name="SettingsMain" component={SettingsScreen} options={hMain('الإعدادات 🔧',navigation)}/>
    </Stack.Navigator>
  );
}

// ══════════════════════════════════════════════════
// Drawer الرئيسي
// ══════════════════════════════════════════════════
function MainDrawer() {
  const { can } = useAuth();
  return (
    <Drawer.Navigator
      drawerContent={(props) => <CustomDrawer {...props} />}
      screenOptions={{
        headerShown:false,
        drawerPosition:'right',
        drawerStyle:{ width:285, backgroundColor:colors.bg2 },
        swipeEnabled:true,
        swipeEdgeWidth:60,
      }}
    >
      <Drawer.Screen name="HomeTab"     component={BottomTabs}/>
      <Drawer.Screen name="Invoices"    component={InvoicesStack}/>
      <Drawer.Screen name="Collections" component={CollectionsStack}/>
      <Drawer.Screen name="Cashier"     component={CashierStack}/>
      <Drawer.Screen name="Inventory"   component={InventoryStack}/>
      <Drawer.Screen name="POS"         component={POSStack}/>
      <Drawer.Screen name="Wallets"     component={WalletsStack}/>
      <Drawer.Screen name="Reports"     component={ReportsStack}/>
      <Drawer.Screen name="Admin"       component={AdminStack}/>
      <Drawer.Screen name="Settings"    component={SettingsStack}/>
    </Drawer.Navigator>
  );
}

// ══════════════════════════════════════════════════
// Root
// ══════════════════════════════════════════════════
export default function AppNavigator() {
  const { user, loading } = useAuth();
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => {
      initDatabase()
        .then(() => setDbReady(true))
        .catch(e => { setDbError(e.message); setDbReady(true); });
    }, 800);
    return () => clearTimeout(t);
  }, []);

  if (loading || !dbReady) {
    return (
      <View style={{flex:1,backgroundColor:colors.bg,alignItems:'center',justifyContent:'center'}}>
        <ActivityIndicator color={colors.blue} size="large"/>
        <Text style={{color:colors.t3,marginTop:12,fontSize:13}}>جاري التحميل...</Text>
      </View>
    );
  }

  if (dbError) {
    return (
      <View style={{flex:1,backgroundColor:colors.bg,alignItems:'center',justifyContent:'center',padding:24}}>
        <Text style={{fontSize:40,marginBottom:16}}>⚠️</Text>
        <Text style={{color:'#ef4444',fontWeight:'700',fontSize:16,marginBottom:12,textAlign:'center'}}>خطأ في قاعدة البيانات</Text>
        <Text style={{color:'#94a3b8',fontSize:11,textAlign:'center'}}>{dbError}</Text>
      </View>
    );
  }

  return (
    <NavigationContainer>
      {user ? <MainDrawer /> : <LoginScreen />}
    </NavigationContainer>
  );
}

// ── Styles القائمة الجانبية ────────────────────────
const ds = StyleSheet.create({
  drawer:{flex:1,backgroundColor:colors.bg2},
  drawerHeader:{flexDirection:'row',alignItems:'center',gap:spacing.md,padding:spacing.xl,paddingTop:52,borderBottomWidth:1,borderBottomColor:colors.border,backgroundColor:colors.card},
  avatar:{width:50,height:50,borderRadius:25,alignItems:'center',justifyContent:'center'},
  avatarTxt:{fontSize:22,fontWeight:'800'},
  userName:{fontSize:fontSize.xl,fontWeight:'800',color:colors.t1},
  userRole:{fontSize:fontSize.xs,fontWeight:'600',marginTop:3},
  sectionLabel:{fontSize:fontSize.xs,fontWeight:'700',color:colors.t3,letterSpacing:1.5,paddingHorizontal:spacing.xl,paddingTop:spacing.lg,paddingBottom:spacing.sm},
  menuItem:{flexDirection:'row',alignItems:'center',gap:spacing.md,paddingVertical:13,paddingHorizontal:spacing.xl,marginHorizontal:spacing.sm,borderRadius:radius.md,position:'relative'},
  menuItemActive:{backgroundColor:colors.blue+'18'},
  activeBar:{position:'absolute',right:0,top:'15%',bottom:'15%',width:3,backgroundColor:colors.blue,borderRadius:2},
  menuIcon:{fontSize:18,width:26,textAlign:'center'},
  menuLabel:{fontSize:fontSize.lg,fontWeight:'500',color:colors.t2,flex:1},
  menuLabelActive:{color:colors.blue,fontWeight:'700'},
  logoutBtn:{flexDirection:'row',alignItems:'center',gap:spacing.md,padding:spacing.xl,borderTopWidth:1,borderTopColor:colors.border},
  logoutTxt:{fontSize:fontSize.lg,fontWeight:'700',color:colors.red},
});
