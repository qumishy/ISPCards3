import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  TextInput, RefreshControl, Alert, ScrollView,
} from 'react-native';
import { colors, spacing, radius, fontSize } from '../theme';
import { supabase } from '../services/supabase';
import {
  getLocalInvoices, getLocalCollections,
  approveLocalCollection, rejectLocalCollection,
} from '../services/database';
import { formatCurrency, formatDateShort, creditPercent, creditColor } from '../utils/helpers';
import { Badge, Btn, Loading, Empty, KpiCard, Row, ProgressBar } from '../components/UI';
import SyncBar from '../components/SyncBar';
import { useAuth } from '../services/AuthContext';

// ══════════════════════════════════════════════════
// الفواتير — SQLite المحلي
// ══════════════════════════════════════════════════
export function InvoicesScreen({ navigation }) {
  const { user } = useAuth();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('all');

  const load = useCallback(async () => {
    const filters = tab!=='all' ? {status:tab} : {};
    if (user?.role==='agent') filters.agent_id = user.id;
    const data = await getLocalInvoices(filters);
    setInvoices(data);
    setLoading(false); setRefreshing(false);
  }, [tab, user]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  const filtered = invoices.filter(inv =>
    !search || inv.invoice_number?.includes(search) || inv.pos_customers?.name?.includes(search)
  );
  const total = invoices.reduce((s,i)=>s+(i.net_amount||i.total_amount||0),0);
  const paid = invoices.filter(i=>i.status==='paid').reduce((s,i)=>s+(i.net_amount||i.total_amount||0),0);

  return (
    <View style={s.screen}>
      <SyncBar />
      <View style={s.summary}>
        <View style={s.sumItem}><Text style={s.sumLabel}>الإجمالي</Text><Text style={[s.sumVal,{color:colors.cyan}]}>{formatCurrency(total)}</Text></View>
        <View style={s.sumDiv}/>
        <View style={s.sumItem}><Text style={s.sumLabel}>مسدد</Text><Text style={[s.sumVal,{color:colors.green}]}>{formatCurrency(paid)}</Text></View>
        <View style={s.sumDiv}/>
        <View style={s.sumItem}><Text style={s.sumLabel}>العدد</Text><Text style={[s.sumVal,{color:colors.t1}]}>{invoices.length}</Text></View>
      </View>
      <View style={s.tabs}>
        {[{k:'all',l:'الكل'},{k:'pending',l:'معلقة'},{k:'paid',l:'مسددة'},{k:'overdue',l:'متأخرة'}].map(t=>(
          <TouchableOpacity key={t.k} style={[s.tab,tab===t.k&&s.tabAct]} onPress={()=>setTab(t.k)}>
            <Text style={[s.tabTxt,tab===t.k&&s.tabTxtAct]}>{t.l}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={s.searchRow}>
        <View style={s.searchBox}>
          <Text style={{fontSize:13,color:colors.t3}}>🔍</Text>
          <TextInput style={s.searchInput} value={search} onChangeText={setSearch}
            placeholder="بحث..." placeholderTextColor={colors.t3}/>
        </View>
        <Btn label="+ فاتورة" variant="primary" size="sm" onPress={()=>navigation.navigate('NewInvoice')}/>
      </View>
      {loading ? <Loading/> : filtered.length===0
        ? <Empty icon="🧾" title="لا توجد فواتير" action="+ فاتورة جديدة" onAction={()=>navigation.navigate('NewInvoice')}/>
        : <FlatList data={filtered} keyExtractor={i=>i.id}
            contentContainerStyle={{padding:spacing.md,paddingBottom:90}}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);load();}} tintColor={colors.blue}/>}
            renderItem={({item:inv})=>(
              <TouchableOpacity style={s.row} activeOpacity={0.8}
                onPress={()=>navigation.navigate('InvoiceDetail',{id:inv.id})}>
                <View style={{flex:1,gap:3}}>
                  <Row style={{gap:6}}>
                    <Text style={s.rowNum}>{inv.invoice_number}</Text>
                    {inv.synced==0&&<Text style={{fontSize:10}}>📤</Text>}
                  </Row>
                  <Text style={s.rowPos}>{inv.pos_customers?.name||'—'}</Text>
                  <Text style={s.rowMeta}>{inv.users?.name||'—'} • {formatDateShort(inv.invoice_date)}</Text>
                </View>
                <View style={{alignItems:'flex-end',gap:4}}>
                  <Text style={s.rowAmt}>{formatCurrency(inv.net_amount||inv.total_amount)}</Text>
                  <Badge status={inv.status}/>
                  <Badge status={inv.type}/>
                </View>
              </TouchableOpacity>
            )}/>
      }
    </View>
  );
}

