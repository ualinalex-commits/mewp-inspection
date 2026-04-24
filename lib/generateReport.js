'use strict';

const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { createClient } = require('@supabase/supabase-js');
const fs   = require('fs');
const path = require('path');

// ─── Day / date helpers ───────────────────────────────────────────────────────

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const DAY_NORM = {
  monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu',
  friday: 'Fri', saturday: 'Sat', sunday: 'Sun',
  mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun',
};

function normDay(val) {
  return val ? DAY_NORM[String(val).toLowerCase()] ?? null : null;
}

function dayFromDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00Z');
  return DAYS[(d.getUTCDay() + 6) % 7];
}

function getWeekDates(weekCommencing) {
  const mon = new Date(weekCommencing + 'T00:00:00Z');
  return DAYS.map((_, i) => {
    const d = new Date(mon);
    d.setUTCDate(d.getUTCDate() + i);
    return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}

function fmtDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00Z');
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

// ─── Visual check categories (used to count category-header rows) ─────────────

const CATEGORIES = [
  { items: [1, 2, 3] },
  { items: [4, 5, 6] },
  { items: [7, 8, 9] },
  { items: [10, 11] },
  { items: [12, 13] },
  { items: [14, 15, 16] },
  { items: [17, 18, 19] },
  { items: [20, 21, 22, 23, 24, 25] },
  { items: [26, 27, 28] },
];

// ─── Coordinate layout ────────────────────────────────────────────────────────
// pdf-lib uses bottom-left origin: y=0 at page bottom, y=pageHeight at top.
// drawText(x, y) places the glyph baseline at (x, y).
//
// Page 1: A4 landscape  841.92 × 595.32 pts  — all 43 inspection items
// Page 2: A4 portrait   595.32 × 841.92 pts  — operator log + defect log
//
// NOTE: all x/y values are APPROXIMATE starting points.
// Print the stamped PDF, overlay it on the blank template, and nudge each
// constant until text lands inside its pre-printed cell. Even 1–2 pt matters.

const L1 = {
  // Header stamp positions (value text, not the label)
  machineRef:     { x: 168, y: 539 },
  weekCommencing: { x: 468, y: 539 },

  // Top of the grid: y of the TOP edge of the first category-header row.
  // Row positions are computed by subtracting heights as we walk down the page.
  gridTopY: 498,

  catH:     7,   // category-header row height (pre-printed — we just skip past it)
  visRowH:  9,   // visual-check row height (items 1–28)
  funcH:   14,   // gap before function-check section header
  funcRowH: 8,   // height of each G / P sub-row (items 29–43)

  // Left-edge x of each day column, Mon (index 0) … Sun (index 6).
  // The seven columns span roughly x=348 … x=826 on the landscape page.
  dayX: [348, 418, 488, 558, 628, 698, 768],
  dayW: 68,  // column width used to centre stamp text
};

const L2 = {
  // Operator table — seven rows (Mon–Sun), reading top-to-bottom
  opTopY:  740,  // y of text baseline in the Monday row
  opRowH:   20,  // vertical pitch to the next row
  opNameX:  85,
  opPalX:  310,
  opDateX: 430,

  // Defect log — first data row
  defTopY:  510,
  defRowH:   19,
  defCols: {
    item:     22,
    details: 100,
    noted:   300,
    engineer:365,
    repaired:450,
    notes:   515,
  },
};

// ─── Drawing helpers ──────────────────────────────────────────────────────────

const BLACK = rgb(0,     0,     0    );
const GREEN = rgb(0.086, 0.502, 0.239);
const RED   = rgb(0.725, 0.110, 0.110);

function put(page, font, text, x, y, size = 7, color = BLACK) {
  if (text == null || text === '') return;
  page.drawText(String(text), { x, y, size, font, color });
}

function putCentered(page, font, text, cellX, y, cellW, size, color = BLACK) {
  const str = String(text);
  const tw  = font.widthOfTextAtSize(str, size);
  page.drawText(str, { x: cellX + Math.max(0, (cellW - tw) / 2), y, size, font, color });
}

// Stamp "P" (green) or "F" (red) centred in a grid cell.
// Helvetica (WinAnsiEncoding) does not include ✓ / ✗ glyphs, so P / F is used.
// rowBottom = y of the bottom edge of the row; rowH = row height in points.
function putResult(page, boldFont, result, dayIdx, rowBottom, rowH) {
  if (result !== 'pass' && result !== 'fail') return;
  const isPass = result === 'pass';
  const size   = 6;
  const y      = rowBottom + (rowH - size) / 2;  // vertically centred baseline
  putCentered(page, boldFont, isPass ? 'P' : 'F',
    L1.dayX[dayIdx], y, L1.dayW, size, isPass ? GREEN : RED);
}

// ─── Page 1: header + items 1–28 (visual) + items 29–43 (function) ───────────

function stampPage1(page, font, boldFont, mewp, sheet, summaryByItem, funcItems) {
  // Header
  put(page, boldFont, mewp.machine_ref || '',         L1.machineRef.x,     L1.machineRef.y,     9);
  put(page, boldFont, fmtDate(sheet.week_commencing), L1.weekCommencing.x, L1.weekCommencing.y, 9);

  // Visual checks (items 1–28)
  // rowTop tracks the TOP edge of the current row; it decreases as we go down.
  let rowTop = L1.gridTopY;

  for (const cat of CATEGORIES) {
    rowTop -= L1.catH;  // skip the pre-printed category-header row

    for (const num of cat.items) {
      const rowBottom = rowTop - L1.visRowH;
      const row = summaryByItem[num] || {};

      for (let d = 0; d < 7; d++) {
        const day    = DAYS[d].toLowerCase();
        const result = row[`${day}_result`] ?? row[day] ?? null;
        putResult(page, boldFont, result, d, rowBottom, L1.visRowH);
      }

      rowTop = rowBottom;  // advance to next row
    }
  }

  // Function checks (items 29–43) — each item has a Ground row then a Platform row.
  rowTop -= L1.funcH;  // gap for the pre-printed function-section header

  for (const ci of funcItems) {
    const gBottom = rowTop - L1.funcRowH;       // Ground (G) row
    const pBottom = gBottom - L1.funcRowH;      // Platform (P) row

    const row = summaryByItem[ci.item_number] || {};
    for (let d = 0; d < 7; d++) {
      const day = DAYS[d].toLowerCase();
      putResult(page, boldFont,
        row[`${day}_ground_result`]   ?? row[`${day}_ground`]   ?? null,
        d, gBottom, L1.funcRowH);
      putResult(page, boldFont,
        row[`${day}_platform_result`] ?? row[`${day}_platform`] ?? null,
        d, pBottom, L1.funcRowH);
    }

    rowTop = pBottom;  // advance past both sub-rows
  }
}

// ─── Page 2: operator log + defect log ───────────────────────────────────────

function stampPage2(page, font, operatorsByDay, weekDates, defects) {
  // Operator rows (Mon → Sun)
  let y = L2.opTopY;
  for (let i = 0; i < 7; i++) {
    const op = operatorsByDay[DAYS[i]] || {};
    put(page, font, op.operator_name    || '', L2.opNameX, y, 7);
    put(page, font, op.pal_card_number  || '', L2.opPalX,  y, 7);
    put(page, font, weekDates[i]        || '', L2.opDateX, y, 7);
    y -= L2.opRowH;
  }

  // Defect log rows
  const dc = L2.defCols;
  let dy = L2.defTopY;
  for (const def of defects || []) {
    put(page, font, def.item_number,             dc.item,     dy, 6);
    put(page, font, def.defect_details,          dc.details,  dy, 6);
    put(page, font, fmtDate(def.date_noted),     dc.noted,    dy, 6);
    put(page, font, def.engineer_name,           dc.engineer, dy, 6);
    put(page, font, fmtDate(def.date_repaired),  dc.repaired, dy, 6);
    put(page, font, def.further_notes,           dc.notes,    dy, 6);
    dy -= L2.defRowH;
    if (dy < 40) break;  // stop before running off the page
  }
}

// ─── PDF assembly ─────────────────────────────────────────────────────────────

async function buildPDF({ mewp, sheet, checkItems, summaryByItem, operatorsByDay, weekDates, defects }) {
  const templateBytes = fs.readFileSync(
    path.join(process.cwd(), 'public/mewps_template.pdf'),
  );

  const pdfDoc   = await PDFDocument.load(templateBytes);
  const font     = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pages = pdfDoc.getPages();
  const page1 = pages[0];  // A4 landscape — all 43 inspection items
  const page2 = pages[1];  // A4 portrait  — operator log + defect log

  const funcItems = checkItems.filter(
    ci => ci.item_number >= 29 || ci.check_type === 'function',
  );

  stampPage1(page1, font, boldFont, mewp, sheet, summaryByItem, funcItems);
  stampPage2(page2, font, operatorsByDay, weekDates, defects);

  return Buffer.from(await pdfDoc.save());
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

  // 2. Check item descriptions
  const { data: checkItems = [] } = await supabase
    .from('check_items')
    .select('item_number, description, check_type, category, has_gp')
    .order('item_number');

  // 3. weekly_sheet_summary — all 43 items pivoted across 7 day columns
  const { data: summaryRows = [], error: sumErr } = await supabase
    .from('weekly_sheet_summary')
    .select('*')
    .eq('sheet_id', sheet.id);

  if (sumErr) console.warn('[generateReport] weekly_sheet_summary:', sumErr.message);

  const summaryByItem = {};
  (summaryRows || []).forEach(row => { summaryByItem[row.item_number] = row; });

  // 4. weekly_operator_log — one row per day
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

  // 5. Defect log
  const { data: defects = [] } = await supabase
    .from('defect_log')
    .select('item_number, defect_details, date_noted, engineer_name, date_repaired, further_notes')
    .eq('sheet_id', sheet.id)
    .order('item_number');

  // 6. Build PDF
  const weekDates = getWeekDates(weekCommencing);
  const pdfBuffer = await buildPDF({
    mewp, sheet, checkItems, summaryByItem, operatorsByDay, weekDates,
    defects: defects || [],
  });

  // 7. Upload to Supabase Storage
  const siteId   = mewp.site_id;
  const filePath = `${siteId}/${mewpId}/${weekCommencing}.pdf`;

  const { error: uploadError } = await supabase.storage
    .from('weekly-reports')
    .upload(filePath, pdfBuffer, { contentType: 'application/pdf', upsert: true });

  if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);

  const { data: { publicUrl } } = supabase.storage
    .from('weekly-reports')
    .getPublicUrl(filePath);

  // 8. Persist URL and timestamp
  await supabase
    .from('weekly_inspection_sheets')
    .update({ pdf_url: publicUrl, pdf_generated_at: new Date().toISOString() })
    .eq('id', sheet.id);

  return publicUrl;
}

module.exports = { generateReport };
