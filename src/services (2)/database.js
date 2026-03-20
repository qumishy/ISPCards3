import * as SQLite from 'expo-sqlite';

let _db = null;

export function getDB() {
  if (!_db) _db = SQLite.openDatabase('isp_cards.db');
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

// ── قراءة ─────────────────────────────────────────
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
  return (r.rows._array||[]).map(b => ({
    ...b, card_categories: { name: b.cat_name, price: b.cat_price }
  }));
}
export async function getLocalInvoices(filters = {}) {
  let q = `SELECT i.*, p.name as pos_name, u.name as agent_name
    FROM invoices i
    LEFT JOIN pos_customers p ON i.pos_id=p.id
    LEFT JOIN users u ON i.agent_id=u.id`;
  const where = []; const params = [];
  if (filters.status) { where.push('i.status=?'); params.push(filters.status); }
  if (filters.agent_id) { where.push('i.agent_id=?'); params.push(filters.agent_id); }
  if (where.length) q += ' WHERE ' + where.join(' AND ');
  q += ' ORDER BY i.created_at DESC';
  const r = await execSQL(q, params);
  return (r.rows._array||[]).map(i => ({
    ...i, pos_customers:{name:i.pos_name}, users:{name:i.agent_name}
  }));
}
export async function getLocalInvoiceItems(invoiceId) {
  const r = await execSQL(`
    SELECT ii.*, c.name as cat_name, b.serial_number, b.batch_number
    FROM invoice_items ii
    LEFT JOIN card_categories c ON ii.category_id=c.id
    LEFT JOIN batches b ON ii.batch_id=b.id
    WHERE ii.invoice_id=?`, [invoiceId]);
  return r.rows._array || [];
}
export async function getLocalCollections(filters = {}) {
  let q = `SELECT c.*, u.name as agent_name, p.name as pos_name,
    i.invoice_number as inv_number
    FROM collections c
    LEFT JOIN users u ON c.agent_id=u.id
    LEFT JOIN pos_customers p ON c.pos_id=p.id
    LEFT JOIN invoices i ON c.invoice_id=i.id`;
  const where = []; const params = [];
  if (filters.status) { where.push('c.status=?'); params.push(filters.status); }
  if (where.length) q += ' WHERE ' + where.join(' AND ');
  q += ' ORDER BY c.created_at DESC';
  const r = await execSQL(q, params);
  return (r.rows._array||[]).map(c => ({
    ...c, users:{name:c.agent_name},
    pos_customers:{name:c.pos_name},
    invoice:{invoice_number:c.inv_number}
  }));
}
export async function getLocalUsers(role = null) {
  let q = 'SELECT * FROM users WHERE is_active=1';
  const params = [];
  if (role) { q += ' AND role=?'; params.push(role); }
  const r = await execSQL(q + ' ORDER BY name', params);
  return r.rows._array || [];
}
export async function getSyncQueueCount() {
  const r = await execSQL('SELECT COUNT(*) as cnt FROM sync_queue');
  return r.rows._array[0]?.cnt || 0;
}
export async function getAgentWallets(agentId = null) {
  let q = `SELECT aw.*, u.name as agent_name,
    c.name as cat_name, c.price as cat_price,
    b.batch_number, b.serial_number
    FROM agent_wallets aw
    LEFT JOIN users u ON aw.agent_id=u.id
    LEFT JOIN card_categories c ON aw.category_id=c.id
    LEFT JOIN batches b ON aw.batch_id=b.id`;
  const params = [];
  if (agentId) { q += ' WHERE aw.agent_id=?'; params.push(agentId); }
  q += ' ORDER BY aw.created_at DESC';
  const r = await execSQL(q, params);
  return (r.rows._array||[]).map(w => ({
    ...w,
    users:{name:w.agent_name},
    card_categories:{name:w.cat_name, price:w.cat_price},
    batches:{batch_number:w.batch_number, serial_number:w.serial_number},
    remaining_cards: w.total_cards - w.sold_cards,
  }));
}

// ── كتابة ─────────────────────────────────────────
export async function addToSyncQueue(table, op, id, payload) {
  await execSQL(
    'INSERT INTO sync_queue (table_name,operation,record_id,payload) VALUES (?,?,?,?)',
    [table, op, id, JSON.stringify(payload)]
  );
}

export async function createLocalInvoice(data) {
  const id = generateUUID(); const num = generateInvoiceNumber();
  const now = new Date().toISOString();
  await execSQL(
    `INSERT INTO invoices (id,invoice_number,pos_id,agent_id,type,total_amount,paid_amount,status,notes,invoice_date,synced,created_at)
     VALUES (?,?,?,?,?,0,0,?,?,?,0,?)`,
    [id,num,data.pos_id,data.agent_id,data.type||'credit',
     'pending',data.notes||'',data.invoice_date||now.split('T')[0],now]);
  await addToSyncQueue('invoices','INSERT',id,{...data,id,invoice_number:num,total_amount:0,status:'pending',created_at:now});
  return { id, invoice_number: num };
}