// ══════════════════════════════════════════════════
// التحصيلات — SQLite المحلي
// ══════════════════════════════════════════════════
export function CollectionsScreen({ navigation }) {
  const { can } = useAuth();
  const [cols, setCols] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState('pending');

  const load = useCallback(async () => {
    const data = await getLocalCollections();
    setCols(data); setLoading(false); setRefreshing(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const handleApprove = (id,amount) => Alert.alert('اعتماد التحصيل',`هل تؤكد استلام ${formatCurrency(amount)}؟`,[
    {text:'إلغاء',style:'cancel'},
    {text:'✅ نعم اعتماد',onPress:async()=>{await approveLocalCollection(id);load();}},
  ]);
  const handleReject = (id) => Alert.alert('رفض التحصيل','هل تريد رفض هذا الإشعار؟',[
    {text:'إلغاء',style:'cancel'},
    {text:'❌ رفض',style:'destructive',onPress:async()=>{await rejectLocalCollection(id,'مرفوض');load();}},
  ]);

  const pending=cols.filter(c=>c.status==='pending');
  const approved=cols.filter(c=>c.status==='approved');
  const display=tab==='pending'?pending:tab==='approved'?approved:cols;
  const totalPending=pending.reduce((s,c)=>s+(c.amount||0),0);
  const totalApproved=approved.reduce((s,c)=>s+(c.amount||0),0);
  const methodLabel=m=>({cash:'نقدي',transfer:'تحويل',check:'شيك'}[m]||m);

  return (
    <View style={s.screen}>
      <SyncBar/>
      <View style={s.kpiRow}>
        <KpiCard value={pending.length} label="معلق" color={colors.orange}/>
        <KpiCard value={formatCurrency(totalPending)} label="قيد الانتظار" color={colors.orange}/>
        <KpiCard value={formatCurrency(totalApproved)} label="محصّل" color={colors.green}/>
      </View>
      <View style={s.tabs}>
        {[{k:'pending',l:`معلقة (${pending.length})`},{k:'approved',l:`معتمدة (${approved.length})`},{k:'all',l:`الكل (${cols.length})`}].map(t=>(
          <TouchableOpacity key={t.k} style={[s.tab,tab===t.k&&s.tabAct]} onPress={()=>setTab(t.k)}>
            <Text style={[s.tabTxt,tab===t.k&&s.tabTxtAct]}>{t.l}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={{marginLeft:'auto',paddingHorizontal:spacing.md,paddingVertical:spacing.md}}
          onPress={()=>navigation.navigate('NewCollection')}>
          <Text style={{color:colors.blue,fontWeight:'700',fontSize:fontSize.sm}}>+ قبض</Text>
        </TouchableOpacity>
      </View>
      {loading ? <Loading/> : display.length===0
        ? <Empty icon="💰" title={tab==='pending'?'✅ لا تحصيلات معلقة':'لا توجد تحصيلات'}
            action="+ إشعار قبض" onAction={()=>navigation.navigate('NewCollection')}/>
        : <ScrollView contentContainerStyle={{padding:spacing.md,paddingBottom:90}}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);load();}} tintColor={colors.blue}/>}>
            {display.map(col=>(
              <View key={col.id} style={s.apc}>
                <Row style={{justifyContent:'space-between',marginBottom:spacing.sm}}>
                  <Row style={{gap:6}}>
                    <Text style={s.colNum}>{col.collection_number}</Text>
                    {col.synced==0&&<Text style={{fontSize:10}}>📤</Text>}
                  </Row>
                  <Badge status={col.status}/>
                </Row>
                <Text style={s.colAmt}>{formatCurrency(col.amount)}</Text>
                <View style={s.colGrid}>
                  <View style={s.colItem}><Text style={s.colLabel}>المندوب</Text><Text style={s.colVal}>{col.users?.name||'—'}</Text></View>
                  <View style={s.colItem}><Text style={s.colLabel}>نقطة البيع</Text><Text style={s.colVal}>{col.pos_customers?.name||'—'}</Text></View>
                  <View style={s.colItem}><Text style={s.colLabel}>الطريقة</Text><Text style={s.colVal}>{methodLabel(col.method)}</Text></View>
                  {col.invoice?.invoice_number&&<View style={s.colItem}><Text style={s.colLabel}>الفاتورة</Text><Text style={[s.colVal,{color:colors.blue}]}>{col.invoice.invoice_number}</Text></View>}
                </View>
                {col.status==='pending'&&can('canApproveCollection')&&(
                  <Row style={{gap:spacing.sm,marginTop:spacing.sm}}>
                    <Btn label="✅ اعتماد واستلام" variant="success" size="sm" style={{flex:1}} onPress={()=>handleApprove(col.id,col.amount)}/>
                    <Btn label="❌ رفض" variant="danger" size="sm" style={{flex:1}} onPress={()=>handleReject(col.id)}/>
                  </Row>
                )}
              </View>
            ))}
          </ScrollView>
      }
    </View>
  );
}

// ══════════════════════════════════════════════════
// المخزون — Supabase مباشرة
// ══════════════════════════════════════════════════
export function InventoryScreen({ navigation }) {
  const [batches, setBatches] = useState([]);
  const [cats, setCats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [bR, cR] = await Promise.all([
        supabase.from('batches').select('*,card_categories(name,price)').order('created_at',{ascending:false}),
        supabase.from('card_categories').select('*').eq('is_active',true).order('price'),
      ]);
      setBatches(bR.data||[]);
      setCats(cR.data||[]);
    } catch(e) {}
    setLoading(false); setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const catColors = [colors.blue,colors.cyan,colors.purple,colors.green];
  const catSummary = cats.map((cat,i) => ({
    ...cat, color:catColors[i%catColors.length],
    total: batches.filter(b=>b.category_id===cat.id).reduce((s,b)=>s+(b.available_cards||0),0),
  }));

  if (loading) return <Loading/>;
  return (
    <View style={s.screen}>
      <ScrollView contentContainerStyle={{padding:spacing.md,paddingBottom:90}}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);load();}} tintColor={colors.blue}/>}>
        <View style={s.catGrid}>
          {catSummary.map(cat=>(
            <View key={cat.id} style={[s.catCard,{borderTopColor:cat.color,borderTopWidth:3}]}>
              <Text style={[s.catTotal,cat.total<15&&{color:colors.red}]}>{cat.total}</Text>
              <Text style={s.catName}>{cat.name}</Text>
              <Text style={s.catPrice}>{formatCurrency(cat.price)}/ورقة</Text>
              {cat.total<15&&<Text style={{fontSize:10,color:colors.red,marginTop:4}}>⚠️ حرج</Text>}
            </View>
          ))}
        </View>
        <Row style={{justifyContent:'space-between',alignItems:'center',marginBottom:spacing.md}}>
          <Text style={{fontSize:fontSize.xl,fontWeight:'800',color:colors.t1}}>📋 الدفعات</Text>
          <Btn label="+ دفعة" variant="primary" size="sm" onPress={()=>navigation.navigate('AddBatch')}/>
        </Row>
        {batches.length===0
          ? <Empty icon="📦" title="لا توجد دفعات" action="+ دفعة جديدة" onAction={()=>navigation.navigate('AddBatch')}/>
          : batches.map(batch=>{
            const cat = cats.find(c=>c.id===batch.category_id);
            const catIdx = cats.findIndex(c=>c.id===batch.category_id);
            const col = catColors[catIdx%catColors.length]||colors.blue;
            const pct = batch.total_cards>0?Math.round((batch.available_cards/batch.total_cards)*100):0;
            return (
              <View key={batch.id} style={s.batchCard}>
                <Row style={{marginBottom:spacing.sm}}>
                  <Text style={[s.batchNum,{flex:1}]}>{batch.batch_number}</Text>
                  <View style={[s.catChip,{backgroundColor:col+'22'}]}><Text style={[s.catChipTxt,{color:col}]}>{cat?.name||batch.card_categories?.name||'—'}</Text></View>
                  <Badge status={batch.status}/>
                </Row>
                <Row style={{marginBottom:spacing.sm}}>
                  {[{l:'إجمالي',v:batch.total_cards,c:colors.t1},{l:'متبقي',v:batch.available_cards,c:batch.available_cards<10?colors.red:colors.green},{l:'تسلسلي',v:batch.serial_number,c:colors.cyan}].map((st,i)=>(
                    <View key={i} style={{flex:1}}>
                      <Text style={{fontSize:fontSize.xs,color:colors.t3,marginBottom:2}}>{st.l}</Text>
                      <Text style={{fontSize:fontSize.md,fontWeight:'700',color:st.c}}>{st.v}</Text>
                    </View>
                  ))}
                </Row>
                <View style={{flexDirection:'row',alignItems:'center',gap:spacing.sm}}>
                  <View style={{flex:1,height:5,backgroundColor:colors.border,borderRadius:3,overflow:'hidden'}}>
                    <View style={{height:5,width:pct+'%',backgroundColor:batch.available_cards<10?colors.red:col,borderRadius:3}}/>
                  </View>
                  <Text style={{fontSize:fontSize.xs,fontWeight:'700',color:col}}>{pct}%</Text>
                </View>
              </View>
            );
          })
        }
      </ScrollView>
    </View>
  );
}

