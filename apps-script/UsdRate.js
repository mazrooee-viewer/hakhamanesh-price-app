/**
 * UsdRate.js — نرخ دلار (ریال) از tgju برای هشدار دلار فرم محاسبهٔ اپ مدیر (1405/09/06).
 *
 * اپ (MazroueiInbox.html / PWA) اول خودش مستقیم از tgju می‌خواند؛ اگر مرورگر نتوانست، getUsdRates را صدا می‌زند.
 * دو منبع:
 *   - سری روزانه (نرخ پایانی هر روز) برای «دلار روز ثبت قیمت»؛
 *   - widget لحظه‌ای برای «دلار همین الان».
 * خروجی: { rates: { 'YYYY-MM-DD': ریال }, live: { rate, at }, source: 'tgju', fetchedAt: ISO }
 * کش اسکریپت ۵ دقیقه؛ آخرین نتیجهٔ موفق در Script Properties هم می‌ماند تا اگر tgju در دسترس نبود، دادهٔ قبلی برگردد.
 */
var USD_RATE_URL_ = 'https://api.tgju.org/v1/market/indicator/summary-table-data/price_dollar_rl?lang=fa&order_dir=desc&start=0&length=500';
var USD_LIVE_URL_ = 'https://api.tgju.org/v1/widget/tmp?keys=137203';
var USD_RATE_CACHE_KEY_ = 'usdRates:v2';
var USD_RATE_PROP_KEY_ = 'USD_RATES_LAST';
var USD_RATE_TTL_SEC_ = 300;

function getUsdRates() {
  var cache = CacheService.getScriptCache();
  var hit = null;
  try { hit = cache.get(USD_RATE_CACHE_KEY_); } catch (e) {}
  if (hit) return JSON.parse(hit);

  var props = PropertiesService.getScriptProperties();
  var last = null;
  try { last = JSON.parse(props.getProperty(USD_RATE_PROP_KEY_) || 'null'); } catch (e) {}

  var rates = null, live = null;
  try {
    var res = UrlFetchApp.fetchAll([
      { url: USD_RATE_URL_, muteHttpExceptions: true, headers: { Accept: 'application/json' } },
      { url: USD_LIVE_URL_, muteHttpExceptions: true, headers: { Accept: 'application/json' } }
    ]);
    if (res[0].getResponseCode() === 200) {
      var r = usdParseTgju_(JSON.parse(res[0].getContentText()));
      if (Object.keys(r).length) rates = r;
    }
    if (res[1].getResponseCode() === 200) live = usdParseLive_(JSON.parse(res[1].getContentText()));
  } catch (e) {
    console.warn('getUsdRates: ' + e);
  }

  if (!rates && last && last.rates) rates = last.rates;
  if (!rates && !live) {
    if (last) return last;
    throw new Error('نرخ دلار از tgju دریافت نشد');
  }
  var out = { rates: rates || {}, live: live || (last && last.live) || null, source: 'tgju', fetchedAt: new Date().toISOString() };
  var json = JSON.stringify(out);
  try { cache.put(USD_RATE_CACHE_KEY_, json, USD_RATE_TTL_SEC_); } catch (e) {}
  if (rates && live) { try { props.setProperty(USD_RATE_PROP_KEY_, json); } catch (e) {} }
  return out;
}

function usdToEn_(v) {
  return String(v == null ? '' : v).replace(/<[^>]*>/g, '')
    .replace(/[۰-۹]/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'.indexOf(d); }).trim();
}

// هر ردیف tgju: [بازگشایی، کمینه، بیشینه، پایانی، تغییر، درصد، تاریخ میلادی، تاریخ شمسی] — کلید خروجی تاریخ میلادی است.
function usdParseTgju_(json) {
  var out = {};
  ((json && json.data) || []).forEach(function (row) {
    if (!row || !row.length) return;
    var iso = '', nums = [];
    row.forEach(function (c) {
      var t = usdToEn_(c);
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

// widget: { response: { indicators: [{ name: 'price_dollar_rl', p: '2928900', updated_at: '2026-11-27 19:17:05' }] } }
function usdParseLive_(json) {
  var list = (json && json.response && json.response.indicators) || [];
  for (var i = 0; i < list.length; i++) {
    var it = list[i] || {};
    if (it.name && it.name !== 'price_dollar_rl') continue;
    var n = +usdToEn_(it.p).replace(/[,،٬\s]/g, '');
    if (n > 1000) return { rate: n, at: String(it.updated_at || '') };
  }
  return null;
}
