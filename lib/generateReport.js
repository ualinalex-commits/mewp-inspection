const PDFDocument = require('pdfkit');
const { createClient } = require('@supabase/supabase-js');

// ─── Layout constants (A4 landscape) ─────────────────────────────────────────
const PW = 841.89;
const PH = 595.28;
const ML = 20;          // left/right margin
const MT = 20;          // top margin
const MB = 28;          // bottom margin
const CW = PW - ML * 2; // content width = 801.89

const C_NUM  = 22;                          // Item # column
const C_DESC = 200;                         // Description column
const C_GP   = 14;                          // G / P label column
const C_DAY  = (CW - C_NUM - C_DESC - C_GP) / 7; // ≈ 80.84 pt per day

const RH_THEAD = 18; // table header row
const RH_VIS   = 12; // visual check row
const RH_FUNC  = 11; // function check sub-row (×2 per item)
const RH_CAT   = 10; // category header row

// ─── Colours ─────────────────────────────────────────────────────────────────
const C = {
  darkBlue:  '#1e3a8a',
  blue:      '#1d4ed8',
  passBg:    '#dcfce7', passText: '#166534', passBdr: '#86efac',
  failBg:    '#fee2e2', failText: '#991b1b', failBdr: '#fca5a5',
  catBg:     '#dbeafe',
  funcCatBg: '#fef9c3',
  gBg:       '#e0f2fe',
  pBg:       '#fef3c7',
  altRow:    '#f9fafb',
  border:    '#d1d5db',
  text:      '#111827',
  muted:     '#6b7280',
  white:     '#ffffff',
};

// ─── Visual check categories ──────────────────────────────────────────────────
const CATEGORIES = [
  { name: 'DOCUMENTATION',            items: [1, 2, 3] },
  { name: 'WHEELS / TYRES',           items: [4, 5, 6] },
  { name: 'ENGINE / POWER SOURCE',    items: [7, 8, 9] },
  { name: 'HYDRAULICS',               items: [10, 11] },
  { name: 'HOSES AND CABLES',         items: [12, 13] },
  { name: 'OUTRIGGERS / STABILISERS', items: [14, 15, 16] },
  { name: 'CHASSIS / BOOM / SCISSOR', items: [17, 18, 19] },
  { name: 'PLATFORM OR CAGE',         items: [20, 21, 22, 23, 24, 25] },
  { name: 'DECALS AND SIGNAGE',       items: [26, 27, 28] },
];

const DAYS      = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAYS_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const DAY_NORM = {
  monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed',
  thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun',
  mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun',
};

// ─── Utility helpers ──────────────────────────────────────────────────────────

function normDay(val) {
  return val ? DAY_NORM[String(val).toLowerCase()] || null : null;
}

function dayFromDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00Z');
  return DAYS[(d.getUTCDay() + 6) % 7]; // Mon=0 … Sun=6
}

