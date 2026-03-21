/**
 * database.js
 * SQLite محلي للفواتير والتحصيلات فقط
 * باقي البيانات تُقرأ من Supabase مباشرة
 */
import * as SQLite from 'expo-sqlite';
import { supabase } from './supabase';

let _db = null;
let _isOnline = false;

export function setOnlineStatus(v) { _isOnline = v; }
export function getOnlineStatus() { return _isOnline; }

export function getDB() {
  if (!_db) _db = SQLite.openDatabase('isp_local.db');
  return _db;
}

export function execSQL(query, params = []) {
  return new Promise((resolve, reject) => {
    getDB().transaction(tx => {
      tx.executeSql(query, params,
        (_, r) => resolve(r),
        (_, e) => { reject(e); return true; }
      );
    });
  });
}

// ── إنشاء جداول الفواتير والتحصيلات فقط ─────────
export function initDatabase() {
  return new Promise((resolve, reject) => {
    getDB().transaction(tx => {
      tx.executeSql(`CREATE TABLE IF NOT EXISTS invoices (
        id TEXT PRIMARY KEY,
        invoice_number TEXT UNIQUE,
        pos_id TEXT, agent_id TEXT,
        type TEXT DEFAULT 'credit',
        total_amount REAL DEFAULT 0,
        discount REAL DEFAULT 0,
        net_amount REAL DEFAULT 0,
        paid_amount REAL DEFAULT 0,
        status TEXT DEFAULT 'pending',
        notes TEXT, invoice_date TEXT,
        active INTEGER DEFAULT 1,
        synced INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      )`);
      tx.executeSql(`CREATE TABLE IF NOT EXISTS invoice_items (
        id TEXT PRIMARY KEY,
        invoice_id TEXT,
        category_id TEXT, batch_id TEXT, wallet_id TEXT,
        from_card INTEGER, to_card INTEGER,
        quantity INTEGER, unit_price REAL, total_price REAL,
        active INTEGER DEFAULT 1,
        synced INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      )`);
      tx.executeSql(`CREATE TABLE IF NOT EXISTS collections (
        id TEXT PRIMARY KEY,
        collection_number TEXT UNIQUE,
        agent_id TEXT, pos_id TEXT, invoice_id TEXT,
        amount REAL NOT NULL,
        method TEXT DEFAULT 'cash',
        reference_number TEXT,
        status TEXT DEFAULT 'pending',
        approved_at TEXT, rejection_reason TEXT,
        collection_date TEXT,
        active INTEGER DEFAULT 1,
        synced INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      )`);
      tx.executeSql(`CREATE TABLE IF NOT EXISTS sync_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        table_name TEXT NOT NULL,
        operation TEXT NOT NULL,
        record_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        attempts INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      )`);
      tx.executeSql(`CREATE TABLE IF NOT EXISTS sync_meta (
        key TEXT PRIMARY KEY, value TEXT
      )`);
    }, reject, resolve);
  });
}

// ── UUID + أرقام ──────────────────────────────────
export function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}
export const genInvoiceNum = () =>
  `INV-${new Date().getFullYear()}-${Math.floor(Math.random()*90000)+10000}`;
export const genCollectionNum = () =>
  'COL-' + (Math.floor(Math.random()*90000)+10000);

// ══════════════════════════════════════════════════
// Dual-Write Helper
// ══════════════════════════════════════════════════
async function dualWrite(table, op, id, localFn, supabaseFn) {
  // 1. اكتب محلياً أولاً
  await localFn();
  // 2. حاول Supabase
  if (_isOnline) {
    try {
      const { error } = await supabaseFn();
      if (error) {
        console.log(`Supabase ${op} error (${table}):`, error.message);
        await addToQueue(table, op, id);
      } else {
        await execSQL(`UPDATE ${table} SET synced=1 WHERE id=?`, [id]).catch(()=>{});
      }
    } catch(e) {
      await addToQueue(table, op, id);
    }
  } else {
    await addToQueue(table, op, id);
  }
}

