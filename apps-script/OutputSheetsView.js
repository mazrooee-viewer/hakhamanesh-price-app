// ==========================================
// نمای زندهٔ شیت‌های خروجی در اپ مدیر (1405/09/06؛ درخواست مدیر)
// Traction / Hydraulic / Door&Cabin («درب و ریل») — فقط خواندنی.
// - محدودهٔ چاپ هر شیت (نام‌دار print_* یا A1:K40 / A1:K29) با یک درخواست Sheets API
//   (مقدار نمایشی + رنگ/فونت/تراز/حاشیه + ادغام + ردیف/ستون پنهان) خوانده می‌شود.
// - اپ هر چند ثانیه با نسخهٔ قبلی می‌پرسد؛ اگر شیت عوض نشده فقط { same: true } برمی‌گردد.
//   ویرایش A–H جدول Data_Offers با installedOnEdit → updateLuxuryPreview هر سه شیت را
//   همان لحظه بازنویسی می‌کند، پس پیشنهادات تکمیلی در اپ چند ثانیه بعد تازه می‌شوند.
// - بلوک پیشنهادات تکمیلی (همان OFFER_ROW_BLOCKS_ در Auto pdf.js) با o:1 علامت می‌خورد.
// ==========================================

var OSV_SHEETS_ = [
  { name: "Traction", label: "کششی", named: "print_Traction", a1: "A1:K40", offers: { start: 27, rows: 11, header: 26 } },
  { name: "Hydraulic", label: "هیدرولیک", named: "print_Hydraulic", a1: "A1:K40", offers: { start: 26, rows: 11, header: 0 } },
  { name: "Door&Cabin", label: "درب و ریل", named: "print_DoorCabin", a1: "A1:K29", offers: { start: 15, rows: 11, header: 0 } }
];

var OSV_FIELDS_ = "sheets(properties(title,rightToLeft),merges," +
  "data(startRow,startColumn,rowMetadata(hiddenByUser,hiddenByFilter,pixelSize),columnMetadata(hiddenByUser,pixelSize)," +
  "rowData(values(formattedValue,effectiveFormat(backgroundColor,horizontalAlignment,verticalAlignment,wrapStrategy,borders," +
  "textFormat(foregroundColor,bold,italic,strikethrough,underline,fontSize))))))";

/**
 * opts: { sheet?: "Traction"|"Hydraulic"|"Door&Cabin", vers?: { نام شیت: نسخه } }
 * خروجی: { ok, at, sheets: [{ name, label, ver, same } | نمای کامل] }
 */
function getOutputSheetsView(opts) {
  opts = opts || {};
  var vers = opts.vers || {};
  var specs = OSV_SHEETS_.filter(function (s) { return !opts.sheet || s.name === opts.sheet; });
  if (!specs.length) throw new Error("شیت خروجی نامعتبر: " + opts.sheet);
  var ss = getSs_();
  var ranges = specs.map(function (s) { return osvRangeA1_(ss, s); });
  var grids = null;
  try { grids = osvReadSheetsApi_(ss, specs, ranges); } catch (eApi) { grids = null; }
  var out = { ok: true, at: Date.now(), sheets: [] };
  specs.forEach(function (spec, i) {
    var g = grids ? grids[i] : null;
    if (!g) g = osvReadSpreadsheetApp_(ss, spec, ranges[i]);
    if (!g) { out.sheets.push({ name: spec.name, label: spec.label, missing: true }); return; }
    var view = osvBuildView_(spec, g);
    if (vers[spec.name] && vers[spec.name] === view.ver) {
      out.sheets.push({ name: spec.name, label: spec.label, ver: view.ver, same: true, offerCount: view.offerCount });
    } else {
      out.sheets.push(view);
    }
  });
  return out;
}

// محدودهٔ چاپ: نام‌دار print_* اگر بود (کش ۱۰ دقیقه)، وگرنه نشانی ثابت
function osvRangeA1_(ss, spec) {
  var cache = null, key = "osvRange:" + spec.name;
  try { cache = CacheService.getScriptCache(); var hit = cache.get(key); if (hit) return hit; } catch (e) { cache = null; }
  var a1 = spec.a1;
  try {
    var nr = ss.getRangeByName(spec.named);
    if (nr && nr.getSheet().getName() === spec.name) a1 = nr.getA1Notation();
  } catch (e2) {}
  try { if (cache) cache.put(key, a1, 600); } catch (e3) {}
  return a1;
}

