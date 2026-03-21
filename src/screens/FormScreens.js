import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Alert, KeyboardAvoidingView, Platform, TextInput,
} from 'react-native';
import { colors, spacing, radius, fontSize } from '../theme';
import {
  getLocalPOS, getLocalCategories, getLocalBatches, getLocalUsers,
  getAgentWallets, createLocalInvoice, addInvoiceItem,
  createLocalCollection, createAgentWallet, execSQL,
  updatePOS, updateUser, updateCategory,
} from '../services/database';
import { posService, inventoryService } from '../services/supabase';
import { todayISO, GOVERNORATES, getDistricts, formatCurrency } from '../utils/helpers';
import { Input, Btn, Loading, Row, Badge } from '../components/UI';
import { useAuth } from '../services/AuthContext';

// ── Picker ────────────────────────────────────────
function Picker({ label, options, value, onChange, placeholder }) {
  const [open, setOpen] = useState(false);
  const selected = options.find(o => o.value === value);
  return (
    <View style={{ marginBottom: spacing.md }}>
      {label && <Text style={st.label}>{label}</Text>}
      <TouchableOpacity style={st.picker} onPress={() => setOpen(!open)} activeOpacity={0.8}>
        <Text style={[st.pickerTxt, !selected && { color: colors.t3 }]}>
          {selected ? selected.label : placeholder || 'اختر...'}
        </Text>
        <Text style={{ color: colors.t3 }}>{open ? '▲' : '▼'}</Text>
      </TouchableOpacity>
      {open && (
        <View style={st.dropdown}>
          <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
            {options.map(opt => (
              <TouchableOpacity key={String(opt.value)} style={[st.dropItem, value===opt.value&&st.dropItemAct]}
                onPress={() => { onChange(opt.value); setOpen(false); }}>
                <Text style={[st.dropTxt, value===opt.value&&{color:colors.blue,fontWeight:'700'}]}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

// ══════════════════════════════════════════════════
// فاتورة جديدة مع البنود في نفس الواجهة
// ══════════════════════════════════════════════════
export function NewInvoiceScreen({ navigation }) {
  const { user } = useAuth();
  const [pos, setPos] = useState([]);
  const [agents, setAgents] = useState([]);
  const [categories, setCategories] = useState([]);
  const [wallets, setWallets] = useState([]);
  const [form, setForm] = useState({
    pos_id: '', agent_id: user?.role==='agent'?user.id:'',
    type: 'credit', invoice_date: todayISO(), notes: ''
  });
  const [items, setItems] = useState([]); // بنود الفاتورة
  const [newItem, setNewItem] = useState({ category_id:'', wallet_id:'', unit_price:'', quantity:'' });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [invoiceId, setInvoiceId] = useState(null); // بعد الحفظ الأولي

  useEffect(() => {
    async function load() {
      const agentId = user?.role==='agent' ? user.id : null;
      const [p, a, c, w] = await Promise.all([
        getLocalPOS(), getLocalUsers('agent'),
        getLocalCategories(),
        getAgentWallets(agentId),
      ]);
      setPos(p.filter(x=>!x.is_blocked));
      setAgents(a);
      setCategories(c);
      setWallets(w.filter(x=>x.remaining_cards>0));
      setLoading(false);
    }
    load();
  }, [user]);

  // عند اختيار الفئة — ملء السعر وتصفية المحافظ
  const onSelectCategory = (catId) => {
    const cat = categories.find(c=>c.id===catId);
    const catWallets = wallets.filter(w=>w.category_id===catId);
    setNewItem(f => ({
      ...f,
      category_id: catId,
      unit_price: String(cat?.price||''),
      wallet_id: catWallets.length===1 ? catWallets[0].id : '',
    }));
  };

  const itemTotal = () => {
    const qty = parseInt(newItem.quantity)||0;
    const price = parseFloat(newItem.unit_price)||0;
    return qty * price;
  };

  const grandTotal = () => items.reduce((s,i)=>s+(i.total||0), 0);

  const addItem = () => {
    if (!newItem.category_id||!newItem.quantity||!newItem.unit_price) {
      Alert.alert('تنبيه','اختر الفئة وأدخل الكمية والسعر'); return;
    }
    const qty = parseInt(newItem.quantity)||0;
    const wallet = wallets.find(w=>w.id===newItem.wallet_id);
    if (wallet && qty > wallet.remaining_cards) {
      Alert.alert('خطأ',`المتاح في المحفظة: ${wallet.remaining_cards} ورقة فقط`); return;
    }
    const cat = categories.find(c=>c.id===newItem.category_id);
    const total = itemTotal();
    setItems(prev=>[...prev,{
      ...newItem,
      cat_name: cat?.name||'—',
      quantity: qty,
      unit_price: parseFloat(newItem.unit_price),
      total,
      id: Date.now().toString(),
    }]);
    setNewItem({ category_id:'', wallet_id:'', unit_price:'', quantity:'' });
  };

  const removeItem = (id) => setItems(prev=>prev.filter(i=>i.id!==id));

  const save = async () => {
    if (!form.pos_id||!form.agent_id) { Alert.alert('تنبيه','اختر نقطة البيع والمندوب'); return; }
    if (items.length===0) { Alert.alert('تنبيه','أضف بنداً واحداً على الأقل'); return; }
    setSaving(true);
    try {
      const { id, invoice_number } = await createLocalInvoice(form);
      for (const item of items) {
        // نحسب from/to من المحفظة تلقائياً
        const wallet = wallets.find(w=>w.id===item.wallet_id);
        const fromCard = wallet ? wallet.from_card + wallet.sold_cards : 1;
        const toCard = fromCard + item.quantity - 1;
        await addInvoiceItem(id, {
          category_id: item.category_id,
          batch_id: wallet?.batch_id||'',
          wallet_id: item.wallet_id||'',
          from_card: fromCard,
          to_card: toCard,
          unit_price: item.unit_price,
          quantity: item.quantity,
        });
      }
      setSaving(false);
      Alert.alert('✅ تم',`الفاتورة: ${invoice_number}\nالإجمالي: ${formatCurrency(grandTotal())}`,[
        {text:'موافق',onPress:()=>navigation.goBack()}
      ]);
    } catch(e) {
      setSaving(false);
      Alert.alert('خطأ',e.message);
    }
  };

  if (loading) return <Loading />;

  const filteredWallets = wallets.filter(w=>w.category_id===newItem.category_id);

  return (
    <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}>
      <ScrollView style={st.screen} contentContainerStyle={{padding:spacing.md,paddingBottom:100}}>

        {/* ═══ رأس الفاتورة ═══ */}
        <View style={st.invoiceHeader}>
          <Text style={st.invoiceTitle}>فاتورة مبيعات</Text>
          <Text style={st.invoiceDate}>{form.invoice_date}</Text>
        </View>

        <View style={st.invoiceBody}>
          <Picker label="نقطة البيع *" options={pos.map(p=>({value:p.id,label:p.name}))}
            value={form.pos_id} onChange={v=>setForm({...form,pos_id:v})} placeholder="اختر العميل..."/>
          {user?.role!=='agent'&&(
            <Picker label="المندوب *" options={agents.map(a=>({value:a.id,label:a.name}))}
              value={form.agent_id} onChange={v=>setForm({...form,agent_id:v})}/>
          )}
          <Row style={{gap:spacing.md}}>
            <View style={{flex:1}}>
              <Picker label="النوع"
                options={[{value:'credit',label:'آجل'},{value:'cash',label:'نقدي'}]}
                value={form.type} onChange={v=>setForm({...form,type:v})}/>
            </View>
            <View style={{flex:1}}>
              <Input label="التاريخ" value={form.invoice_date}
                onChangeText={v=>setForm({...form,invoice_date:v})} placeholder="YYYY-MM-DD"/>
            </View>
          </Row>
          <Input label="ملاحظات" value={form.notes}
            onChangeText={v=>setForm({...form,notes:v})} placeholder="اختياري..." multiline/>
        </View>

        {/* ═══ جدول البنود ═══ */}
        <View style={st.itemsSection}>
          <Text style={st.sectionTitle}>📋 البنود</Text>

          {/* رأس الجدول */}
          {items.length>0&&(
            <View style={st.tableHeader}>
              <Text style={[st.thCell,{flex:2}]}>الفئة</Text>
              <Text style={[st.thCell,{flex:1}]}>الكمية</Text>
              <Text style={[st.thCell,{flex:1}]}>السعر</Text>
              <Text style={[st.thCell,{flex:1}]}>الإجمالي</Text>
              <Text style={[st.thCell,{width:30}]}> </Text>
            </View>
          )}

          {/* البنود المضافة */}
          {items.map((item,i)=>(
            <View key={item.id} style={[st.tableRow,i%2===0&&{backgroundColor:colors.card2}]}>
              <Text style={[st.tdCell,{flex:2,color:colors.cyan,fontWeight:'700'}]}>{item.cat_name}</Text>
              <Text style={[st.tdCell,{flex:1}]}>{item.quantity}</Text>
              <Text style={[st.tdCell,{flex:1}]}>{formatCurrency(item.unit_price)}</Text>
              <Text style={[st.tdCell,{flex:1,color:colors.green,fontWeight:'700'}]}>{formatCurrency(item.total)}</Text>
              <TouchableOpacity style={{width:30,alignItems:'center'}} onPress={()=>removeItem(item.id)}>
                <Text style={{color:colors.red,fontSize:16}}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}

          {/* إضافة بند جديد */}
          <View style={st.addItemBox}>
            <Text style={st.addItemTitle}>+ إضافة بند</Text>
            <Picker label="الفئة *"
              options={categories.map(c=>({value:c.id,label:`${c.name} — ${formatCurrency(c.price)}`}))}
              value={newItem.category_id} onChange={onSelectCategory} placeholder="اختر الفئة..."/>

            {filteredWallets.length>0&&(
              <Picker label="المحفظة"
                options={filteredWallets.map(w=>({value:w.id,label:`${w.batches?.batch_number||'—'} • متبقي: ${w.remaining_cards}`}))}
                value={newItem.wallet_id} onChange={v=>setNewItem({...newItem,wallet_id:v})}/>
            )}

            <Row style={{gap:spacing.sm}}>
              <View style={{flex:1}}>
                <Input label="عدد الأوراق *" value={newItem.quantity}
                  onChangeText={v=>setNewItem({...newItem,quantity:v})} keyboardType="numeric" placeholder="0"/>
              </View>
              <View style={{flex:1}}>
                <Input label="سعر الورقة *" value={newItem.unit_price}
                  onChangeText={v=>setNewItem({...newItem,unit_price:v})} keyboardType="numeric" placeholder="0"/>
              </View>
            </Row>

            {/* معاينة */}
            {newItem.quantity&&newItem.unit_price&&itemTotal()>0&&(
              <View style={st.itemPreview}>
                <Text style={{color:colors.t3}}>إجمالي البند</Text>
                <Text style={{color:colors.green,fontWeight:'800',fontSize:fontSize.xl}}>{formatCurrency(itemTotal())}</Text>
              </View>
            )}

            <Btn label="✅ إضافة البند" variant="success" size="sm" onPress={addItem}/>
          </View>

          {/* الإجمالي العام */}
          {items.length>0&&(
            <View style={st.grandTotal}>
              <Text style={st.grandTotalLabel}>الإجمالي العام للفاتورة</Text>
              <Text style={st.grandTotalVal}>{formatCurrency(grandTotal())}</Text>
              <Text style={st.grandTotalSub}>{items.length} بند • {items.reduce((s,i)=>s+i.quantity,0)} ورقة</Text>
            </View>
          )}
        </View>

        {/* أزرار الحفظ */}
        <Row style={st.actions}>
          <Btn label="إلغاء" variant="outline" style={{flex:1}} onPress={()=>navigation.goBack()}/>
          <Btn label={saving?'جاري الحفظ...':'💾 حفظ الفاتورة'} variant="primary" style={{flex:1}}
            onPress={save} disabled={saving||items.length===0}/>
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
  const [invoice, setInvoice] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const r = await execSQL(`
        SELECT i.*, p.name as pos_name, u.name as agent_name
        FROM invoices i
        LEFT JOIN pos_customers p ON i.pos_id=p.id
        LEFT JOIN users u ON i.agent_id=u.id
        WHERE i.id=?`,[id]);
      const itR = await execSQL(`
        SELECT ii.*, c.name as cat_name
        FROM invoice_items ii
        LEFT JOIN card_categories c ON ii.category_id=c.id
        WHERE ii.invoice_id=?`,[id]);
      setInvoice(r.rows._array[0]);
      setItems(itR.rows._array||[]);
      setLoading(false);
    }
    load();
  },[id]);

  if (loading) return <Loading />;
  if (!invoice) return <View style={{flex:1,backgroundColor:colors.bg,alignItems:'center',justifyContent:'center'}}><Text style={{color:colors.t3}}>الفاتورة غير موجودة</Text></View>;

  return (
    <ScrollView style={st.screen} contentContainerStyle={{padding:spacing.md,paddingBottom:60}}>
      <View style={st.invoiceHeader}>
        <Text style={st.invoiceTitle}>{invoice.invoice_number}</Text>
        <Badge status={invoice.status}/>
      </View>

      <View style={st.invoiceBody}>
        <Row style={{justifyContent:'space-between',paddingVertical:spacing.sm,borderBottomWidth:1,borderBottomColor:colors.border}}>
          <Text style={{color:colors.t3}}>نقطة البيع</Text>
          <Text style={{color:colors.t1,fontWeight:'700'}}>{invoice.pos_name||'—'}</Text>
        </Row>
        <Row style={{justifyContent:'space-between',paddingVertical:spacing.sm,borderBottomWidth:1,borderBottomColor:colors.border}}>
          <Text style={{color:colors.t3}}>المندوب</Text>
          <Text style={{color:colors.t1,fontWeight:'700'}}>{invoice.agent_name||'—'}</Text>
        </Row>
        <Row style={{justifyContent:'space-between',paddingVertical:spacing.sm,borderBottomWidth:1,borderBottomColor:colors.border}}>
          <Text style={{color:colors.t3}}>التاريخ</Text>
          <Text style={{color:colors.t1}}>{invoice.invoice_date||'—'}</Text>
        </Row>
        <Row style={{justifyContent:'space-between',paddingVertical:spacing.sm}}>
          <Text style={{color:colors.t3}}>النوع</Text>
          <Badge status={invoice.type}/>
        </Row>
      </View>

      <View style={st.itemsSection}>
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
        <View style={st.grandTotal}>
          <Text style={st.grandTotalLabel}>الإجمالي العام</Text>
          <Text style={st.grandTotalVal}>{formatCurrency(invoice.total_amount)}</Text>
        </View>
      </View>
    </ScrollView>
  );
}

// ══════════════════════════════════════════════════
// إشعار قبض
// ══════════════════════════════════════════════════
export function NewCollectionScreen({ navigation }) {
  const { user } = useAuth();
  const [agents, setAgents] = useState([]);
  const [pos, setPos] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [form, setForm] = useState({
    agent_id: user?.role==='agent'?user.id:'',
    pos_id:'', invoice_id:'', amount:'',
    method:'cash', reference_number:'', collection_date:todayISO(),
  });
  const [saving, setSaving] = useState(false);

  useEffect(()=>{
    async function load(){
      const [a,p,inv]=await Promise.all([
        getLocalUsers('agent'), getLocalPOS(),
        execSQL("SELECT id,invoice_number,total_amount FROM invoices WHERE status!='paid' ORDER BY created_at DESC"),
      ]);
      setAgents(a); setPos(p);
      setInvoices(inv.rows._array||[]);
    }
    load();
  },[]);

  const save=async()=>{
    if(!form.agent_id||!form.pos_id||!form.amount){Alert.alert('تنبيه','يرجى إكمال البيانات');return;}
    setSaving(true);
    const {collection_number}=await createLocalCollection({...form,amount:parseFloat(form.amount)});
    setSaving(false);
    Alert.alert('✅ تم',`تم رفع الإشعار: ${collection_number}`,[{text:'موافق',onPress:()=>navigation.goBack()}]);
  };

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
          options={[{value:'',label:'— بدون فاتورة —'},...invoices.map(i=>({value:i.id,label:`${i.invoice_number} — ${formatCurrency(i.total_amount)}`}))]}
          value={form.invoice_id} onChange={v=>setForm({...form,invoice_id:v})}/>
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
          <Btn label={saving?'جاري الرفع...':'💾 رفع الإشعار'} variant="primary" style={{flex:1}} onPress={save} disabled={saving}/>
        </Row>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ══════════════════════════════════════════════════
// توزيع أوراق — بدون حقول الأرقام، باختيار الفئة
// ══════════════════════════════════════════════════
export function AssignWalletScreen({ navigation }) {
  const { user } = useAuth();
  const [agents, setAgents] = useState([]);
  const [batches, setBatches] = useState([]);
  const [cats, setCats] = useState([]);
  const [form, setForm] = useState({ agent_id:'', category_id:'', batch_id:'', quantity:'', notes:'' });
  const [batchInfo, setBatchInfo] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(()=>{
    Promise.all([getLocalUsers('agent'), getLocalBatches(), getLocalCategories()])
      .then(([a,b,c])=>{
        setAgents(a);
        setBatches(b.filter(x=>x.available_cards>0));
        setCats(c);
      });
  },[]);

  const onSelectCategory = (catId) => {
    const catBatches = batches.filter(b=>b.category_id===catId);
    setForm(f=>({...f, category_id:catId, batch_id:catBatches.length===1?catBatches[0].id:''}));
    if(catBatches.length===1) setBatchInfo(catBatches[0]);
    else setBatchInfo(null);
  };

  const onSelectBatch = (batchId) => {
    const batch = batches.find(b=>b.id===batchId);
    setBatchInfo(batch||null);
    setForm(f=>({...f, batch_id:batchId}));
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
    // تخصيص الأوراق من بداية المتاح
    const usedCards = (batchInfo.total_cards||39) - (batchInfo.available_cards||0);
    const fromCard = usedCards + 1;
    const toCard = fromCard + qty - 1;
    setSaving(true);
    const { total_cards } = await createAgentWallet({
      agent_id: form.agent_id, batch_id: form.batch_id,
      category_id: form.category_id,
      from_card: fromCard, to_card: toCard,
      issued_by: user?.id, notes: form.notes,
    });
    setSaving(false);
    Alert.alert('✅ تم',`تم توزيع ${total_cards} ورقة\nمن ${fromCard} إلى ${toCard}`,[
      {text:'توزيع آخر',onPress:()=>{setForm({agent_id:'',category_id:'',batch_id:'',quantity:'',notes:''});setBatchInfo(null);}},
      {text:'موافق',onPress:()=>navigation.goBack()},
    ]);
  };

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
            <Text style={st.infoTitle}>معلومات الدفعة</Text>
            <Row style={{justifyContent:'space-between',marginTop:spacing.sm}}>
              <Text style={{color:colors.t3}}>الرقم التسلسلي</Text>
              <Text style={{color:colors.cyan,fontWeight:'700'}}>{batchInfo.serial_number}</Text>
            </Row>
            <Row style={{justifyContent:'space-between',marginTop:spacing.xs}}>
              <Text style={{color:colors.t3}}>الأوراق المتاحة للتوزيع</Text>
              <Text style={{color:colors.green,fontWeight:'700'}}>{batchInfo.available_cards} ورقة</Text>
            </Row>
          </View>
        )}
        <Input label="عدد الأوراق *" value={form.quantity}
          onChangeText={v=>setForm({...form,quantity:v})} keyboardType="numeric"
          placeholder={`من 1 إلى ${batchInfo?.available_cards||0}`}/>
        {form.quantity&&batchInfo&&parseInt(form.quantity)>0&&(
          <View style={st.preview}>
            <Row style={{justifyContent:'space-between'}}>
              <Text style={{color:colors.t3}}>سيتم التوزيع</Text>
              <Text style={{color:colors.green,fontWeight:'800',fontSize:fontSize.xl}}>{parseInt(form.quantity)} ورقة</Text>
            </Row>
          </View>
        )}
        <Input label="ملاحظات" value={form.notes}
          onChangeText={v=>setForm({...form,notes:v})} placeholder="اختياري..." multiline/>
        <Row style={st.actions}>
          <Btn label="إلغاء" variant="outline" style={{flex:1}} onPress={()=>navigation.goBack()}/>
          <Btn label={saving?'جاري التوزيع...':'✅ توزيع الأوراق'} variant="primary" style={{flex:1}} onPress={save} disabled={saving}/>
        </Row>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ══════════════════════════════════════════════════
// إضافة دفعة + نقطة بيع جديدة + تعديل نقطة بيع
// ══════════════════════════════════════════════════
export function AddBatchScreen({ navigation }) {
  const [cats,setCats]=useState([]);
  const [form,setForm]=useState({category_id:'',serial_number:'',total_cards:'39',received_date:todayISO()});
  const [saving,setSaving]=useState(false);
  useEffect(()=>{getLocalCategories().then(setCats);},[]);
  const save=async()=>{
    if(!form.category_id||!form.serial_number){Alert.alert('تنبيه','اختر الفئة وأدخل الرقم التسلسلي');return;}
    setSaving(true);
    const {data,error}=await inventoryService.addBatch({
      category_id:form.category_id,serial_number:form.serial_number,
      total_cards:parseInt(form.total_cards)||39,available_cards:parseInt(form.total_cards)||39,
      received_date:form.received_date,status:'active',
    });
    setSaving(false);
    if(error){Alert.alert('خطأ',error.message);return;}
    Alert.alert('✅ تم',`تم إضافة الدفعة: ${data.batch_number}`,[{text:'موافق',onPress:()=>navigation.goBack()}]);
  };
  return (
    <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}>
      <ScrollView style={st.screen} contentContainerStyle={{padding:spacing.lg,paddingBottom:100}}>
        <Picker label="فئة الكرت *" options={cats.map(c=>({value:c.id,label:`${c.name} — ${formatCurrency(c.price)}`}))}
          value={form.category_id} onChange={v=>setForm({...form,category_id:v})}/>
        <Input label="الرقم التسلسلي *" value={form.serial_number}
          onChangeText={v=>setForm({...form,serial_number:v})} placeholder="مثال: 2444"/>
        <Input label="عدد الأوراق" value={form.total_cards}
          onChangeText={v=>setForm({...form,total_cards:v})} keyboardType="numeric"/>
        <Input label="تاريخ الوصول" value={form.received_date}
          onChangeText={v=>setForm({...form,received_date:v})} placeholder="YYYY-MM-DD"/>
        {form.serial_number&&(
          <View style={st.preview}>
            <Text style={{color:colors.t3,fontSize:fontSize.xs,marginBottom:4}}>معاينة الترقيم</Text>
            <Text style={{color:colors.cyan,fontWeight:'700',textAlign:'center'}}>1-{form.serial_number} → {form.total_cards}-{form.serial_number}</Text>
          </View>
        )}
        <Row style={st.actions}>
          <Btn label="إلغاء" variant="outline" style={{flex:1}} onPress={()=>navigation.goBack()}/>
          <Btn label={saving?'...':'✅ حفظ الدفعة'} variant="success" style={{flex:1}} onPress={save} disabled={saving}/>
        </Row>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function NewPOSScreen({ navigation }) {
  const [agents,setAgents]=useState([]);
  const [form,setForm]=useState({name:'',owner_name:'',phone:'',governorate:'صنعاء',district:'',area:'',credit_limit:'500000',assigned_agent_id:''});
  const [saving,setSaving]=useState(false);
  useEffect(()=>{getLocalUsers('agent').then(setAgents);},[]);
  const save=async()=>{
    if(!form.name){Alert.alert('تنبيه','يرجى إدخال اسم نقطة البيع');return;}
    setSaving(true);
    const city=[form.governorate,form.district,form.area].filter(Boolean).join(' / ');
    const {error}=await posService.create({name:form.name,owner_name:form.owner_name,phone:form.phone,city,credit_limit:parseFloat(form.credit_limit)||500000,credit_used:0,is_blocked:false,assigned_agent_id:form.assigned_agent_id||null});
    setSaving(false);
    if(error){Alert.alert('خطأ',error.message);return;}
    Alert.alert('✅ تم','تم إضافة نقطة البيع',[{text:'موافق',onPress:()=>navigation.goBack()}]);
  };
  const districts=getDistricts(form.governorate);
  return (
    <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}>
      <ScrollView style={st.screen} contentContainerStyle={{padding:spacing.lg,paddingBottom:100}}>
        <Input label="اسم المحل *" value={form.name} onChangeText={v=>setForm({...form,name:v})} placeholder="..."/>
        <Input label="اسم المالك" value={form.owner_name} onChangeText={v=>setForm({...form,owner_name:v})} placeholder="..."/>
        <Input label="رقم الجوال" value={form.phone} onChangeText={v=>setForm({...form,phone:v})} keyboardType="phone-pad"/>
        <Picker label="المحافظة *" options={GOVERNORATES.map(g=>({value:g,label:g}))}
          value={form.governorate} onChange={v=>setForm({...form,governorate:v,district:'',area:''})}/>
        {districts.length>0&&<Picker label="المديرية"
          options={[{value:'',label:'— اختر —'},...districts.map(d=>({value:d,label:d}))]}
          value={form.district} onChange={v=>setForm({...form,district:v})}/>}
        <Input label="العزلة / الحارة" value={form.area} onChangeText={v=>setForm({...form,area:v})} placeholder="اختياري"/>
        <Input label="الحد الائتماني (ر.ي)" value={form.credit_limit} onChangeText={v=>setForm({...form,credit_limit:v})} keyboardType="numeric"/>
        <Picker label="المندوب المسؤول"
          options={[{value:'',label:'— بدون —'},...agents.map(a=>({value:a.id,label:a.name}))]}
          value={form.assigned_agent_id} onChange={v=>setForm({...form,assigned_agent_id:v})}/>
        <Row style={st.actions}>
          <Btn label="إلغاء" variant="outline" style={{flex:1}} onPress={()=>navigation.goBack()}/>
          <Btn label={saving?'...':'✅ إضافة'} variant="primary" style={{flex:1}} onPress={save} disabled={saving}/>
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
      const [pos,ags]=await Promise.all([getLocalPOS(),getLocalUsers('agent')]);
      const p=pos.find(x=>x.id===id);
      if(p) setForm({name:p.name||'',owner_name:p.owner_name||'',phone:p.phone||'',city:p.city||'',credit_limit:String(p.credit_limit||500000),assigned_agent_id:p.assigned_agent_id||''});
      setAgents(ags);
    }
    load();
  },[id]);
  const save=async()=>{
    if(!form.name){Alert.alert('تنبيه','الاسم مطلوب');return;}
    setSaving(true);
    await updatePOS(id,{name:form.name,owner_name:form.owner_name,phone:form.phone,city:form.city,credit_limit:parseFloat(form.credit_limit)||500000,assigned_agent_id:form.assigned_agent_id||null});
    setSaving(false);
    Alert.alert('✅ تم','تم التعديل',[{text:'موافق',onPress:()=>navigation.goBack()}]);
  };
  if(!form) return <Loading />;
  return (
    <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}>
      <ScrollView style={st.screen} contentContainerStyle={{padding:spacing.lg,paddingBottom:100}}>
        <Input label="اسم المحل *" value={form.name} onChangeText={v=>setForm({...form,name:v})}/>
        <Input label="اسم المالك" value={form.owner_name} onChangeText={v=>setForm({...form,owner_name:v})}/>
        <Input label="رقم الجوال" value={form.phone} onChangeText={v=>setForm({...form,phone:v})} keyboardType="phone-pad"/>
        <Input label="المدينة / المنطقة" value={form.city} onChangeText={v=>setForm({...form,city:v})}/>
        <Input label="الحد الائتماني (ر.ي)" value={form.credit_limit} onChangeText={v=>setForm({...form,credit_limit:v})} keyboardType="numeric"/>
        <Picker label="المندوب المسؤول"
          options={[{value:'',label:'— بدون —'},...agents.map(a=>({value:a.id,label:a.name}))]}
          value={form.assigned_agent_id} onChange={v=>setForm({...form,assigned_agent_id:v})}/>
        <Row style={st.actions}>
          <Btn label="إلغاء" variant="outline" style={{flex:1}} onPress={()=>navigation.goBack()}/>
          <Btn label={saving?'...':'💾 حفظ التعديل'} variant="primary" style={{flex:1}} onPress={save} disabled={saving}/>
        </Row>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// Styles
const st = StyleSheet.create({
  screen:{flex:1,backgroundColor:colors.bg},
  label:{fontSize:fontSize.sm,fontWeight:'700',color:colors.t2,marginBottom:5},
  picker:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',backgroundColor:colors.bg,borderWidth:1,borderColor:colors.border2,borderRadius:radius.sm,padding:spacing.md,marginBottom:spacing.md},
  pickerTxt:{fontSize:fontSize.md,color:colors.t1,flex:1,marginLeft:8},
  dropdown:{backgroundColor:colors.card2,borderWidth:1,borderColor:colors.border2,borderRadius:radius.sm,marginTop:-spacing.md,marginBottom:spacing.md,zIndex:100},
  dropItem:{padding:spacing.md,borderBottomWidth:1,borderBottomColor:colors.border},
  dropItemAct:{backgroundColor:colors.blue+'11'},
  dropTxt:{fontSize:fontSize.md,color:colors.t1},
  infoBox:{backgroundColor:colors.bg2,borderRadius:radius.sm,padding:spacing.md,marginBottom:spacing.md,borderWidth:1,borderColor:colors.border2},
  infoTitle:{fontSize:fontSize.sm,fontWeight:'700',color:colors.t2},
  preview:{backgroundColor:colors.bg2,borderRadius:radius.sm,padding:spacing.md,marginBottom:spacing.md,borderWidth:1,borderColor:colors.blue+'44'},
  actions:{flexDirection:'row',gap:spacing.md,marginTop:spacing.sm},
  // فاتورة
  invoiceHeader:{backgroundColor:colors.card2,borderTopWidth:3,borderTopColor:colors.blue,borderRadius:radius.md,padding:spacing.lg,marginBottom:spacing.sm,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
  invoiceTitle:{fontSize:fontSize.xxl,fontWeight:'800',color:colors.t1},
  invoiceDate:{fontSize:fontSize.sm,color:colors.t3},
  invoiceBody:{backgroundColor:colors.card,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,padding:spacing.md,marginBottom:spacing.md},
  itemsSection:{backgroundColor:colors.card,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,padding:spacing.md,marginBottom:spacing.md},
  sectionTitle:{fontSize:fontSize.lg,fontWeight:'700',color:colors.t1,marginBottom:spacing.md},
  tableHeader:{flexDirection:'row',backgroundColor:colors.bg2,padding:spacing.sm,borderRadius:radius.sm,marginBottom:spacing.xs},
  thCell:{fontSize:fontSize.xs,fontWeight:'700',color:colors.t3,textAlign:'center'},
  tableRow:{flexDirection:'row',paddingVertical:spacing.sm,paddingHorizontal:spacing.xs,borderRadius:radius.xs,marginBottom:2},
  tdCell:{fontSize:fontSize.sm,color:colors.t1,textAlign:'center'},
  addItemBox:{backgroundColor:colors.bg2,borderRadius:radius.sm,padding:spacing.md,marginTop:spacing.md,borderWidth:1,borderColor:colors.border2,borderStyle:'dashed'},
  addItemTitle:{fontSize:fontSize.md,fontWeight:'700',color:colors.blue,marginBottom:spacing.md},
  itemPreview:{flexDirection:'row',justifyContent:'space-between',backgroundColor:colors.bg,borderRadius:radius.sm,padding:spacing.sm,marginBottom:spacing.sm},
  grandTotal:{backgroundColor:colors.blue+'11',borderWidth:1,borderColor:colors.blue+'44',borderRadius:radius.md,padding:spacing.lg,marginTop:spacing.md,alignItems:'center'},
  grandTotalLabel:{fontSize:fontSize.sm,color:colors.t3,marginBottom:spacing.xs},
  grandTotalVal:{fontSize:28,fontWeight:'800',color:colors.green},
  grandTotalSub:{fontSize:fontSize.xs,color:colors.t3,marginTop:spacing.xs},
});
