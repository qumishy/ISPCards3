import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { colors, spacing, radius, fontSize } from '../theme';
import {
  getLocalPOS, getLocalInvoices, getLocalCollections,
  getLocalBatches, getLocalCategories, getAgentWallets,
} from '../services/database';
import { formatCurrency, formatNumber, creditPercent, creditColor, formatDateShort } from '../utils/helpers';
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
      getAgentWallets(user?.role==='agent' ? user.id : null),
    ]);
    setData({ pos, invoices:inv, collections:col, batches:bat, categories:cat, wallets:wal });
    setLoading(false); setRefreshing(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const totalCredit = data.pos.reduce((s,p) => s+(p.credit_used||0), 0);
  const blockedPos = data.pos.filter(p => p.is_blocked==1).length;
  const totalInventory = data.batches.reduce((s,b) => s+(b.available_cards||0), 0);
  const pendingInv = data.invoices.filter(i => i.status==='pending').length;
  const overdueInv = data.invoices.filter(i => i.status==='overdue').length;
  const totalSales = data.invoices.reduce((s,i) => s+(i.total_amount||0), 0);
  const totalCollected = data.invoices.filter(i=>i.status==='paid').reduce((s,i)=>s+(i.total_amount||0),0);

  if (loading) return <Loading />;

  return (
    <View style={{ flex:1, backgroundColor:colors.bg }}>
      <SyncBar />
      <ScrollView
        contentContainerStyle={{ padding:spacing.lg, paddingBottom:90 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);load();}} tintColor={colors.blue}/>}
      >
        {/* KPIs الرئيسية */}
        <Row style={{ gap:spacing.sm, marginBottom:spacing.sm }}>
          <KpiCard value={formatCurrency(totalSales)} label="إجمالي المبيعات" color={colors.cyan}/>
          <KpiCard value={formatCurrency(totalCollected)} label="إجمالي المحصّل" color={colors.green}/>
        </Row>
        <Row style={{ gap:spacing.sm, marginBottom:spacing.sm }}>
          <KpiCard value={formatNumber(totalCredit)} label="ذمم مستحقة (ر.ي)" color={colors.orange}/>
          <KpiCard value={data.collections.length} label="تحصيل معلق" color={colors.red}/>
        </Row>
        <Row style={{ gap:spacing.sm, marginBottom:spacing.lg }}>
          <KpiCard value={pendingInv} label="فاتورة معلقة" color={colors.orange}/>
          <KpiCard value={overdueInv} label="فاتورة متأخرة" color={colors.red}/>
          <KpiCard value={formatNumber(totalInventory)} label="كروت بالمخزن" color={colors.purple}/>
        </Row>

        {/* آخر الفواتير */}
        <Card>
          <CardHeader title="🧾 آخر الفواتير"
            right={<Btn label="الكل" variant="outline" size="xs" onPress={()=>navigation.navigate('Invoices')}/>}/>
          <View style={{ padding:spacing.md }}>
            {data.invoices.length===0
              ? <Text style={s.empty}>لا توجد فواتير بعد</Text>
              : data.invoices.slice(0,5).map((inv,i) => (
                <TouchableOpacity key={inv.id}
                  style={[s.row, i===4&&{borderBottomWidth:0}]}
                  onPress={()=>navigation.navigate('Invoices',{screen:'InvoicesTab',params:{screen:'InvMain'}})}>
                  <View style={{flex:1}}>
                    <Row style={{gap:6}}>
                      <Text style={s.invNum}>{inv.invoice_number}</Text>
                      {inv.synced==0&&<Text style={{fontSize:10}}>📤</Text>}
                    </Row>
                    <Text style={s.invPos}>{inv.pos_customers?.name||'—'}</Text>
                    <Text style={s.invMeta}>{inv.users?.name||'—'} • {formatDateShort(inv.invoice_date)}</Text>
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

        {/* تحصيلات معلقة */}
        {data.collections.length > 0 && (
          <Card>
            <CardHeader title="💰 تحصيلات معلقة"
              right={<View style={[s.cntBadge,{backgroundColor:colors.orange+'22'}]}>
                <Text style={{color:colors.orange,fontSize:fontSize.xs,fontWeight:'700'}}>{data.collections.length}</Text>
              </View>}/>
            <View style={{padding:spacing.md}}>
              {data.collections.slice(0,3).map((col,i)=>(
                <View key={col.id} style={[s.colRow,i===Math.min(2,data.collections.length-1)&&{borderBottomWidth:0}]}>
                  <View style={{flex:1}}>
                    <Row style={{gap:6}}>
                      <Text style={s.colNum}>{col.collection_number}</Text>
                      {col.synced==0&&<Text style={{fontSize:10}}>📤</Text>}
                    </Row>
                    <Text style={s.colAgent}>{col.users?.name||'—'} • {col.pos_customers?.name||'—'}</Text>
                    {col.invoice?.invoice_number&&<Text style={{fontSize:fontSize.xs,color:colors.blue,marginTop:1}}>فاتورة: {col.invoice.invoice_number}</Text>}
                  </View>
                  <Text style={s.colAmt}>{formatCurrency(col.amount)}</Text>
                </View>
              ))}
              <Btn label="اعتماد التحصيلات" variant="primary" size="sm"
                style={{marginTop:spacing.sm}}
                onPress={()=>navigation.navigate('Cashier')}/>
            </View>
          </Card>
        )}

        {/* ملخص المحفظة إذا كان مندوب */}
        {user?.role==='agent' && data.wallets.length>0 && (
          <Card>
            <CardHeader title="👜 محفظتي"
              right={<Btn label="التفاصيل" variant="outline" size="xs" onPress={()=>navigation.navigate('Wallets')}/>}/>
            <View style={{padding:spacing.md}}>
              {data.wallets.slice(0,4).map((w,i)=>{
                const remaining=w.total_cards-w.sold_cards;
                const pct=w.total_cards>0?Math.round((w.sold_cards/w.total_cards)*100):0;
                const col=remaining===0?colors.red:remaining<5?colors.orange:colors.green;
                return (
                  <View key={w.id} style={[s.walRow,i===Math.min(3,data.wallets.length-1)&&{borderBottomWidth:0}]}>
                    <View style={{flex:1}}>
                      <Text style={{fontSize:fontSize.md,fontWeight:'700',color:colors.t1}}>{w.card_categories?.name||'—'}</Text>
                      <Text style={{fontSize:fontSize.xs,color:colors.t3}}>{w.batches?.batch_number||'—'}</Text>
                      <ProgressBar percent={pct} color={colors.blue} height={3}/>
                    </View>
                    <View style={[s.remBadge,{backgroundColor:col+'22'}]}>
                      <Text style={{color:col,fontWeight:'800',fontSize:fontSize.lg}}>{remaining}</Text>
                      <Text style={{color:col,fontSize:fontSize.xs}}>ورقة</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </Card>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  empty: { textAlign:'center', color:colors.t3, fontSize:fontSize.sm, paddingVertical:spacing.lg },
  row: { flexDirection:'row', alignItems:'center', paddingVertical:spacing.md, borderBottomWidth:1, borderBottomColor:colors.border },
  invNum: { fontSize:fontSize.md, fontWeight:'700', color:colors.cyan, marginBottom:2 },
  invPos: { fontSize:fontSize.sm, fontWeight:'600', color:colors.t1 },
  invMeta: { fontSize:fontSize.xs, color:colors.t3, marginTop:1 },
  invAmt: { fontSize:fontSize.md, fontWeight:'700', color:colors.t1 },
  colRow: { flexDirection:'row', alignItems:'center', paddingVertical:spacing.sm, borderBottomWidth:1, borderBottomColor:colors.border },
  colNum: { fontSize:fontSize.md, fontWeight:'700', color:colors.cyan },
  colAgent: { fontSize:fontSize.xs, color:colors.t3, marginTop:2 },
  colAmt: { fontSize:fontSize.lg, fontWeight:'800', color:colors.green },
  cntBadge: { width:24, height:24, borderRadius:12, alignItems:'center', justifyContent:'center' },
  walRow: { flexDirection:'row', alignItems:'center', gap:spacing.md, paddingVertical:spacing.sm, borderBottomWidth:1, borderBottomColor:colors.border },
  remBadge: { alignItems:'center', justifyContent:'center', padding:spacing.sm, borderRadius:radius.md, minWidth:50 },
});
