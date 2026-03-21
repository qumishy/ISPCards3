import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { colors, spacing, radius, fontSize } from '../theme';
import { supabase } from '../services/supabase';
import {
  getLocalUsers, getLocalCategories, getLocalBatches, getLocalPOS,
  updateCategory, updateUser, execSQL,
} from '../services/database';
import { useAuth, ROLE_PERMISSIONS } from '../services/AuthContext';
import { formatCurrency, todayISO, GOVERNORATES, getDistricts } from '../utils/helpers';
import { Btn, Loading, Badge, Row, Input } from '../components/UI';
import { POSScreen } from './MainScreens';

function Picker({ label, options, value, onChange, placeholder }) {
  const [open, setOpen] = useState(false);
  const selected = options.find(o=>o.value===value);
  return (
    <View style={{marginBottom:spacing.md}}>
      {label&&<Text style={s.label}>{label}</Text>}
      <TouchableOpacity style={s.picker} onPress={()=>setOpen(!open)} activeOpacity={0.8}>
        <Text style={[s.pickerTxt,!selected&&{color:colors.t3}]}>{selected?selected.label:placeholder||'اختر...'}</Text>
        <Text style={{color:colors.t3}}>{open?'▲':'▼'}</Text>
      </TouchableOpacity>
      {open&&(
        <View style={s.dropdown}>
          <ScrollView style={{maxHeight:200}}>
            {options.map(opt=>(
              <TouchableOpacity key={String(opt.value)} style={[s.dropItem,value===opt.value&&s.dropItemAct]}
                onPress={()=>{onChange(opt.value);setOpen(false);}}>
                <Text style={[s.dropTxt,value===opt.value&&{color:colors.blue,fontWeight:'700'}]}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const TABS = [
  {key:'users',    label:'المستخدمون', icon:'👥'},
  {key:'pos',      label:'نقاط البيع', icon:'🏪'},
  {key:'categories',label:'الفئات والأسعار',icon:'🏷️'},
  {key:'batches',  label:'الدفعات',   icon:'📦'},
  {key:'settings', label:'الإعدادات', icon:'⚙️'},
];

export default function AdminScreen({ navigation }) {
  const [tab, setTab] = useState('users');
  return (
    <View style={s.screen}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={{maxHeight:52,backgroundColor:colors.bg2,borderBottomWidth:1,borderBottomColor:colors.border}}
        contentContainerStyle={{flexDirection:'row',paddingHorizontal:spacing.sm}}>
        {TABS.map(t=>(
          <TouchableOpacity key={t.key} style={[s.tab,tab===t.key&&s.tabAct]} onPress={()=>setTab(t.key)}>
            <Text style={{fontSize:14}}>{t.icon}</Text>
            <Text style={[s.tabTxt,tab===t.key&&s.tabTxtAct]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      {tab==='users'     && <UsersTab/>}
      {tab==='pos'       && <POSScreen navigation={navigation}/>}
      {tab==='categories'&& <CategoriesTab/>}
      {tab==='batches'   && <BatchesTab/>}
      {tab==='settings'  && <SettingsTab/>}
    </View>
  );
}

// ── تبويب المستخدمين ──────────────────────────────
function UsersTab() {
  const [users,setUsers]=useState([]);
  const [loading,setLoading]=useState(true);
  const [showForm,setShowForm]=useState(false);
  const [editId,setEditId]=useState(null);
  const [form,setForm]=useState({name:'',username:'',password_hash:'',role:'agent',phone:''});
  const [saving,setSaving]=useState(false);

  const load=useCallback(async()=>{
    const {data}=await supabase.from('users').select('*').order('name');
    setUsers(data||[]);setLoading(false);
  },[]);
  useEffect(()=>{load();},[load]);

  const save=async()=>{
    if(!form.name||!form.username){Alert.alert('تنبيه','الاسم واسم الدخول مطلوبان');return;}
    setSaving(true);
    if(editId){
      const updateData={name:form.name,phone:form.phone,role:form.role};
      if(form.password_hash) updateData.password_hash=form.password_hash;
      await supabase.from('users').update(updateData).eq('id',editId);
      await updateUser(editId,updateData);
    } else {
      if(!form.password_hash){Alert.alert('تنبيه','كلمة المرور مطلوبة');setSaving(false);return;}
      await supabase.from('users').insert({...form,is_active:true});
    }
    setSaving(false);
    setForm({name:'',username:'',password_hash:'',role:'agent',phone:''});
    setShowForm(false);setEditId(null);load();
  };

  const startEdit=(u)=>{
    setEditId(u.id);
    setForm({name:u.name||'',username:u.username||'',password_hash:'',role:u.role||'agent',phone:u.phone||''});
    setShowForm(true);
  };

  const roleColors={admin:colors.purple,cashier:colors.blue,agent:colors.green};
  const roleLabels={admin:'مدير عام',cashier:'محاسب',agent:'مندوب'};

  return (
    <ScrollView style={s.tabContent} contentContainerStyle={{padding:spacing.md,paddingBottom:90}}>
      <TouchableOpacity style={s.addBtn} onPress={()=>{setShowForm(!showForm);setEditId(null);setForm({name:'',username:'',password_hash:'',role:'agent',phone:''});}}>
        <Text style={s.addBtnTxt}>{showForm&&!editId?'✕ إلغاء':'+ إضافة مستخدم'}</Text>
      </TouchableOpacity>
      {showForm&&(
        <View style={s.formCard}>
          <Text style={s.formTitle}>{editId?'تعديل مستخدم':'مستخدم جديد'}</Text>
          <Input label="الاسم الكامل *" value={form.name} onChangeText={v=>setForm({...form,name:v})} placeholder="..."/>
          {!editId&&<Input label="اسم الدخول *" value={form.username} onChangeText={v=>setForm({...form,username:v})} placeholder="مثال: ahmed1"/>}
          <Input label={editId?'كلمة مرور جديدة (اتركها فارغة لعدم التغيير)':'كلمة المرور *'} value={form.password_hash} onChangeText={v=>setForm({...form,password_hash:v})} placeholder="..."/>
          <Input label="رقم الجوال" value={form.phone} onChangeText={v=>setForm({...form,phone:v})} keyboardType="phone-pad" placeholder="07XXXXXXXX"/>
          <Picker label="الدور"
            options={[{value:'admin',label:'👑 مدير عام'},{value:'cashier',label:'💼 محاسب'},{value:'agent',label:'🚗 مندوب'}]}
            value={form.role} onChange={v=>setForm({...form,role:v})}/>
          <Btn label={saving?'جاري الحفظ...':editId?'💾 حفظ التعديل':'✅ حفظ'} variant="primary" onPress={save} disabled={saving}/>
        </View>
      )}
      {loading ? <Loading/> : users.map(u=>{
        const col=roleColors[u.role]||colors.t3;
        return (
          <View key={u.id} style={s.listCard}>
            <Row>
              <View style={[s.userAv,{backgroundColor:col+'22'}]}>
                <Text style={[s.userAvTxt,{color:col}]}>{u.name?.charAt(0)}</Text>
              </View>
              <View style={{flex:1}}>
                <Text style={s.userName}>{u.name}</Text>
                <Text style={s.userMeta}>@{u.username} • {u.phone||'—'}</Text>
              </View>
              <View style={{alignItems:'flex-end',gap:4}}>
                <View style={{paddingHorizontal:spacing.sm,paddingVertical:3,borderRadius:radius.full,backgroundColor:col+'22'}}>
                  <Text style={{fontSize:fontSize.xs,fontWeight:'700',color:col}}>{roleLabels[u.role]||u.role}</Text>
                </View>
                <TouchableOpacity onPress={()=>startEdit(u)}>
                  <Text style={{fontSize:12}}>✏️ تعديل</Text>
                </TouchableOpacity>
              </View>
            </Row>
          </View>
        );
      })}
    </ScrollView>
  );
}

// ── تبويب الفئات والأسعار ─────────────────────────
function CategoriesTab() {
  const [cats,setCats]=useState([]);
  const [loading,setLoading]=useState(true);
  const [showForm,setShowForm]=useState(false);
  const [editId,setEditId]=useState(null);
  const [form,setForm]=useState({name:'',price:''});
  const [saving,setSaving]=useState(false);

  const load=useCallback(async()=>{
    const {data}=await supabase.from('card_categories').select('*').order('price');
    setCats(data||[]);setLoading(false);
  },[]);
  useEffect(()=>{load();},[load]);

  const save=async()=>{
    if(!form.name||!form.price){Alert.alert('تنبيه','الاسم والسعر مطلوبان');return;}
    setSaving(true);
    if(editId){
      await supabase.from('card_categories').update({name:form.name,price:parseFloat(form.price)}).eq('id',editId);
      await updateCategory(editId,{name:form.name,price:parseFloat(form.price)});
    } else {
      await supabase.from('card_categories').insert({name:form.name,price:parseFloat(form.price),is_active:true});
    }
    setSaving(false);
    setForm({name:'',price:''});setShowForm(false);setEditId(null);load();
  };

  const startEdit=(c)=>{setEditId(c.id);setForm({name:c.name,price:String(c.price)});setShowForm(true);};
  const toggleActive=async(id,active)=>{await supabase.from('card_categories').update({is_active:!active}).eq('id',id);load();};

  return (
    <ScrollView style={s.tabContent} contentContainerStyle={{padding:spacing.md,paddingBottom:90}}>
      <TouchableOpacity style={s.addBtn} onPress={()=>{setShowForm(!showForm);setEditId(null);setForm({name:'',price:''});}}>
        <Text style={s.addBtnTxt}>{showForm&&!editId?'✕ إلغاء':'+ فئة جديدة'}</Text>
      </TouchableOpacity>
      {showForm&&(
        <View style={s.formCard}>
          <Text style={s.formTitle}>{editId?'تعديل الفئة':'فئة جديدة'}</Text>
          <Input label="اسم الفئة *" value={form.name} onChangeText={v=>setForm({...form,name:v})} placeholder="مثال: كرت 5000 ر.ي"/>
          <Input label="سعر الورقة (ر.ي) *" value={form.price} onChangeText={v=>setForm({...form,price:v})} keyboardType="numeric" placeholder="5000"/>
          <Btn label={saving?'جاري الحفظ...':editId?'💾 حفظ التعديل':'✅ إضافة'} variant="primary" onPress={save} disabled={saving}/>
        </View>
      )}
      {loading ? <Loading/> : cats.map(c=>(
        <View key={c.id} style={s.listCard}>
          <Row>
            <Text style={{fontSize:22,marginLeft:spacing.md}}>🏷️</Text>
            <View style={{flex:1}}>
              <Text style={s.userName}>{c.name}</Text>
              <Text style={[s.userMeta,{color:colors.green}]}>{formatCurrency(c.price)} / ورقة</Text>
            </View>
            <Row style={{gap:spacing.sm}}>
              <TouchableOpacity onPress={()=>startEdit(c)}><Text style={{fontSize:16}}>✏️</Text></TouchableOpacity>
              <TouchableOpacity onPress={()=>toggleActive(c.id,c.is_active)}>
                <Badge status={c.is_active?'active':'cancelled'} label={c.is_active?'نشط':'موقف'}/>
              </TouchableOpacity>
            </Row>
          </Row>
        </View>
      ))}
    </ScrollView>
  );
}

// ── تبويب الدفعات ─────────────────────────────────
function BatchesTab() {
  const [batches,setBatches]=useState([]);
  const [loading,setLoading]=useState(true);
  const [editId,setEditId]=useState(null);
  const [form,setForm]=useState({received_date:''});
  const [saving,setSaving]=useState(false);

  const load=useCallback(async()=>{
    const {data}=await supabase.from('batches').select('*,card_categories(name)').order('created_at',{ascending:false});
    setBatches(data||[]);setLoading(false);
  },[]);
  useEffect(()=>{load();},[load]);

  const save=async()=>{
    setSaving(true);
    await supabase.from('batches').update({received_date:form.received_date}).eq('id',editId);
    setSaving(false);setEditId(null);load();
  };

  return (
    <ScrollView style={s.tabContent} contentContainerStyle={{padding:spacing.md,paddingBottom:90}}>
      {loading ? <Loading/> : batches.map(b=>{
        const canEdit=b.available_cards===b.total_cards;
        return (
          <View key={b.id} style={s.listCard}>
            <Row style={{marginBottom:spacing.sm}}>
              <View style={{flex:1}}>
                <Text style={s.userName}>{b.batch_number}</Text>
                <Text style={s.userMeta}>{b.card_categories?.name||'—'} • Serial: {b.serial_number}</Text>
              </View>
              <View style={{alignItems:'flex-end',gap:4}}>
                <Badge status={b.status}/>
                <Text style={{fontSize:fontSize.xs,color:b.available_cards<10?colors.red:colors.green,fontWeight:'700'}}>
                  {b.available_cards}/{b.total_cards}
                </Text>
              </View>
            </Row>
            {canEdit&&editId!==b.id&&(
              <TouchableOpacity onPress={()=>{setEditId(b.id);setForm({received_date:b.received_date||''});}}>
                <Text style={{color:colors.blue,fontSize:fontSize.sm,fontWeight:'700'}}>✏️ تعديل تاريخ الوصول</Text>
              </TouchableOpacity>
            )}
            {editId===b.id&&(
              <View style={{marginTop:spacing.sm}}>
                <Input label="تاريخ الوصول" value={form.received_date} onChangeText={v=>setForm({received_date:v})} placeholder="YYYY-MM-DD"/>
                <Row style={{gap:spacing.sm}}>
                  <Btn label="إلغاء" variant="outline" size="sm" style={{flex:1}} onPress={()=>setEditId(null)}/>
                  <Btn label={saving?'...':'💾 حفظ'} variant="primary" size="sm" style={{flex:1}} onPress={save} disabled={saving}/>
                </Row>
              </View>
            )}
            {!canEdit&&<Text style={{fontSize:fontSize.xs,color:colors.t3,marginTop:4}}>⚠️ تم توزيع بعض الأوراق</Text>}
          </View>
        );
      })}
    </ScrollView>
  );
}

// ── تبويب الإعدادات ───────────────────────────────
function SettingsTab() {
  const {user,logout}=useAuth();
  return (
    <ScrollView style={s.tabContent} contentContainerStyle={{padding:spacing.md,paddingBottom:90}}>
      <View style={s.listCard}>
        <Text style={[s.formTitle,{marginBottom:spacing.md}]}>معلومات النظام</Text>
        {[{l:'العملة',v:'ريال يمني (ر.ي)'},{l:'الدولة',v:'اليمن'},{l:'الإصدار',v:'1.0.0'}].map((item,i)=>(
          <Row key={i} style={{justifyContent:'space-between',paddingVertical:spacing.sm,borderBottomWidth:1,borderBottomColor:colors.border}}>
            <Text style={{color:colors.t2}}>{item.l}</Text>
            <Text style={{color:colors.t1,fontWeight:'700'}}>{item.v}</Text>
          </Row>
        ))}
      </View>
      <View style={s.listCard}>
        <Text style={[s.formTitle,{marginBottom:spacing.md}]}>المستخدم الحالي</Text>
        <Row style={{justifyContent:'space-between',paddingVertical:spacing.sm,borderBottomWidth:1,borderBottomColor:colors.border}}>
          <Text style={{color:colors.t2}}>الاسم</Text>
          <Text style={{color:colors.t1,fontWeight:'700'}}>{user?.name}</Text>
        </Row>
        <Row style={{justifyContent:'space-between',paddingVertical:spacing.sm}}>
          <Text style={{color:colors.t2}}>الدور</Text>
          <Text style={{color:colors.t1,fontWeight:'700'}}>{ROLE_PERMISSIONS[user?.role]?.label||user?.role}</Text>
        </Row>
      </View>
      <TouchableOpacity style={s.logoutBtn} onPress={logout}>
        <Text style={s.logoutTxt}>🚪 تسجيل الخروج</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  screen:{flex:1,backgroundColor:colors.bg},
  tab:{flexDirection:'row',alignItems:'center',gap:5,paddingVertical:spacing.md,paddingHorizontal:spacing.md,borderBottomWidth:2,borderBottomColor:'transparent'},
  tabAct:{borderBottomColor:colors.blue},
  tabTxt:{fontSize:fontSize.sm,color:colors.t3,fontWeight:'600'},
  tabTxtAct:{color:colors.blue,fontWeight:'700'},
  tabContent:{flex:1},
  addBtn:{backgroundColor:colors.blue+'22',borderWidth:1,borderColor:colors.blue+'44',borderRadius:radius.sm,padding:spacing.md,alignItems:'center',marginBottom:spacing.md},
  addBtnTxt:{color:colors.blue,fontWeight:'700',fontSize:fontSize.md},
  formCard:{backgroundColor:colors.card2,borderWidth:1,borderColor:colors.border2,borderRadius:radius.md,padding:spacing.lg,marginBottom:spacing.md},
  formTitle:{fontSize:fontSize.xl,fontWeight:'800',color:colors.t1,marginBottom:spacing.md},
  label:{fontSize:fontSize.sm,fontWeight:'700',color:colors.t2,marginBottom:5},
  picker:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',backgroundColor:colors.bg,borderWidth:1,borderColor:colors.border2,borderRadius:radius.sm,padding:spacing.md,marginBottom:spacing.md},
  pickerTxt:{fontSize:fontSize.md,color:colors.t1,flex:1},
  dropdown:{backgroundColor:colors.card2,borderWidth:1,borderColor:colors.border2,borderRadius:radius.sm,marginTop:-spacing.md,marginBottom:spacing.md},
  dropItem:{padding:spacing.md,borderBottomWidth:1,borderBottomColor:colors.border},
  dropItemAct:{backgroundColor:colors.blue+'11'},
  dropTxt:{fontSize:fontSize.md,color:colors.t1},
  listCard:{backgroundColor:colors.card,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,padding:spacing.md,marginBottom:spacing.sm},
  userAv:{width:40,height:40,borderRadius:20,alignItems:'center',justifyContent:'center',marginLeft:spacing.md},
  userAvTxt:{fontSize:fontSize.lg,fontWeight:'800'},
  userName:{fontSize:fontSize.lg,fontWeight:'700',color:colors.t1},
  userMeta:{fontSize:fontSize.xs,color:colors.t3,marginTop:2},
  logoutBtn:{backgroundColor:colors.red+'15',borderWidth:1,borderColor:colors.red+'44',borderRadius:radius.md,padding:spacing.lg,alignItems:'center',marginTop:spacing.md},
  logoutTxt:{color:colors.red,fontWeight:'800',fontSize:fontSize.lg},
});
