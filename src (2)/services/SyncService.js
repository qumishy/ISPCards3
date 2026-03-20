import NetInfo from '@react-native-community/netinfo';
import { supabase } from './supabase';
import { getDB, execSQL } from './database';

let _isOnline = false;
let _isSyncing = false;
let _unsubscribe = null;
let _syncInterval = null;
let _listeners = [];

export function startNetworkMonitor(onStatusChange) {
  _unsubscribe = NetInfo.addEventListener(state => {
    const online = !!(state.isConnected && state.isInternetReachable !== false);
    const changed = online !== _isOnline;
    _isOnline = online;
    if (changed) { onStatusChange?.(online); if (online) syncAll(); }
  });
  _syncInterval = setInterval(() => { if (_isOnline) syncAll(); }, 30000);
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

export async function syncAll() {
  if (_isSyncing || !_isOnline) return;
  _isSyncing = true;
  try {
    await pushLocalChanges();
    await pullRemoteChanges();
    notifyListeners();
  } catch(e) {
    console.log('Sync error:', e.message);
  } finally {
    _isSyncing = false;
  }
}

async function pushLocalChanges() {
  const r = await execSQL('SELECT * FROM sync_queue ORDER BY id ASC LIMIT 50');
  const queued = r.rows._array || [];
  for (const item of queued) {
    try {
      const payload = JSON.parse(item.payload);
      let error = null;
      if (item.operation==='INSERT') { const res=await supabase.from(item.table_name).upsert(payload); error=res.error; }
      else if (item.operation==='UPDATE') { const res=await supabase.from(item.table_name).update(payload).eq('id',item.record_id); error=res.error; }
      else if (item.operation==='DELETE') { const res=await supabase.from(item.table_name).delete().eq('id',item.record_id); error=res.error; }
      if (!error) {
        await execSQL('DELETE FROM sync_queue WHERE id=?',[item.id]);
      } else {
        await execSQL('UPDATE sync_queue SET attempts=attempts+1 WHERE id=?',[item.id]);
      }
    } catch(e) { console.log('Push error:', e.message); }
  }
}

async function pullRemoteChanges() {
  const metaR = await execSQL("SELECT value FROM sync_meta WHERE key='last_pull'");
  const lastPull = metaR.rows._array[0]?.value || '2000-01-01T00:00:00Z';
  const tables = [
    {name:'pos_customers',fields:'id,name,owner_name,phone,city,credit_limit,credit_used,is_blocked,assigned_agent_id,notes,created_at'},
    {name:'card_categories',fields:'id,name,price,is_active'},
    {name:'batches',fields:'id,batch_number,category_id,serial_number,total_cards,available_cards,received_date,status,created_at'},
    {name:'users',fields:'id,name,username,role,phone,is_active,password_hash'},
    {name:'invoices',fields:'id,invoice_number,pos_id,agent_id,type,total_amount,paid_amount,status,notes,invoice_date,created_at'},
    {name:'invoice_items',fields:'id,invoice_id,category_id,batch_id,wallet_id,from_card,to_card,quantity,unit_price,total_price,created_at'},
    {name:'collections',fields:'id,collection_number,agent_id,pos_id,invoice_id,amount,method,reference_number,status,approved_at,rejection_reason,collection_date,created_at'},
    {name:'agent_wallets',fields:'id,agent_id,batch_id,category_id,from_card,to_card,total_cards,sold_cards,issued_by,notes,created_at'},
  ];
  for (const t of tables) {
    try {
      const { data } = await supabase.from(t.name).select(t.fields).gte('created_at',lastPull).limit(200);
      if (!data||data.length===0) continue;
      for (const row of data) {
        const cols = Object.keys(row);
        const vals = Object.values(row).map(v => typeof v==='boolean'?(v?1:0):v);
        const ph = cols.map(()=>'?').join(',');
        try {
          await execSQL(`INSERT OR REPLACE INTO ${t.name} (${cols.join(',')},synced) VALUES (${ph},1)`,vals);
        } catch(e) {}
      }
    } catch(e) { console.log(`Pull error ${t.name}:`, e.message); }
  }
  await execSQL("INSERT OR REPLACE INTO sync_meta (key,value) VALUES ('last_pull',?)",[new Date().toISOString()]);
}

export async function initialSync() {
  if (!_isOnline) return;
  try {
    await execSQL("INSERT OR REPLACE INTO sync_meta (key,value) VALUES ('last_pull','2000-01-01T00:00:00Z')");
    await pullRemoteChanges();
    notifyListeners();
  } catch(e) { console.log('Initial sync error:', e.message); }
}
