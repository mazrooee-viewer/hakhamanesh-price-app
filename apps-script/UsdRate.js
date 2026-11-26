/**
 * UsdRate.js — نرخ روزانهٔ دلار (ریال) از tgju برای هشدار دلار فرم محاسبه.
 *
 * اپ (index.html) اول خودش مستقیم از tgju می‌خواند؛ اگر مرورگر اجازه نداد (CORS یا فیلتر)،
 * همین تابع getUsdRates را از سرور صدا می‌زند. برای فعال شدن این مسیر پشتیبان:
 *   ۱) این فایل را در پروژهٔ Apps Script اضافه کنید.
 *   ۲) نام getUsdRates را به فهرست توابع مجاز doPost (همان فهرستی که getPriceEngineData و ... در آن است) اضافه کنید.
 *   ۳) Deploy → Manage deployments → نسخهٔ جدید همان استقرار فعلی (آدرس exec عوض نشود).
 *
 * خروجی: { rates: { 'YYYY-MM-DD': ریال, ... }, source: 'tgju', fetchedAt: ISO }
 * آخرین نتیجهٔ موفق در Script Properties هم می‌ماند تا اگر tgju در دسترس نبود، داده‌ی قبلی برگردد.
 */
var USD_RATE_URL_ = 'https://api.tgju.org/v1/market/indicator/summary-table-data/price_dollar_rl?lang=fa&order_dir=desc&start=0&length=500';
var USD_RATE_CACHE_KEY_ = 'usdRates:v1';
var USD_RATE_PROP_KEY_ = 'USD_RATES_LAST';

function getUsdRates() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get(USD_RATE_CACHE_KEY_);
  if (hit) return JSON.parse(hit);

  var out = null;
  try {
    var res = UrlFetchApp.fetch(USD_RATE_URL_, { muteHttpExceptions: true, headers: { Accept: 'application/json' } });
    if (res.getResponseCode() === 200) {
      var rates = usdParseTgju_(JSON.parse(res.getContentText()));
      if (Object.keys(rates).length) out = { rates: rates, source: 'tgju', fetchedAt: new Date().toISOString() };
    }
  } catch (e) {
    console.warn('getUsdRates: ' + e);
  }

  var props = PropertiesService.getScriptProperties();
  if (out) {
    var json = JSON.stringify(out);
    try { cache.put(USD_RATE_CACHE_KEY_, json, 3 * 3600); } catch (e) {}
    try { props.setProperty(USD_RATE_PROP_KEY_, json); } catch (e) {}
    return out;
  }
  var last = props.getProperty(USD_RATE_PROP_KEY_);
  if (last) return JSON.parse(last);
  throw new Error('نرخ دلار از tgju دریافت نشد');
}

// هر ردیف tgju: [بازگشایی، کمینه، بیشینه، پایانی، تغییر، درصد، تاریخ میلادی، تاریخ شمسی] — کلید خروجی تاریخ میلادی است.
function usdParseTgju_(json) {
  var out = {};
  var toEn = function (v) {
    return String(v == null ? '' : v).replace(/<[^>]*>/g, '')
      .replace(/[۰-۹]/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'.indexOf(d); }).trim();
  };
  ((json && json.data) || []).forEach(function (row) {
    if (!row || !row.length) return;
    var iso = '', nums = [];
    row.forEach(function (c) {
      var t = toEn(c);
      var m = t.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
      if (m) {
        if (+m[1] > 1700 && !iso) iso = m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
        return;
      }
      var n = t.replace(/[,،٬\s]/g, '');
      if (/^\d+(\.\d+)?$/.test(n) && +n > 1000) nums.push(+n);
    });
    var close = nums.length >= 4 ? nums[3] : nums[nums.length - 1];
    if (iso && close) out[iso] = close;
  });
  return out;
}