// ══════════════════════════════════════════════════
// نقاط البيع — Supabase مباشرة
// ══════════════════════════════════════════════════
export function POSScreen({ navigation }) {
  const [pos, setPos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    try {
      const { data } = await supabase.from('pos_customers').select('*').order('name');
      setPos(data||[]);
    } catch(e) {}
    setLoading(false); setRefreshing(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const handleToggleBlock = (id,name,blocked) => Alert.alert(
    blocked?'رفع الحجب':'حجب نقطة البيع',
    blocked?`رفع الحجب عن "${name}"؟`:`حجب "${name}"؟`,
    [{text:'إلغاء',style:'cancel'},{text:blocked?'رفع الحجب':'حجب',style:blocked?'default':'destructive',
      onPress:async()=>{
        await supabase.from('pos_customers').update({is_blocked:!blocked}).eq('id',id);
        load();
      }}]
  );

  const filtered = pos.filter(p=>!search||p.name?.includes(search)||p.owner_name?.includes(search));

  return (
    <View style={s.screen}>
      <View style={s.searchRow}>
        <View style={s.searchBox}>
          <Text style={{fontSize:13,color:colors.t3}}>🔍</Text>
          <TextInput style={s.searchInput} value={search} onChangeText={setSearch} placeholder="بحث..." placeholderTextColor={colors.t3}/>
        </View>
        <Btn label="+ نقطة بيع" variant="primary" size="sm" onPress={()=>navigation.navigate('NewPOS')}/>
      </View>
      {loading ? <Loading/> : filtered.length===0
        ? <Empty icon="🏪" title="لا توجد نقاط بيع" action="+ نقطة بيع جديدة" onAction={()=>navigation.navigate('NewPOS')}/>
        : <FlatList data={filtered} keyExtractor={i=>i.id}
            contentContainerStyle={{padding:spacing.md,paddingBottom:90}}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);load();}} tintColor={colors.blue}/>}
            renderItem={({item:p})=>{
              const pct=creditPercent(p.credit_used,p.credit_limit);
              const col=creditColor(pct,p.is_blocked);
              return (
                <TouchableOpacity style={[s.posCard,p.is_blocked&&s.posBlocked]} activeOpacity={0.85}
                  onPress={()=>navigation.navigate('EditPOS',{id:p.id})}>
                  <Row style={{marginBottom:spacing.md}}>
                    <View style={[s.posAv,{backgroundColor:col+'22'}]}><Text style={[s.posAvTxt,{color:col}]}>{p.name?.charAt(0)}</Text></View>
                    <View style={{flex:1}}>
                      <Text style={s.posName}>{p.name}</Text>
                      <Text style={s.posMeta}>{p.owner_name||'—'} • {p.city||'—'}</Text>
                    </View>
                    <Badge status={p.is_blocked?'محجوب':pct>=80?'تحذير':'نشط'}/>
                  </Row>
                  <Row style={{marginBottom:spacing.sm,gap:spacing.sm}}>
                    {[{l:'مستخدم',v:formatCurrency(p.credit_used),c:colors.orange},{l:'الحد',v:formatCurrency(p.credit_limit),c:colors.t1},{l:'%',v:pct+'%',c:col}].map((st,i)=>(
                      <View key={i} style={{flex:1}}>
                        <Text style={{fontSize:fontSize.xs,color:colors.t3,marginBottom:2}}>{st.l}</Text>
                        <Text style={{fontSize:fontSize.md,fontWeight:'700',color:st.c}}>{st.v}</Text>
                      </View>
                    ))}
                  </Row>
                  <ProgressBar percent={pct} color={col}/>
                  <Row style={{marginTop:spacing.md,gap:spacing.sm}}>
                    <Btn label="✏️ تعديل" variant="outline" size="xs" style={{flex:1}} onPress={()=>navigation.navigate('EditPOS',{id:p.id})}/>
                    <Btn label={p.is_blocked?'✓ رفع الحجب':'✗ حجب'} variant={p.is_blocked?'success':'danger'} size="xs" style={{flex:1}}
                      onPress={()=>handleToggleBlock(p.id,p.name,p.is_blocked)}/>
                  </Row>
                </TouchableOpacity>
              );
            }}/>
      }
    </View>
  );
}

