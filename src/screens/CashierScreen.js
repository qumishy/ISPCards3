import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, RefreshControl } from 'react-native';
import { colors, spacing, radius, fontSize } from '../theme';
import { getLocalCollections, approveLocalCollection, rejectLocalCollection } from '../services/database';
import { formatCurrency, formatDateShort } from '../utils/helpers';
import { Badge, Btn, Loading, Empty, KpiCard, Row } from '../components/UI';
import SyncBar from '../components/SyncBar';

export default function CashierScreen() {
  const [tab, setTab] = useState('pending');
  const [cols, setCols] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const data = await getLocalCollections();
    setCols(data); setLoading(false); setRefreshing(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const pending = cols.filter(c=>c.status==='pending');
  const approved = cols.filter(c=>c.status==='approved');
  const rejected = cols.filter(c=>c.status==='rejected');
  const display = tab==='pending'?pending:tab==='approved'?approved:tab==='rejected'?rejected:cols;

  const totalPending = pending.reduce((s,c)=>s+(c.amount||0),0);
  const totalApproved = approved.reduce((s,c)=>s+(c.amount||0),0);

  const handleApprove = (id,amount) => Alert.alert('اعتماد التحصيل',`هل تؤكد استلام ${formatCurrency(amount)}؟`,[
    {text:'إلغاء',style:'cancel'},
    {text:'✅ نعم اعتماد',onPress:async()=>{await approveLocalCollection(id);load();}},
  ]);
  const handleReject = (id) => Alert.alert('رفض التحصيل','هل تريد رفض هذا الإشعار؟',[
    {text:'إلغاء',style:'cancel'},
    {text:'❌ رفض',style:'destructive',onPress:async()=>{await rejectLocalCollection(id,'مرفوض من المحاسب');load();}},
  ]);
  const methodLabel = m=>({cash:'نقدي',transfer:'تحويل',check:'شيك'}[m]||m);

  if (loading) return <Loading/>;

  return (
    <View style={s.screen}>
      <SyncBar/>
      <View style={s.kpiRow}>
        <KpiCard value={pending.length} label="قبوض معلقة" color={colors.orange}/>
        <KpiCard value={formatCurrency(totalPending)} label="مبلغ المعلق" color={colors.orange}/>
        <KpiCard value={formatCurrency(totalApproved)} label="إجمالي المحصّل" color={colors.green}/>
      </View>
      <View style={s.tabs}>
        {[
          {k:'pending', l:`معلقة (${pending.length})`},
          {k:'approved',l:`معتمدة (${approved.length})`},
          {k:'rejected',l:`مرفوضة (${rejected.length})`},
          {k:'all',     l:`الكل (${cols.length})`},
        ].map(t=>(
          <TouchableOpacity key={t.k} style={[s.tab,tab===t.k&&s.tabAct]} onPress={()=>setTab(t.k)}>
            <Text style={[s.tabTxt,tab===t.k&&s.tabTxtAct]}>{t.l}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <ScrollView contentContainerStyle={{padding:spacing.md,paddingBottom:90}}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);load();}} tintColor={colors.blue}/>}>
        {display.length===0
          ? <Empty icon={tab==='pending'?'✅':'💰'} title={tab==='pending'?'لا توجد قبوض معلقة':'لا توجد تحصيلات'}/>
          : display.map(col=>(
            <View key={col.id} style={s.card}>
              <Row style={s.cardTop}>
                <Text style={s.num}>{col.collection_number}</Text>
                <Text style={s.date}>{formatDateShort(col.collection_date)}</Text>
                <Badge status={col.status}/>
              </Row>
              <Text style={s.amount}>{formatCurrency(col.amount)}</Text>
              <View style={s.grid}>
                <View style={s.gi}><Text style={s.gl}>المندوب</Text><Text style={s.gv}>{col.users?.name||'—'}</Text></View>
                <View style={s.gi}><Text style={s.gl}>نقطة البيع</Text><Text style={s.gv}>{col.pos_customers?.name||'—'}</Text></View>
                <View style={s.gi}><Text style={s.gl}>الطريقة</Text><Text style={s.gv}>{methodLabel(col.method)}</Text></View>
                {col.invoice?.invoice_number&&<View style={s.gi}><Text style={s.gl}>الفاتورة</Text><Text style={[s.gv,{color:colors.blue}]}>{col.invoice.invoice_number}</Text></View>}
              </View>
              {col.status==='rejected'&&col.rejection_reason&&(
                <Text style={{fontSize:fontSize.xs,color:colors.red,marginTop:spacing.xs}}>سبب الرفض: {col.rejection_reason}</Text>
              )}
              {col.status==='pending'&&(
                <Row style={{gap:spacing.sm,marginTop:spacing.sm}}>
                  <Btn label="✅ اعتماد واستلام" variant="success" size="sm" style={{flex:1}} onPress={()=>handleApprove(col.id,col.amount)}/>
                  <Btn label="❌ رفض" variant="danger" size="sm" style={{flex:1}} onPress={()=>handleReject(col.id)}/>
                </Row>
              )}
            </View>
          ))
        }
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
  tabTxt:{fontSize:9,fontWeight:'600',color:colors.t3},
  tabTxtAct:{color:colors.blue,fontWeight:'700'},
  card:{backgroundColor:colors.card,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,padding:spacing.lg,marginBottom:spacing.sm},
  cardTop:{justifyContent:'space-between',marginBottom:spacing.sm},
  num:{fontSize:fontSize.md,fontWeight:'700',color:colors.cyan,flex:1},
  date:{fontSize:fontSize.xs,color:colors.t3,marginLeft:spacing.sm},
  amount:{fontSize:24,fontWeight:'800',color:colors.green,marginBottom:spacing.md},
  grid:{flexDirection:'row',flexWrap:'wrap',gap:spacing.sm,marginBottom:spacing.sm},
  gi:{backgroundColor:colors.bg2,borderRadius:radius.sm,padding:spacing.sm,minWidth:'45%'},
  gl:{fontSize:fontSize.xs,color:colors.t3,marginBottom:2},
  gv:{fontSize:fontSize.md,fontWeight:'600',color:colors.t1},
});