function getWeekDates(weekCommencing) {
  const mon = new Date(weekCommencing + 'T00:00:00Z');
  return DAYS.map((_, i) => {
    const d = new Date(mon);
    d.setUTCDate(d.getUTCDate() + i);
    return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00Z');
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

// ─── PDF drawing primitives ───────────────────────────────────────────────────

function fillBox(doc, x, y, w, h, fill) {
  doc.rect(x, y, w, h).fillColor(fill).fill();
}

function strokeBox(doc, x, y, w, h, strokeColor, lw = 0.3) {
  doc.rect(x, y, w, h).strokeColor(strokeColor).lineWidth(lw).stroke();
}

function box(doc, x, y, w, h, fill = C.white, strokeColor = C.border, lw = 0.3) {
  fillBox(doc, x, y, w, h, fill);
  strokeBox(doc, x, y, w, h, strokeColor, lw);
}

function txt(doc, text, x, y, w, h, opts = {}) {
  const { font = 'Helvetica', size = 7, color = C.text, align = 'center', pad = 2 } = opts;
  if (text === null || text === undefined || text === '') return;
  const lineH = size * 1.2;
  const ty = y + Math.max(1, (h - lineH) / 2);
  doc.font(font).fontSize(size).fillColor(color)
     .text(String(text), x + pad, ty, { width: w - pad * 2, align, lineBreak: false });
}

function resultCell(doc, x, y, w, h, result) {
  const isP = result === 'pass';
  const isF = result === 'fail';
  box(
    doc, x, y, w, h,
    isP ? C.passBg : isF ? C.failBg : C.white,
    isP ? C.passBdr : isF ? C.failBdr : C.border,
    0.3,
  );
  if (isP || isF) {
    txt(doc, isP ? 'P' : 'F', x, y, w, h, {
      font: 'Helvetica-Bold', size: 7,
      color: isP ? C.passText : C.failText,
    });
  }
}

// x-position for a given day column (0=Mon … 6=Sun)
function dx(i) {
  return ML + C_NUM + C_DESC + C_GP + i * C_DAY;
}

// ─── Page-level drawing functions ────────────────────────────────────────────

function drawPageHeader(doc, mewp, site, sheet) {
  const x = ML, y = MT, w = CW, h = 44;

  // Title bar
  fillBox(doc, x, y, w, 16, C.darkBlue);
  strokeBox(doc, x, y, w, 16, C.darkBlue, 0.5);
  txt(doc, 'MEWP PRE-USE INSPECTION CHECKLIST', x, y, w * 0.72, 16,
    { font: 'Helvetica-Bold', size: 9, color: '#ffffff', align: 'left', pad: 8 });
  txt(doc, 'IPAF TE-1049-EN-V4.0', x + w * 0.72, y, w * 0.28, 16,
    { font: 'Helvetica-Bold', size: 7, color: '#93c5fd', align: 'right', pad: 6 });

  // Row 1: machine + site fields
  const r1y = y + 16, r1h = 14;
  const fields = [
    `Machine Ref: ${mewp.machine_ref || '—'}`,
    `Model: ${mewp.model || '—'}`,
    `Serial No: ${mewp.serial_number || '—'}`,
    `Site: ${site?.name || '—'}`,
  ];
  const fw = w / fields.length;
  fields.forEach((label, i) => {
    box(doc, x + i * fw, r1y, fw, r1h, C.white, C.border, 0.3);
    txt(doc, label, x + i * fw, r1y, fw, r1h,
      { size: 6.5, color: C.text, align: 'left', pad: 5 });
  });

  // Row 2: week dates
  const r2y = r1y + r1h, r2h = h - 16 - r1h;
  box(doc, x, r2y, w / 2, r2h, C.white, C.border, 0.3);
  txt(doc, `Week Commencing: ${formatDate(sheet.week_commencing)}`, x, r2y, w / 2, r2h,
    { font: 'Helvetica-Bold', size: 6.5, color: C.text, align: 'left', pad: 5 });
  box(doc, x + w / 2, r2y, w / 2, r2h, C.white, C.border, 0.3);
  txt(doc, `Week Ending: ${formatDate(sheet.week_ending)}`, x + w / 2, r2y, w / 2, r2h,
    { font: 'Helvetica-Bold', size: 6.5, color: C.text, align: 'left', pad: 5 });

  // Outer border drawn last for a clean finish
  strokeBox(doc, x, y, w, h, C.darkBlue, 1);
}

function drawTableHeader(doc, y, weekDates) {
  const h = RH_THEAD;
  box(doc, ML, y, C_NUM, h, C.darkBlue, C.darkBlue, 0.5);
  txt(doc, '#', ML, y, C_NUM, h, { font: 'Helvetica-Bold', size: 7, color: '#ffffff' });

  box(doc, ML + C_NUM, y, C_DESC + C_GP, h, C.darkBlue, C.darkBlue, 0.5);
  txt(doc, 'INSPECTION ITEM', ML + C_NUM, y, C_DESC + C_GP, h,
    { font: 'Helvetica-Bold', size: 7, color: '#ffffff', align: 'left', pad: 5 });

  for (let i = 0; i < 7; i++) {
    box(doc, dx(i), y, C_DAY, h, C.darkBlue, C.darkBlue, 0.5);
    txt(doc, DAYS[i], dx(i), y, C_DAY, h / 2,
      { font: 'Helvetica-Bold', size: 7, color: '#ffffff' });
    txt(doc, weekDates[i] || '', dx(i), y + h / 2, C_DAY, h / 2,
      { size: 5.5, color: '#93c5fd' });
  }
  return y + h;
}

function drawCatRow(doc, label, y, isFunc = false) {
  box(doc, ML, y, CW, RH_CAT,
    isFunc ? C.funcCatBg : C.catBg,
    isFunc ? '#fde68a' : '#93c5fd', 0.4);
  txt(doc, label, ML, y, CW, RH_CAT, {
    font: 'Helvetica-Bold', size: 6.5,
    color: isFunc ? '#78350f' : C.blue,
    align: 'left', pad: 6,
  });
  return y + RH_CAT;
}

function drawVisualRow(doc, num, description, rowData, y, alt) {
  const h = RH_VIS;
  const bg = alt ? C.altRow : C.white;

  box(doc, ML, y, C_NUM, h, bg);
  txt(doc, num, ML, y, C_NUM, h, { size: 6.5, color: C.muted });

  box(doc, ML + C_NUM, y, C_DESC, h, bg);
  txt(doc, description, ML + C_NUM, y, C_DESC, h,
    { size: 6.5, color: C.text, align: 'left', pad: 4 });

  // G/P column is blank for visual checks
  box(doc, ML + C_NUM + C_DESC, y, C_GP, h, bg);

  for (let i = 0; i < 7; i++) {
    const day = DAYS[i].toLowerCase();
    const result = rowData[`${day}_result`] ?? rowData[day] ?? null;
    resultCell(doc, dx(i), y, C_DAY, h, result);
  }
  return y + h;
}

function drawFunctionRow(doc, num, description, rowData, y, alt) {
  const h = RH_FUNC;
  const bg = alt ? C.altRow : C.white;

  // ── Ground (G) sub-row ──────────────────────────────────────
  box(doc, ML + C_NUM, y, C_DESC, h, bg);
  txt(doc, description, ML + C_NUM, y, C_DESC, h,
    { size: 6, color: C.text, align: 'left', pad: 4 });

  box(doc, ML + C_NUM + C_DESC, y, C_GP, h, C.gBg, '#7dd3fc', 0.3);
  txt(doc, 'G', ML + C_NUM + C_DESC, y, C_GP, h,
    { font: 'Helvetica-Bold', size: 6, color: '#0369a1' });

  for (let i = 0; i < 7; i++) {
    const day = DAYS[i].toLowerCase();
    const g = rowData[`${day}_ground_result`] ?? rowData[`${day}_ground`] ?? null;
    resultCell(doc, dx(i), y, C_DAY, h, g);
  }

  // ── Platform (P) sub-row ─────────────────────────────────────
  box(doc, ML + C_NUM, y + h, C_DESC, h, C.pBg, '#fde68a', 0.3);
  txt(doc, 'Platform Controls', ML + C_NUM, y + h, C_DESC, h,
    { size: 5.5, color: '#92400e', align: 'left', pad: 4 });

  box(doc, ML + C_NUM + C_DESC, y + h, C_GP, h, C.pBg, '#fde68a', 0.3);
  txt(doc, 'P', ML + C_NUM + C_DESC, y + h, C_GP, h,
    { font: 'Helvetica-Bold', size: 6, color: '#92400e' });

  for (let i = 0; i < 7; i++) {
    const day = DAYS[i].toLowerCase();
    const p = rowData[`${day}_platform_result`] ?? rowData[`${day}_platform`] ?? null;
    resultCell(doc, dx(i), y + h, C_DAY, h, p);
  }

  // Item # cell drawn last so it spans G + P rows cleanly
  box(doc, ML, y, C_NUM, h * 2, bg);
  txt(doc, num, ML, y, C_NUM, h * 2, { size: 6.5, color: C.muted });

  return y + h * 2;
}

function drawOperatorLog(doc, y, operatorsByDay) {
  const LW = 62, NW = 220, PL = 120, SW = CW - LW - NW - PL;
  const TH = 14, RH = 13;

  txt(doc, 'OPERATOR LOG', ML, y, CW, 12,
    { font: 'Helvetica-Bold', size: 8, color: C.blue, align: 'left', pad: 0 });
  y += 12;

  // Header row
  const cols = [
    { label: 'DAY',           w: LW },
    { label: 'OPERATOR NAME', w: NW },
    { label: 'PAL CARD NO.',  w: PL },
    { label: 'STATUS',        w: SW },
  ];
  let hx = ML;
  cols.forEach(({ label, w }) => {
    box(doc, hx, y, w, TH, C.darkBlue, C.darkBlue, 0.5);
    txt(doc, label, hx, y, w, TH,
      { font: 'Helvetica-Bold', size: 6.5, color: '#ffffff', align: 'left', pad: 4 });
    hx += w;
  });
  y += TH;

  // Data rows
  DAYS.forEach((day, i) => {
    const op  = operatorsByDay[day] || {};
    const isFault = op.daily_status === 'fault';
    const isOk    = op.daily_status === 'ok';
    const hasData = Boolean(op.operator_name);
    const rowBg  = hasData ? (isFault ? '#fff7f7' : isOk ? '#f0fdf4' : (i % 2 ? C.altRow : C.white)) : (i % 2 ? C.altRow : C.white);
    const rowBdr = isFault ? C.failBdr : isOk ? C.passBdr : C.border;

    let rx = ML;
    box(doc, rx, y, LW, RH, C.catBg, '#93c5fd', 0.3);
    txt(doc, DAYS_FULL[i], rx, y, LW, RH,
      { font: 'Helvetica-Bold', size: 6.5, color: C.blue, align: 'left', pad: 4 });
    rx += LW;

    box(doc, rx, y, NW, RH, rowBg, rowBdr, 0.3);
    txt(doc, op.operator_name || '', rx, y, NW, RH,
      { size: 6.5, color: C.text, align: 'left', pad: 4 });
    rx += NW;

    box(doc, rx, y, PL, RH, rowBg, rowBdr, 0.3);
    txt(doc, op.pal_card_number || '', rx, y, PL, RH,
      { size: 6.5, color: C.text, align: 'left', pad: 4 });
    rx += PL;

    const statusLabel = isFault ? 'FAULT' : isOk ? 'OK' : hasData ? 'PENDING' : '—';
    const statusColor = isFault ? C.failText : isOk ? C.passText : C.muted;
    box(doc, rx, y, SW, RH, rowBg, rowBdr, 0.3);
    txt(doc, statusLabel, rx, y, SW, RH,
      { font: isFault || isOk ? 'Helvetica-Bold' : 'Helvetica', size: 6.5, color: statusColor });

    y += RH;
  });

  return y;
}

function drawFooter(doc, pageNum) {
  const fy = PH - MB + 4;
  doc.font('Helvetica-Bold').fontSize(7).fillColor('#dc2626')
     .text('ALL FAULTS TO BE REPORTED IMMEDIATELY TO SUPERVISOR', ML, fy,
       { width: CW * 0.8, align: 'center', lineBreak: false });
  doc.font('Helvetica').fontSize(6).fillColor(C.muted)
     .text(`Page ${pageNum}`, ML, fy, { width: CW, align: 'right', lineBreak: false });
}

// ─── PDF assembly ─────────────────────────────────────────────────────────────

function buildPDF({ mewp, site, sheet, checkItems, summaryByItem, operatorsByDay, weekDates }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: [PW, PH],
      margins: { top: MT, bottom: MB, left: ML, right: ML },
      autoFirstPage: true,
      info: {
        Title: `MEWP Inspection – ${mewp.machine_ref} – w/c ${sheet.week_commencing}`,
        Author: 'MEWP Inspection App',
      },
    });

    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end',  () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const itemMap = {};
    checkItems.forEach(ci => { itemMap[ci.item_number] = ci; });

    // ══════════════════════ PAGE 1 — Visual Checks ══════════════════════

    drawPageHeader(doc, mewp, site, sheet);

    let y = MT + 44 + 4;
    y = drawTableHeader(doc, y, weekDates);

    let alt = false;
    for (const cat of CATEGORIES) {
      y = drawCatRow(doc, cat.name, y);
      for (const num of cat.items) {
        const ci  = itemMap[num];
        const row = summaryByItem[num] || {};
        y = drawVisualRow(doc, num, ci?.description || `Item ${num}`, row, y, alt);
        alt = !alt;
      }
    }

    drawFooter(doc, 1);

    // ══════════════════════ PAGE 2 — Function Checks + Operator Log ══════

    doc.addPage({ size: [PW, PH] });

    // Compact header strip
    fillBox(doc, ML, MT, CW, 20, C.darkBlue);
    strokeBox(doc, ML, MT, CW, 20, C.darkBlue, 0.5);
    txt(doc, 'MEWP PRE-USE INSPECTION CHECKLIST (continued)', ML, MT, CW * 0.65, 20,
      { font: 'Helvetica-Bold', size: 8, color: '#ffffff', align: 'left', pad: 8 });
    txt(doc, `${mewp.machine_ref}  ·  Week: ${formatDate(sheet.week_commencing)}`, ML, MT, CW, 20,
      { size: 7, color: '#93c5fd', align: 'right', pad: 6 });

    y = MT + 24;
    y = drawCatRow(doc, 'FUNCTION CHECKS — GROUND (G) AND PLATFORM (P) CONTROLS', y, true);
    y = drawTableHeader(doc, y, weekDates);

    alt = false;
    const funcItems = checkItems.filter(ci => ci.item_number >= 29 || ci.check_type === 'function');
    for (const ci of funcItems) {
      y = drawFunctionRow(doc, ci.item_number, ci.description || `Item ${ci.item_number}`, summaryByItem[ci.item_number] || {}, y, alt);
      alt = !alt;
    }

    y += 12;
    drawOperatorLog(doc, y, operatorsByDay);
    drawFooter(doc, 2);

    doc.end();
  });
}