async function addToQueue(table, op, id) {
  try {
    const r = await execSQL(`SELECT * FROM ${table} WHERE id=?`, [id]);
    const payload = r.rows._array[0] || {};
    await execSQL(
      'INSERT OR REPLACE INTO sync_queue (table_name,operation,record_id,payload) VALUES (?,?,?,?)',
      [table, op, id, JSON.stringify(payload)]
    );
  } catch(e) {}
}

// ══════════════════════════════════════════════════
// قراءة الفواتير (محلي)
// ══════════════════════════════════════════════════
export async function getLocalInvoices(filters = {}) {
  let q = 'SELECT * FROM invoices WHERE active=1';
  const params = [];
  if (filters.status) { q += ' AND status=?'; params.push(filters.status); }
  if (filters.agent_id) { q += ' AND agent_id=?'; params.push(filters.agent_id); }
  q += ' ORDER BY created_at DESC';
  const r = await execSQL(q, params);
  const rows = r.rows._array || [];
  // نضيف أسماء نقاط البيع والمندوبين من Supabase إذا كان أونلاين
  if (_isOnline && rows.length > 0) {
    try {
      const posIds = [...new Set(rows.map(i=>i.pos_id).filter(Boolean))];
      const agentIds = [...new Set(rows.map(i=>i.agent_id).filter(Boolean))];
      const [posR, agentR] = await Promise.all([
        posIds.length ? supabase.from('pos_customers').select('id,name').in('id',posIds) : {data:[]},
        agentIds.length ? supabase.from('users').select('id,name').in('id',agentIds) : {data:[]},
      ]);
      const posMap = Object.fromEntries((posR.data||[]).map(p=>[p.id,p.name]));
      const agentMap = Object.fromEntries((agentR.data||[]).map(u=>[u.id,u.name]));
      return rows.map(i=>({
        ...i,
        pos_customers:{name:posMap[i.pos_id]||'—'},
        users:{name:agentMap[i.agent_id]||'—'},
      }));
    } catch(e) {}
  }
  return rows.map(i=>({...i, pos_customers:{name:'—'}, users:{name:'—'}}));
}

export async function getLocalInvoiceItems(invoiceId) {
  const r = await execSQL(
    'SELECT * FROM invoice_items WHERE invoice_id=? AND active=1',
    [invoiceId]
  );
  const rows = r.rows._array || [];
  if (_isOnline && rows.length > 0) {
    try {
      const catIds = [...new Set(rows.map(i=>i.category_id).filter(Boolean))];
      if (catIds.length) {
        const { data } = await supabase.from('card_categories').select('id,name').in('id',catIds);
        const catMap = Object.fromEntries((data||[]).map(c=>[c.id,c.name]));
        return rows.map(i=>({...i, cat_name:catMap[i.category_id]||'—'}));
      }
    } catch(e) {}
  }
  return rows.map(i=>({...i, cat_name:'—'}));
}

export async function getLocalCollections(filters = {}) {
  let q = 'SELECT * FROM collections WHERE active=1';
  const params = [];
  if (filters.status) { q += ' AND status=?'; params.push(filters.status); }
  q += ' ORDER BY created_at DESC';
  const r = await execSQL(q, params);
  const rows = r.rows._array || [];
  if (_isOnline && rows.length > 0) {
    try {
      const agentIds = [...new Set(rows.map(c=>c.agent_id).filter(Boolean))];
      const posIds = [...new Set(rows.map(c=>c.pos_id).filter(Boolean))];
      const invIds = [...new Set(rows.map(c=>c.invoice_id).filter(Boolean))];
      const [agentR, posR] = await Promise.all([
        agentIds.length ? supabase.from('users').select('id,name').in('id',agentIds) : {data:[]},
        posIds.length ? supabase.from('pos_customers').select('id,name').in('id',posIds) : {data:[]},
      ]);
      const agentMap = Object.fromEntries((agentR.data||[]).map(u=>[u.id,u.name]));
      const posMap = Object.fromEntries((posR.data||[]).map(p=>[p.id,p.name]));
      // أرقام الفواتير من SQLite المحلي
      const invMap = {};
      if (invIds.length) {
        const invR = await execSQL(`SELECT id,invoice_number,net_amount FROM invoices WHERE id IN (${invIds.map(()=>'?').join(',')})`, invIds);
        (invR.rows._array||[]).forEach(i=>{ invMap[i.id]={invoice_number:i.invoice_number,net_amount:i.net_amount}; });
      }
      return rows.map(c=>({
        ...c,
        users:{name:agentMap[c.agent_id]||'—'},
        pos_customers:{name:posMap[c.pos_id]||'—'},
        invoice:invMap[c.invoice_id]||{invoice_number:null},
      }));
    } catch(e) {}
  }
  return rows.map(c=>({...c, users:{name:'—'}, pos_customers:{name:'—'}, invoice:{}}));
}