function osvQuote_(name) { return "'" + String(name).replace(/'/g, "''") + "'"; }

// یک درخواست Sheets API برای همهٔ شیت‌های خواسته‌شده → شبکهٔ میانی هر شیت
function osvReadSheetsApi_(ss, specs, ranges) {
  if (typeof Sheets === "undefined" || !Sheets.Spreadsheets) return null;
  var res = Sheets.Spreadsheets.get(ss.getId(), {
    ranges: specs.map(function (s, i) { return osvQuote_(s.name) + "!" + ranges[i]; }),
    fields: OSV_FIELDS_
  });
  var byTitle = {};
  (res.sheets || []).forEach(function (sh) { byTitle[sh.properties && sh.properties.title] = sh; });
  return specs.map(function (s, i) {
    var sh = byTitle[s.name];
    return sh ? osvGridFromApi_(sh, ranges[i]) : null;
  });
}

function osvA1Bounds_(a1) {
  var m = /^\$?([A-Z]+)\$?(\d+):\$?([A-Z]+)\$?(\d+)$/.exec(String(a1 || "").toUpperCase());
  if (!m) throw new Error("محدودهٔ چاپ نامعتبر: " + a1);
  function col(s) { var n = 0; for (var i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64); return n; }
  return { r0: parseInt(m[2], 10) - 1, c0: col(m[1]) - 1, r1: parseInt(m[4], 10), c1: col(m[3]) };
}

// پاسخ Sheets API → { rtl, r0, c0, nRows, nCols, cells[r][c]: { t, f }, rowH, rowHidden, colW, colHidden, merges }
function osvGridFromApi_(sh, a1) {
  var b = osvA1Bounds_(a1);
  var nRows = b.r1 - b.r0, nCols = b.c1 - b.c0;
  var d = (sh.data && sh.data[0]) || {};
  var rowData = d.rowData || [], rowMeta = d.rowMetadata || [], colMeta = d.columnMetadata || [];
  var g = { rtl: !!(sh.properties && sh.properties.rightToLeft), r0: b.r0, c0: b.c0, nRows: nRows, nCols: nCols,
    cells: [], rowH: [], rowHidden: [], colW: [], colHidden: [], merges: [] };
  for (var r = 0; r < nRows; r++) {
    var vals = (rowData[r] && rowData[r].values) || [];
    var line = [];
    for (var c = 0; c < nCols; c++) {
      var v = vals[c] || {};
      line.push({ t: v.formattedValue == null ? "" : String(v.formattedValue), f: v.effectiveFormat || null });
    }
    g.cells.push(line);
    var rm = rowMeta[r] || {};
    g.rowH.push(rm.pixelSize || 21);
    g.rowHidden.push(!!(rm.hiddenByUser || rm.hiddenByFilter));
  }
  for (var c2 = 0; c2 < nCols; c2++) {
    var cm = colMeta[c2] || {};
    g.colW.push(cm.pixelSize || 100);
    g.colHidden.push(!!cm.hiddenByUser);
  }
  (sh.merges || []).forEach(function (m) {
    var sr = Math.max(m.startRowIndex || 0, b.r0), er = Math.min(m.endRowIndex || 0, b.r1);
    var sc = Math.max(m.startColumnIndex || 0, b.c0), ec = Math.min(m.endColumnIndex || 0, b.c1);
    if (er > sr && ec > sc) g.merges.push([sr - b.r0, sc - b.c0, er - sr, ec - sc]);
  });
  return g;
}

// پشتیبان بدون Sheets API (کندتر، بدون حاشیه)
function osvReadSpreadsheetApp_(ss, spec, a1) {
  var sh = ss.getSheetByName(spec.name);
  if (!sh) return null;
  var b = osvA1Bounds_(a1);
  var rng = sh.getRange(a1);
  var disp = rng.getDisplayValues(), bg = rng.getBackgrounds(), fc = rng.getFontColors(), fw = rng.getFontWeights(),
    fs = rng.getFontSizes(), ha = rng.getHorizontalAlignments(), va = rng.getVerticalAlignments(), wr = rng.getWraps();
  function rgb(hex) {
    var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || ""));
    return m ? { red: parseInt(m[1], 16) / 255, green: parseInt(m[2], 16) / 255, blue: parseInt(m[3], 16) / 255 } : null;
  }
  function hAlign(x) { x = String(x || "").toLowerCase(); return x.indexOf("center") >= 0 ? "CENTER" : x.indexOf("right") >= 0 ? "RIGHT" : x.indexOf("left") >= 0 ? "LEFT" : undefined; }
  var nRows = b.r1 - b.r0, nCols = b.c1 - b.c0;
  var g = { rtl: sh.isRightToLeft ? sh.isRightToLeft() : true, r0: b.r0, c0: b.c0, nRows: nRows, nCols: nCols,
    cells: [], rowH: [], rowHidden: [], colW: [], colHidden: [], merges: [] };
  for (var r = 0; r < nRows; r++) {
    var line = [];
    for (var c = 0; c < nCols; c++) {
      line.push({ t: disp[r][c], f: {
        backgroundColor: rgb(bg[r][c]),
        horizontalAlignment: hAlign(ha[r][c]),
        verticalAlignment: String(va[r][c] || "").toUpperCase() || undefined,
        wrapStrategy: wr[r][c] ? "WRAP" : "OVERFLOW_CELL",
        textFormat: { foregroundColor: rgb(fc[r][c]), bold: fw[r][c] === "bold", fontSize: fs[r][c] }
      } });
    }
    g.cells.push(line);
    g.rowH.push(sh.getRowHeight(b.r0 + r + 1));
    g.rowHidden.push(sh.isRowHiddenByUser(b.r0 + r + 1));
  }
  for (var c2 = 0; c2 < nCols; c2++) {
    g.colW.push(sh.getColumnWidth(b.c0 + c2 + 1));
    g.colHidden.push(sh.isColumnHiddenByUser(b.c0 + c2 + 1));
  }
  rng.getMergedRanges().forEach(function (m) {
    var sr = Math.max(m.getRow() - 1, b.r0), er = Math.min(m.getLastRow(), b.r1);
    var sc = Math.max(m.getColumn() - 1, b.c0), ec = Math.min(m.getLastColumn(), b.c1);
    if (er > sr && ec > sc) g.merges.push([sr - b.r0, sc - b.c0, er - sr, ec - sc]);
  });
  return g;
}

