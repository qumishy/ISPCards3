import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Alert, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { colors, spacing, radius, fontSize } from '../theme';
import { supabase } from '../services/supabase';
import {
  createLocalInvoice, addInvoiceItem,
  createLocalCollection, createAgentWallet,
  softDeleteInvoice, getLocalInvoiceItems,
} from '../services/database';
import { todayISO, GOVERNORATES, getDistricts, formatCurrency } from '../utils/helpers';
import { Input, Btn, Loading, Row, Badge } from '../components/UI';
import { useAuth } from '../services/AuthContext';

// ── Picker بسيط ──────────────────────────────────
function Picker({ label, options, value, onChange, placeholder, loading: pLoading }) {
  const [open, setOpen] = useState(false);
  const selected = options.find(o => String(o.value) === String(value));
  return (
    <View style={{ marginBottom: spacing.md }}>
      {label && <Text style={st.label}>{label}</Text>}
      <TouchableOpacity style={st.picker} onPress={() => !pLoading && setOpen(!open)} activeOpacity={0.8}>
        {pLoading
          ? <ActivityIndicator size="small" color={colors.blue} style={{ flex: 1 }} />
          : <Text style={[st.pickerTxt, !selected && { color: colors.t3 }]}>
              {selected ? selected.label : (placeholder || 'اختر...')}
            </Text>
        }
        <Text style={{ color: colors.t3 }}>{open ? '▲' : '▼'}</Text>
      </TouchableOpacity>
      {open && (
        <View style={st.dropdown}>
          <ScrollView style={{ maxHeight: 220 }} nestedScrollEnabled>
            {options.length === 0
              ? <Text style={{ color:colors.t3, textAlign:'center', padding:spacing.md }}>لا توجد خيارات</Text>
              : options.map(opt => (
                <TouchableOpacity key={String(opt.value)}
                  style={[st.dropItem, String(value)===String(opt.value) && st.dropItemAct]}
                  onPress={() => { onChange(opt.value); setOpen(false); }}>
                  <Text style={[st.dropTxt, String(value)===String(opt.value) && { color:colors.blue, fontWeight:'700' }]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))
            }
          </ScrollView>
        </View>
      )}
    </View>
  );
}

// ══════════════════════════════════════════════════
// فاتورة جديدة — القوائم من Supabase، الحفظ في SQLite
// ══════════════════════════════════════════════════
export function NewInvoiceScreen({ navigation }) {
  const { user } = useAuth();
  const [pos, setPos] = useState([]);
  const [agents, setAgents] = useState([]);
  const [categories, setCategories] = useState([]);
  const [wallets, setWallets] = useState([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [form, setForm] = useState({
    pos_id: '', agent_id: user?.role==='agent' ? user.id : '',
    type: 'credit', invoice_date: todayISO(), notes: '', discount: '0',
  });
  const [items, setItems] = useState([]);
  const [newItem, setNewItem] = useState({ category_id:'', wallet_id:'', unit_price:'', quantity:'' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const agentId = user?.role === 'agent' ? user.id : null;
        const [posR, agentR, catR, walR] = await Promise.all([
          supabase.from('pos_customers').select('id,name').eq('is_blocked', false).order('name'),
          supabase.from('users').select('id,name').eq('role','agent').eq('is_active',true).order('name'),
          supabase.from('card_categories').select('id,name,price').eq('is_active',true).order('price'),
          agentId
            ? supabase.from('agent_wallets').select('id,agent_id,category_id,batch_id,from_card,to_card,total_cards,sold_cards,batches(batch_number,serial_number)').eq('agent_id',agentId)
            : supabase.from('agent_wallets').select('id,agent_id,category_id,batch_id,from_card,to_card,total_cards,sold_cards,batches(batch_number,serial_number)'),
        ]);
        setPos(posR.data || []);
        setAgents(agentR.data || []);
        setCategories(catR.data || []);
        const w = (walR.data||[]).map(x=>({...x, remaining_cards:(x.total_cards||0)-(x.sold_cards||0)}));
        setWallets(w.filter(x=>x.remaining_cards>0));
      } catch(e) { console.log('Load error:', e.message); }
      setDataLoading(false);
    }
    load();
  }, [user]);

  const onSelectCategory = (catId) => {
    const cat = categories.find(c => c.id === catId);
    const catWallets = wallets.filter(w => w.category_id === catId);
    setNewItem(f => ({
      ...f, category_id: catId,
      unit_price: String(cat?.price || ''),
      wallet_id: catWallets.length === 1 ? catWallets[0].id : '',
    }));
  };

  const itemTotal = () => (parseInt(newItem.quantity)||0) * (parseFloat(newItem.unit_price)||0);
  const subtotal = () => items.reduce((s,i) => s + i.total, 0);
  const discount = () => Math.max(0, parseFloat(form.discount)||0);
  const grandTotal = () => Math.max(0, subtotal() - discount());

  const addItem = () => {
    if (!newItem.category_id || !newItem.quantity || !newItem.unit_price) {
      Alert.alert('تنبيه', 'اختر الفئة وأدخل الكمية والسعر'); return;
    }
    const qty = parseInt(newItem.quantity) || 0;
    if (qty <= 0) { Alert.alert('خطأ', 'الكمية يجب أن تكون أكبر من صفر'); return; }
    const wallet = wallets.find(w => w.id === newItem.wallet_id);
    if (wallet && qty > wallet.remaining_cards) {
      Alert.alert('خطأ', `المتاح في المحفظة: ${wallet.remaining_cards} ورقة فقط`); return;
    }
    const cat = categories.find(c => c.id === newItem.category_id);
    setItems(prev => [...prev, {
      ...newItem,
      cat_name: cat?.name || '—',
      quantity: qty,
      unit_price: parseFloat(newItem.unit_price),
      total: itemTotal(),
      id: Date.now().toString(),
    }]);
    setNewItem({ category_id:'', wallet_id:'', unit_price:'', quantity:'' });
  };

  const removeItem = (id) => setItems(prev => prev.filter(i => i.id !== id));

  const save = async () => {
    if (!form.pos_id || !form.agent_id) { Alert.alert('تنبيه', 'اختر نقطة البيع والمندوب'); return; }
    if (items.length === 0) { Alert.alert('تنبيه', 'أضف بنداً واحداً على الأقل'); return; }
    setSaving(true);
    try {
      const total = subtotal();
      const disc = discount();
      const { id, invoice_number } = await createLocalInvoice({ ...form, total_amount: total, discount: disc });
      for (const item of items) {
        const wallet = wallets.find(w => w.id === item.wallet_id);
        const usedCards = wallet ? (wallet.from_card + wallet.sold_cards - 1) : 0;
        const fromCard = usedCards + 1;
        const toCard = fromCard + item.quantity - 1;
        await addInvoiceItem(id, {
          category_id: item.category_id,
          batch_id: wallet?.batch_id || '',
          wallet_id: item.wallet_id || '',
          from_card: fromCard, to_card: toCard,
          unit_price: item.unit_price,
          quantity: item.quantity,
        });
        // تحديث sold_cards في Supabase
        if (item.wallet_id && wallet) {
          await supabase.from('agent_wallets')
            .update({ sold_cards: (wallet.sold_cards||0) + item.quantity })
            .eq('id', item.wallet_id);
        }
      }
      setSaving(false);
      Alert.alert('✅ تم', `الفاتورة: ${invoice_number}\nالإجمالي: ${formatCurrency(grandTotal())}`, [
        { text: 'موافق', onPress: () => navigation.goBack() }
      ]);
    } catch(e) {
      setSaving(false);
      Alert.alert('خطأ', e.message);
    }
  };

  if (dataLoading) return <Loading />;

  const filteredWallets = wallets.filter(w => w.category_id === newItem.category_id);

  return (
    <KeyboardAvoidingView style={{ flex:1 }} behavior={Platform.OS==='ios'?'padding':undefined}>
      <ScrollView style={st.screen} contentContainerStyle={{ padding:spacing.md, paddingBottom:100 }}>

        {/* رأس الفاتورة */}
        <View style={st.invoiceHeader}>
          <Text style={st.invoiceTitle}>🧾 فاتورة مبيعات</Text>
          <Text style={st.invoiceDate}>{form.invoice_date}</Text>
        </View>

        <View style={st.section}>
          <Picker label="نقطة البيع *"
            options={pos.map(p => ({ value:p.id, label:p.name }))}
            value={form.pos_id} onChange={v => setForm({...form, pos_id:v})}
            placeholder="اختر العميل..."/>
          {user?.role !== 'agent' && (
            <Picker label="المندوب *"
              options={agents.map(a => ({ value:a.id, label:a.name }))}
              value={form.agent_id} onChange={v => setForm({...form, agent_id:v})}/>
          )}
          <Row style={{ gap:spacing.md }}>
            <View style={{ flex:1 }}>
              <Picker label="النوع"
                options={[{value:'credit',label:'آجل'},{value:'cash',label:'نقدي'}]}
                value={form.type} onChange={v => setForm({...form, type:v})}/>
            </View>
            <View style={{ flex:1 }}>
              <Input label="التاريخ" value={form.invoice_date}
                onChangeText={v => setForm({...form, invoice_date:v})} placeholder="YYYY-MM-DD"/>
            </View>
          </Row>
          <Input label="ملاحظات" value={form.notes}
            onChangeText={v => setForm({...form, notes:v})} placeholder="اختياري..." multiline/>
        </View>

        {/* البنود */}
        <View style={st.section}>
          <Text style={st.sectionTitle}>📋 البنود</Text>

          {items.length > 0 && (
            <View style={st.tableHeader}>
              <Text style={[st.thCell,{flex:2}]}>الفئة</Text>
              <Text style={[st.thCell,{flex:1}]}>الكمية</Text>
              <Text style={[st.thCell,{flex:1}]}>السعر</Text>
              <Text style={[st.thCell,{flex:1}]}>الإجمالي</Text>
              <Text style={[st.thCell,{width:28}]}> </Text>
            </View>
          )}

          {items.map((item, i) => (
            <View key={item.id} style={[st.tableRow, i%2===0 && {backgroundColor:colors.card2}]}>
              <Text style={[st.tdCell,{flex:2,color:colors.cyan,fontWeight:'600'}]}>{item.cat_name}</Text>
              <Text style={[st.tdCell,{flex:1}]}>{item.quantity}</Text>
              <Text style={[st.tdCell,{flex:1}]}>{formatCurrency(item.unit_price)}</Text>
              <Text style={[st.tdCell,{flex:1,color:colors.green,fontWeight:'700'}]}>{formatCurrency(item.total)}</Text>
              <TouchableOpacity style={{width:28,alignItems:'center'}} onPress={() => removeItem(item.id)}>
                <Text style={{color:colors.red,fontSize:15}}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}

          {/* إضافة بند */}
          <View style={st.addItemBox}>
            <Text style={st.addItemTitle}>+ إضافة بند</Text>
            <Picker label="الفئة *"
              options={categories.map(c => ({ value:c.id, label:`${c.name} — ${formatCurrency(c.price)}` }))}
              value={newItem.category_id} onChange={onSelectCategory}
              placeholder="اختر الفئة..."/>
            {filteredWallets.length > 0 && (
              <Picker label="المحفظة"
                options={filteredWallets.map(w => ({ value:w.id, label:`${w.batches?.batch_number||'—'} • متبقي: ${w.remaining_cards}` }))}
                value={newItem.wallet_id} onChange={v => setNewItem({...newItem, wallet_id:v})}/>
            )}
            <Row style={{ gap:spacing.sm }}>
              <View style={{ flex:1 }}>
                <Input label="عدد الأوراق *" value={newItem.quantity}
                  onChangeText={v => setNewItem({...newItem, quantity:v})} keyboardType="numeric" placeholder="0"/>
              </View>
              <View style={{ flex:1 }}>
                <Input label="سعر الورقة *" value={newItem.unit_price}
                  onChangeText={v => setNewItem({...newItem, unit_price:v})} keyboardType="numeric" placeholder="0"/>
              </View>
            </Row>
            {newItem.quantity && newItem.unit_price && itemTotal() > 0 && (
              <View style={st.preview}>
                <Text style={{color:colors.t3,fontSize:fontSize.xs}}>إجمالي البند</Text>
                <Text style={{color:colors.green,fontWeight:'800',fontSize:fontSize.xl}}>{formatCurrency(itemTotal())}</Text>
              </View>
            )}
            <Btn label="✅ إضافة البند" variant="success" size="sm" onPress={addItem}/>
          </View>

          {/* المجاميع */}
          {items.length > 0 && (
            <View style={st.totalsBox}>
              <Row style={{justifyContent:'space-between',marginBottom:spacing.sm}}>
                <Text style={{color:colors.t2}}>المجموع الفرعي</Text>
                <Text style={{color:colors.t1,fontWeight:'700'}}>{formatCurrency(subtotal())}</Text>
              </Row>
              <Row style={{alignItems:'center',marginBottom:spacing.sm}}>
                <Text style={{color:colors.t2,flex:1}}>الخصم (ر.ي)</Text>
                <View style={{width:140}}>
                  <Input value={form.discount} onChangeText={v => setForm({...form,discount:v})}
                    keyboardType="numeric" placeholder="0" style={{marginBottom:0}}/>
                </View>
              </Row>
              <Row style={{justifyContent:'space-between',paddingTop:spacing.sm,borderTopWidth:1,borderTopColor:colors.border2}}>
                <Text style={{fontSize:fontSize.lg,fontWeight:'700',color:colors.t1}}>الإجمالي الصافي</Text>
                <Text style={{fontSize:24,fontWeight:'800',color:colors.green}}>{formatCurrency(grandTotal())}</Text>
              </Row>
            </View>
          )}
        </View>

        <Row style={st.actions}>
          <Btn label="إلغاء" variant="outline" style={{flex:1}} onPress={() => navigation.goBack()}/>
          <Btn label={saving?'جاري الحفظ...':'💾 حفظ الفاتورة'} variant="primary" style={{flex:2}}
            onPress={save} disabled={saving || items.length===0}/>
        </Row>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ══════════════════════════════════════════════════
// تفاصيل الفاتورة
// ══════════════════════════════════════════════════
export function InvoiceDetailScreen({ route, navigation }) {
  const { id } = route.params;
  const { can } = useAuth();
  const [invoice, setInvoice] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const { data } = await supabase
          .from('invoices')
          .select('*,pos_customers(name),users(name)')
          .eq('id', id)
          .single();
        setInvoice(data);
        // بنود من SQLite
        const localItems = await getLocalInvoiceItems(id);
        if (localItems.length > 0) {
          setItems(localItems);
        } else {
          // من Supabase
          const { data: sbItems } = await supabase
            .from('invoice_items')
            .select('*,card_categories(name)')
            .eq('invoice_id', id);
          setItems((sbItems||[]).map(i=>({...i,cat_name:i.card_categories?.name||'—'})));
        }
      } catch(e) {}
      setLoading(false);
    }
    load();
  }, [id]);

  const handleDelete = () => Alert.alert('حذف الفاتورة','هل تريد حذف هذه الفاتورة؟',[
    {text:'إلغاء',style:'cancel'},
    {text:'حذف',style:'destructive',onPress:async()=>{
      await softDeleteInvoice(id);
      navigation.goBack();
    }},
  ]);

  if (loading) return <Loading/>;
  if (!invoice) return <View style={{flex:1,backgroundColor:colors.bg,alignItems:'center',justifyContent:'center'}}><Text style={{color:colors.t3}}>الفاتورة غير موجودة</Text></View>;

  return (
    <ScrollView style={st.screen} contentContainerStyle={{padding:spacing.md,paddingBottom:60}}>
      <View style={st.invoiceHeader}>
        <Text style={st.invoiceTitle}>{invoice.invoice_number}</Text>
        <Badge status={invoice.status}/>
      </View>
      <View style={st.section}>
        {[
          {l:'نقطة البيع', v:invoice.pos_customers?.name||'—'},
          {l:'المندوب', v:invoice.users?.name||'—'},
          {l:'التاريخ', v:invoice.invoice_date||'—'},
        ].map((item,i)=>(
          <Row key={i} style={{justifyContent:'space-between',paddingVertical:spacing.sm,borderBottomWidth:1,borderBottomColor:colors.border}}>
            <Text style={{color:colors.t3}}>{item.l}</Text>
            <Text style={{color:colors.t1,fontWeight:'700'}}>{item.v}</Text>
          </Row>
        ))}
        <Row style={{justifyContent:'space-between',paddingVertical:spacing.sm}}>
          <Text style={{color:colors.t3}}>النوع</Text>
          <Badge status={invoice.type}/>
        </Row>
      </View>

      <View style={st.section}>
        <Text style={st.sectionTitle}>📋 البنود</Text>
        {items.length===0
          ? <Text style={{textAlign:'center',color:colors.t3,padding:spacing.lg}}>لا توجد بنود</Text>
          : (<>
            <View style={st.tableHeader}>
              <Text style={[st.thCell,{flex:2}]}>الفئة</Text>
              <Text style={[st.thCell,{flex:1}]}>الكمية</Text>
              <Text style={[st.thCell,{flex:1}]}>سعر</Text>
              <Text style={[st.thCell,{flex:1}]}>إجمالي</Text>
            </View>
            {items.map((item,i)=>(
              <View key={item.id} style={[st.tableRow,i%2===0&&{backgroundColor:colors.card2}]}>
                <Text style={[st.tdCell,{flex:2,color:colors.cyan}]}>{item.cat_name||'—'}</Text>
                <Text style={[st.tdCell,{flex:1}]}>{item.quantity}</Text>
                <Text style={[st.tdCell,{flex:1}]}>{formatCurrency(item.unit_price)}</Text>
                <Text style={[st.tdCell,{flex:1,color:colors.green,fontWeight:'700'}]}>{formatCurrency(item.total_price)}</Text>
              </View>
            ))}
          </>)
        }
        <View style={st.totalsBox}>
          <Row style={{justifyContent:'space-between',marginBottom:spacing.xs}}>
            <Text style={{color:colors.t3}}>المجموع الفرعي</Text>
            <Text style={{color:colors.t1,fontWeight:'700'}}>{formatCurrency(invoice.total_amount)}</Text>
          </Row>
          {invoice.discount>0&&(
            <Row style={{justifyContent:'space-between',marginBottom:spacing.xs}}>
              <Text style={{color:colors.t3}}>الخصم</Text>
              <Text style={{color:colors.orange,fontWeight:'700'}}>- {formatCurrency(invoice.discount)}</Text>
            </Row>
          )}
          <Row style={{justifyContent:'space-between',paddingTop:spacing.sm,borderTopWidth:1,borderTopColor:colors.border2}}>
            <Text style={{fontSize:fontSize.lg,fontWeight:'700',color:colors.t1}}>الإجمالي الصافي</Text>
            <Text style={{fontSize:24,fontWeight:'800',color:colors.green}}>{formatCurrency(invoice.net_amount||invoice.total_amount)}</Text>
          </Row>
        </View>
      </View>

      {can('canDeleteInvoice') && invoice.status==='pending' && (
        <Btn label="🗑️ حذف الفاتورة" variant="danger" onPress={handleDelete} style={{marginTop:spacing.sm}}/>
      )}
    </ScrollView>
  );
}

// ══════════════════════════════════════════════════
// إشعار قبض — القوائم من Supabase، الحفظ في SQLite
// ══════════════════════════════════════════════════
export function NewCollectionScreen({ navigation }) {
  const { user } = useAuth();
  const [agents, setAgents] = useState([]);
  const [pos, setPos] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [form, setForm] = useState({
    agent_id: user?.role==='agent' ? user.id : '',
    pos_id:'', invoice_id:'', amount:'',
    method:'cash', reference_number:'', collection_date:todayISO(),
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const agentFilter = user?.role==='agent' ? user.id : null;
        const [agentR, posR, invR] = await Promise.all([
          supabase.from('users').select('id,name').eq('role','agent').eq('is_active',true).order('name'),
          supabase.from('pos_customers').select('id,name').order('name'),
          agentFilter
            ? supabase.from('invoices').select('id,invoice_number,total_amount,net_amount,paid_amount').eq('agent_id',agentFilter).neq('status','paid').eq('active',true).order('created_at',{ascending:false})
            : supabase.from('invoices').select('id,invoice_number,total_amount,net_amount,paid_amount').neq('status','paid').eq('active',true).order('created_at',{ascending:false}),
        ]);
        setAgents(agentR.data||[]);
        setPos(posR.data||[]);
        setInvoices(invR.data||[]);
      } catch(e) {}
      setDataLoading(false);
    }
    load();
  }, [user]);

  const onSelectInvoice = (invId) => {
    const inv = invoices.find(i => i.id === invId);
    setSelectedInvoice(inv||null);
    const remaining = inv ? Math.max(0,(inv.net_amount||inv.total_amount||0)-(inv.paid_amount||0)) : 0;
    setForm(f => ({ ...f, invoice_id: invId, amount: String(remaining) }));
  };

  const save = async () => {
    if (!form.agent_id||!form.pos_id||!form.amount) { Alert.alert('تنبيه','يرجى إكمال البيانات'); return; }
    const amt = parseFloat(form.amount)||0;
    if (amt <= 0) { Alert.alert('خطأ','المبلغ يجب أن يكون أكبر من صفر'); return; }
    if (selectedInvoice) {
      const maxAmt = Math.max(0,(selectedInvoice.net_amount||selectedInvoice.total_amount||0)-(selectedInvoice.paid_amount||0));
      if (amt > maxAmt) { Alert.alert('خطأ',`المبلغ يتجاوز المستحق\nأقصى مبلغ: ${formatCurrency(maxAmt)}`); return; }
    }
    setSaving(true);
    const { collection_number } = await createLocalCollection({ ...form, amount: amt });
    setSaving(false);
    Alert.alert('✅ تم',`تم رفع الإشعار: ${collection_number}`,[{text:'موافق',onPress:()=>navigation.goBack()}]);
  };

  if (dataLoading) return <Loading/>;

  return (
    <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}>
      <ScrollView style={st.screen} contentContainerStyle={{padding:spacing.lg,paddingBottom:100}}>
        {user?.role!=='agent'&&(
          <Picker label="المندوب *" options={agents.map(a=>({value:a.id,label:a.name}))}
            value={form.agent_id} onChange={v=>setForm({...form,agent_id:v})}/>
        )}
        <Picker label="نقطة البيع *" options={pos.map(p=>({value:p.id,label:p.name}))}
          value={form.pos_id} onChange={v=>setForm({...form,pos_id:v})}/>
        <Picker label="الفاتورة المرتبطة"
          options={[{value:'',label:'— بدون فاتورة —'},...invoices.map(i=>({value:i.id,label:`${i.invoice_number} — ${formatCurrency(i.net_amount||i.total_amount)}`}))]}
          value={form.invoice_id} onChange={onSelectInvoice}/>
        {selectedInvoice&&(
          <View style={st.infoBox}>
            <Row style={{justifyContent:'space-between',marginBottom:spacing.xs}}>
              <Text style={{color:colors.t3,fontSize:fontSize.sm}}>إجمالي الفاتورة</Text>
              <Text style={{color:colors.t1,fontWeight:'700'}}>{formatCurrency(selectedInvoice.net_amount||selectedInvoice.total_amount)}</Text>
            </Row>
            <Row style={{justifyContent:'space-between'}}>
              <Text style={{color:colors.t3,fontSize:fontSize.sm}}>المستحق</Text>
              <Text style={{color:colors.orange,fontWeight:'800',fontSize:fontSize.lg}}>
                {formatCurrency(Math.max(0,(selectedInvoice.net_amount||selectedInvoice.total_amount||0)-(selectedInvoice.paid_amount||0)))}
              </Text>
            </Row>
          </View>
        )}
        <Input label="المبلغ (ر.ي) *" value={form.amount}
          onChangeText={v=>setForm({...form,amount:v})} keyboardType="numeric" placeholder="0"/>
        <Picker label="طريقة القبض"
          options={[{value:'cash',label:'نقدي'},{value:'transfer',label:'تحويل بنكي'},{value:'check',label:'شيك'}]}
          value={form.method} onChange={v=>setForm({...form,method:v})}/>
        {form.method!=='cash'&&(
          <Input label="رقم المرجع" value={form.reference_number}
            onChangeText={v=>setForm({...form,reference_number:v})} placeholder="REF-..."/>
        )}
        <Input label="التاريخ" value={form.collection_date}
          onChangeText={v=>setForm({...form,collection_date:v})} placeholder="YYYY-MM-DD"/>
        <Row style={st.actions}>
          <Btn label="إلغاء" variant="outline" style={{flex:1}} onPress={()=>navigation.goBack()}/>
          <Btn label={saving?'جاري الرفع...':'💾 رفع الإشعار'} variant="primary" style={{flex:2}} onPress={save} disabled={saving}/>
        </Row>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ══════════════════════════════════════════════════
