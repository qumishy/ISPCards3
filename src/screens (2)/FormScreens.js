import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { colors, spacing, radius, fontSize } from '../theme';
import {
  getLocalPOS, getLocalCategories, getLocalBatches, getLocalUsers,
  getAgentWallets, createLocalInvoice, addInvoiceItem,
  createLocalCollection, createAgentWallet, createLocalBatch,
  updatePOS, updateUser, updateCategory, updateBatch, updateWallet,
  execSQL,
} from '../services/database';
import { userService, posService, inventoryService } from '../services/supabase';
import { todayISO, GOVERNORATES, getDistricts, formatCurrency } from '../utils/helpers';
import { Input, Btn, Loading, Card, CardHeader, Row, Badge } from '../components/UI';
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
          <ScrollView style={{ maxHeight: 220 }}>
            {options.map(opt => (
              <TouchableOpacity key={String(opt.value)} style={[st.dropItem, value===opt.value&&st.dropItemAct]}
                onPress={() => { onChange(opt.value); setOpen(false); }}>
                <Text style={[st.dropTxt, value===opt.value&&{color:colors.blue}]}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

// ── إنشاء فاتورة ─────────────────────────────────
export function NewInvoiceScreen({ navigation }) {
  const { user } = useAuth();
  const [pos, setPos] = useState([]);
  const [agents, setAgents] = useState([]);
  const [form, setForm] = useState({ pos_id:'', agent_id: user?.role==='agent'?user.id:'', type:'credit', invoice_date:todayISO(), notes:'' });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getLocalPOS(), getLocalUsers('agent')]).then(([p,a]) => {
      setPos(p.filter(x=>!x.is_blocked));
      setAgents(a);
      setLoading(false);
    });
  }, []);

  const save = async () => {
    if (!form.pos_id || !form.agent_id) { Alert.alert('تنبيه','يرجى اختيار نقطة البيع والمندوب'); return; }
    setSaving(true);
    const { id, invoice_number } = await createLocalInvoice(form);
    setSaving(false);
    Alert.alert('✅ تم', `تم إنشاء الفاتورة: ${invoice_number}`, [
      { text: 'إضافة بنود', onPress: () => navigation.replace('AddInvoiceItem', { invoiceId: id }) },
      { text: 'موافق', onPress: () => navigation.goBack() },
    ]);
  };

  if (loading) return <Loading />;
  return (
    <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}>
      <ScrollView style={st.screen} contentContainerStyle={{padding:spacing.lg,paddingBottom:100}}>
        <Picker label="نقطة البيع *" options={pos.map(p=>({value:p.id,label:p.name}))}
          value={form.pos_id} onChange={v=>setForm({...form,pos_id:v})}/>
        {user?.role !== 'agent' && (
          <Picker label="المندوب *" options={agents.map(a=>({value:a.id,label:a.name}))}
            value={form.agent_id} onChange={v=>setForm({...form,agent_id:v})}/>
        )}
        <Picker label="نوع البيع"
          options={[{value:'credit',label:'آجل'},{value:'cash',label:'نقدي'}]}
          value={form.type} onChange={v=>setForm({...form,type:v})}/>
        <Input label="التاريخ" value={form.invoice_date}
          onChangeText={v=>setForm({...form,invoice_date:v})} placeholder="YYYY-MM-DD"/>
        <Input label="ملاحظات" value={form.notes}
          onChangeText={v=>setForm({...form,notes:v})} placeholder="اختياري..." multiline/>
        <View style={st.actions}>
          <Btn label="إلغاء" variant="outline" style={{flex:1}} onPress={()=>navigation.goBack()}/>
          <Btn label={saving?'جاري الحفظ...':'💾 حفظ'} variant="primary" style={{flex:1}} onPress={save} disabled={saving}/>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── إضافة بند للفاتورة ───────────────────────────
