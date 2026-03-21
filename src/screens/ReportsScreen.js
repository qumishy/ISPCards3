import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { colors, spacing, radius, fontSize } from '../theme';
import { execSQL, getLocalUsers, getLocalPOS } from '../services/database';
import { formatCurrency, formatDateShort } from '../utils/helpers';
import { Card, CardHeader, Badge, Loading, Row, KpiCard, Btn } from '../components/UI';
import SyncBar from '../components/SyncBar';

export default function ReportsScreen() {
  const [tab, setTab] = useState('debts');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState({
    debts: [], agentSales: [], inventory: [], dailyCollections: [], overdueInvoices: [], summary: {}
  });

  const load = useCallback(async () => {
    try {
      // 1. ذمم نقاط البيع
      const debtsR = await execSQL(`
        SELECT p.id, p.name, p.owner_name, p.city, p.credit_used, p.credit_limit,
          p.is_blocked, COUNT(i.id) as inv_count
        FROM pos_customers p
        LEFT JOIN invoices i ON i.pos_id=p.id AND i.status='pending'
        WHERE p.credit_used > 0
        GROUP BY p.id ORDER BY p.credit_used DESC`);

      // 2. مبيعات المندوبين
      const agentR = await execSQL(`
        SELECT u.id, u.name,
          COUNT(DISTINCT i.id) as inv_count,
          COALESCE(SUM(i.total_amount),0) as total_sales,
          COALESCE(SUM(CASE WHEN i.status='paid' THEN i.total_amount ELSE 0 END),0) as collected,
          COUNT(DISTINCT c.id) as col_count
        FROM users u
        LEFT JOIN invoices i ON i.agent_id=u.id
        LEFT JOIN collections c ON c.agent_id=u.id AND c.status='approved'
        WHERE u.role='agent' AND u.is_active=1
        GROUP BY u.id ORDER BY total_sales DESC`);

      // 3. حركة المخزون
      const invR = await execSQL(`
        SELECT c.name as cat_name, c.price,
          COALESCE(SUM(b.total_cards),0) as total,
          COALESCE(SUM(b.available_cards),0) as available,
          COALESCE(SUM(b.total_cards)-SUM(b.available_cards),0) as distributed,
          COUNT(b.id) as batch_count
        FROM card_categories c
        LEFT JOIN batches b ON b.category_id=c.id AND b.status='active'
        WHERE c.is_active=1
        GROUP BY c.id ORDER BY c.price`);

      // 4. التحصيلات اليومية (آخر 7 أيام)
      const dailyR = await execSQL(`
        SELECT collection_date,
          COUNT(*) as count,
          COALESCE(SUM(amount),0) as total
        FROM collections WHERE status='approved'
        GROUP BY collection_date
        ORDER BY collection_date DESC LIMIT 7`);

      // 5. الفواتير المتأخرة
      const overdueR = await execSQL(`
        SELECT i.*, p.name as pos_name, u.name as agent_name
        FROM invoices i
        LEFT JOIN pos_customers p ON i.pos_id=p.id
        LEFT JOIN users u ON i.agent_id=u.id
        WHERE i.status IN ('pending','overdue')
        ORDER BY i.created_at ASC LIMIT 20`);

      // 6. ملخص عام
      const sumR = await execSQL(`
        SELECT
          (SELECT COALESCE(SUM(total_amount),0) FROM invoices) as total_invoices,
          (SELECT COALESCE(SUM(total_amount),0) FROM invoices WHERE status='paid') as total_paid,
          (SELECT COALESCE(SUM(amount),0) FROM collections WHERE status='approved') as total_collected,
          (SELECT COUNT(*) FROM pos_customers WHERE is_blocked=1) as blocked_pos,
          (SELECT COUNT(*) FROM invoices WHERE status='overdue') as overdue_count,
          (SELECT COUNT(*) FROM collections WHERE status='pending') as pending_collections`);

      setData({
        debts: debtsR.rows._array || [],
        agentSales: agentR.rows._array || [],
        inventory: invR.rows._array || [],
        dailyCollections: dailyR.rows._array || [],
        overdueInvoices: overdueR.rows._array || [],
        summary: sumR.rows._array[0] || {},
      });
    } catch(e) { console.log('Reports error:', e.message); }
    setLoading(false); setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const tabs = [
    { k:'debts',      l:'الذمم',      icon:'💳' },
    { k:'agents',     l:'المندوبون',  icon:'👤' },
    { k:'inventory',  l:'المخزون',   icon:'📦' },
    { k:'daily',      l:'يومي',       icon:'📅' },
    { k:'overdue',    l:'متأخرة',     icon:'⚠️' },
  ];

  if (loading) return <Loading />;

  const sum = data.summary;

  return (
    <View style={s.screen}>
      <SyncBar />

      {/* ملخص عام */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={{ maxHeight:80, backgroundColor:colors.bg2, borderBottomWidth:1, borderBottomColor:colors.border }}
        contentContainerStyle={{ flexDirection:'row', paddingHorizontal:spacing.sm, alignItems:'center', gap:spacing.xs }}>
        {[
          { l:'إجمالي الفواتير', v:formatCurrency(sum.total_invoices||0), c:colors.cyan },
          { l:'محصّل', v:formatCurrency(sum.total_collected||0), c:colors.green },
          { l:'متأخرة', v:sum.overdue_count||0, c:colors.red },
          { l:'قبوض معلقة', v:sum.pending_collections||0, c:colors.orange },
          { l:'محجوب', v:sum.blocked_pos||0, c:colors.red },
        ].map((item,i) => (
          <View key={i} style={s.sumCard}>
            <Text style={[s.sumVal,{color:item.c}]}>{item.v}</Text>
            <Text style={s.sumLabel}>{item.l}</Text>
          </View>
        ))}
      </ScrollView>

      {/* Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={{ maxHeight:46, backgroundColor:colors.bg2, borderBottomWidth:1, borderBottomColor:colors.border }}
        contentContainerStyle={{ flexDirection:'row', paddingHorizontal:spacing.sm }}>
        {tabs.map(t => (
          <TouchableOpacity key={t.k} style={[s.tab, tab===t.k&&s.tabAct]} onPress={()=>setTab(t.k)}>
            <Text style={{fontSize:13}}>{t.icon}</Text>
            <Text style={[s.tabTxt, tab===t.k&&s.tabTxtAct]}>{t.l}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={{padding:spacing.md, paddingBottom:90}}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);load();}} tintColor={colors.blue}/>}>

        {/* ذمم نقاط البيع */}
        {tab==='debts' && (
          data.debts.length===0
            ? <Text style={s.empty}>لا توجد ذمم مستحقة</Text>
            : data.debts.map((p,i)=>{
              const pct = p.credit_limit>0?Math.round((p.credit_used/p.credit_limit)*100):0;
              const col = pct>=90?colors.red:pct>=70?colors.orange:colors.green;
              return (
                <View key={p.id} style={s.card}>
                  <Row style={{marginBottom:spacing.sm}}>
                    <View style={[s.avatar,{backgroundColor:col+'22'}]}>
                      <Text style={[s.avatarTxt,{color:col}]}>{p.name?.charAt(0)}</Text>
                    </View>
                    <View style={{flex:1}}>
                      <Text style={s.cardTitle}>{p.name}</Text>
                      <Text style={s.cardSub}>{p.owner_name||'—'} • {p.city||'—'}</Text>
                    </View>
                    {p.is_blocked==1&&<Badge status="cancelled" label="محجوب"/>}
                    {p.inv_count>0&&<View style={s.invBadge}><Text style={{color:colors.orange,fontSize:fontSize.xs,fontWeight:'700'}}>{p.inv_count} فاتورة</Text></View>}
                  </Row>
                  <Row style={{justifyContent:'space-between',marginBottom:spacing.sm}}>
                    <View style={{alignItems:'center'}}>
                      <Text style={{fontSize:fontSize.xs,color:colors.t3}}>مستخدم</Text>
                      <Text style={{fontSize:fontSize.lg,fontWeight:'800',color:colors.orange}}>{formatCurrency(p.credit_used)}</Text>
                    </View>
                    <View style={{alignItems:'center'}}>
                      <Text style={{fontSize:fontSize.xs,color:colors.t3}}>الحد</Text>
                      <Text style={{fontSize:fontSize.md,fontWeight:'700',color:colors.t2}}>{formatCurrency(p.credit_limit)}</Text>
                    </View>
                    <View style={{alignItems:'center'}}>
                      <Text style={{fontSize:fontSize.xs,color:colors.t3}}>النسبة</Text>
                      <Text style={{fontSize:fontSize.lg,fontWeight:'800',color:col}}>{pct}%</Text>
                    </View>
                  </Row>
                  <View style={{height:6,backgroundColor:colors.border,borderRadius:3,overflow:'hidden'}}>
                    <View style={{height:6,width:Math.min(pct,100)+'%',backgroundColor:col,borderRadius:3}}/>
                  </View>
                </View>
              );
            })
        )}

        {/* مبيعات المندوبين */}
        {tab==='agents' && (
          data.agentSales.length===0
            ? <Text style={s.empty}>لا توجد بيانات مندوبين</Text>
            : data.agentSales.map((a,i)=>(
              <View key={a.id} style={s.card}>
                <Row style={{marginBottom:spacing.md}}>
                  <View style={[s.avatar,{backgroundColor:colors.green+'22'}]}>
                    <Text style={[s.avatarTxt,{color:colors.green}]}>{a.name?.charAt(0)}</Text>
                  </View>
                  <View style={{flex:1}}>
                    <Text style={s.cardTitle}>{a.name}</Text>
                    <Text style={s.cardSub}>{a.inv_count} فاتورة • {a.col_count} تحصيل</Text>
                  </View>
                </Row>
                <Row style={{justifyContent:'space-between'}}>
                  {[
                    {l:'إجمالي المبيعات', v:formatCurrency(a.total_sales), c:colors.cyan},
                    {l:'محصّل', v:formatCurrency(a.collected), c:colors.green},
                    {l:'متبقي', v:formatCurrency((a.total_sales||0)-(a.collected||0)), c:colors.orange},
                  ].map((st,j)=>(
                    <View key={j} style={{alignItems:'center',flex:1}}>
                      <Text style={{fontSize:fontSize.xs,color:colors.t3,marginBottom:2}}>{st.l}</Text>
                      <Text style={{fontSize:fontSize.sm,fontWeight:'700',color:st.c}}>{st.v}</Text>
                    </View>
                  ))}
                </Row>
              </View>
            ))
        )}

        {/* حركة المخزون */}
        {tab==='inventory' && (
          data.inventory.length===0
            ? <Text style={s.empty}>لا توجد بيانات مخزون</Text>
            : data.inventory.map((cat,i)=>{
              const distPct = cat.total>0?Math.round((cat.distributed/cat.total)*100):0;
              return (
                <View key={i} style={s.card}>
                  <Row style={{marginBottom:spacing.sm}}>
                    <Text style={{fontSize:18}}>📦</Text>
                    <View style={{flex:1,marginRight:spacing.sm}}>
                      <Text style={s.cardTitle}>{cat.cat_name}</Text>
                      <Text style={s.cardSub}>{formatCurrency(cat.price)} / ورقة • {cat.batch_count} دفعة</Text>
                    </View>
                    <View style={[s.invBadge,{backgroundColor:cat.available<10?colors.red+'22':colors.green+'22'}]}>
                      <Text style={{color:cat.available<10?colors.red:colors.green,fontWeight:'700',fontSize:fontSize.sm}}>{cat.available} متاح</Text>
                    </View>
                  </Row>
                  <Row style={{justifyContent:'space-between',marginBottom:spacing.sm}}>
                    {[
                      {l:'الإجمالي', v:cat.total, c:colors.t1},
                      {l:'موزّع', v:cat.distributed, c:colors.orange},
                      {l:'متاح', v:cat.available, c:colors.green},
                    ].map((st,j)=>(
                      <View key={j} style={{alignItems:'center',flex:1}}>
                        <Text style={{fontSize:fontSize.xs,color:colors.t3}}>{st.l}</Text>
                        <Text style={{fontSize:fontSize.xxl,fontWeight:'800',color:st.c}}>{st.v}</Text>
                      </View>
                    ))}
                  </Row>
                  <View style={{height:5,backgroundColor:colors.border,borderRadius:3,overflow:'hidden'}}>
                    <View style={{height:5,width:distPct+'%',backgroundColor:colors.orange,borderRadius:3}}/>
                  </View>
                  <Text style={{fontSize:fontSize.xs,color:colors.t3,marginTop:4,textAlign:'left'}}>موزّع {distPct}%</Text>
                </View>
              );
            })
        )}

        {/* التحصيلات اليومية */}
        {tab==='daily' && (
          data.dailyCollections.length===0
            ? <Text style={s.empty}>لا توجد تحصيلات مسجلة</Text>
            : data.dailyCollections.map((d,i)=>(
              <View key={i} style={s.card}>
                <Row style={{justifyContent:'space-between'}}>
                  <View>
                    <Text style={{fontSize:fontSize.md,fontWeight:'700',color:colors.t1}}>{formatDateShort(d.collection_date)}</Text>
                    <Text style={{fontSize:fontSize.xs,color:colors.t3,marginTop:2}}>{d.count} عملية قبض</Text>
                  </View>
                  <Text style={{fontSize:fontSize.xxl,fontWeight:'800',color:colors.green}}>{formatCurrency(d.total)}</Text>
                </Row>
              </View>
            ))
        )}

        {/* الفواتير المتأخرة */}
        {tab==='overdue' && (
          data.overdueInvoices.length===0
            ? <Text style={s.empty}>✅ لا توجد فواتير متأخرة</Text>
            : data.overdueInvoices.map((inv,i)=>(
              <View key={inv.id} style={[s.card,{borderColor:colors.red+'44'}]}>
                <Row style={{marginBottom:spacing.sm}}>
                  <Text style={[s.cardTitle,{color:colors.cyan,flex:1}]}>{inv.invoice_number}</Text>
                  <Badge status={inv.status}/>
                </Row>
                <Row style={{justifyContent:'space-between'}}>
                  <View>
                    <Text style={s.cardSub}>نقطة البيع: {inv.pos_name||'—'}</Text>
                    <Text style={s.cardSub}>المندوب: {inv.agent_name||'—'}</Text>
                    <Text style={s.cardSub}>التاريخ: {formatDateShort(inv.invoice_date)}</Text>
                  </View>
                  <Text style={{fontSize:fontSize.xxl,fontWeight:'800',color:colors.orange}}>{formatCurrency(inv.total_amount)}</Text>
                </Row>
              </View>
            ))
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  screen:{flex:1,backgroundColor:colors.bg},
  sumCard:{backgroundColor:colors.card,borderRadius:radius.sm,padding:spacing.sm,alignItems:'center',minWidth:110,marginVertical:spacing.sm},
  sumVal:{fontSize:fontSize.md,fontWeight:'800',marginBottom:2},
  sumLabel:{fontSize:fontSize.xs,color:colors.t3},
  tab:{flexDirection:'row',alignItems:'center',gap:5,paddingVertical:spacing.sm,paddingHorizontal:spacing.md,borderBottomWidth:2,borderBottomColor:'transparent'},
  tabAct:{borderBottomColor:colors.blue},
  tabTxt:{fontSize:fontSize.sm,color:colors.t3,fontWeight:'600'},
  tabTxtAct:{color:colors.blue,fontWeight:'700'},
  card:{backgroundColor:colors.card,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,padding:spacing.md,marginBottom:spacing.sm},
  avatar:{width:42,height:42,borderRadius:21,alignItems:'center',justifyContent:'center',marginLeft:spacing.md},
  avatarTxt:{fontSize:18,fontWeight:'800'},
  cardTitle:{fontSize:fontSize.lg,fontWeight:'700',color:colors.t1},
  cardSub:{fontSize:fontSize.xs,color:colors.t3,marginTop:2},
  invBadge:{paddingHorizontal:spacing.sm,paddingVertical:3,borderRadius:radius.full,backgroundColor:colors.orange+'22'},
  empty:{textAlign:'center',color:colors.t3,fontSize:fontSize.md,paddingVertical:40},
});
