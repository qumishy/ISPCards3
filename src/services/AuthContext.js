import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { startNetworkMonitor, stopNetworkMonitor, isOnline } from './SyncService';

const AuthContext = createContext(null);

export const ROLE_PERMISSIONS = {
  admin: {
    label:'مدير عام',
    canViewDashboard:true, canViewInvoices:true, canCreateInvoice:true,
    canViewCollections:true, canApproveCollection:true, canCreateCollection:true,
    canViewInventory:true, canManageInventory:true,
    canViewPOS:true, canManagePOS:true,
    canViewReports:true, canViewAdmin:true,
    canManageUsers:true, canManageSettings:true, canManageWallets:true,
    canDeleteInvoice:true,
  },
  cashier: {
    label:'محاسب / مدير صندوق',
    canViewDashboard:true, canViewInvoices:true, canCreateInvoice:false,
    canViewCollections:true, canApproveCollection:true, canCreateCollection:false,
    canViewInventory:true, canManageInventory:false,
    canViewPOS:true, canManagePOS:false,
    canViewReports:true, canViewAdmin:false,
    canManageUsers:false, canManageSettings:false, canManageWallets:true,
    canDeleteInvoice:false,
  },
  agent: {
    label:'مندوب مبيعات',
    canViewDashboard:true, canViewInvoices:true, canCreateInvoice:true,
    canViewCollections:true, canApproveCollection:false, canCreateCollection:true,
    canViewInventory:true, canManageInventory:false,
    canViewPOS:true, canManagePOS:false,
    canViewReports:false, canViewAdmin:false,
    canManageUsers:false, canManageSettings:false, canManageWallets:false,
    canDeleteInvoice:false,
  },
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    startNetworkMonitor(()=>{});
    AsyncStorage.getItem('isp_user').then(stored => {
      if (stored) { try { setUser(JSON.parse(stored)); } catch(e) {} }
      setLoading(false);
    });
    return () => stopNetworkMonitor();
  }, []);

  const login = async (username, password) => {
    if (!isOnline()) {
      try {
        const cached = await AsyncStorage.getItem('isp_user_cache');
        if (cached) {
          const users = JSON.parse(cached);
          const u = users.find(x => x.username===username && x.password_hash===password);
          if (u) {
            const userData = {id:u.id,name:u.name,username:u.username,role:u.role,phone:u.phone};
            await AsyncStorage.setItem('isp_user', JSON.stringify(userData));
            setUser(userData);
            return { success: true };
          }
        }
      } catch(e) {}
      return { success:false, error:'لا إنترنت — سجّل دخولك مرة واحدة بالإنترنت أولاً' };
    }

    const { data, error } = await supabase
      .from('users').select('*').eq('username',username).eq('is_active',true).single();
    if (error || !data) return { success:false, error:'اسم المستخدم غير موجود' };
    if (data.password_hash !== password) return { success:false, error:'كلمة المرور غير صحيحة' };

    try {
      const cached = await AsyncStorage.getItem('isp_user_cache');
      const users = cached ? JSON.parse(cached) : [];
      const idx = users.findIndex(u => u.id===data.id);
      if (idx >= 0) users[idx] = data; else users.push(data);
      await AsyncStorage.setItem('isp_user_cache', JSON.stringify(users));
    } catch(e) {}

    const userData = {id:data.id,name:data.name,username:data.username,role:data.role,phone:data.phone};
    await AsyncStorage.setItem('isp_user', JSON.stringify(userData));
    setUser(userData);
    return { success: true };
  };

  const logout = async () => {
    await AsyncStorage.removeItem('isp_user');
    setUser(null);
  };

  const can = (permission) => {
    if (!user) return false;
    return ROLE_PERMISSIONS[user.role]?.[permission] || false;
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, can }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