export async function addInvoiceItem(invoiceId, item) {
  const id = generateUUID();
  const now = new Date().toISOString();
  const qty = item.to_card - item.from_card + 1;
  const total = qty * item.unit_price;
  await execSQL(
    `INSERT INTO invoice_items (id,invoice_id,category_id,batch_id,wallet_id,from_card,to_card,quantity,unit_price,total_price,synced,created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,0,?)`,
    [id,invoiceId,item.category_id,item.batch_id,item.wallet_id||'',
     item.from_card,item.to_card,qty,item.unit_price,total,now]);
  if (item.wallet_id) {
    await execSQL('UPDATE agent_wallets SET sold_cards=sold_cards+? WHERE id=?',[qty,item.wallet_id]);
  }
  const totR = await execSQL('SELECT SUM(total_price) as tot FROM invoice_items WHERE invoice_id=?',[invoiceId]);
  const newTotal = totR.rows._array[0]?.tot || 0;
  await execSQL('UPDATE invoices SET total_amount=? WHERE id=?',[newTotal,invoiceId]);
  await addToSyncQueue('invoice_items','INSERT',id,{...item,id,invoice_id:invoiceId,quantity:qty,total_price:total,created_at:now});
  return { id, quantity: qty, total_price: total };
}

export async function createLocalCollection(data) {
  const id = generateUUID(); const num = generateCollectionNumber();
  const now = new Date().toISOString();
  await execSQL(
    `INSERT INTO collections (id,collection_number,agent_id,pos_id,invoice_id,amount,method,reference_number,status,collection_date,synced,created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,0,?)`,
    [id,num,data.agent_id,data.pos_id,data.invoice_id||'',data.amount,
     data.method||'cash',data.reference_number||'',
     'pending',data.collection_date||now.split('T')[0],now]);
  await addToSyncQueue('collections','INSERT',id,{...data,id,collection_number:num,status:'pending',created_at:now});
  return { id, collection_number: num };
}

export async function approveLocalCollection(id) {
  const now = new Date().toISOString();
  await execSQL("UPDATE collections SET status='approved',approved_at=? WHERE id=?",[now,id]);
  await addToSyncQueue('collections','UPDATE',id,{status:'approved',approved_at:now});
}
export async function rejectLocalCollection(id, reason) {
  await execSQL("UPDATE collections SET status='rejected',rejection_reason=? WHERE id=?",[reason||'مرفوض',id]);
  await addToSyncQueue('collections','UPDATE',id,{status:'rejected',rejection_reason:reason});
}

export async function createAgentWallet(data) {
  const id = generateUUID();
  const now = new Date().toISOString();
  const total = data.to_card - data.from_card + 1;
  await execSQL(
    `INSERT INTO agent_wallets (id,agent_id,batch_id,category_id,from_card,to_card,total_cards,sold_cards,issued_by,notes,synced,created_at)
     VALUES (?,?,?,?,?,?,?,0,?,?,0,?)`,
    [id,data.agent_id,data.batch_id,data.category_id,
     data.from_card,data.to_card,total,
     data.issued_by||'',data.notes||'',now]);
  await execSQL('UPDATE batches SET available_cards=available_cards-? WHERE id=?',[total,data.batch_id]);
  await addToSyncQueue('agent_wallets','INSERT',id,{...data,id,total_cards:total,sold_cards:0,created_at:now});
  return { id, total_cards: total };
}

export async function updatePOS(id, data) {
  const fields = Object.keys(data).map(k=>`${k}=?`).join(',');
  await execSQL(`UPDATE pos_customers SET ${fields} WHERE id=?`,[...Object.values(data),id]);
  await addToSyncQueue('pos_customers','UPDATE',id,data);
}
export async function updateUser(id, data) {
  const fields = Object.keys(data).map(k=>`${k}=?`).join(',');
  await execSQL(`UPDATE users SET ${fields} WHERE id=?`,[...Object.values(data),id]);
  await addToSyncQueue('users','UPDATE',id,data);
}
export async function updateCategory(id, data) {
  const fields = Object.keys(data).map(k=>`${k}=?`).join(',');
  await execSQL(`UPDATE card_categories SET ${fields} WHERE id=?`,[...Object.values(data),id]);
  await addToSyncQueue('card_categories','UPDATE',id,data);
}
export async function updateBatch(id, data) {
  const fields = Object.keys(data).map(k=>`${k}=?`).join(',');
  await execSQL(`UPDATE batches SET ${fields} WHERE id=?`,[...Object.values(data),id]);
  await addToSyncQueue('batches','UPDATE',id,data);
}
export async function updateWallet(id, data) {
  const fields = Object.keys(data).map(k=>`${k}=?`).join(',');
  await execSQL(`UPDATE agent_wallets SET ${fields} WHERE id=?`,[...Object.values(data),id]);
  await addToSyncQueue('agent_wallets','UPDATE',id,data);
}
export async function toggleLocalPOSBlock(id, blocked) {
  await execSQL('UPDATE pos_customers SET is_blocked=? WHERE id=?',[blocked?1:0,id]);
  await addToSyncQueue('pos_customers','UPDATE',id,{is_blocked:blocked});
}
