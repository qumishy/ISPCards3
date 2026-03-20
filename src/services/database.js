/**
 * database.js — Dual-Write Layer
 *
 * كل عملية كتابة تتبع هذا المسار:
 * 1. اكتب في SQLite فوراً (لا انتظار — يعمل أوفلاين)
 * 2. حاول الكتابة في Supabase في الخلفية
 *    - إنترنت موجود → يكتب مباشرة
 *    - لا إنترنت → يضيف لـ sync_queue
 */

import * as SQLite from 'expo-sqlite';
import { supabase } from './supabase';

let _db = null;
let _isOnline = false;

export function setOnlineStatus(status) { _isOnline = status; }
export function getOnlineStatus() { return _isOnline; }

export function getDB() {
  if (!_db) _db = SQLite.openDatabase('isp_cards.db');
  return _db;
}

// ── Helper: تنفيذ SQL محلي ────────────────────────
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

// ── إنشاء الجداول ─────────────────────────────────
export function initDatabase() {
  return new Promise((resolve, reject) => {
    getDB().transaction(tx => {
      tx.executeSql(`CREATE TABLE IF NOT EXISTS pos_customers (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, owner_name TEXT,
        phone TEXT, city TEXT, credit_limit REAL DEFAULT 500000,
        credit_used REAL DEFAULT 0, is_blocked INTEGER DEFAULT 0,
        assigned_agent_id TEXT, notes TEXT, synced INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')))`);
      tx.executeSql(`CREATE TABLE IF NOT EXISTS card_categories (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, price REAL DEFAULT 0,
        is_active INTEGER DEFAULT 1, synced INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')))`);
      tx.executeSql(`CREATE TABLE IF NOT EXISTS batches (
        id TEXT PRIMARY KEY, batch_number TEXT UNIQUE, category_id TEXT,
        serial_number TEXT, total_cards INTEGER DEFAULT 39,
        available_cards INTEGER DEFAULT 39, received_date TEXT,
        status TEXT DEFAULT 'active', synced INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')))`);
      tx.executeSql(`CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, name TEXT, username TEXT UNIQUE,
        role TEXT, phone TEXT, password_hash TEXT,
        is_active INTEGER DEFAULT 1, synced INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')))`);
      tx.executeSql(`CREATE TABLE IF NOT EXISTS invoices (
        id TEXT PRIMARY KEY, invoice_number TEXT UNIQUE,
        pos_id TEXT, agent_id TEXT, type TEXT DEFAULT 'credit',
        total_amount REAL DEFAULT 0, paid_amount REAL DEFAULT 0,
        status TEXT DEFAULT 'pending', notes TEXT, invoice_date TEXT,
        synced INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))`);
      tx.executeSql(`CREATE TABLE IF NOT EXISTS invoice_items (
        id TEXT PRIMARY KEY, invoice_id TEXT, category_id TEXT,
        batch_id TEXT, wallet_id TEXT,
        from_card INTEGER, to_card INTEGER,
        quantity INTEGER, unit_price REAL, total_price REAL,
        synced INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))`);
      tx.executeSql(`CREATE TABLE IF NOT EXISTS collections (
        id TEXT PRIMARY KEY, collection_number TEXT UNIQUE,
        agent_id TEXT, pos_id TEXT, invoice_id TEXT,
        amount REAL NOT NULL, method TEXT DEFAULT 'cash',
        reference_number TEXT, status TEXT DEFAULT 'pending',
        approved_at TEXT, rejection_reason TEXT,
        collection_date TEXT, synced INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')))`);
      tx.executeSql(`CREATE TABLE IF NOT EXISTS agent_wallets (
        id TEXT PRIMARY KEY, agent_id TEXT, batch_id TEXT,
        category_id TEXT, from_card INTEGER, to_card INTEGER,
        total_cards INTEGER, sold_cards INTEGER DEFAULT 0,
        issued_by TEXT, notes TEXT, synced INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')))`);
      tx.executeSql(`CREATE TABLE IF NOT EXISTS sync_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        table_name TEXT NOT NULL, operation TEXT NOT NULL,
        record_id TEXT NOT NULL, payload TEXT NOT NULL,
        attempts INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')))`);
      tx.executeSql(`CREATE TABLE IF NOT EXISTS sync_meta (
        key TEXT PRIMARY KEY, value TEXT)`);
    }, reject, resolve);
  });
}

