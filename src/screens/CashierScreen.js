import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Alert, RefreshControl,
} from 'react-native';
import { colors, spacing, radius, fontSize } from '../theme';
import {
  getLocalInvoices, getLocalCollections,
  approveLocalCollection, rejectLocalCollection,
  updateInvoiceStatus,
} from '../services/database';
import { formatCurrency, formatDateShort } from '../utils/helpers';
import { Badge, Btn, Loading, Empty, KpiCard, Row } from '../components/UI';
import SyncBar from '../components/SyncBar';

export default function CashierScreen() {
  const [tab, setTab] = useState('collections');
  const [collections, setCollections] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [cols, invs] = await Promise.all([
      getLocalCollections(),
      getLocalInvoices(),
    ]);
    setCollections(cols);
    setInvoices(invs);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const pendingCols = collections.filter(c => c.status === 'pending');
  const pendingInvs = invoices.filter(i => i.status === 'pending');
  const totalPendingCols = pendingCols.reduce((s,c) => s+(c.amount||0), 0);

  const handleApproveCol = (id, amount) => {
    Alert.alert('اعتماد التحصيل', `هل تؤكد استلام ${formatCurrency(amount)}؟`, [
      { text:'إلغاء', style:'cancel' },
      { text:'✅ نعم اعتماد', onPress: async () => { await approveLocalCollection(id); load(); } },
    ]);
  };

  const handleRejectCol = (id) => {
    Alert.alert('رفض التحصيل', 'هل تريد رفض هذا الإشعار؟', [
      { text:'إلغاء', style:'cancel' },
      { text:'❌ رفض', style:'destructive', onPress: async () => { await rejectLocalCollection(id,'مرفوض من المحاسب'); load(); } },
    ]);
  };

  const handleInvoiceStatus = (id, number, newStatus) => {
    const labels = { paid:'مسددة', partial:'جزئي', overdue:'متأخرة' };
    Alert.alert(
      `تحديث الفاتورة`,
      `تحديث ${number} إلى: ${labels[newStatus]}؟`,
      [
        { text:'إلغاء', style:'cancel' },
        { text:'✅ تأكيد', onPress: async () => { await updateInvoiceStatus(id, newStatus); load(); } },
      ]
    );
  };

  const methodLabel = m => ({ cash:'نقدي', transfer:'تحويل', check:'شيك' }[m] || m);

  if (loading) return <Loading />;

  return (
    <View style={s.screen}>
      <SyncBar />

      {/* KPI */}
      <View style={s.kpiRow}>
        <KpiCard value={pendingCols.length} label="قبوض معلقة" color={colors.orange} />
        <KpiCard value={formatCurrency(totalPendingCols)} label="مبلغ القبوض" color={colors.orange} />
        <KpiCard value={pendingInvs.length} label="فواتير معلقة" color={colors.blue} />
      </View>

      {/* Tabs */}
      <View style={s.tabs}>
        {[
          { k:'collections', l:`التحصيلات (${pendingCols.length})` },
          { k:'invoices',    l:`الفواتير (${pendingInvs.length})` },
          { k:'all_cols',    l:`كل القبوض (${collections.length})` },
        ].map(t => (
          <TouchableOpacity key={t.k} style={[s.tab, tab===t.k&&s.tabAct]} onPress={()=>setTab(t.k)}>
            <Text style={[s.tabTxt, tab===t.k&&s.tabTxtAct]}>{t.l}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={{ padding:spacing.md, paddingBottom:90 }}
        refreshControl={<RefreshControl refreshing={refreshing}
          onRefresh={()=>{setRefreshing(true);load();}} tintColor={colors.blue}/>}>

        {/* تحصيلات معلقة */}
        {tab==='collections' && (
          pendingCols.length===0
            ? <Empty icon="✅" title="لا توجد تحصيلات معلقة" sub="جميع القبوض معتمدة"/>
            : pendingCols.map(col=>(
              <View key={col.id} style={s.card}>
                <Row style={s.cardTop}>
                  <Text style={s.num}>{col.collection_number}</Text>
                  <Text style={s.date}>{formatDateShort(col.collection_date)}</Text>
                  <Badge status={col.status}/>
                </Row>
                <Text style={s.amount}>{formatCurrency(col.amount)}</Text>
                <View style={s.grid}>
                  <View style={s.gridItem}><Text style={s.gridLabel}>المندوب</Text><Text style={s.gridVal}>{col.users?.name||'—'}</Text></View>
                  <View style={s.gridItem}><Text style={s.gridLabel}>نقطة البيع</Text><Text style={s.gridVal}>{col.pos_customers?.name||'—'}</Text></View>
                  <View style={s.gridItem}><Text style={s.gridLabel}>الطريقة</Text><Text style={s.gridVal}>{methodLabel(col.method)}</Text></View>
                  {col.invoice?.invoice_number&&<View style={s.gridItem}><Text style={s.gridLabel}>الفاتورة</Text><Text style={[s.gridVal,{color:colors.blue}]}>{col.invoice.invoice_number}</Text></View>}
                </View>
                {col.reference_number?<Text style={s.ref}>Ref: {col.reference_number}</Text>:null}
                <Row style={s.actions}>
                  <Btn label="✅ اعتماد واستلام" variant="success" size="sm" style={{flex:1}} onPress={()=>handleApproveCol(col.id,col.amount)}/>
                  <Btn label="❌ رفض" variant="danger" size="sm" style={{flex:1}} onPress={()=>handleRejectCol(col.id)}/>
                </Row>
              </View>
            ))
        )}

        {/* فواتير معلقة */}
        {tab==='invoices' && (
          pendingInvs.length===0
            ? <Empty icon="✅" title="لا توجد فواتير معلقة"/>
            : pendingInvs.map(inv=>(
              <View key={inv.id} style={s.card}>
                <Row style={s.cardTop}>
                  <Text style={s.num}>{inv.invoice_number}</Text>
                  <Text style={s.date}>{formatDateShort(inv.invoice_date)}</Text>
                  <Badge status={inv.status}/>
                </Row>
                <Text style={s.amount}>{formatCurrency(inv.total_amount)}</Text>
                <View style={s.grid}>
                  <View style={s.gridItem}><Text style={s.gridLabel}>نقطة البيع</Text><Text style={s.gridVal}>{inv.pos_customers?.name||'—'}</Text></View>
                  <View style={s.gridItem}><Text style={s.gridLabel}>المندوب</Text><Text style={s.gridVal}>{inv.users?.name||'—'}</Text></View>
                  <View style={s.gridItem}><Text style={s.gridLabel}>النوع</Text><Badge status={inv.type}/></View>
                  <View style={s.gridItem}><Text style={s.gridLabel}>مسدد</Text><Text style={[s.gridVal,{color:colors.green}]}>{formatCurrency(inv.paid_amount)}</Text></View>
                </View>
                <Row style={s.actions}>
                  <Btn label="✅ مسددة" variant="success" size="sm" style={{flex:1}}
                    onPress={()=>handleInvoiceStatus(inv.id,inv.invoice_number,'paid')}/>
                  <Btn label="🔄 جزئي" variant="outline" size="sm" style={{flex:1}}
                    onPress={()=>handleInvoiceStatus(inv.id,inv.invoice_number,'partial')}/>
                  <Btn label="⚠️ متأخرة" variant="danger" size="sm" style={{flex:1}}
                    onPress={()=>handleInvoiceStatus(inv.id,inv.invoice_number,'overdue')}/>
                </Row>
              </View>
            ))
        )}

        {/* كل القبوض */}
        {tab==='all_cols' && (
          collections.length===0
            ? <Empty icon="💰" title="لا توجد تحصيلات"/>
            : collections.map(col=>(
              <View key={col.id} style={s.card}>
                <Row style={s.cardTop}>
                  <Text style={s.num}>{col.collection_number}</Text>
                  <Text style={s.date}>{formatDateShort(col.collection_date)}</Text>
                  <Badge status={col.status}/>
                </Row>
                <Row style={{justifyContent:'space-between',marginBottom:spacing.sm}}>
                  <Text style={s.amount}>{formatCurrency(col.amount)}</Text>
                  <Text style={{color:colors.t3,fontSize:fontSize.sm}}>{col.users?.name||'—'}</Text>
                </Row>
                <Text style={{color:colors.t3,fontSize:fontSize.xs}}>
                  {col.pos_customers?.name||'—'} • {methodLabel(col.method)}
                </Text>
                {col.status==='pending'&&(
                  <Row style={[s.actions,{marginTop:spacing.sm}]}>
                    <Btn label="✅ اعتماد" variant="success" size="sm" style={{flex:1}} onPress={()=>handleApproveCol(col.id,col.amount)}/>
                    <Btn label="❌ رفض" variant="danger" size="sm" style={{flex:1}} onPress={()=>handleRejectCol(col.id)}/>
                  </Row>
                )}
              </View>
            ))
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  screen:{flex:1,backgroundColor:colors.bg},
  kpiRow:{flexDirection:'row',gap:1,backgroundColor:colors.bg2,borderBottomWidth:1,borderBottomColor:colors.border},
  tabs:{flexDirection:'row',backgroundColor:colors.bg2,borderBottomWidth:1,borderBottomColor:colors.border},
  tab:{flex:1,paddingVertical:spacing.md,alignItems:'center',borderBottomWidth:2,borderBottomColor:'transparent'},
  tabAct:{borderBottomColor:colors.blue},
  tabTxt:{fontSize:fontSize.xs,fontWeight:'600',color:colors.t3},
  tabTxtAct:{color:colors.blue,fontWeight:'700'},
  card:{backgroundColor:colors.card2,borderWidth:1,borderColor:colors.border2,borderRadius:radius.md,padding:spacing.lg,marginBottom:spacing.sm},
  cardTop:{justifyContent:'space-between',marginBottom:spacing.sm},
  num:{fontSize:fontSize.md,fontWeight:'700',color:colors.cyan,flex:1},
  date:{fontSize:fontSize.xs,color:colors.t3,marginLeft:spacing.sm},
  amount:{fontSize:24,fontWeight:'800',color:colors.green,marginBottom:spacing.md},
  grid:{flexDirection:'row',flexWrap:'wrap',gap:spacing.sm,marginBottom:spacing.sm},
  gridItem:{backgroundColor:colors.bg,borderRadius:radius.sm,padding:spacing.sm,minWidth:'45%'},
  gridLabel:{fontSize:fontSize.xs,color:colors.t3,marginBottom:2},
  gridVal:{fontSize:fontSize.md,fontWeight:'600',color:colors.t1},
  ref:{fontSize:fontSize.xs,color:colors.t3,marginBottom:spacing.sm},
  actions:{gap:spacing.sm,marginTop:spacing.sm},
});
