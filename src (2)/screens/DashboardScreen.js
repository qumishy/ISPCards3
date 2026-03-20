import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { colors, spacing, radius, fontSize } from '../theme';
import {
  getLocalPOS, getLocalInvoices, getLocalCollections,
  getLocalBatches, getLocalCategories, getAgentWallets,
} from '../services/database';
import { formatCurrency, formatNumber, creditPercent, creditColor } from '../utils/helpers';
import { Card, CardHeader, Badge, Btn, Loading, ProgressBar, Row, KpiCard } from '../components/UI';
import SyncBar from '../components/SyncBar';
import { useAuth } from '../services/AuthContext';

export default function DashboardScreen({ navigation }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState({ pos:[], invoices:[], collections:[], batches:[], categories:[], wallets:[] });

  const load = useCallback(async () => {
    const [pos, inv, col, bat, cat, wal] = await Promise.all([
      getLocalPOS(),
      getLocalInvoices(),
      getLocalCollections({ status:'pending' }),
      getLocalBatches(),
      getLocalCategories(),
      getAgentWallets(user?.role === 'agent' ? user.id : null),
    ]);
    setData({ pos, invoices:inv, collections:col, batches:bat, categories:cat, wallets:wal });
    setLoading(false); setRefreshing(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const totalCredit = data.pos.reduce((s,p) => s+(p.credit_used||0), 0);
  const blockedPos = data.pos.filter(p => p.is_blocked==1).length;
  const totalInventory = data.batches.reduce((s,b) => s+(b.available_cards||0), 0);
  const pendingInv = data.invoices.filter(i => i.status==='pending').length;
  const catColors = [colors.blue, colors.cyan, colors.purple, colors.green];

  // إجماليات المحافظ
  const walletSummary = data.categories.map((cat,i) => ({
    ...cat, color: catColors[i%catColors.length],
    total: data.wallets.filter(w=>w.category_id===cat.id).reduce((s,w)=>s+(w.total_cards||0),0),
    remaining: data.wallets.filter(w=>w.category_id===cat.id).reduce((s,w)=>s+(w.remaining_cards||0),0),
    sold: data.wallets.filter(w=>w.category_id===cat.id).reduce((s,w)=>s+(w.sold_cards||0),0),
  }));

  const catSummary = data.categories.map((cat,i) => ({
    ...cat, color: catColors[i%catColors.length],
    total: data.batches.filter(b=>b.category_id===cat.id).reduce((s,b)=>s+(b.available_cards||0),0),
  }));

  if (loading) return <Loading />;

  return (
    <View style={{ flex:1, backgroundColor:colors.bg }}>
      <SyncBar />
      <ScrollView contentContainerStyle={{ padding:spacing.lg, paddingBottom:90 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);load();}} tintColor={colors.blue}/>}>

        {/* KPIs */}
        <Row style={{ gap:spacing.sm, marginBottom:spacing.sm }}>
          <KpiCard value={formatNumber(totalCredit)} label="ذمم (ر.ي)" color={colors.orange}/>
          <KpiCard value={data.collections.length} label="تحصيل معلق" color={colors.red}/>
          <KpiCard value={formatNumber(totalInventory)} label="كروت بالمخزن" color={colors.cyan}/>
        </Row>
        <Row style={{ gap:spacing.sm, marginBottom:spacing.lg }}>
          <KpiCard value={data.pos.length} label="نقاط البيع" color={colors.green}/>
          <KpiCard value={pendingInv} label="فاتورة معلقة" color={colors.orange}/>
          <KpiCard value={blockedPos} label="محجوب" color={colors.red}/>
        </Row>

        {/* محافظ المندوبين */}
        {data.wallets.length > 0 && (
          <Card>
            <CardHeader title="👜 محفظة الأوراق"
              right={<Btn label="تفاصيل" variant="outline" size="xs" onPress={()=>navigation.navigate('Wallets')}/>}/>
            <View style={{ padding:spacing.md }}>
              {walletSummary.filter(w=>w.total>0).map((cat,i) => (
                <View key={cat.id} style={[s.walRow, i===walletSummary.filter(w=>w.total>0).length-1&&{borderBottomWidth:0}]}>
                  <View style={[s.walBar, {backgroundColor:cat.color}]}/>
                  <View style={{flex:1}}>
                    <Text style={s.walName}>{cat.name}</Text>
                    <Text style={s.walMeta}>متبقي: {cat.remaining} • مباع: {cat.sold}</Text>
                    <ProgressBar percent={cat.total>0?Math.round((cat.sold/cat.total)*100):0} color={cat.color} height={3}/>
                  </View>
                  <View style={{alignItems:'flex-end'}}>
                    <Text style={[s.walCount, {color:cat.color}]}>{cat.remaining}</Text>
                    <Text style={{fontSize:fontSize.xs, color:colors.t3}}>ورقة</Text>
                  </View>
                </View>
              ))}
            </View>
          </Card>
        )}

        {/* آخر الفواتير */}
        <Card>
          <CardHeader title="🧾 آخر الفواتير"
            right={<Btn label="عرض الكل" variant="outline" size="xs" onPress={()=>navigation.navigate('Invoices')}/>}/>
          <View style={{ padding:spacing.md }}>
            {data.invoices.length===0
              ? <Text style={s.empty}>لا توجد فواتير بعد</Text>
              : data.invoices.slice(0,5).map((inv,i) => (
                <TouchableOpacity key={inv.id} style={[s.invRow, i===4&&{borderBottomWidth:0}]}
                  onPress={()=>navigation.navigate('InvoiceDetail', {id:inv.id})}>
                  <View style={{flex:1}}>
                    <Row style={{gap:6}}>
                      <Text style={s.invNum}>{inv.invoice_number}</Text>
                      {inv.synced==0 && <Text style={{fontSize:10}}>📤</Text>}
                    </Row>
                    <Text style={s.invPos}>{inv.pos_customers?.name||'—'}</Text>
                  </View>
                  <View style={{alignItems:'flex-end',gap:4}}>
                    <Text style={s.invAmt}>{formatCurrency(inv.total_amount)}</Text>
                    <Badge status={inv.status}/>
                  </View>
                </TouchableOpacity>
              ))
            }
          </View>
        </Card>

        {/* المخزون */}
        <Card>
          <CardHeader title="📦 المخزون"
            right={<Btn label="إدارة" variant="outline" size="xs" onPress={()=>navigation.navigate('Inventory')}/>}/>
          <View style={{ padding:spacing.md }}>
            {catSummary.length===0
              ? <Text style={s.empty}>لا توجد فئات</Text>
              : catSummary.map((cat,i) => (
                <View key={cat.id} style={[s.catRow, i===catSummary.length-1&&{borderBottomWidth:0}]}>
                  <View style={[s.catBar, {backgroundColor:cat.color}]}/>
                  <View style={{flex:1}}>
                    <Text style={s.catName}>{cat.name}</Text>
                    <Text style={s.catMeta}>{formatCurrency(cat.price)} / ورقة</Text>
                  </View>
                  <Text style={[s.catCount, cat.total<15&&{color:colors.red}]}>{cat.total}</Text>
                  {cat.total<15 && <Text style={{fontSize:12}}>⚠️</Text>}
                </View>
              ))
            }
          </View>
        </Card>

        {/* نقاط البيع */}
        <Card>
          <CardHeader title="🏪 نقاط البيع"
            right={<Btn label="الكل" variant="outline" size="xs" onPress={()=>navigation.navigate('POS')}/>}/>
          <View style={{ padding:spacing.md }}>
            {data.pos.slice(0,4).map((pos,i) => {
              const pct = creditPercent(pos.credit_used, pos.credit_limit);
              const col = creditColor(pct, pos.is_blocked==1);
              return (
                <View key={pos.id} style={[s.posRow, i===Math.min(3,data.pos.length-1)&&{borderBottomWidth:0}]}>
                  <View style={[s.posAv, {backgroundColor:col+'22'}]}>
                    <Text style={[s.posAvTxt, {color:col}]}>{pos.name?.charAt(0)}</Text>
                  </View>
                  <View style={{flex:1}}>
                    <Text style={s.posName}>{pos.name}</Text>
                    <Text style={s.posMeta}>{pos.city||'—'}</Text>
                    <ProgressBar percent={pct} color={col} height={3}/>
                  </View>
                  <Text style={[s.posUsed, {color:col}]}>{pct}%</Text>
                </View>
              );
            })}
          </View>
        </Card>

        {/* تحصيلات معلقة */}
        {data.collections.length > 0 && (
          <Card>
            <CardHeader title="💰 تحصيلات معلقة"
              right={<View style={[s.cntBadge, {backgroundColor:colors.orange+'22'}]}>
                <Text style={{color:colors.orange,fontSize:fontSize.xs,fontWeight:'700'}}>{data.collections.length}</Text>
              </View>}/>
            <View style={{padding:spacing.md}}>
              {data.collections.slice(0,3).map((col,i) => (
                <View key={col.id} style={[s.colRow, i===Math.min(2,data.collections.length-1)&&{borderBottomWidth:0}]}>
                  <View style={{flex:1}}>
                    <Text style={s.colNum}>{col.collection_number}</Text>
                    <Text style={s.colAgent}>{col.users?.name||'—'} • {col.pos_customers?.name||'—'}</Text>
                    {col.invoice?.invoice_number ? <Text style={s.colInv}>فاتورة: {col.invoice.invoice_number}</Text> : null}
                  </View>
                  <Text style={s.colAmt}>{formatCurrency(col.amount)}</Text>
                </View>
              ))}
              <Btn label="اعتماد التحصيلات" variant="primary" size="sm"
                style={{marginTop:spacing.sm}} onPress={()=>navigation.navigate('Collections')}/>
            </View>
          </Card>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  empty: { textAlign:'center', color:colors.t3, fontSize:fontSize.sm, paddingVertical:spacing.lg },
  invRow: { flexDirection:'row', alignItems:'center', paddingVertical:spacing.md, borderBottomWidth:1, borderBottomColor:colors.border },
  invNum: { fontSize:fontSize.md, fontWeight:'700', color:colors.cyan, marginBottom:2 },
  invPos: { fontSize:fontSize.sm, color:colors.t2 },
  invAmt: { fontSize:fontSize.md, fontWeight:'700', color:colors.t1 },
  catRow: { flexDirection:'row', alignItems:'center', gap:spacing.sm, paddingVertical:spacing.sm, borderBottomWidth:1, borderBottomColor:colors.border },
  catBar: { width:8, height:30, borderRadius:3 },
  catName: { fontSize:fontSize.md, fontWeight:'700', color:colors.t1 },
  catMeta: { fontSize:fontSize.xs, color:colors.t3 },
  catCount: { fontSize:fontSize.xxl, fontWeight:'800', color:colors.t1 },
  posRow: { flexDirection:'row', alignItems:'center', gap:spacing.md, paddingVertical:spacing.md, borderBottomWidth:1, borderBottomColor:colors.border },
  posAv: { width:36, height:36, borderRadius:9, alignItems:'center', justifyContent:'center' },
  posAvTxt: { fontSize:fontSize.lg, fontWeight:'800' },
  posName: { fontSize:fontSize.md, fontWeight:'700', color:colors.t1, marginBottom:2 },
  posMeta: { fontSize:fontSize.xs, color:colors.t3, marginBottom:3 },
  posUsed: { fontSize:fontSize.sm, fontWeight:'700' },
  colRow: { flexDirection:'row', alignItems:'center', paddingVertical:spacing.sm, borderBottomWidth:1, borderBottomColor:colors.border },
  colNum: { fontSize:fontSize.md, fontWeight:'700', color:colors.cyan },
  colAgent: { fontSize:fontSize.xs, color:colors.t3, marginTop:2 },
  colInv: { fontSize:fontSize.xs, color:colors.blue, marginTop:1 },
  colAmt: { fontSize:fontSize.lg, fontWeight:'800', color:colors.green },
  cntBadge: { width:24, height:24, borderRadius:12, alignItems:'center', justifyContent:'center' },
  walRow: { flexDirection:'row', alignItems:'center', gap:spacing.sm, paddingVertical:spacing.sm, borderBottomWidth:1, borderBottomColor:colors.border },
  walBar: { width:8, height:30, borderRadius:3 },
  walName: { fontSize:fontSize.md, fontWeight:'700', color:colors.t1 },
  walMeta: { fontSize:fontSize.xs, color:colors.t3, marginBottom:3 },
  walCount: { fontSize:fontSize.xxl, fontWeight:'800' },
});