// ══════════════════════════════════════════════════
// Dual-Write Core
// ══════════════════════════════════════════════════

/**
 * يكتب في SQLite ثم يحاول Supabase
 * إذا فشل Supabase → يضيف للطابور
 */
async function dualWrite(tableName, operation, id, localFn, supabaseFn) {
  // 1. اكتب محلياً أولاً (دائماً)
  await localFn();

  // 2. حاول Supabase في الخلفية
  if (_isOnline) {
    try {
      const { error } = await supabaseFn();
      if (error) {
        console.log(`Supabase ${operation} error (${tableName}):`, error.message);
        await addToSyncQueue(tableName, operation, id, await getLocalRecord(tableName, id));
      } else {
        // نجح — حدّث حالة المزامنة
        await execSQL(`UPDATE ${tableName} SET synced=1 WHERE id=?`, [id]);
      }
    } catch(e) {
      console.log(`Supabase ${operation} exception (${tableName}):`, e.message);
      await addToSyncQueue(tableName, operation, id, await getLocalRecord(tableName, id));
    }
  } else {
    // لا إنترنت → طابور
    await addToSyncQueue(tableName, operation, id, await getLocalRecord(tableName, id));
  }
}

async function getLocalRecord(tableName, id) {
  try {
    const r = await execSQL(`SELECT * FROM ${tableName} WHERE id=?`, [id]);
    return r.rows._array[0] || {};
  } catch(e) { return {}; }
}

export async function addToSyncQueue(table, op, id, payload) {
  try {
    await execSQL(
      'INSERT OR REPLACE INTO sync_queue (table_name,operation,record_id,payload) VALUES (?,?,?,?)',
      [table, op, id, JSON.stringify(payload || {})]
    );
  } catch(e) { console.log('addToSyncQueue error:', e.message); }
}

// ══════════════════════════════════════════════════
// UUID + أرقام
// ══════════════════════════════════════════════════
export function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}
export const generateInvoiceNumber = () =>
  `INV-${new Date().getFullYear()}-${Math.floor(Math.random()*90000)+10000}`;
export const generateCollectionNumber = () =>
  'COL-' + (Math.floor(Math.random()*90000)+10000);
export const generateBatchNumber = () =>
  'BTH-' + (Math.floor(Math.random()*90000)+10000);

// ══════════════════════════════════════════════════
// قراءة البيانات (من SQLite دائماً)
// ══════════════════════════════════════════════════