function osvColorHex_(c) {
  if (!c) return "";
  function h(x) { var n = Math.round((x || 0) * 255); n = Math.max(0, Math.min(255, n)); return (n < 16 ? "0" : "") + n.toString(16); }
  return "#" + h(c.red) + h(c.green) + h(c.blue);
}

function osvBorderCss_(side, b) {
  if (!b || !b.style || b.style === "NONE") return "";
  var w = b.style === "SOLID_THICK" ? 3 : (b.style === "SOLID_MEDIUM" || b.style === "DOUBLE") ? 2 : 1;
  var st = b.style === "DOTTED" ? "dotted" : b.style === "DASHED" ? "dashed" : b.style === "DOUBLE" ? "double" : "solid";
  if (st === "double") w = 3;
  var col = osvColorHex_(b.color || {}) || "#000000";
  return "border-" + side + ":" + w + "px " + st + " " + col + ";";
}

// قالب خانه → CSS کوتاه (فقط چیزهایی که با پیش‌فرض فرق دارند)
function osvCellCss_(f) {
  if (!f) return "";
  var css = "";
  var bg = osvColorHex_(f.backgroundColor);
  if (bg && bg !== "#ffffff") css += "background:" + bg + ";";
  var tf = f.textFormat || {};
  var fg = osvColorHex_(tf.foregroundColor);
  if (fg && fg !== "#000000") css += "color:" + fg + ";";
  if (tf.bold) css += "font-weight:700;";
  if (tf.italic) css += "font-style:italic;";
  if (tf.strikethrough || tf.underline) css += "text-decoration:" + (tf.underline ? "underline " : "") + (tf.strikethrough ? "line-through" : "") + ";";
  if (tf.fontSize && tf.fontSize !== 10) css += "font-size:" + Math.round(tf.fontSize * 4 / 3 * 10) / 10 + "px;";
  if (f.horizontalAlignment) css += "text-align:" + ({ LEFT: "left", CENTER: "center", RIGHT: "right" }[f.horizontalAlignment] || "start") + ";";
  if (f.verticalAlignment) css += "vertical-align:" + ({ TOP: "top", MIDDLE: "middle", BOTTOM: "bottom" }[f.verticalAlignment] || "bottom") + ";";
  if (f.wrapStrategy === "WRAP") css += "white-space:pre-wrap;";
  else if (f.wrapStrategy === "CLIP") css += "overflow:hidden;";
  var bd = f.borders || {};
  css += osvBorderCss_("top", bd.top) + osvBorderCss_("bottom", bd.bottom) + osvBorderCss_("left", bd.left) + osvBorderCss_("right", bd.right);
  return css;
}

