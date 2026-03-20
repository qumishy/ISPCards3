import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SUPABASE_URL = 'https://vddwtksrxokdazhassjp.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZkZHd0a3NyeG9rZGF6aGFzc2pwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4OTAxNjksImV4cCI6MjA4OTQ2NjE2OX0.00a9SDJKOiHV8g_BFY8c-y-1CWo3ulTHUAT_PatHMK0';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export const userService = {
  getAgents: () => supabase.from('users').select('*').eq('role','agent').eq('is_active',true),
  getAll: () => supabase.from('users').select('*').order('name'),
};
export const posService = {
  getAll: () => supabase.from('pos_customers').select('*').order('name'),
  create: (data) => supabase.from('pos_customers').insert(data).select().single(),
  toggleBlock: (id, blocked) => supabase.from('pos_customers').update({ is_blocked: !blocked }).eq('id', id),
};
export const invoiceService = {
  create: async (data) => {
    const num = 'INV-' + new Date().getFullYear() + '-' + (Math.floor(Math.random()*90000)+10000);
    return supabase.from('invoices').insert({ ...data, invoice_number: num }).select().single();
  },
};
export const collectionService = {
  create: async (data) => {
    const num = 'COL-' + (Math.floor(Math.random()*90000)+10000);
    return supabase.from('collections').insert({ ...data, collection_number: num }).select().single();
  },
  approve: (id) => supabase.from('collections').update({ status:'approved', approved_at: new Date().toISOString() }).eq('id',id),
  reject: (id, reason) => supabase.from('collections').update({ status:'rejected', rejection_reason: reason }).eq('id',id),
};
export const inventoryService = {
  getBatches: () => supabase.from('batches').select('*,card_categories(name,price)').order('created_at',{ascending:false}),
  getCategories: () => supabase.from('card_categories').select('*').eq('is_active',true),
  addBatch: async (data) => {
    const num = 'BTH-' + (Math.floor(Math.random()*90000)+10000);
    return supabase.from('batches').insert({ ...data, batch_number: num }).select().single();
  },
};
