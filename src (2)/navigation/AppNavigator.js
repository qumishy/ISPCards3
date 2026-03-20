import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { colors } from '../theme';
import { useAuth } from '../services/AuthContext';
import { initDatabase } from '../services/database';

import LoginScreen from '../screens/LoginScreen';
import DashboardScreen from '../screens/DashboardScreen';
import AdminScreen from '../screens/AdminScreen';
import {
  InvoicesScreen, InvoiceDetailScreen, CollectionsScreen,
  InventoryScreen, POSScreen, WalletsScreen,
} from '../screens/MainScreens';
import {
  NewInvoiceScreen, AddInvoiceItemScreen,
  NewCollectionScreen, AddBatchScreen,
  NewPOSScreen, EditPOSScreen,
  AssignWalletScreen,
} from '../screens/FormScreens';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

function TabIcon({ emoji, label, focused }) {
  return (
    <View style={{ alignItems:'center', width:56 }}>
      <View style={{ width:38, height:26, borderRadius:13, alignItems:'center', justifyContent:'center', backgroundColor: focused?colors.blue+'22':'transparent' }}>
        <Text style={{ fontSize:17 }}>{emoji}</Text>
      </View>
      <Text style={{ fontSize:9, fontWeight:focused?'700':'500', color:focused?colors.blue:colors.t3, marginTop:2 }}>{label}</Text>
    </View>
  );
}

const hOpts = (title) => ({
  title,
  headerStyle:{ backgroundColor:colors.bg2, elevation:0, shadowOpacity:0 },
  headerTintColor:colors.t1,
  headerTitleStyle:{ fontWeight:'700', fontSize:16 },
  headerBackTitle:'رجوع',
});

function DashboardStack() {
  return <Stack.Navigator screenOptions={{headerShown:false}}><Stack.Screen name="DashMain" component={DashboardScreen}/></Stack.Navigator>;
}
function InvoicesStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="InvMain" component={InvoicesScreen} options={{headerShown:false}}/>
      <Stack.Screen name="NewInvoice" component={NewInvoiceScreen} options={hOpts('فاتورة جديدة')}/>
      <Stack.Screen name="InvoiceDetail" component={InvoiceDetailScreen} options={hOpts('تفاصيل الفاتورة')}/>
      <Stack.Screen name="AddInvoiceItem" component={AddInvoiceItemScreen} options={hOpts('إضافة بند للفاتورة')}/>
    </Stack.Navigator>
  );
}
function CollectionsStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="ColMain" component={CollectionsScreen} options={{headerShown:false}}/>
      <Stack.Screen name="NewCollection" component={NewCollectionScreen} options={hOpts('إشعار قبض جديد')}/>
    </Stack.Navigator>
  );
}
function InventoryStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="InvtMain" component={InventoryScreen} options={{headerShown:false}}/>
      <Stack.Screen name="AddBatch" component={AddBatchScreen} options={hOpts('إضافة دفعة')}/>
    </Stack.Navigator>
  );
}
function POSStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="POSMain" component={POSScreen} options={{headerShown:false}}/>
      <Stack.Screen name="NewPOS" component={NewPOSScreen} options={hOpts('نقطة بيع جديدة')}/>
      <Stack.Screen name="EditPOS" component={EditPOSScreen} options={hOpts('تعديل نقطة البيع')}/>
    </Stack.Navigator>
  );
}
function WalletsStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="WalMain" component={WalletsScreen} options={{headerShown:false}}/>
      <Stack.Screen name="AssignWallet" component={AssignWalletScreen} options={hOpts('توزيع أوراق على مندوب')}/>
    </Stack.Navigator>
  );
}
function AdminStack() {
  return <Stack.Navigator><Stack.Screen name="AdminMain" component={AdminScreen} options={{headerShown:false}}/></Stack.Navigator>;
}

function MainTabs() {
  const { can } = useAuth();
  return (
    <Tab.Navigator screenOptions={{
      headerShown:false,
      tabBarStyle:{ backgroundColor:colors.bg2, borderTopColor:colors.border, borderTopWidth:1, height:62, paddingBottom:6 },
      tabBarShowLabel:false,
    }}>
      <Tab.Screen name="Dashboard" component={DashboardStack} options={{tabBarIcon:({focused})=><TabIcon emoji="📊" label="الرئيسية" focused={focused}/>}}/>
      {can('canViewInvoices')&&<Tab.Screen name="Invoices" component={InvoicesStack} options={{tabBarIcon:({focused})=><TabIcon emoji="🧾" label="الفواتير" focused={focused}/>}}/>}
      {can('canViewCollections')&&<Tab.Screen name="Collections" component={CollectionsStack} options={{tabBarIcon:({focused})=><TabIcon emoji="💰" label="التحصيلات" focused={focused}/>}}/>}
      {can('canViewInventory')&&<Tab.Screen name="Inventory" component={InventoryStack} options={{tabBarIcon:({focused})=><TabIcon emoji="📦" label="المخزون" focused={focused}/>}}/>}
      {can('canViewPOS')&&<Tab.Screen name="POS" component={POSStack} options={{tabBarIcon:({focused})=><TabIcon emoji="🏪" label="نقاط البيع" focused={focused}/>}}/>}
      <Tab.Screen name="Wallets" component={WalletsStack} options={{tabBarIcon:({focused})=><TabIcon emoji="👜" label="المحفظة" focused={focused}/>}}/>
      {can('canViewAdmin')&&<Tab.Screen name="Admin" component={AdminStack} options={{tabBarIcon:({focused})=><TabIcon emoji="⚙️" label="الإدارة" focused={focused}/>}}/>}
    </Tab.Navigator>
  );
}

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
      {user ? <MainTabs /> : <LoginScreen />}
    </NavigationContainer>
  );
}