export async function getSyncQueueCount() {
  const r = await execSQL('SELECT COUNT(*) as cnt FROM sync_queue');
  return r.rows._array[0]?.cnt || 0;
}

// ══════════════════════════════════════════════════
// كتابة الفواتير
// ══════════════════════════════════════════════════
export async function createLocalInvoice(data) {
  const id = generateUUID();
  const num = genInvoiceNum();
  const now = new Date().toISOString();
  const discount = data.discount || 0;
  const total = data.total_amount || 0;
  const net = Math.max(0, total - discount);

  await dualWrite('invoices', 'INSERT', id,
    async () => execSQL(
      `INSERT INTO invoices
       (id,invoice_number,pos_id,agent_id,type,total_amount,discount,net_amount,
        paid_amount,status,notes,invoice_date,active,synced,created_at)
       VALUES (?,?,?,?,?,?,?,?,0,'pending',?,?,1,0,?)`,
      [id,num,data.pos_id,data.agent_id,data.type||'credit',
       total,discount,net,data.notes||'',
       data.invoice_date||now.split('T')[0],now]
    ),
    () => supabase.from('invoices').insert({
      id,invoice_number:num,pos_id:data.pos_id,agent_id:data.agent_id,
      type:data.type||'credit',total_amount:total,discount,net_amount:net,
      paid_amount:0,status:'pending',notes:data.notes||'',
      invoice_date:data.invoice_date||now.split('T')[0],active:true,
      created_at:now,
    })
  );
  return { id, invoice_number: num };
}

export async function addInvoiceItem(invoiceId, item) {
  const id = generateUUID();
  const now = new Date().toISOString();
  const qty = item.quantity || (item.to_card - item.from_card + 1);
  const total = qty * item.unit_price;

  await dualWrite('invoice_items', 'INSERT', id,
    async () => {
      await execSQL(
        `INSERT INTO invoice_items
         (id,invoice_id,category_id,batch_id,wallet_id,from_card,to_card,
          quantity,unit_price,total_price,active,synced,created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,1,0,?)`,
        [id,invoiceId,item.category_id,item.batch_id||'',item.wallet_id||'',
         item.from_card||0,item.to_card||0,qty,item.unit_price,total,now]
      );
      // تحديث إجمالي الفاتورة
      const totR = await execSQL(
        'SELECT SUM(total_price) as tot FROM invoice_items WHERE invoice_id=? AND active=1',
        [invoiceId]
      );
      const newTotal = totR.rows._array[0]?.tot || 0;
      const invR = await execSQL('SELECT discount FROM invoices WHERE id=?',[invoiceId]);
      const disc = invR.rows._array[0]?.discount || 0;
      const net = Math.max(0, newTotal - disc);
      await execSQL(
        'UPDATE invoices SET total_amount=?,net_amount=? WHERE id=?',
        [newTotal,net,invoiceId]
      );
    },
    () => supabase.from('invoice_items').insert({
      id,invoice_id:invoiceId,...item,quantity:qty,total_price:total,
      active:true,created_at:now,
    })
  );
  // تحديث Supabase بالإجمالي الجديد
  if (_isOnline) {
    try {
      const totR = await execSQL('SELECT total_amount,net_amount FROM invoices WHERE id=?',[invoiceId]);
      const inv = totR.rows._array[0];
      if (inv) await supabase.from('invoices').update({total_amount:inv.total_amount,net_amount:inv.net_amount}).eq('id',invoiceId);
    } catch(e) {}
  }
  return { id, quantity: qty, total_price: total };
}