export async function getLocalPOS() {
  const r = await execSQL('SELECT * FROM pos_customers ORDER BY name');
  return r.rows._array || [];
}
export async function getLocalCategories() {
  const r = await execSQL('SELECT * FROM card_categories WHERE is_active=1 ORDER BY price');
  return r.rows._array || [];
}
export async function getLocalBatches() {
  const r = await execSQL(`
    SELECT b.*, c.name as cat_name, c.price as cat_price
    FROM batches b LEFT JOIN card_categories c ON b.category_id=c.id
    ORDER BY b.created_at DESC`);
  return (r.rows._array||[]).map(b=>({
    ...b, card_categories:{name:b.cat_name, price:b.cat_price}
  }));
}
export async function getLocalInvoices(filters={}) {
  let q=`SELECT i.*, p.name as pos_name, u.name as agent_name
    FROM invoices i
    LEFT JOIN pos_customers p ON i.pos_id=p.id
    LEFT JOIN users u ON i.agent_id=u.id`;
  const where=[]; const params=[];
  if(filters.status){where.push('i.status=?');params.push(filters.status);}
  if(filters.agent_id){where.push('i.agent_id=?');params.push(filters.agent_id);}
  if(where.length) q+=' WHERE '+where.join(' AND ');
  q+=' ORDER BY i.created_at DESC';
  const r=await execSQL(q,params);
  return (r.rows._array||[]).map(i=>({
    ...i, pos_customers:{name:i.pos_name}, users:{name:i.agent_name}
  }));
}
export async function getLocalInvoiceItems(invoiceId) {
  const r=await execSQL(`
    SELECT ii.*, c.name as cat_name, b.serial_number, b.batch_number
    FROM invoice_items ii
    LEFT JOIN card_categories c ON ii.category_id=c.id
    LEFT JOIN batches b ON ii.batch_id=b.id
    WHERE ii.invoice_id=?`,[invoiceId]);
  return r.rows._array||[];
}
export async function getLocalCollections(filters={}) {
  let q=`SELECT c.*, u.name as agent_name, p.name as pos_name,
    i.invoice_number as inv_number
    FROM collections c
    LEFT JOIN users u ON c.agent_id=u.id
    LEFT JOIN pos_customers p ON c.pos_id=p.id
    LEFT JOIN invoices i ON c.invoice_id=i.id`;
  const where=[]; const params=[];
  if(filters.status){where.push('c.status=?');params.push(filters.status);}
  if(where.length) q+=' WHERE '+where.join(' AND ');
  q+=' ORDER BY c.created_at DESC';
  const r=await execSQL(q,params);
  return (r.rows._array||[]).map(c=>({
    ...c, users:{name:c.agent_name},
    pos_customers:{name:c.pos_name},
    invoice:{invoice_number:c.inv_number}
  }));
}
export async function getLocalUsers(role=null) {
  let q='SELECT * FROM users WHERE is_active=1';
  const params=[];
  if(role){q+=' AND role=?';params.push(role);}
  const r=await execSQL(q+' ORDER BY name',params);
  return r.rows._array||[];
}
export async function getSyncQueueCount() {
  const r=await execSQL('SELECT COUNT(*) as cnt FROM sync_queue');
  return r.rows._array[0]?.cnt||0;
}
export async function getAgentWallets(agentId=null) {
  let q=`SELECT aw.*, u.name as agent_name,
    c.name as cat_name, c.price as cat_price,
    b.batch_number, b.serial_number
    FROM agent_wallets aw
    LEFT JOIN users u ON aw.agent_id=u.id
    LEFT JOIN card_categories c ON aw.category_id=c.id
    LEFT JOIN batches b ON aw.batch_id=b.id`;
  const params=[];
  if(agentId){q+=' WHERE aw.agent_id=?';params.push(agentId);}
  q+=' ORDER BY aw.created_at DESC';
  const r=await execSQL(q,params);
  return (r.rows._array||[]).map(w=>({
    ...w,
    users:{name:w.agent_name},
    card_categories:{name:w.cat_name,price:w.cat_price},
    batches:{batch_number:w.batch_number,serial_number:w.serial_number},
    remaining_cards:w.total_cards-w.sold_cards,
  }));
}

// ══════════════════════════════════════════════════
// كتابة البيانات — Dual Write
// ══════════════════════════════════════════════════

export async function createLocalInvoice(data) {
  const id=generateUUID(); const num=generateInvoiceNumber();
  const now=new Date().toISOString();
  const payload={
    id,invoice_number:num,pos_id:data.pos_id,agent_id:data.agent_id,
    type:data.type||'credit',total_amount:0,paid_amount:0,
    status:'pending',notes:data.notes||'',
    invoice_date:data.invoice_date||now.split('T')[0],
    created_at:now,
  };
  await dualWrite('invoices','INSERT',id,
    async()=>execSQL(
      `INSERT INTO invoices (id,invoice_number,pos_id,agent_id,type,total_amount,paid_amount,status,notes,invoice_date,synced,created_at)
       VALUES (?,?,?,?,?,0,0,?,?,?,0,?)`,
      [id,num,payload.pos_id,payload.agent_id,payload.type,'pending',payload.notes,payload.invoice_date,now]
    ),
    ()=>supabase.from('invoices').insert(payload)
  );
  return {id,invoice_number:num};
}