// توزيع أوراق — من Supabase، الحفظ في Supabase
// ══════════════════════════════════════════════════
export function AssignWalletScreen({ navigation }) {
  const { user } = useAuth();
  const [agents, setAgents] = useState([]);
  const [batches, setBatches] = useState([]);
  const [cats, setCats] = useState([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [form, setForm] = useState({ agent_id:'', category_id:'', batch_id:'', quantity:'', notes:'' });
  const [batchInfo, setBatchInfo] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(()=>{
    async function load() {
      try {
        const [aR, bR, cR] = await Promise.all([
          supabase.from('users').select('id,name').eq('role','agent').eq('is_active',true).order('name'),
          supabase.from('batches').select('*').gt('available_cards',0).order('created_at',{ascending:false}),
          supabase.from('card_categories').select('id,name,price').eq('is_active',true).order('price'),
        ]);
        setAgents(aR.data||[]);
        setBatches(bR.data||[]);
        setCats(cR.data||[]);
      } catch(e) {}
      setDataLoading(false);
    }
    load();
  },[]);

  const onSelectCategory = (catId) => {
    const catBatches = batches.filter(b=>b.category_id===catId);
    setForm(f=>({...f,category_id:catId,batch_id:catBatches.length===1?catBatches[0].id:''}));
    if(catBatches.length===1) setBatchInfo(catBatches[0]); else setBatchInfo(null);
  };
  const onSelectBatch = (batchId) => {
    setBatchInfo(batches.find(b=>b.id===batchId)||null);
    setForm(f=>({...f,batch_id:batchId}));
  };
  const filteredBatches = batches.filter(b=>b.category_id===form.category_id);

  const save = async () => {
    if (!form.agent_id||!form.category_id||!form.batch_id||!form.quantity) {
      Alert.alert('تنبيه','يرجى إكمال جميع البيانات'); return;
    }
    const qty = parseInt(form.quantity);
    if (!batchInfo||qty>batchInfo.available_cards) {
      Alert.alert('خطأ',`المتاح في الدفعة: ${batchInfo?.available_cards||0} ورقة`); return;
    }
    const usedCards = (batchInfo.total_cards||39) - (batchInfo.available_cards||0);
    const fromCard = usedCards + 1;
    const toCard = fromCard + qty - 1;
    setSaving(true);
    try {
      // حفظ مباشرة في Supabase
      const { error } = await supabase.from('agent_wallets').insert({
        agent_id: form.agent_id, batch_id: form.batch_id,
        category_id: form.category_id,
        from_card: fromCard, to_card: toCard,
        total_cards: qty, sold_cards: 0,
        issued_by: user?.id, notes: form.notes||null,
      });
      if (error) throw error;
      // تحديث المخزون
      await supabase.from('batches').update({ available_cards: batchInfo.available_cards - qty }).eq('id', form.batch_id);
      setSaving(false);
      Alert.alert('✅ تم',`تم توزيع ${qty} ورقة`,[
        {text:'توزيع آخر',onPress:()=>{setForm({agent_id:'',category_id:'',batch_id:'',quantity:'',notes:''});setBatchInfo(null);}},
        {text:'موافق',onPress:()=>navigation.goBack()},
      ]);
    } catch(e) { setSaving(false); Alert.alert('خطأ',e.message); }
  };

  if (dataLoading) return <Loading/>;

  return (
    <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}>
      <ScrollView style={st.screen} contentContainerStyle={{padding:spacing.lg,paddingBottom:100}}>
        <Picker label="المندوب *" options={agents.map(a=>({value:a.id,label:a.name}))}
          value={form.agent_id} onChange={v=>setForm({...form,agent_id:v})}/>
        <Picker label="الفئة *"
          options={cats.map(c=>({value:c.id,label:`${c.name} — ${formatCurrency(c.price)}`}))}
          value={form.category_id} onChange={onSelectCategory} placeholder="اختر فئة الكرت..."/>
        {filteredBatches.length>0&&(
          <Picker label="الدفعة *"
            options={filteredBatches.map(b=>({value:b.id,label:`${b.batch_number} • متاح: ${b.available_cards}`}))}
            value={form.batch_id} onChange={onSelectBatch}/>
        )}
        {batchInfo&&(
          <View style={st.infoBox}>
            <Row style={{justifyContent:'space-between',marginBottom:spacing.xs}}>
              <Text style={{color:colors.t3,fontSize:fontSize.sm}}>الرقم التسلسلي</Text>
              <Text style={{color:colors.cyan,fontWeight:'700'}}>{batchInfo.serial_number}</Text>
            </Row>
            <Row style={{justifyContent:'space-between'}}>
              <Text style={{color:colors.t3,fontSize:fontSize.sm}}>المتاح للتوزيع</Text>
              <Text style={{color:colors.green,fontWeight:'800',fontSize:fontSize.lg}}>{batchInfo.available_cards} ورقة</Text>
            </Row>
          </View>
        )}
        <Input label="عدد الأوراق *" value={form.quantity}
          onChangeText={v=>setForm({...form,quantity:v})} keyboardType="numeric"
          placeholder={batchInfo?`من 1 إلى ${batchInfo.available_cards}`:'أدخل العدد'}/>
        {form.quantity&&batchInfo&&parseInt(form.quantity)>0&&(
          <View style={st.preview}>
            <Text style={{color:colors.t3,fontSize:fontSize.xs}}>سيتم توزيع</Text>
            <Text style={{color:colors.green,fontWeight:'800',fontSize:fontSize.xl}}>{parseInt(form.quantity)} ورقة</Text>
          </View>
        )}
        <Input label="ملاحظات" value={form.notes}
          onChangeText={v=>setForm({...form,notes:v})} placeholder="اختياري..." multiline/>
        <Row style={st.actions}>
          <Btn label="إلغاء" variant="outline" style={{flex:1}} onPress={()=>navigation.goBack()}/>
          <Btn label={saving?'جاري التوزيع...':'✅ توزيع الأوراق'} variant="primary" style={{flex:2}} onPress={save} disabled={saving}/>
        </Row>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ══════════════════════════════════════════════════
// إضافة دفعة + نقطة بيع جديدة + تعديل
// ══════════════════════════════════════════════════
export function AddBatchScreen({ navigation }) {
  const [cats, setCats] = useState([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [form, setForm] = useState({ category_id:'', serial_number:'', total_cards:'39', received_date:todayISO() });
  const [saving, setSaving] = useState(false);

  useEffect(()=>{
    supabase.from('card_categories').select('id,name,price').eq('is_active',true).order('price')
      .then(({data})=>{ setCats(data||[]); setDataLoading(false); });
  },[]);

  const save = async () => {
    if (!form.category_id||!form.serial_number) { Alert.alert('تنبيه','اختر الفئة وأدخل الرقم التسلسلي'); return; }
    setSaving(true);
    const num = 'BTH-'+(Math.floor(Math.random()*90000)+10000);
    const total = parseInt(form.total_cards)||39;
    const { data, error } = await supabase.from('batches').insert({
      batch_number:num, category_id:form.category_id, serial_number:form.serial_number,
      total_cards:total, available_cards:total, received_date:form.received_date, status:'active',
    }).select().single();
    setSaving(false);
    if (error) { Alert.alert('خطأ',error.message); return; }
    Alert.alert('✅ تم',`تم إضافة الدفعة: ${data.batch_number}`,[{text:'موافق',onPress:()=>navigation.goBack()}]);
  };

  if (dataLoading) return <Loading/>;
  return (
    <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}>
      <ScrollView style={st.screen} contentContainerStyle={{padding:spacing.lg,paddingBottom:100}}>
        <Picker label="فئة الكرت *"
          options={cats.map(c=>({value:c.id,label:`${c.name} — ${formatCurrency(c.price)}`}))}
          value={form.category_id} onChange={v=>setForm({...form,category_id:v})} placeholder="اختر الفئة..."/>
        <Input label="الرقم التسلسلي *" value={form.serial_number} onChangeText={v=>setForm({...form,serial_number:v})} placeholder="مثال: 2444"/>
        <Input label="عدد الأوراق" value={form.total_cards} onChangeText={v=>setForm({...form,total_cards:v})} keyboardType="numeric"/>
        <Input label="تاريخ الوصول" value={form.received_date} onChangeText={v=>setForm({...form,received_date:v})} placeholder="YYYY-MM-DD"/>
        {form.serial_number&&(
          <View style={st.preview}>
            <Text style={{color:colors.t3,fontSize:fontSize.xs,marginBottom:4}}>معاينة الترقيم</Text>
            <Text style={{color:colors.cyan,fontWeight:'700',textAlign:'center'}}>1-{form.serial_number} → {form.total_cards}-{form.serial_number}</Text>
          </View>
        )}
        <Row style={st.actions}>
          <Btn label="إلغاء" variant="outline" style={{flex:1}} onPress={()=>navigation.goBack()}/>
          <Btn label={saving?'...':'✅ حفظ الدفعة'} variant="success" style={{flex:2}} onPress={save} disabled={saving}/>
        </Row>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function NewPOSScreen({ navigation }) {
  const [agents, setAgents] = useState([]);
  const [form, setForm] = useState({name:'',owner_name:'',phone:'',governorate:'صنعاء',district:'',area:'',credit_limit:'500000',assigned_agent_id:''});
  const [saving, setSaving] = useState(false);
  useEffect(()=>{ supabase.from('users').select('id,name').eq('role','agent').eq('is_active',true).then(({data})=>setAgents(data||[])); },[]);
  const save = async () => {
    if (!form.name) { Alert.alert('تنبيه','يرجى إدخال اسم نقطة البيع'); return; }
    setSaving(true);
    const city=[form.governorate,form.district,form.area].filter(Boolean).join(' / ');
    const { error } = await supabase.from('pos_customers').insert({name:form.name,owner_name:form.owner_name,phone:form.phone,city,credit_limit:parseFloat(form.credit_limit)||500000,credit_used:0,is_blocked:false,assigned_agent_id:form.assigned_agent_id||null,active:true});
    setSaving(false);
    if (error) { Alert.alert('خطأ',error.message); return; }
    Alert.alert('✅ تم','تم إضافة نقطة البيع',[{text:'موافق',onPress:()=>navigation.goBack()}]);
  };
  const districts = getDistricts(form.governorate);
  return (
    <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}>
      <ScrollView style={st.screen} contentContainerStyle={{padding:spacing.lg,paddingBottom:100}}>
        <Input label="اسم المحل *" value={form.name} onChangeText={v=>setForm({...form,name:v})} placeholder="..."/>
        <Input label="اسم المالك" value={form.owner_name} onChangeText={v=>setForm({...form,owner_name:v})} placeholder="..."/>
        <Input label="رقم الجوال" value={form.phone} onChangeText={v=>setForm({...form,phone:v})} keyboardType="phone-pad"/>
        <Picker label="المحافظة *" options={GOVERNORATES.map(g=>({value:g,label:g}))} value={form.governorate} onChange={v=>setForm({...form,governorate:v,district:'',area:''})}/>
        {districts.length>0&&<Picker label="المديرية" options={[{value:'',label:'— اختر —'},...districts.map(d=>({value:d,label:d}))]} value={form.district} onChange={v=>setForm({...form,district:v})}/>}
        <Input label="العزلة / الحارة" value={form.area} onChangeText={v=>setForm({...form,area:v})} placeholder="اختياري"/>
        <Input label="الحد الائتماني (ر.ي)" value={form.credit_limit} onChangeText={v=>setForm({...form,credit_limit:v})} keyboardType="numeric"/>
        <Picker label="المندوب المسؤول" options={[{value:'',label:'— بدون —'},...agents.map(a=>({value:a.id,label:a.name}))]} value={form.assigned_agent_id} onChange={v=>setForm({...form,assigned_agent_id:v})}/>
        <Row style={st.actions}>
          <Btn label="إلغاء" variant="outline" style={{flex:1}} onPress={()=>navigation.goBack()}/>
          <Btn label={saving?'...':'✅ إضافة'} variant="primary" style={{flex:2}} onPress={save} disabled={saving}/>
        </Row>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function EditPOSScreen({ route, navigation }) {
  const {id}=route.params;
  const [agents,setAgents]=useState([]);
  const [form,setForm]=useState(null);
  const [saving,setSaving]=useState(false);
  useEffect(()=>{
    async function load(){
      const [posR,aR]=await Promise.all([
        supabase.from('pos_customers').select('*').eq('id',id).single(),
        supabase.from('users').select('id,name').eq('role','agent').eq('is_active',true),
      ]);
      const p=posR.data;
      if(p) setForm({name:p.name||'',owner_name:p.owner_name||'',phone:p.phone||'',city:p.city||'',credit_limit:String(p.credit_limit||500000),assigned_agent_id:p.assigned_agent_id||''});
      setAgents(aR.data||[]);
    }
    load();
  },[id]);
  const save=async()=>{
    if(!form?.name){Alert.alert('تنبيه','الاسم مطلوب');return;}
    setSaving(true);
    await supabase.from('pos_customers').update({name:form.name,owner_name:form.owner_name,phone:form.phone,city:form.city,credit_limit:parseFloat(form.credit_limit)||500000,assigned_agent_id:form.assigned_agent_id||null}).eq('id',id);
    setSaving(false);
    Alert.alert('✅ تم','تم التعديل',[{text:'موافق',onPress:()=>navigation.goBack()}]);
  };
  if(!form) return <Loading/>;
  return (
    <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}>
      <ScrollView style={st.screen} contentContainerStyle={{padding:spacing.lg,paddingBottom:100}}>
        <Input label="اسم المحل *" value={form.name} onChangeText={v=>setForm({...form,name:v})}/>
        <Input label="اسم المالك" value={form.owner_name} onChangeText={v=>setForm({...form,owner_name:v})}/>
        <Input label="رقم الجوال" value={form.phone} onChangeText={v=>setForm({...form,phone:v})} keyboardType="phone-pad"/>
        <Input label="المدينة / المنطقة" value={form.city} onChangeText={v=>setForm({...form,city:v})}/>
        <Input label="الحد الائتماني (ر.ي)" value={form.credit_limit} onChangeText={v=>setForm({...form,credit_limit:v})} keyboardType="numeric"/>
        <Picker label="المندوب المسؤول" options={[{value:'',label:'— بدون —'},...agents.map(a=>({value:a.id,label:a.name}))]} value={form.assigned_agent_id} onChange={v=>setForm({...form,assigned_agent_id:v})}/>
        <Row style={st.actions}>
          <Btn label="إلغاء" variant="outline" style={{flex:1}} onPress={()=>navigation.goBack()}/>
          <Btn label={saving?'...':'💾 حفظ التعديل'} variant="primary" style={{flex:2}} onPress={save} disabled={saving}/>
        </Row>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  screen:{flex:1,backgroundColor:colors.bg},
  label:{fontSize:fontSize.sm,fontWeight:'700',color:colors.t2,marginBottom:5},
  picker:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',backgroundColor:colors.bg,borderWidth:1,borderColor:colors.border2,borderRadius:radius.sm,padding:spacing.md,marginBottom:spacing.md},
  pickerTxt:{fontSize:fontSize.md,color:colors.t1,flex:1,marginLeft:8},
  dropdown:{backgroundColor:colors.card2,borderWidth:1,borderColor:colors.border2,borderRadius:radius.sm,marginTop:-spacing.md,marginBottom:spacing.md,zIndex:999,elevation:5},
  dropItem:{padding:spacing.md,borderBottomWidth:1,borderBottomColor:colors.border},
  dropItemAct:{backgroundColor:colors.blue+'11'},
  dropTxt:{fontSize:fontSize.md,color:colors.t1},
  invoiceHeader:{backgroundColor:colors.card2,borderTopWidth:3,borderTopColor:colors.blue,borderRadius:radius.md,padding:spacing.lg,marginBottom:spacing.sm,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
  invoiceTitle:{fontSize:fontSize.xxl,fontWeight:'800',color:colors.t1},
  invoiceDate:{fontSize:fontSize.sm,color:colors.t3},
  section:{backgroundColor:colors.card,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,padding:spacing.md,marginBottom:spacing.md},
  sectionTitle:{fontSize:fontSize.lg,fontWeight:'700',color:colors.t1,marginBottom:spacing.md},
  tableHeader:{flexDirection:'row',backgroundColor:colors.bg2,padding:spacing.sm,borderRadius:radius.sm,marginBottom:spacing.xs},
  thCell:{fontSize:fontSize.xs,fontWeight:'700',color:colors.t3,textAlign:'center'},
  tableRow:{flexDirection:'row',paddingVertical:spacing.sm,paddingHorizontal:spacing.xs,borderRadius:4,marginBottom:2},
  tdCell:{fontSize:fontSize.sm,color:colors.t1,textAlign:'center'},
  addItemBox:{backgroundColor:colors.bg2,borderRadius:radius.sm,padding:spacing.md,marginTop:spacing.md,borderWidth:1,borderColor:colors.border2,borderStyle:'dashed'},
  addItemTitle:{fontSize:fontSize.md,fontWeight:'700',color:colors.blue,marginBottom:spacing.md},
  preview:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',backgroundColor:colors.bg,borderRadius:radius.sm,padding:spacing.sm,marginBottom:spacing.sm},
  totalsBox:{marginTop:spacing.md,backgroundColor:colors.bg2,borderRadius:radius.md,padding:spacing.md},
  infoBox:{backgroundColor:colors.blue+'11',borderRadius:radius.sm,padding:spacing.md,marginBottom:spacing.md,borderWidth:1,borderColor:colors.blue+'33'},
  actions:{flexDirection:'row',gap:spacing.md,marginTop:spacing.sm},
});