// ─── Main export ─────────────────────────────────────────────────────────────

async function generateReport(mewpId, weekCommencing) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  // 1. Weekly sheet + MEWP + site metadata
  const { data: sheet, error: sheetErr } = await supabase
    .from('weekly_inspection_sheets')
    .select('*, mewps(machine_ref, model, serial_number, site_id, sites(name, location))')
    .eq('mewp_id', mewpId)
    .eq('week_commencing', weekCommencing)
    .single();

  if (sheetErr || !sheet) {
    throw new Error(`Weekly sheet not found: ${sheetErr?.message || 'no data'}`);
  }

  const mewp = sheet.mewps || {};
  const site = mewp.sites  || {};

  // 2. Check item descriptions (source of truth for labels)
  const { data: checkItems = [] } = await supabase
    .from('check_items')
    .select('item_number, description, check_type, category, has_gp')
    .order('item_number');

  // 3. weekly_sheet_summary — all 43 items pivoted across 7 day columns
  //    Expected columns: item_number, check_type, {day}_result (visual) OR
  //    {day}_ground_result / {day}_platform_result (function)
  const { data: summaryRows = [], error: sumErr } = await supabase
    .from('weekly_sheet_summary')
    .select('*')
    .eq('sheet_id', sheet.id);

  if (sumErr) console.warn('[generateReport] weekly_sheet_summary:', sumErr.message);

  const summaryByItem = {};
  (summaryRows || []).forEach(row => {
    summaryByItem[row.item_number] = row;
  });

  // 4. weekly_operator_log — one row per day with operator name / PAL / status
  //    Expected columns: sheet_id, day_of_week | inspection_date, operator_name,
  //    pal_card_number, daily_status
  const { data: operatorRows = [], error: opErr } = await supabase
    .from('weekly_operator_log')
    .select('*')
    .eq('sheet_id', sheet.id);

  if (opErr) console.warn('[generateReport] weekly_operator_log:', opErr.message);

  const operatorsByDay = {};
  (operatorRows || []).forEach(row => {
    const day = normDay(row.day_of_week) || dayFromDate(row.inspection_date);
    if (day) operatorsByDay[day] = row;
  });

  // 5. Build PDF buffer
  const weekDates = getWeekDates(weekCommencing);
  const pdfBuffer = await buildPDF({ mewp, site, sheet, checkItems, summaryByItem, operatorsByDay, weekDates });

  // 6. Upload to Supabase Storage  (requires SUPABASE_SERVICE_ROLE_KEY)
  const siteId   = mewp.site_id;
  const filePath = `${siteId}/${mewpId}/${weekCommencing}.pdf`;

  const { error: uploadError } = await supabase.storage
    .from('weekly-reports')
    .upload(filePath, pdfBuffer, { contentType: 'application/pdf', upsert: true });

  if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);

  const { data: { publicUrl } } = supabase.storage
    .from('weekly-reports')
    .getPublicUrl(filePath);

  // 7. Persist the URL and timestamp on the sheet record
  await supabase
    .from('weekly_inspection_sheets')
    .update({ pdf_url: publicUrl, pdf_generated_at: new Date().toISOString() })
    .eq('id', sheet.id);

  return publicUrl;
}

module.exports = { generateReport };
