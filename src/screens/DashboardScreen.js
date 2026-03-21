import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, RefreshControl, Dimensions, ActivityIndicator,
} from 'react-native';
import { colors, spacing, radius, fontSize } from '../theme';
import { supabase } from '../services/supabase';
import { getLocalInvoices, getLocalCollections } from '../services/database';
import { formatCurrency, formatNumber, creditPercent, creditColor, formatDateShort } from '../utils/helpers';
import { Badge, Btn, Loading, ProgressBar, Row } from '../components/UI';
import SyncBar from '../components/SyncBar';
import { useAuth } from '../services/AuthContext';
import { isOnline } from '../services/SyncService';

const W = Dimensions.get('window').width;

function StatCard({ value, label, icon, color }) {
  return (
    <View style={[s.statCard, { borderTopColor: color, borderTopWidth: 3 }]}>
      <Text style={s.statIcon}>{icon}</Text>
      <Text style={[s.statValue, { color }]} numberOfLines={1}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

export default function DashboardScreen({ navigation }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({
    total_sales:0, total_collected:0, pending_inv:0,
    overdue_inv:0, pending_col:0, blocked_pos:0, total_stock:0,
  });
  const [recentInvoices, setRecentInvoices] = useState([]);
  const [pendingCols, setPendingCols] = useState([]);
  const [topDebtors, setTopDebtors] = useState([]);
  const [online, setOnline] = useState(isOnline());

  const load = useCallback(async () => {
    setOnline(isOnline());
    try {
      if (isOnline()) {
        // بيانات من Supabase
        const [invR, colR, posR, stockR] = await Promise.all([
          supabase.from('invoices').select('id,net_amount,total_amount,status').eq('active',true),
          supabase.from('collections').select('id,amount,status,agent_id,pos_id,collection_date,collection_number').eq('active',true),
          supabase.from('pos_customers').select('id,name,owner_name,credit_used,credit_limit,is_blocked').eq('active',true),
          supabase.from('batches').select('available_cards').eq('status','active'),
        ]);

        const invs = invR.data || [];
        const cols = colR.data || [];
        const pos = posR.data || [];

        const total_sales = invs.reduce((s,i)=>s+(i.net_amount||i.total_amount||0),0);
        const total_collected = cols.filter(c=>c.status==='approved').reduce((s,c)=>s+(c.amount||0),0);
        const total_stock = (stockR.data||[]).reduce((s,b)=>s+(b.available_cards||0),0);

        setStats({
          total_sales, total_collected,
          pending_inv: invs.filter(i=>i.status==='pending').length,
          overdue_inv: invs.filter(i=>i.status==='overdue').length,
          pending_col: cols.filter(c=>c.status==='pending').length,
          blocked_pos: pos.filter(p=>p.is_blocked).length,
          total_stock,
        });

        // آخر 5 فواتير (من SQLite المحلي)
        const localInvs = await getLocalInvoices();
        setRecentInvoices(localInvs.slice(0,5));

        // أعلى التحصيلات المعلقة
        const localCols = await getLocalCollections({status:'pending'});
        setPendingCols(localCols.slice(0,3));

        // أعلى المديونيات
        const sorted = pos.filter(p=>p.credit_used>0).sort((a,b)=>b.credit_used-a.credit_used).slice(0,4);
        setTopDebtors(sorted);

      } else {
        // أوفلاين — من SQLite
        const [localInvs, localCols] = await Promise.all([
          getLocalInvoices(), getLocalCollections({status:'pending'}),
        ]);
        const total_sales = localInvs.reduce((s,i)=>s+(i.net_amount||i.total_amount||0),0);
        setStats({
          total_sales, total_collected:0,
          pending_inv: localInvs.filter(i=>i.status==='pending').length,
          overdue_inv: localInvs.filter(i=>i.status==='overdue').length,
          pending_col: localCols.length,
          blocked_pos:0, total_stock:0,
        });
        setRecentInvoices(localInvs.slice(0,5));
        setPendingCols(localCols.slice(0,3));
        setTopDebtors([]);
      }
    } catch(e) { console.log('Dashboard error:', e.message); }
    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Loading />;

  const remaining = (stats.total_sales||0) - (stats.total_collected||0);

  return (
    <View style={{ flex:1, backgroundColor:colors.bg }}>
      <SyncBar />
      {!online && (
        <View style={s.offlineBanner}>
          <Text style={s.offlineTxt}>📵 أوفلاين — البيانات المالية قد لا تكون محدّثة</Text>
        </View>
      )}
      <ScrollView
        contentContainerStyle={{ padding:spacing.md, paddingBottom:90 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);load();}} tintColor={colors.blue}/>}
      >
        {/* بطاقات الإحصائيات */}
        <View style={s.statsGrid}>
          <StatCard value={formatCurrency(stats.total_sales)} label="إجمالي المبيعات" icon="📊" color={colors.blue}/>
          <StatCard value={formatCurrency(stats.total_collected)} label="إجمالي المحصّل" icon="✅" color={colors.green}/>
          <StatCard value={formatCurrency(remaining)} label="المستحقات" icon="⏳" color={colors.orange}/>
          <StatCard value={formatNumber(stats.total_stock)} label="كروت بالمخزن" icon="📦" color={colors.cyan}/>
        </View>

        {/* تنبيهات */}
        {(stats.pending_inv>0||stats.overdue_inv>0||stats.pending_col>0||stats.blocked_pos>0)&&(
          <View style={s.alertBar}>
            {stats.pending_inv>0&&<View style={[s.chip,{backgroundColor:colors.orange+'22'}]}><Text style={[s.chipTxt,{color:colors.orange}]}>🧾 {stats.pending_inv} فاتورة معلقة</Text></View>}
            {stats.overdue_inv>0&&<View style={[s.chip,{backgroundColor:colors.red+'22'}]}><Text style={[s.chipTxt,{color:colors.red}]}>⚠️ {stats.overdue_inv} متأخرة</Text></View>}
            {stats.pending_col>0&&<View style={[s.chip,{backgroundColor:colors.purple+'22'}]}><Text style={[s.chipTxt,{color:colors.purple}]}>💰 {stats.pending_col} قبض معلق</Text></View>}
            {stats.blocked_pos>0&&<View style={[s.chip,{backgroundColor:colors.red+'22'}]}><Text style={[s.chipTxt,{color:colors.red}]}>🚫 {stats.blocked_pos} محجوب</Text></View>}
          </View>
        )}

        {/* آخر الفواتير */}
        <Row style={s.secHeader}>
          <Text style={s.secTitle}>🧾 آخر الفواتير</Text>
          <TouchableOpacity onPress={()=>navigation.navigate('Invoices')}><Text style={s.secLink}>الكل ←</Text></TouchableOpacity>
        </Row>
        <View style={s.card}>
          {recentInvoices.length===0
            ? <Text style={s.empty}>لا توجد فواتير بعد</Text>
            : recentInvoices.map((inv,i)=>(
              <TouchableOpacity key={inv.id}
                style={[s.listRow,i===recentInvoices.length-1&&{borderBottomWidth:0}]}>
                <View style={{flex:1}}>
                  <Text style={{fontSize:fontSize.md,fontWeight:'700',color:colors.cyan}}>{inv.invoice_number}</Text>
                  <Text style={{fontSize:fontSize.xs,color:colors.t3,marginTop:2}}>
                    {inv.pos_customers?.name||'—'} • {formatDateShort(inv.invoice_date)}
                  </Text>
                </View>
                <View style={{alignItems:'flex-end',gap:3}}>
                  <Text style={{fontSize:fontSize.md,fontWeight:'700',color:colors.t1}}>
                    {formatCurrency(inv.net_amount||inv.total_amount)}
                  </Text>
                  <Badge status={inv.status}/>
                </View>
              </TouchableOpacity>
            ))
          }
        </View>

        {/* تحصيلات معلقة */}
        {pendingCols.length>0&&(
          <>
            <Row style={s.secHeader}>
              <Text style={s.secTitle}>💰 تحصيلات معلقة</Text>
              <TouchableOpacity onPress={()=>navigation.navigate('Cashier')}><Text style={s.secLink}>اعتماد ←</Text></TouchableOpacity>
            </Row>
            <View style={s.card}>
              {pendingCols.map((col,i)=>(
                <View key={col.id} style={[s.listRow,i===pendingCols.length-1&&{borderBottomWidth:0}]}>
                  <View style={{flex:1}}>
                    <Text style={{fontSize:fontSize.md,fontWeight:'700',color:colors.t1}}>{col.users?.name||'—'}</Text>
                    <Text style={{fontSize:fontSize.xs,color:colors.t3,marginTop:2}}>{col.pos_customers?.name||'—'}</Text>
                  </View>
                  <Text style={{fontSize:fontSize.lg,fontWeight:'800',color:colors.green}}>{formatCurrency(col.amount)}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* أعلى المديونيات */}
        {topDebtors.length>0&&(
          <>
            <Row style={s.secHeader}>
              <Text style={s.secTitle}>💳 أعلى المديونيات</Text>
              <TouchableOpacity onPress={()=>navigation.navigate('Reports')}><Text style={s.secLink}>الكل ←</Text></TouchableOpacity>
            </Row>
            <View style={s.card}>
              {topDebtors.map((p,i)=>{
                const pct=creditPercent(p.credit_used,p.credit_limit);
                const col=creditColor(pct,p.is_blocked);
                return (
                  <View key={p.id} style={[s.listRow,i===topDebtors.length-1&&{borderBottomWidth:0}]}>
                    <View style={{flex:1,marginLeft:spacing.sm}}>
                      <Text style={{fontSize:fontSize.md,fontWeight:'700',color:colors.t1}}>{p.name}</Text>
                      <ProgressBar percent={pct} color={col} height={3}/>
                    </View>
                    <View style={{alignItems:'flex-end'}}>
                      <Text style={{fontSize:fontSize.md,fontWeight:'700',color:colors.orange}}>{formatCurrency(p.credit_used)}</Text>
                      <Text style={{fontSize:fontSize.xs,color:col}}>{pct}%</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  statsGrid:{flexDirection:'row',flexWrap:'wrap',gap:spacing.sm,marginBottom:spacing.md},
  statCard:{
    width:(W-spacing.md*2-spacing.sm)/2-1,
    backgroundColor:colors.card,borderWidth:1,borderColor:colors.border,
    borderRadius:radius.md,padding:spacing.md,alignItems:'center',
  },
  statIcon:{fontSize:22,marginBottom:spacing.xs},
  statValue:{fontSize:fontSize.xl,fontWeight:'800',marginBottom:2,textAlign:'center'},
  statLabel:{fontSize:fontSize.xs,color:colors.t3,textAlign:'center'},
  offlineBanner:{backgroundColor:colors.red+'22',padding:spacing.sm,borderBottomWidth:1,borderBottomColor:colors.red+'44'},
  offlineTxt:{color:colors.red,fontSize:fontSize.xs,textAlign:'center',fontWeight:'600'},
  alertBar:{flexDirection:'row',flexWrap:'wrap',gap:spacing.sm,marginBottom:spacing.md},
  chip:{paddingHorizontal:spacing.md,paddingVertical:spacing.xs,borderRadius:radius.full},
  chipTxt:{fontSize:fontSize.xs,fontWeight:'700'},
  secHeader:{justifyContent:'space-between',alignItems:'center',marginBottom:spacing.sm,marginTop:spacing.sm},
  secTitle:{fontSize:fontSize.lg,fontWeight:'800',color:colors.t1},
  secLink:{fontSize:fontSize.xs,color:colors.blue,fontWeight:'700'},
  card:{backgroundColor:colors.card,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,padding:spacing.md,marginBottom:spacing.md},
  listRow:{flexDirection:'row',alignItems:'center',paddingVertical:spacing.sm,borderBottomWidth:1,borderBottomColor:colors.border},
  empty:{textAlign:'center',color:colors.t3,fontSize:fontSize.sm,paddingVertical:spacing.lg},
});