// شبکهٔ میانی → نمای فشردهٔ اپ. ردیف/ستون پنهان حذف می‌شود و ادغام‌ها روی ردیف/ستون پیدا کوتاه می‌شوند.
function osvBuildView_(spec, g) {
  var visR = [], visC = [];
  for (var r = 0; r < g.nRows; r++) if (!g.rowHidden[r]) visR.push(r);
  for (var c = 0; c < g.nCols; c++) if (!g.colHidden[c]) visC.push(c);
  var rIdx = {}, cIdx = {};
  visR.forEach(function (r, i) { rIdx[r] = i; });
  visC.forEach(function (c, i) { cIdx[c] = i; });

  // ادغام‌ها: لنگر = اولین خانهٔ پیدا؛ بقیه پوشیده
  var span = {}, covered = {};
  g.merges.forEach(function (m) {
    var rows = [], cols = [];
    for (var r = m[0]; r < m[0] + m[2]; r++) if (rIdx[r] != null) rows.push(r);
    for (var c = m[1]; c < m[1] + m[3]; c++) if (cIdx[c] != null) cols.push(c);
    if (!rows.length || !cols.length) return;
    var ar = m[0], ac = m[1]; // متن همیشه در خانهٔ بالا-چپ ادغام است
    span[rows[0] + ":" + cols[0]] = { rs: rows.length, cs: cols.length, src: ar + ":" + ac };
    rows.forEach(function (r) { cols.forEach(function (c) { if (r !== rows[0] || c !== cols[0]) covered[r + ":" + c] = true; }); });
  });

  var styles = [], styleIdx = {};
  function sid(css) {
    if (!css) return 0;
    if (styleIdx[css] == null) { styles.push(css); styleIdx[css] = styles.length; }
    return styleIdx[css];
  }
  var off = spec.offers || {};
  var offStart = (off.start || 0) - 1 - g.r0, offEnd = offStart + (off.rows || 0);
  var offHead = off.header ? off.header - 1 - g.r0 : -1;
  var offerCount = 0;

  var rows = visR.map(function (r) {
    var cells = visC.map(function (c) {
      var k = r + ":" + c;
      if (covered[k]) return null;
      var sp = span[k];
      var srcCell = g.cells[r][c];
      if (sp && sp.src !== k) {
        var p = sp.src.split(":");
        srcCell = { t: g.cells[+p[0]][+p[1]].t, f: srcCell.f || g.cells[+p[0]][+p[1]].f };
      }
      var cell = { t: srcCell.t || "" };
      var s = sid(osvCellCss_(srcCell.f));
      if (s) cell.s = s;
      if (sp && sp.rs > 1) cell.rs = sp.rs;
      if (sp && sp.cs > 1) cell.cs = sp.cs;
      return cell;
    });
    var row = { h: g.rowH[r], c: cells, n: g.r0 + r + 1 };
    if (r >= offStart && r < offEnd) {
      row.o = 1;
      if (g.cells[r].some(function (x) { return String(x.t || "").trim() !== ""; })) offerCount++;
    } else if (r === offHead) row.o = 2;
    return row;
  });
  var view = {
    name: spec.name, label: spec.label, rtl: g.rtl,
    cols: visC.map(function (c) { return g.colW[c]; }),
    rows: rows, styles: styles, offerCount: offerCount,
    offers: { start: off.start || 0, rows: off.rows || 0 }
  };
  view.ver = osvDigest_(JSON.stringify([view.cols, view.rows, view.styles, view.rtl]));
  return view;
}

function osvDigest_(s) {
  if (typeof Utilities !== "undefined" && Utilities.computeDigest) {
    var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, s, Utilities.Charset.UTF_8);
    return Utilities.base64EncodeWebSafe(bytes).slice(0, 16);
  }
  // Node (تست): هش ساده
  var h = 5381;
  for (var i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return "n" + h.toString(36) + s.length.toString(36);
}