export async function addInvoiceItem(invoiceId, item) {
  const id=generateUUID(); const now=new Date().toISOString();
  const qty=item.to_card-item.from_card+1;
  const total=qty*item.unit_price;
  const payload={
    id,invoice_id:invoiceId,category_id:item.category_id,
    batch_id:item.batch_id,wallet_id:item.wallet_id||null,
    from_card:item.from_card,to_card:item.to_card,
    quantity:qty,unit_price:item.unit_price,total_price:total,
    created_at:now,
  };
  await dualWrite('invoice_items','INSERT',id,
    async()=>{
      await execSQL(
        `INSERT INTO invoice_items (id,invoice_id,category_id,batch_id,wallet_id,from_card,to_card,quantity,unit_price,total_price,synced,created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,0,?)`,
        [id,invoiceId,item.category_id,item.batch_id,item.wallet_id||'',item.from_card,item.to_card,qty,item.unit_price,total,now]
      );
      if(item.wallet_id){
        await execSQL('UPDATE agent_wallets SET sold_cards=sold_cards+? WHERE id=?',[qty,item.wallet_id]);
      }
      const totR=await execSQL('SELECT SUM(total_price) as tot FROM invoice_items WHERE invoice_id=?',[invoiceId]);
      const newTotal=totR.rows._array[0]?.tot||0;
      await execSQL('UPDATE invoices SET total_amount=? WHERE id=?',[newTotal,invoiceId]);
    },
    ()=>supabase.from('invoice_items').insert(payload)
  );
  // تحديث إجمالي الفاتورة في Supabase
  if(_isOnline){
    try{
      const totR=await execSQL('SELECT total_amount FROM invoices WHERE id=?',[invoiceId]);
      const newTotal=totR.rows._array[0]?.total_amount||0;
      await supabase.from('invoices').update({total_amount:newTotal}).eq('id',invoiceId);
    }catch(e){}
  }
  return {id,quantity:qty,total_price:total};
}

export async function createLocalCollection(data) {
  const id=generateUUID(); const num=generateCollectionNumber();
  const now=new Date().toISOString();
  const payload={
    id,collection_number:num,agent_id:data.agent_id,pos_id:data.pos_id,
    invoice_id:data.invoice_id||null,amount:data.amount,
    method:data.method||'cash',reference_number:data.reference_number||null,
    status:'pending',collection_date:data.collection_date||now.split('T')[0],
    created_at:now,
  };
  await dualWrite('collections','INSERT',id,
    async()=>execSQL(
      `INSERT INTO collections (id,collection_number,agent_id,pos_id,invoice_id,amount,method,reference_number,status,collection_date,synced,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,0,?)`,
      [id,num,payload.agent_id,payload.pos_id,payload.invoice_id||'',payload.amount,payload.method,payload.reference_number||'','pending',payload.collection_date,now]
    ),
    ()=>supabase.from('collections').insert(payload)
  );
  return {id,collection_number:num};
}

export async function approveLocalCollection(id) {
  const now=new Date().toISOString();
  await dualWrite('collections','UPDATE',id,
    async()=>execSQL("UPDATE collections SET status='approved',approved_at=? WHERE id=?",[now,id]),
    ()=>supabase.from('collections').update({status:'approved',approved_at:now}).eq('id',id)
  );
}

export async function rejectLocalCollection(id,reason) {
  const r=reason||'مرفوض';
  await dualWrite('collections','UPDATE',id,
    async()=>execSQL("UPDATE collections SET status='rejected',rejection_reason=? WHERE id=?",[r,id]),
    ()=>supabase.from('collections').update({status:'rejected',rejection_reason:r}).eq('id',id)
  );
}

