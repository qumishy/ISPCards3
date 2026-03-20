export const formatNumber = (n) => {
  if (!n && n !== 0) return '0';
  const parts = parseFloat(String(n).replace(/,/g,'')).toFixed(0).split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts[0];
};
export const formatCurrency = (n) => formatNumber(n) + ' ر.ي';
export const formatDateShort = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  const p = (n) => String(n).padStart(2,'0');
  return `${p(dt.getDate())}/${p(dt.getMonth()+1)}/${dt.getFullYear()}`;
};
export const todayISO = () => new Date().toISOString().split('T')[0];

export const statusLabel = (s) => ({
  paid:'مسددة', pending:'معلقة', overdue:'متأخرة', partial:'جزئي', cancelled:'ملغاة',
  approved:'معتمد', rejected:'مرفوض',
  active:'نشط', depleted:'منتهي', critical:'حرج',
  cash:'نقدي', credit:'آجل',
}[s] || s);

export const statusColor = (s) => ({
  paid:'#10b981', approved:'#10b981', active:'#10b981',
  pending:'#f59e0b', partial:'#f59e0b', critical:'#f59e0b',
  overdue:'#ef4444', rejected:'#ef4444', depleted:'#ef4444', cancelled:'#ef4444',
  cash:'#3b82f6', credit:'#8b5cf6',
}[s] || '#475569');

export const creditPercent = (used, limit) => {
  if (!limit || limit===0) return 0;
  return Math.min(100, Math.round((used/limit)*100));
};
export const creditColor = (pct, blocked) => {
  if (blocked) return '#ef4444';
  if (pct >= 90) return '#ef4444';
  if (pct >= 75) return '#f59e0b';
  return '#10b981';
};

export const YEMEN_REGIONS = {
  'صنعاء':   ['التحرير','الصافية','السبعين','بني حوات','حزيز','سنحان','أرحب','خولان','نهم','همدان','بني مطر','شرف'],
  'عدن':     ['المعلا','كريتر','التواهي','البريقة','دار سعد','المنصورة','الشيخ عثمان','خور مكسر'],
  'تعز':     ['القاهرة','صالة','المسبح','شرعب السلام','المعافر','موزع','حيفان','التعزية','الشمايتين','مقبنة','الحوبان','المخا'],
  'الحديدة': ['الحديدة','المنيرة','باجل','الزيدية','التحيتا','الدريهمي','زبيد','بيت الفقيه','الخوخة','اللحية','الصليف'],
  'إب':      ['إب','يريم','جبلة','السدة','ذي السفال','حبيش','بعدان','القفر','النادرة','وصاب العالي','وصاب السافل'],
  'ذمار':    ['ذمار','عنس','جهران','مجزر','ضواء','حياد','وصاب','الحداء'],
  'حضرموت': ['المكلا','الشحر','سيئون','تريم','حجر السيار','دوعن','وادي العين'],
  'مأرب':    ['مأرب','مدينة مأرب','صرواح','رحبة','الجوبة','حريب','عين'],
  'لحج':     ['الحوطة','يافع','القبيطة','ردفان','المسيمير','تبن','طور الباحة'],
  'البيضاء': ['البيضاء','رداع','نعمان','الزاهر','الملاجم','الطلح'],
  'شبوة':    ['عتق','حبان','عسيلان','ميفعة','بيحان','عين'],
  'الجوف':   ['الحزم','المصلوب','الغيل','المتون','العبدية'],
  'صعدة':    ['صعدة','سحار','حيدان','باقم','رازح','شدا'],
  'عمران':   ['عمران','خارف','حوث','سفيان','ريدة','ثلا'],
  'ريمة':    ['كسمة','جبل راس','بلاد الطعام','المحابشة','الجبين'],
  'المحويت': ['المحويت','حفاش','شبام كوكبان','الرجم','بني سعد'],
  'حجة':     ['حجة','عبس','كشر','مسور','بني العوام','نجرة','ميدي'],
  'الضالع':  ['الضالع','جحاف','دمت','قعطبة','الشعيب'],
  'أبين':    ['زنجبار','لودر','شقرة','مودية','سباح','خنفر'],
  'المهرة':  ['الغيضة','حوف','قشن','شحن'],
};
export const GOVERNORATES = Object.keys(YEMEN_REGIONS);
export const getDistricts = (gov) => YEMEN_REGIONS[gov] || [];