export function AddInvoiceItemScreen({ route, navigation }) {
  const { invoiceId } = route.params;
  const { user } = useAuth();
  const [wallets, setWallets] = useState([]);
  const [cats, setCats] = useState([]);
  const [form, setForm] = useState({ wallet_id:'', category_id:'', batch_id:'', from_card:'', to_card:'', unit_price:'' });
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState({ qty:0, total:0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const agentId = user?.role==='agent' ? user.id : null;
      const [w, c] = await Promise.all([getAgentWallets(agentId), getLocalCategories()]);
      setWallets(w.filter(x=>x.remaining_cards>0));
      setCats(c);
      setLoading(false);
    }
    load();
  }, [user]);

  // تحديث المعاينة
  useEffect(() => {
    const from = parseInt(form.from_card);
    const to = parseInt(form.to_card);
    const price = parseFloat(form.unit_price);
    if (from && to && to >= from && price) {
      const qty = to - from + 1;
      setPreview({ qty, total: qty * price });
    } else {
      setPreview({ qty:0, total:0 });
    }
  }, [form.from_card, form.to_card, form.unit_price]);

  // عند اختيار المحفظة — ملء البيانات تلقائياً
  const onSelectWallet = (walletId) => {
    const wallet = wallets.find(w => w.id === walletId);
    if (wallet) {
      const cat = cats.find(c => c.id === wallet.category_id);
      setForm(f => ({
        ...f,
        wallet_id: walletId,
        category_id: wallet.category_id,
        batch_id: wallet.batch_id,
        unit_price: String(cat?.price || ''),
        from_card: String(wallet.from_card + wallet.sold_cards),
        to_card: '',
      }));
    }
  };

  const save = async () => {
    if (!form.wallet_id || !form.from_card || !form.to_card || !form.unit_price) {
      Alert.alert('تنبيه','يرجى إكمال جميع البيانات');return;
    }
    const wallet = wallets.find(w=>w.id===form.wallet_id);
    const from = parseInt(form.from_card);
    const to = parseInt(form.to_card);
    const remaining = wallet?.remaining_cards || 0;
    const qty = to - from + 1;
    if (qty > remaining) {
      Alert.alert('خطأ',`لا يوجد كافي في المحفظة. المتبقي: ${remaining} ورقة`);return;
    }
    if (to < from) { Alert.alert('خطأ','رقم النهاية يجب أن يكون أكبر من رقم البداية');return; }
    setSaving(true);
    await addInvoiceItem(invoiceId, {
      category_id: form.category_id,
      batch_id: form.batch_id,
      wallet_id: form.wallet_id,
      from_card: from, to_card: to,
      unit_price: parseFloat(form.unit_price),
    });
    setSaving(false);
    Alert.alert('✅ تم',`تم إضافة ${qty} ورقة`,[
      {text:'إضافة بند آخر',onPress:()=>setForm({wallet_id:'',category_id:'',batch_id:'',from_card:'',to_card:'',unit_price:''})},
      {text:'عرض الفاتورة',onPress:()=>navigation.navigate('InvoiceDetail',{id:invoiceId})},
    ]);
  };

  if (loading) return <Loading />;
  return (
    <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}>
      <ScrollView style={st.screen} contentContainerStyle={{padding:spacing.lg,paddingBottom:100}}>
        <Picker label="المحفظة (الفئة) *"
          options={wallets.map(w=>({
            value:w.id,
            label:`${w.card_categories?.name||'—'} • متبقي: ${w.remaining_cards} • ${w.batches?.batch_number||'—'}`
          }))}
          value={form.wallet_id} onChange={onSelectWallet}/>

        {form.wallet_id && (() => {
          const w = wallets.find(x=>x.id===form.wallet_id);
          return w ? (
            <View style={st.walInfo}>
              <Text style={st.walInfoTitle}>معلومات المحفظة</Text>
              <Row style={{justifyContent:'space-between',marginTop:spacing.sm}}>
                <Text style={{color:colors.t3}}>النطاق المتاح</Text>
                <Text style={{color:colors.cyan,fontWeight:'700'}}>
                  {w.from_card + w.sold_cards}-{w.batches?.serial_number} → {w.to_card}-{w.batches?.serial_number}
                </Text>
              </Row>
              <Row style={{justifyContent:'space-between',marginTop:spacing.xs}}>
                <Text style={{color:colors.t3}}>متبقي</Text>
                <Text style={{color:colors.green,fontWeight:'700'}}>{w.remaining_cards} ورقة</Text>
              </Row>
            </View>
          ) : null;
        })()}

        <Input label="من ورقة رقم *" value={form.from_card}
          onChangeText={v=>setForm({...form,from_card:v})} keyboardType="numeric" placeholder="مثال: 1"/>
        <Input label="إلى ورقة رقم *" value={form.to_card}
          onChangeText={v=>setForm({...form,to_card:v})} keyboardType="numeric" placeholder="مثال: 10"/>
        <Input label="سعر الورقة (ر.ي) *" value={form.unit_price}
          onChangeText={v=>setForm({...form,unit_price:v})} keyboardType="numeric"/>

        {preview.qty > 0 && (
          <View style={st.preview}>
            <Row style={{justifyContent:'space-between'}}>
              <Text style={{color:colors.t3}}>عدد الأوراق</Text>
              <Text style={{color:colors.t1,fontWeight:'700'}}>{preview.qty} ورقة</Text>
            </Row>
            <Row style={{justifyContent:'space-between',marginTop:spacing.sm}}>
              <Text style={{color:colors.t3,fontSize:fontSize.lg}}>الإجمالي</Text>
              <Text style={{color:colors.green,fontWeight:'800',fontSize:fontSize.xxl}}>{formatCurrency(preview.total)}</Text>
            </Row>
          </View>
        )}

        <View style={st.actions}>
          <Btn label="إلغاء" variant="outline" style={{flex:1}} onPress={()=>navigation.goBack()}/>
          <Btn label={saving?'جاري الحفظ...':'✅ إضافة البند'} variant="primary" style={{flex:1}} onPress={save} disabled={saving}/>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── إشعار قبض ────────────────────────────────────
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

  useEffect(() => {
    async function load() {
      const [a, p, inv] = await Promise.all([
        getLocalUsers('agent'), getLocalPOS(),
        execSQL('SELECT id, invoice_number, total_amount, paid_amount FROM invoices WHERE status!=? ORDER BY created_at DESC',['paid'])
      ]);
      setAgents(a); setPos(p);
      setInvoices(inv.rows._array||[]);
    }
    load();
  }, []);

  const save = async () => {
    if (!form.agent_id||!form.pos_id||!form.amount) { Alert.alert('تنبيه','يرجى إكمال البيانات'); return; }
    setSaving(true);
    const { collection_number } = await createLocalCollection({
      ...form, amount: parseFloat(form.amount),
    });
    setSaving(false);
    Alert.alert('✅ تم',`تم رفع الإشعار: ${collection_number}`,[
      {text:'موافق',onPress:()=>navigation.goBack()}
    ]);
  };

  return (
    <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}>
      <ScrollView style={st.screen} contentContainerStyle={{padding:spacing.lg,paddingBottom:100}}>
        {user?.role !== 'agent' && (
          <Picker label="المندوب *" options={agents.map(a=>({value:a.id,label:a.name}))}
            value={form.agent_id} onChange={v=>setForm({...form,agent_id:v})}/>
        )}
        <Picker label="نقطة البيع *" options={pos.map(p=>({value:p.id,label:p.name}))}
          value={form.pos_id} onChange={v=>setForm({...form,pos_id:v})}/>
        <Picker label="الفاتورة المرتبطة (اختياري)"
          options={[{value:'',label:'— بدون فاتورة —'},...invoices.map(i=>({value:i.id,label:`${i.invoice_number} — ${formatCurrency(i.total_amount)}`}))]}
          value={form.invoice_id} onChange={v=>setForm({...form,invoice_id:v})}/>
        <Input label="المبلغ (ر.ي) *" value={form.amount}
          onChangeText={v=>setForm({...form,amount:v})} keyboardType="numeric" placeholder="0"/>
        <Picker label="طريقة القبض"
          options={[{value:'cash',label:'نقدي'},{value:'transfer',label:'تحويل بنكي'},{value:'check',label:'شيك'}]}
          value={form.method} onChange={v=>setForm({...form,method:v})}/>
        {form.method!=='cash' && (
          <Input label="رقم المرجع" value={form.reference_number}
            onChangeText={v=>setForm({...form,reference_number:v})} placeholder="REF-..."/>
        )}
        <Input label="التاريخ" value={form.collection_date}
          onChangeText={v=>setForm({...form,collection_date:v})} placeholder="YYYY-MM-DD"/>
        <View style={st.actions}>
          <Btn label="إلغاء" variant="outline" style={{flex:1}} onPress={()=>navigation.goBack()}/>
          <Btn label={saving?'جاري الرفع...':'💾 رفع الإشعار'} variant="primary" style={{flex:1}} onPress={save} disabled={saving}/>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── توزيع أوراق على مندوب ─────────────────────────
