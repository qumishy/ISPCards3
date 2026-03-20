/**
 * SyncService.js
 *
 * مسؤول عن:
 * 1. مراقبة حالة الشبكة وتحديث database.js
 * 2. معالجة sync_queue عند عودة الإنترنت
 * 3. سحب التغييرات من Supabase دورياً
 */

import NetInfo from '@react-native-community/netinfo';
import { supabase } from './supabase';
import { execSQL, setOnlineStatus, getSyncQueueCount } from './database';

let _isOnline = false;
let _isSyncing = false;
let _unsubscribe = null;
let _syncInterval = null;
let _listeners = [];

export function startNetworkMonitor(onStatusChange) {
  _unsubscribe = NetInfo.addEventListener(async state => {
    const online = !!(state.isConnected && state.isInternetReachable !== false);
    const changed = online !== _isOnline;
    _isOnline = online;
    setOnlineStatus(online); // أخبر database.js بحالة الشبكة
    if (changed) {
      onStatusChange?.(online);
      if (online) {
        // عند عودة الإنترنت — ارفع الطابور فوراً
        await processSyncQueue();
        notifyListeners();
      }
    }
  });

  // فحص دوري كل 30 ثانية
  _syncInterval = setInterval(async () => {
    if (_isOnline) {
      await processSyncQueue();
      notifyListeners();
    }
  }, 30000);
}

export function stopNetworkMonitor() {
  _unsubscribe?.();
  if (_syncInterval) clearInterval(_syncInterval);
}

export const isOnline = () => _isOnline;

export function addSyncListener(fn) {
  _listeners.push(fn);
  return () => { _listeners = _listeners.filter(l => l !== fn); };
}
function notifyListeners() { _listeners.forEach(fn => fn()); }

// ── معالجة طابور المزامنة ─────────────────────────
export async function processSyncQueue() {
  if (_isSyncing || !_isOnline) return;
  _isSyncing = true;
  try {
    const r = await execSQL('SELECT * FROM sync_queue WHERE attempts < 5 ORDER BY id ASC LIMIT 30');
    const queued = r.rows._array || [];
    for (const item of queued) {
      try {
        const payload = JSON.parse(item.payload || '{}');
        let error = null;
        if (item.operation === 'INSERT') {
          const { error: e } = await supabase.from(item.table_name).upsert(payload, { onConflict: 'id' });
          error = e;
        } else if (item.operation === 'UPDATE') {
          const { error: e } = await supabase.from(item.table_name).update(payload).eq('id', item.record_id);
          error = e;
        } else if (item.operation === 'DELETE') {
          const { error: e } = await supabase.from(item.table_name).delete().eq('id', item.record_id);
          error = e;
        }
        if (!error) {
          await execSQL('DELETE FROM sync_queue WHERE id=?', [item.id]);
          try { await execSQL(`UPDATE ${item.table_name} SET synced=1 WHERE id=?`, [item.record_id]); } catch(e) {}
        } else {
          await execSQL('UPDATE sync_queue SET attempts=attempts+1 WHERE id=?', [item.id]);
          console.log(`Sync failed (${item.table_name}):`, error.message);
        }
      } catch(e) {
        await execSQL('UPDATE sync_queue SET attempts=attempts+1 WHERE id=?', [item.id]);
        console.log('Queue item error:', e.message);
      }
    }
  } catch(e) {
    console.log('processSyncQueue error:', e.message);
  } finally {
    _isSyncing = false;
  }
}

// ── المزامنة الكاملة ──────────────────────────────
export async function syncAll() {
  if (!_isOnline) return;
  try {
    await processSyncQueue();
    await pullRemoteChanges();
    notifyListeners();
  } catch(e) {
    console.log('syncAll error:', e.message);
  }
}

// ── سحب التغييرات من Supabase ────────────────────
async function pullRemoteChanges() {
  const metaR = await execSQL("SELECT value FROM sync_meta WHERE key='last_pull'");
  const lastPull = metaR.rows._array[0]?.value || '2000-01-01T00:00:00Z';

  const tables = [
    { name:'pos_customers', fields:'id,name,owner_name,phone,city,credit_limit,credit_used,is_blocked,assigned_agent_id,notes,created_at' },
    { name:'card_categories', fields:'id,name,price,is_active,created_at' },
    { name:'batches', fields:'id,batch_number,category_id,serial_number,total_cards,available_cards,received_date,status,created_at' },
    { name:'users', fields:'id,name,username,role,phone,is_active,password_hash,created_at' },
    { name:'invoices', fields:'id,invoice_number,pos_id,agent_id,type,total_amount,paid_amount,status,notes,invoice_date,created_at' },
    { name:'invoice_items', fields:'id,invoice_id,category_id,batch_id,wallet_id,from_card,to_card,quantity,unit_price,total_price,created_at' },
    { name:'collections', fields:'id,collection_number,agent_id,pos_id,invoice_id,amount,method,reference_number,status,approved_at,rejection_reason,collection_date,created_at' },
    { name:'agent_wallets', fields:'id,agent_id,batch_id,category_id,from_card,to_card,total_cards,sold_cards,issued_by,notes,created_at' },
  ];

  for (const t of tables) {
    try {
      const { data } = await supabase
        .from(t.name).select(t.fields)
        .gte('created_at', lastPull).limit(500);
      if (!data || data.length === 0) continue;
      for (const row of data) {
        const cols = Object.keys(row);
        const vals = Object.values(row).map(v => typeof v === 'boolean' ? (v?1:0) : v);
        const ph = cols.map(() => '?').join(',');
        try {
          await execSQL(
            `INSERT OR REPLACE INTO ${t.name} (${cols.join(',')},synced) VALUES (${ph},1)`,
            vals
          );
        } catch(e) {}
      }
    } catch(e) { console.log(`Pull error ${t.name}:`, e.message); }
  }

  await execSQL(
    "INSERT OR REPLACE INTO sync_meta (key,value) VALUES ('last_pull',?)",
    [new Date().toISOString()]
  );
}

// ── مزامنة أولى عند تسجيل الدخول ────────────────
export async function initialSync() {
  if (!_isOnline) return;
  try {
    // إعادة ضبط آخر سحب لجلب كل البيانات
    await execSQL("INSERT OR REPLACE INTO sync_meta (key,value) VALUES ('last_pull','2000-01-01T00:00:00Z')");
    await pullRemoteChanges();
    notifyListeners();
  } catch(e) { console.log('initialSync error:', e.message); }
}