export async function createAgentWallet(data) {
  const id=generateUUID(); const now=new Date().toISOString();
  const total=data.to_card-data.from_card+1;
  const payload={
    id,agent_id:data.agent_id,batch_id:data.batch_id,
    category_id:data.category_id,from_card:data.from_card,
    to_card:data.to_card,total_cards:total,sold_cards:0,
    issued_by:data.issued_by||null,notes:data.notes||null,
    created_at:now,
  };
  await dualWrite('agent_wallets','INSERT',id,
    async()=>{
      await execSQL(
        `INSERT INTO agent_wallets (id,agent_id,batch_id,category_id,from_card,to_card,total_cards,sold_cards,issued_by,notes,synced,created_at)
         VALUES (?,?,?,?,?,?,?,0,?,?,0,?)`,
        [id,data.agent_id,data.batch_id,data.category_id,data.from_card,data.to_card,total,data.issued_by||'',data.notes||'',now]
      );
      await execSQL('UPDATE batches SET available_cards=available_cards-? WHERE id=?',[total,data.batch_id]);
    },
    ()=>supabase.from('agent_wallets').insert(payload)
  );
  // تحديث المخزون في Supabase
  if(_isOnline){
    try{
      await supabase.rpc('decrement_batch_cards',{batch_id:data.batch_id,amount:total})
        .catch(async()=>{
          // إذا لم توجد الدالة — نحدث يدوياً
          const{data:b}=await supabase.from('batches').select('available_cards').eq('id',data.batch_id).single();
          if(b) await supabase.from('batches').update({available_cards:b.available_cards-total}).eq('id',data.batch_id);
        });
    }catch(e){}
  }
  return {id,total_cards:total};
}

export async function toggleLocalPOSBlock(id,blocked) {
  await dualWrite('pos_customers','UPDATE',id,
    async()=>execSQL('UPDATE pos_customers SET is_blocked=? WHERE id=?',[blocked?1:0,id]),
    ()=>supabase.from('pos_customers').update({is_blocked:blocked}).eq('id',id)
  );
}

export async function updatePOS(id,data) {
  await dualWrite('pos_customers','UPDATE',id,
    async()=>{
      const fields=Object.keys(data).map(k=>`${k}=?`).join(',');
      await execSQL(`UPDATE pos_customers SET ${fields} WHERE id=?`,[...Object.values(data),id]);
    },
    ()=>supabase.from('pos_customers').update(data).eq('id',id)
  );
}

export async function updateUser(id,data) {
  await dualWrite('users','UPDATE',id,
    async()=>{
      const fields=Object.keys(data).map(k=>`${k}=?`).join(',');
      await execSQL(`UPDATE users SET ${fields} WHERE id=?`,[...Object.values(data),id]);
    },
    ()=>supabase.from('users').update(data).eq('id',id)
  );
}

export async function updateCategory(id,data) {
  await dualWrite('card_categories','UPDATE',id,
    async()=>{
      const fields=Object.keys(data).map(k=>`${k}=?`).join(',');
      await execSQL(`UPDATE card_categories SET ${fields} WHERE id=?`,[...Object.values(data),id]);
    },
    ()=>supabase.from('card_categories').update(data).eq('id',id)
  );
}

export async function updateBatch(id,data) {
  await dualWrite('batches','UPDATE',id,
    async()=>{
      const fields=Object.keys(data).map(k=>`${k}=?`).join(',');
      await execSQL(`UPDATE batches SET ${fields} WHERE id=?`,[...Object.values(data),id]);
    },
    ()=>supabase.from('batches').update(data).eq('id',id)
  );
}

export async function updateWallet(id,data) {
  await dualWrite('agent_wallets','UPDATE',id,
    async()=>{
      const fields=Object.keys(data).map(k=>`${k}=?`).join(',');
      await execSQL(`UPDATE agent_wallets SET ${fields} WHERE id=?`,[...Object.values(data),id]);
    },
    ()=>supabase.from('agent_wallets').update(data).eq('id',id)
  );
}

export async function updateInvoiceStatus(id,status) {
  await dualWrite('invoices','UPDATE',id,
    async()=>execSQL('UPDATE invoices SET status=? WHERE id=?',[status,id]),
    ()=>supabase.from('invoices').update({status}).eq('id',id)
  );
}