// ══════════════════════════════════════════════════
// المحافظ — Supabase مباشرة
// ══════════════════════════════════════════════════
export function WalletsScreen({ navigation }) {
  const { user, can } = useAuth();
  const [wallets, setWallets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      let q = supabase.from('agent_wallets')
        .select('*,users(name),card_categories(name,price),batches(batch_number,serial_number)')
        .order('created_at',{ascending:false});
      if (user?.role==='agent') q = q.eq('agent_id',user.id);
      const { data } = await q;
      setWallets((data||[]).map(w=>({...w, remaining_cards:(w.total_cards||0)-(w.sold_cards||0)})));
    } catch(e) {}
    setLoading(false); setRefreshing(false);
  }, [user]);
  useEffect(() => { load(); }, [load]);

  return (
    <View style={s.screen}>
      {can('canManageWallets')&&(
        <View style={{padding:spacing.md,paddingBottom:0}}>
          <Btn label="+ توزيع أوراق على مندوب" variant="primary"
            style={{justifyContent:'center'}} onPress={()=>navigation.navigate('AssignWallet')}/>
        </View>
      )}
      {loading ? <Loading/> : wallets.length===0
        ? <Empty icon="👜" title="لا توجد محافظ"
            action={can('canManageWallets')?"+ توزيع أوراق":null}
            onAction={()=>navigation.navigate('AssignWallet')}/>
        : <FlatList data={wallets} keyExtractor={i=>i.id}
            contentContainerStyle={{padding:spacing.md,paddingBottom:90}}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);load();}} tintColor={colors.blue}/>}
            renderItem={({item:w})=>{
              const rem=w.remaining_cards||0;
              const pct=w.total_cards>0?Math.round((w.sold_cards/w.total_cards)*100):0;
              const col=rem===0?colors.red:rem<5?colors.orange:colors.green;
              return (
                <View style={s.walCard}>
                  <Row style={{marginBottom:spacing.sm}}>
                    <View style={{flex:1}}>
                      <Text style={{fontSize:fontSize.lg,fontWeight:'700',color:colors.t1}}>{w.card_categories?.name||'—'}</Text>
                      <Text style={{fontSize:fontSize.xs,color:colors.t3}}>{w.users?.name||'—'} • {w.batches?.batch_number||'—'}</Text>
                    </View>
                    {rem===0
                      ? <Badge status="depleted" label="نفدت"/>
                      : <View style={[s.remBadge,{backgroundColor:col+'22'}]}>
                          <Text style={{color:col,fontWeight:'800',fontSize:fontSize.md}}>{rem}</Text>
                          <Text style={{color:col,fontSize:fontSize.xs}}>ورقة</Text>
                        </View>
                    }
                  </Row>
                  <Row style={{justifyContent:'space-around',marginBottom:spacing.sm}}>
                    {[{l:'إجمالي',v:w.total_cards,c:colors.t1},{l:'مباع',v:w.sold_cards,c:colors.orange},{l:'متبقي',v:rem,c:col}].map((st,i)=>(
                      <View key={i} style={{alignItems:'center'}}>
                        <Text style={{fontSize:fontSize.xs,color:colors.t3}}>{st.l}</Text>
                        <Text style={{fontSize:fontSize.xxl,fontWeight:'800',color:st.c}}>{st.v}</Text>
                      </View>
                    ))}
                  </Row>
                  <View style={{flexDirection:'row',alignItems:'center',gap:spacing.sm}}>
                    <View style={{flex:1,height:6,backgroundColor:colors.border,borderRadius:3,overflow:'hidden'}}>
                      <View style={{height:6,width:pct+'%',backgroundColor:pct>=100?colors.red:colors.blue,borderRadius:3}}/>
                    </View>
                    <Text style={{fontSize:fontSize.xs,fontWeight:'700',color:pct>=100?colors.red:colors.t2}}>{pct}%</Text>
                  </View>
                </View>
              );
            }}/>
      }
    </View>
  );
}