export async function softDeleteInvoice(id) {
  await dualWrite('invoices','UPDATE',id,
    async () => execSQL("UPDATE invoices SET active=0 WHERE id=? AND status='pending'",[id]),
    () => supabase.from('invoices').update({active:false}).eq('id',id).eq('status','pending')
  );
}

// ══════════════════════════════════════════════════
// كتابة التحصيلات
// ══════════════════════════════════════════════════
export async function createLocalCollection(data) {
  const id = generateUUID();
  const num = genCollectionNum();
  const now = new Date().toISOString();

  await dualWrite('collections','INSERT',id,
    async () => execSQL(
      `INSERT INTO collections
       (id,collection_number,agent_id,pos_id,invoice_id,amount,method,
        reference_number,status,collection_date,active,synced,created_at)
       VALUES (?,?,?,?,?,?,?,?,'pending',?,1,0,?)`,
      [id,num,data.agent_id,data.pos_id,data.invoice_id||'',
       data.amount,data.method||'cash',data.reference_number||'',
       data.collection_date||now.split('T')[0],now]
    ),
    () => supabase.from('collections').insert({
      id,collection_number:num,agent_id:data.agent_id,pos_id:data.pos_id,
      invoice_id:data.invoice_id||null,amount:data.amount,
      method:data.method||'cash',reference_number:data.reference_number||null,
      status:'pending',collection_date:data.collection_date||now.split('T')[0],
      active:true,created_at:now,
    })
  );
  return { id, collection_number: num };
}

export async function approveLocalCollection(id) {
  const now = new Date().toISOString();
  await dualWrite('collections','UPDATE',id,
    async () => execSQL("UPDATE collections SET status='approved',approved_at=? WHERE id=?",[now,id]),
    () => supabase.from('collections').update({status:'approved',approved_at:now}).eq('id',id)
  );
}

export async function rejectLocalCollection(id, reason) {
  const r = reason || 'مرفوض';
  await dualWrite('collections','UPDATE',id,
    async () => execSQL("UPDATE collections SET status='rejected',rejection_reason=? WHERE id=?",[r,id]),
    () => supabase.from('collections').update({status:'rejected',rejection_reason:r}).eq('id',id)
  );
}

// ══════════════════════════════════════════════════
// مزامنة الطابور
// ══════════════════════════════════════════════════
export async function processSyncQueue() {
  if (!_isOnline) return 0;
  let synced = 0;
  try {
    const r = await execSQL('SELECT * FROM sync_queue WHERE attempts < 5 ORDER BY id ASC LIMIT 20');
    const items = r.rows._array || [];
    for (const item of items) {
      try {
        const payload = JSON.parse(item.payload || '{}');
        let error = null;
        if (item.operation === 'INSERT') {
          const { error: e } = await supabase.from(item.table_name).upsert(payload,{onConflict:'id'});
          error = e;
        } else if (item.operation === 'UPDATE') {
          const { error: e } = await supabase.from(item.table_name).update(payload).eq('id',item.record_id);
          error = e;
        }
        if (!error) {
          await execSQL('DELETE FROM sync_queue WHERE id=?',[item.id]);
          await execSQL(`UPDATE ${item.table_name} SET synced=1 WHERE id=?`,[item.record_id]).catch(()=>{});
          synced++;
        } else {
          await execSQL('UPDATE sync_queue SET attempts=attempts+1 WHERE id=?',[item.id]);
        }
      } catch(e) {
        await execSQL('UPDATE sync_queue SET attempts=attempts+1 WHERE id=?',[item.id]);
      }
    }
  } catch(e) {}
  return synced;
}