export function AssignWalletScreen({ navigation }) {
  const { user } = useAuth();
  const [agents, setAgents] = useState([]);
  const [batches, setBatches] = useState([]);
  const [cats, setCats] = useState([]);
  const [form, setForm] = useState({ agent_id:'', batch_id:'', category_id:'', from_card:'', to_card:'', notes:'' });
  const [saving, setSaving] = useState(false);
  const [batchInfo, setBatchInfo] = useState(null);

  useEffect(() => {
    Promise.all([getLocalUsers('agent'), getLocalBatches(), getLocalCategories()]).then(([a,b,c]) => {
      setAgents(a); setBatches(b.filter(x=>x.available_cards>0)); setCats(c);
    });
  }, []);

  const onSelectBatch = (batchId) => {
    const batch = batches.find(b=>b.id===batchId);
    if (batch) {
      setBatchInfo(batch);
      setForm(f=>({...f, batch_id:batchId, category_id:batch.category_id}));
    }
  };

  const save = async () => {
    if (!form.agent_id||!form.batch_id||!form.from_card||!form.to_card) {
      Alert.alert('تنبيه','يرجى إكمال جميع البيانات'); return;
    }
    const from = parseInt(form.from_card);
    const to = parseInt(form.to_card);
    if (to < from) { Alert.alert('خطأ','رقم النهاية يجب أن يكون أكبر'); return; }
    const qty = to - from + 1;
    if (batchInfo && qty > batchInfo.available_cards) {
      Alert.alert('خطأ',`المتاح في الدفعة: ${batchInfo.available_cards} ورقة فقط`); return;
    }
    setSaving(true);
    const { total_cards } = await createAgentWallet({
      agent_id: form.agent_id, batch_id: form.batch_id,
      category_id: form.category_id,
      from_card: from, to_card: to,
      issued_by: user?.id, notes: form.notes,
    });
    setSaving(false);
    Alert.alert('✅ تم',`تم توزيع ${total_cards} ورقة`,[
      {text:'توزيع آخر',onPress:()=>setForm({agent_id:'',batch_id:'',category_id:'',from_card:'',to_card:'',notes:''})},
      {text:'موافق',onPress:()=>navigation.goBack()},
    ]);
  };

  return (
    <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}>
      <ScrollView style={st.screen} contentContainerStyle={{padding:spacing.lg,paddingBottom:100}}>
        <Picker label="المندوب *" options={agents.map(a=>({value:a.id,label:a.name}))}
          value={form.agent_id} onChange={v=>setForm({...form,agent_id:v})}/>
        <Picker label="الدفعة *"
          options={batches.map(b=>({value:b.id,label:`${b.batch_number} — ${b.card_categories?.name||'—'} — متبقي: ${b.available_cards}`}))}
          value={form.batch_id} onChange={onSelectBatch}/>
        {batchInfo && (
          <View style={st.walInfo}>
            <Text style={st.walInfoTitle}>معلومات الدفعة</Text>
            <Row style={{justifyContent:'space-between',marginTop:spacing.sm}}>
              <Text style={{color:colors.t3}}>الرقم التسلسلي</Text>
              <Text style={{color:colors.cyan,fontWeight:'700'}}>{batchInfo.serial_number}</Text>
            </Row>
            <Row style={{justifyContent:'space-between',marginTop:spacing.xs}}>
              <Text style={{color:colors.t3}}>المتاح للتوزيع</Text>
              <Text style={{color:colors.green,fontWeight:'700'}}>{batchInfo.available_cards} ورقة</Text>
            </Row>
            <Row style={{justifyContent:'space-between',marginTop:spacing.xs}}>
              <Text style={{color:colors.t3}}>النطاق الكلي</Text>
              <Text style={{color:colors.t2}}>1 → {batchInfo.total_cards}</Text>
            </Row>
          </View>
        )}
        <Input label="من ورقة رقم *" value={form.from_card}
          onChangeText={v=>setForm({...form,from_card:v})} keyboardType="numeric" placeholder="مثال: 1"/>
        <Input label="إلى ورقة رقم *" value={form.to_card}
          onChangeText={v=>setForm({...form,to_card:v})} keyboardType="numeric" placeholder="مثال: 10"/>
        {form.from_card && form.to_card && parseInt(form.to_card)>=parseInt(form.from_card) && (
          <View style={st.preview}>
            <Row style={{justifyContent:'space-between'}}>
              <Text style={{color:colors.t3}}>سيتم توزيع</Text>
              <Text style={{color:colors.green,fontWeight:'800',fontSize:fontSize.xl}}>
                {parseInt(form.to_card)-parseInt(form.from_card)+1} ورقة
              </Text>
            </Row>
            {batchInfo && (
              <Text style={{color:colors.cyan,fontSize:fontSize.sm,marginTop:spacing.xs,textAlign:'right'}}>
                {form.from_card}-{batchInfo.serial_number} → {form.to_card}-{batchInfo.serial_number}
              </Text>
            )}
          </View>
        )}
        <Input label="ملاحظات" value={form.notes}
          onChangeText={v=>setForm({...form,notes:v})} placeholder="اختياري..." multiline/>
        <View style={st.actions}>
          <Btn label="إلغاء" variant="outline" style={{flex:1}} onPress={()=>navigation.goBack()}/>
          <Btn label={saving?'جاري التوزيع...':'✅ توزيع الأوراق'} variant="primary" style={{flex:1}} onPress={save} disabled={saving}/>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── إضافة دفعة ───────────────────────────────────
export function AddBatchScreen({ navigation }) {
  const [cats, setCats] = useState([]);
  const [form, setForm] = useState({ category_id:'', serial_number:'', total_cards:'39', received_date:todayISO() });
  const [saving, setSaving] = useState(false);

  useEffect(() => { getLocalCategories().then(setCats); }, []);

  const save = async () => {
    if (!form.category_id||!form.serial_number) { Alert.alert('تنبيه','اختر الفئة وأدخل الرقم التسلسلي'); return; }
    setSaving(true);
    const { data, error } = await inventoryService.addBatch({
      category_id: form.category_id, serial_number: form.serial_number,
      total_cards: parseInt(form.total_cards)||39,
      available_cards: parseInt(form.total_cards)||39,
      received_date: form.received_date, status:'active',
    });
    setSaving(false);
    if (error) { Alert.alert('خطأ',error.message); return; }
    Alert.alert('✅ تم',`تم إضافة الدفعة: ${data.batch_number}`,[
      {text:'موافق',onPress:()=>navigation.goBack()}
    ]);
  };

  return (
    <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}>
      <ScrollView style={st.screen} contentContainerStyle={{padding:spacing.lg,paddingBottom:100}}>
        <Picker label="فئة الكرت *" options={cats.map(c=>({value:c.id,label:c.name}))}
          value={form.category_id} onChange={v=>setForm({...form,category_id:v})}/>
        <Input label="الرقم التسلسلي *" value={form.serial_number}
          onChangeText={v=>setForm({...form,serial_number:v})} placeholder="مثال: 2444"/>
        <Input label="عدد الأوراق" value={form.total_cards}
          onChangeText={v=>setForm({...form,total_cards:v})} keyboardType="numeric"/>
        <Input label="تاريخ الوصول" value={form.received_date}
          onChangeText={v=>setForm({...form,received_date:v})} placeholder="YYYY-MM-DD"/>
        {form.serial_number && (
          <View style={st.preview}>
            <Text style={{color:colors.t3,fontSize:fontSize.xs,marginBottom:4}}>معاينة الترقيم</Text>
            <Text style={{color:colors.cyan,fontWeight:'700',textAlign:'right'}}>
              1-{form.serial_number} → {form.total_cards}-{form.serial_number}
            </Text>
          </View>
        )}
        <View style={st.actions}>
          <Btn label="إلغاء" variant="outline" style={{flex:1}} onPress={()=>navigation.goBack()}/>
          <Btn label={saving?'جاري الحفظ...':'✅ حفظ الدفعة'} variant="success" style={{flex:1}} onPress={save} disabled={saving}/>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── نقطة بيع جديدة ───────────────────────────────
export function NewPOSScreen({ navigation }) {
  const [agents, setAgents] = useState([]);
  const [form, setForm] = useState({ name:'', owner_name:'', phone:'', governorate:'صنعاء', district:'', area:'', credit_limit:'500000', assigned_agent_id:'' });
  const [saving, setSaving] = useState(false);

  useEffect(() => { getLocalUsers('agent').then(setAgents); }, []);

  const save = async () => {
    if (!form.name) { Alert.alert('تنبيه','يرجى إدخال اسم نقطة البيع'); return; }
    setSaving(true);
    const city = [form.governorate,form.district,form.area].filter(Boolean).join(' / ');
    const { error } = await posService.create({
      name:form.name, owner_name:form.owner_name, phone:form.phone, city,
      credit_limit:parseFloat(form.credit_limit)||500000,
      credit_used:0, is_blocked:false,
      assigned_agent_id:form.assigned_agent_id||null,
    });
    setSaving(false);
    if (error) { Alert.alert('خطأ',error.message); return; }
    Alert.alert('✅ تم','تم إضافة نقطة البيع',[{text:'موافق',onPress:()=>navigation.goBack()}]);
  };

  const districts = getDistricts(form.governorate);
  return (
    <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}>
      <ScrollView style={st.screen} contentContainerStyle={{padding:spacing.lg,paddingBottom:100}}>
        <Input label="اسم المحل *" value={form.name} onChangeText={v=>setForm({...form,name:v})} placeholder="اسم نقطة البيع..."/>
        <Input label="اسم المالك" value={form.owner_name} onChangeText={v=>setForm({...form,owner_name:v})} placeholder="اسم صاحب المحل..."/>
        <Input label="رقم الجوال" value={form.phone} onChangeText={v=>setForm({...form,phone:v})} keyboardType="phone-pad" placeholder="07XXXXXXXX"/>
        <Picker label="المحافظة *" options={GOVERNORATES.map(g=>({value:g,label:g}))}
          value={form.governorate} onChange={v=>setForm({...form,governorate:v,district:'',area:''})}/>
        {districts.length>0 && <Picker label="المديرية"
          options={[{value:'',label:'— اختر —'},...districts.map(d=>({value:d,label:d}))]}
          value={form.district} onChange={v=>setForm({...form,district:v})}/>}
        <Input label="العزلة / الحارة" value={form.area} onChangeText={v=>setForm({...form,area:v})} placeholder="مثال: حارة الخزان..."/>
        <Input label="الحد الائتماني (ر.ي)" value={form.credit_limit} onChangeText={v=>setForm({...form,credit_limit:v})} keyboardType="numeric"/>
        <Picker label="المندوب المسؤول"
          options={[{value:'',label:'— بدون —'},...agents.map(a=>({value:a.id,label:a.name}))]}
          value={form.assigned_agent_id} onChange={v=>setForm({...form,assigned_agent_id:v})}/>
        <View style={st.actions}>
          <Btn label="إلغاء" variant="outline" style={{flex:1}} onPress={()=>navigation.goBack()}/>
          <Btn label={saving?'جاري الحفظ...':'✅ إضافة'} variant="primary" style={{flex:1}} onPress={save} disabled={saving}/>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── تعديل نقطة بيع ───────────────────────────────
export function EditPOSScreen({ route, navigation }) {
  const { id } = route.params;
  const [agents, setAgents] = useState([]);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      const [pos, ags] = await Promise.all([getLocalPOS(), getLocalUsers('agent')]);
      const p = pos.find(x=>x.id===id);
      if (p) setForm({
        name:p.name||'', owner_name:p.owner_name||'',
        phone:p.phone||'', city:p.city||'',
        credit_limit:String(p.credit_limit||500000),
        assigned_agent_id:p.assigned_agent_id||'',
      });
      setAgents(ags);
    }
    load();
  }, [id]);

  const save = async () => {
    if (!form.name) { Alert.alert('تنبيه','الاسم مطلوب'); return; }
    setSaving(true);
    await updatePOS(id, { name:form.name, owner_name:form.owner_name, phone:form.phone, city:form.city, credit_limit:parseFloat(form.credit_limit)||500000, assigned_agent_id:form.assigned_agent_id||null });
    setSaving(false);
    Alert.alert('✅ تم','تم التعديل',[{text:'موافق',onPress:()=>navigation.goBack()}]);
  };

  if (!form) return <Loading />;
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
        <View style={st.actions}>
          <Btn label="إلغاء" variant="outline" style={{flex:1}} onPress={()=>navigation.goBack()}/>
          <Btn label={saving?'جاري الحفظ...':'💾 حفظ التعديل'} variant="primary" style={{flex:1}} onPress={save} disabled={saving}/>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  screen:{flex:1,backgroundColor:colors.bg},
  label:{fontSize:fontSize.sm,fontWeight:'700',color:colors.t2,marginBottom:5},
  picker:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',backgroundColor:colors.bg,borderWidth:1,borderColor:colors.border2,borderRadius:radius.sm,padding:spacing.md,marginBottom:spacing.md},
  pickerTxt:{fontSize:fontSize.md,color:colors.t1,flex:1,marginLeft:8},
  dropdown:{backgroundColor:colors.card2,borderWidth:1,borderColor:colors.border2,borderRadius:radius.sm,marginTop:-spacing.md,marginBottom:spacing.md},
  dropItem:{padding:spacing.md,borderBottomWidth:1,borderBottomColor:colors.border},
  dropItemAct:{backgroundColor:colors.blue+'11'},
  dropTxt:{fontSize:fontSize.md,color:colors.t1},
  walInfo:{backgroundColor:colors.bg2,borderRadius:radius.sm,padding:spacing.md,marginBottom:spacing.md,borderWidth:1,borderColor:colors.border2},
  walInfoTitle:{fontSize:fontSize.sm,fontWeight:'700',color:colors.t2},
  preview:{backgroundColor:colors.bg2,borderRadius:radius.sm,padding:spacing.md,marginBottom:spacing.md,borderWidth:1,borderColor:colors.blue+'44'},
  actions:{flexDirection:'row',gap:spacing.md,marginTop:spacing.sm},
});