// ── تفاصيل الفاتورة ──────────────────────────────
export { InvoiceDetailScreen } from './FormScreens';

const s = StyleSheet.create({
  screen:{flex:1,backgroundColor:colors.bg},
  summary:{flexDirection:'row',backgroundColor:colors.bg2,borderBottomWidth:1,borderBottomColor:colors.border,paddingVertical:spacing.sm},
  sumItem:{flex:1,alignItems:'center',paddingVertical:spacing.xs},
  sumLabel:{fontSize:fontSize.xs,color:colors.t3,marginBottom:2},
  sumVal:{fontSize:fontSize.md,fontWeight:'800'},
  sumDiv:{width:1,backgroundColor:colors.border,marginVertical:spacing.sm},
  tabs:{flexDirection:'row',alignItems:'center',backgroundColor:colors.bg2,borderBottomWidth:1,borderBottomColor:colors.border},
  tab:{flex:1,paddingVertical:spacing.md,alignItems:'center',borderBottomWidth:2,borderBottomColor:'transparent'},
  tabAct:{borderBottomColor:colors.blue},
  tabTxt:{fontSize:fontSize.xs,fontWeight:'600',color:colors.t3},
  tabTxtAct:{color:colors.blue,fontWeight:'700'},
  searchRow:{flexDirection:'row',gap:spacing.sm,padding:spacing.md,paddingBottom:spacing.sm,backgroundColor:colors.bg2,borderBottomWidth:1,borderBottomColor:colors.border},
  searchBox:{flex:1,flexDirection:'row',alignItems:'center',backgroundColor:colors.card,borderWidth:1,borderColor:colors.border2,borderRadius:radius.sm,paddingHorizontal:spacing.md,gap:spacing.sm},
  searchInput:{flex:1,color:colors.t1,fontSize:fontSize.md,paddingVertical:spacing.sm},
  row:{flexDirection:'row',backgroundColor:colors.card,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,padding:spacing.md,marginBottom:spacing.sm},
  rowNum:{fontSize:fontSize.md,fontWeight:'700',color:colors.cyan},
  rowPos:{fontSize:fontSize.lg,fontWeight:'700',color:colors.t1},
  rowMeta:{fontSize:fontSize.xs,color:colors.t3},
  rowAmt:{fontSize:fontSize.lg,fontWeight:'800',color:colors.t1},
  kpiRow:{flexDirection:'row',gap:1,backgroundColor:colors.bg2,borderBottomWidth:1,borderBottomColor:colors.border},
  apc:{backgroundColor:colors.card2,borderWidth:1,borderColor:colors.border2,borderRadius:radius.md,padding:spacing.lg,marginBottom:spacing.sm},
  colNum:{fontSize:fontSize.md,fontWeight:'700',color:colors.cyan},
  colAmt:{fontSize:24,fontWeight:'800',color:colors.green,marginBottom:spacing.md},
  colGrid:{flexDirection:'row',flexWrap:'wrap',gap:spacing.sm,marginBottom:spacing.sm},
  colItem:{backgroundColor:colors.bg,borderRadius:radius.sm,padding:spacing.sm,minWidth:'45%'},
  colLabel:{fontSize:fontSize.xs,color:colors.t3,marginBottom:2},
  colVal:{fontSize:fontSize.md,fontWeight:'600',color:colors.t1},
  catGrid:{flexDirection:'row',flexWrap:'wrap',gap:spacing.sm,marginBottom:spacing.lg},
  catCard:{width:'47.5%',backgroundColor:colors.card,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,padding:spacing.md,alignItems:'center'},
  catTotal:{fontSize:28,fontWeight:'800',color:colors.t1},
  catName:{fontSize:fontSize.md,fontWeight:'700',color:colors.t2,marginTop:4},
  catPrice:{fontSize:fontSize.xs,color:colors.t3,marginTop:2},
  batchCard:{backgroundColor:colors.card2,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,padding:spacing.md,marginBottom:spacing.sm},
  batchNum:{fontSize:fontSize.lg,fontWeight:'700',color:colors.cyan},
  catChip:{paddingHorizontal:spacing.sm,paddingVertical:3,borderRadius:radius.full,marginLeft:spacing.sm},
  catChipTxt:{fontSize:fontSize.xs,fontWeight:'700'},
  posCard:{backgroundColor:colors.card,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,padding:spacing.md,marginBottom:spacing.sm},
  posBlocked:{borderColor:colors.red+'44'},
  posAv:{width:44,height:44,borderRadius:12,alignItems:'center',justifyContent:'center',marginLeft:spacing.md},
  posAvTxt:{fontSize:18,fontWeight:'800'},
  posName:{fontSize:fontSize.xl,fontWeight:'700',color:colors.t1},
  posMeta:{fontSize:fontSize.xs,color:colors.t3,marginTop:2},
  walCard:{backgroundColor:colors.card,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,padding:spacing.md,marginBottom:spacing.sm},
  remBadge:{alignItems:'center',justifyContent:'center',padding:spacing.sm,borderRadius:radius.md,minWidth:50},
});
