import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { colors, spacing, radius, fontSize } from '../theme';
import { supabase } from '../services/supabase';
import { formatCurrency, formatDateShort } from '../utils/helpers';
import { Badge, Loading, Row, ProgressBar } from '../components/UI';

export default function ReportsScreen() {
  const [tab, setTab] = useState('debts');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState({
    debts:[], agentSales:[], inventory:[], daily:[], overdue:[], summary:{},
  });

  const load = useCallback(async () => {
    try {
      const [invR, colR, posR, batchR, agentR] = await Promise.all([
        supabase.from('invoices').select('id,net_amount,total_amount,status,pos_id,agent_id,invoice_date').eq('active',true),
        supabase.from('collections').select('id,amount,status,collection_date,agent_id').eq('active',true),
        supabase.from('pos_customers').select('id,name,owner_name,city,credit_used,credit_limit,is_blocked').eq('active',true),
        supabase.from('batches').select('id,category_id,total_cards,available_cards,card_categories(name,price)').eq('status','active'),
        supabase.from('users').select('id,name').eq('role','agent').eq('is_active',true),
      ]);

      const invs = invR.data||[];
      const cols = colR.data||[];
      const pos = posR.data||[];
      const batches = batchR.data||[];
      const agents = agentR.data||[];

      // ملخص
      const summary = {
        total_sales: invs.reduce((s,i)=>s+(i.net_amount||i.total_amount||0),0),
        total_collected: cols.filter(c=>c.status==='approved').reduce((s,c)=>s+(c.amount||0),0),
        overdue_count: invs.filter(i=>i.status==='overdue').length,
        pending_col: cols.filter(c=>c.status==='pending').length,
        blocked_pos: pos.filter(p=>p.is_blocked).length,
      };

      // ذمم نقاط البيع
      const debts = pos.filter(p=>p.credit_used>0)
        .sort((a,b)=>b.credit_used-a.credit_used)
        .map(p=>({...p, inv_count:invs.filter(i=>i.pos_id===p.id&&i.status==='pending').length}));

      // مبيعات المندوبين
      const agentSales = agents.map(a=>({
        ...a,
        total_sales: invs.filter(i=>i.agent_id===a.id).reduce((s,i)=>s+(i.net_amount||i.total_amount||0),0),
        inv_count: invs.filter(i=>i.agent_id===a.id).length,
        collected: cols.filter(c=>c.agent_id===a.id&&c.status==='approved').reduce((s,c)=>s+(c.amount||0),0),
        col_count: cols.filter(c=>c.agent_id===a.id&&c.status==='approved').length,
      })).sort((a,b)=>b.total_sales-a.total_sales);

      // حركة المخزون
      const catMap = {};
      batches.forEach(b=>{
        const catId = b.category_id;
        const catName = b.card_categories?.name||'—';
        const catPrice = b.card_categories?.price||0;
        if (!catMap[catId]) catMap[catId] = {cat_name:catName,price:catPrice,total:0,available:0,count:0};
        catMap[catId].total += b.total_cards||0;
        catMap[catId].available += b.available_cards||0;
        catMap[catId].count++;
      });
      const inventory = Object.values(catMap).map(c=>({...c,distributed:c.total-c.available}));

      // التحصيلات اليومية
      const dailyMap = {};
      cols.filter(c=>c.status==='approved').forEach(c=>{
        const d = c.collection_date||c.created_at?.split('T')[0]||'';
        if (!dailyMap[d]) dailyMap[d] = {date:d,count:0,total:0};
        dailyMap[d].count++;
        dailyMap[d].total += c.amount||0;
      });
      const daily = Object.values(dailyMap).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,7);

      // الفواتير المتأخرة
      const overdue = invs.filter(i=>i.status==='pending'||i.status==='overdue')
        .sort((a,b)=>a.invoice_date?.localeCompare(b.invoice_date||'')||0)
        .slice(0,20);

      setData({ debts, agentSales, inventory, daily, overdue, summary });
    } catch(e) { console.log('Reports error:', e.message); }
    setLoading(false); setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const tabs = [
    {k:'debts',l:'الذمم',icon:'💳'},
    {k:'agents',l:'المندوبون',icon:'👤'},
    {k:'inventory',l:'المخزون',icon:'📦'},
    {k:'daily',l:'يومي',icon:'📅'},
    {k:'overdue',l:'متأخرة',icon:'⚠️'},
  ];

  if (loading) return <Loading/>;
  const sum = data.summary;

  return (
    <View style={s.screen}>
      {/* ملخص */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={{maxHeight:80,backgroundColor:colors.bg2,borderBottomWidth:1,borderBottomColor:colors.border}}
        contentContainerStyle={{flexDirection:'row',paddingHorizontal:spacing.sm,alignItems:'center',gap:spacing.xs}}>
        {[
          {l:'إجمالي المبيعات',v:formatCurrency(sum.total_sales||0),c:colors.cyan},
          {l:'محصّل',v:formatCurrency(sum.total_collected||0),c:colors.green},
          {l:'متأخرة',v:sum.overdue_count||0,c:colors.red},
          {l:'قبوض معلقة',v:sum.pending_col||0,c:colors.orange},
          {l:'محجوب',v:sum.blocked_pos||0,c:colors.red},
        ].map((item,i)=>(
          <View key={i} style={s.sumCard}>
            <Text style={[s.sumVal,{color:item.c}]}>{item.v}</Text>
            <Text style={s.sumLabel}>{item.l}</Text>
          </View>
        ))}
      </ScrollView>

      {/* Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={{maxHeight:46,backgroundColor:colors.bg2,borderBottomWidth:1,borderBottomColor:colors.border}}
        contentContainerStyle={{flexDirection:'row',paddingHorizontal:spacing.sm}}>
        {tabs.map(t=>(
          <TouchableOpacity key={t.k} style={[s.tab,tab===t.k&&s.tabAct]} onPress={()=>setTab(t.k)}>
            <Text style={{fontSize:13}}>{t.icon}</Text>
            <Text style={[s.tabTxt,tab===t.k&&s.tabTxtAct]}>{t.l}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={{padding:spacing.md,paddingBottom:90}}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);load();}} tintColor={colors.blue}/>}>

        {/* ذمم */}
        {tab==='debts'&&(data.debts.length===0
          ? <Text style={s.empty}>لا توجد ذمم مستحقة</Text>
          : data.debts.map(p=>{
            const pct = p.credit_limit>0?Math.round((p.credit_used/p.credit_limit)*100):0;
            const col = pct>=90?colors.red:pct>=70?colors.orange:colors.green;
            return (
              <View key={p.id} style={s.card}>
                <Row style={{marginBottom:spacing.sm}}>
                  <View style={[s.avatar,{backgroundColor:col+'22'}]}><Text style={[s.avatarTxt,{color:col}]}>{p.name?.charAt(0)}</Text></View>
                  <View style={{flex:1}}>
                    <Text style={s.cardTitle}>{p.name}</Text>
                    <Text style={s.cardSub}>{p.owner_name||'—'} • {p.city||'—'}</Text>
                  </View>
                  {p.is_blocked&&<Badge status="cancelled" label="محجوب"/>}
                  {p.inv_count>0&&<View style={s.invBadge}><Text style={{color:colors.orange,fontSize:fontSize.xs,fontWeight:'700'}}>{p.inv_count} فاتورة</Text></View>}
                </Row>
                <Row style={{justifyContent:'space-between',marginBottom:spacing.sm}}>
                  <View style={{alignItems:'center'}}><Text style={{fontSize:fontSize.xs,color:colors.t3}}>مستخدم</Text><Text style={{fontSize:fontSize.lg,fontWeight:'800',color:colors.orange}}>{formatCurrency(p.credit_used)}</Text></View>
                  <View style={{alignItems:'center'}}><Text style={{fontSize:fontSize.xs,color:colors.t3}}>الحد</Text><Text style={{fontSize:fontSize.md,fontWeight:'700',color:colors.t2}}>{formatCurrency(p.credit_limit)}</Text></View>
                  <View style={{alignItems:'center'}}><Text style={{fontSize:fontSize.xs,color:colors.t3}}>النسبة</Text><Text style={{fontSize:fontSize.lg,fontWeight:'800',color:col}}>{pct}%</Text></View>
                </Row>
                <View style={{height:6,backgroundColor:colors.border,borderRadius:3,overflow:'hidden'}}>
                  <View style={{height:6,width:Math.min(pct,100)+'%',backgroundColor:col,borderRadius:3}}/>
                </View>
              </View>
            );
          })
        )}

        {/* مبيعات المندوبين */}
        {tab==='agents'&&(data.agentSales.length===0
          ? <Text style={s.empty}>لا توجد بيانات</Text>
          : data.agentSales.map(a=>(
            <View key={a.id} style={s.card}>
              <Row style={{marginBottom:spacing.md}}>
                <View style={[s.avatar,{backgroundColor:colors.green+'22'}]}><Text style={[s.avatarTxt,{color:colors.green}]}>{a.name?.charAt(0)}</Text></View>
                <View style={{flex:1}}>
                  <Text style={s.cardTitle}>{a.name}</Text>
                  <Text style={s.cardSub}>{a.inv_count} فاتورة • {a.col_count} تحصيل</Text>
                </View>
              </Row>
              <Row style={{justifyContent:'space-between'}}>
                {[{l:'إجمالي المبيعات',v:formatCurrency(a.total_sales),c:colors.cyan},{l:'محصّل',v:formatCurrency(a.collected),c:colors.green},{l:'متبقي',v:formatCurrency((a.total_sales||0)-(a.collected||0)),c:colors.orange}].map((st,j)=>(
                  <View key={j} style={{alignItems:'center',flex:1}}>
                    <Text style={{fontSize:fontSize.xs,color:colors.t3,marginBottom:2}}>{st.l}</Text>
                    <Text style={{fontSize:fontSize.sm,fontWeight:'700',color:st.c}}>{st.v}</Text>
                  </View>
                ))}
              </Row>
            </View>
          ))
        )}

        {/* المخزون */}
        {tab==='inventory'&&(data.inventory.length===0
          ? <Text style={s.empty}>لا توجد بيانات</Text>
          : data.inventory.map((cat,i)=>{
            const distPct = cat.total>0?Math.round((cat.distributed/cat.total)*100):0;
            return (
              <View key={i} style={s.card}>
                <Row style={{marginBottom:spacing.sm}}>
                  <Text style={{fontSize:18}}>📦</Text>
                  <View style={{flex:1,marginRight:spacing.sm}}>
                    <Text style={s.cardTitle}>{cat.cat_name}</Text>
                    <Text style={s.cardSub}>{formatCurrency(cat.price)} / ورقة • {cat.count} دفعة</Text>
                  </View>
                  <View style={[s.invBadge,{backgroundColor:cat.available<10?colors.red+'22':colors.green+'22'}]}>
                    <Text style={{color:cat.available<10?colors.red:colors.green,fontWeight:'700',fontSize:fontSize.sm}}>{cat.available} متاح</Text>
                  </View>
                </Row>
                <Row style={{justifyContent:'space-between',marginBottom:spacing.sm}}>
                  {[{l:'الإجمالي',v:cat.total,c:colors.t1},{l:'موزّع',v:cat.distributed,c:colors.orange},{l:'متاح',v:cat.available,c:colors.green}].map((st,j)=>(
                    <View key={j} style={{alignItems:'center',flex:1}}>
                      <Text style={{fontSize:fontSize.xs,color:colors.t3}}>{st.l}</Text>
                      <Text style={{fontSize:fontSize.xxl,fontWeight:'800',color:st.c}}>{st.v}</Text>
                    </View>
                  ))}
                </Row>
                <View style={{height:5,backgroundColor:colors.border,borderRadius:3,overflow:'hidden'}}>
                  <View style={{height:5,width:distPct+'%',backgroundColor:colors.orange,borderRadius:3}}/>
                </View>
                <Text style={{fontSize:fontSize.xs,color:colors.t3,marginTop:4}}>موزّع {distPct}%</Text>
              </View>
            );
          })
        )}

        {/* يومي */}
        {tab==='daily'&&(data.daily.length===0
          ? <Text style={s.empty}>لا توجد تحصيلات</Text>
          : data.daily.map((d,i)=>(
            <View key={i} style={s.card}>
              <Row style={{justifyContent:'space-between'}}>
                <View>
                  <Text style={{fontSize:fontSize.md,fontWeight:'700',color:colors.t1}}>{formatDateShort(d.date)}</Text>
                  <Text style={{fontSize:fontSize.xs,color:colors.t3,marginTop:2}}>{d.count} عملية قبض</Text>
                </View>
                <Text style={{fontSize:fontSize.xxl,fontWeight:'800',color:colors.green}}>{formatCurrency(d.total)}</Text>
              </Row>
            </View>
          ))
        )}

        {/* متأخرة */}
        {tab==='overdue'&&(data.overdue.length===0
          ? <Text style={s.empty}>✅ لا توجد فواتير متأخرة</Text>
          : data.overdue.map(inv=>(
            <View key={inv.id} style={[s.card,{borderColor:colors.red+'44'}]}>
              <Row style={{marginBottom:spacing.sm}}>
                <Text style={[s.cardTitle,{color:colors.cyan,flex:1}]}>
                  {/* رقم الفاتورة غير متاح من Supabase مباشرة هنا */}
                  فاتورة معلقة
                </Text>
                <Badge status={inv.status}/>
              </Row>
              <Text style={{color:colors.t3,fontSize:fontSize.xs}}>
                التاريخ: {formatDateShort(inv.invoice_date)}
              </Text>
              <Text style={{fontSize:fontSize.xxl,fontWeight:'800',color:colors.orange,marginTop:spacing.xs}}>
                {formatCurrency(inv.net_amount||inv.total_amount)}
              </Text>
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
