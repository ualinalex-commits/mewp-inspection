'use strict';

const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

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

function fmtDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00Z');
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
}

function toResult(val) {
  if (val === 'pass') return 'P';
  if (val === 'fail') return 'F';
  return '';
}

// ─── Page 1 layout (A4 landscape: 841.92 x 595.32) ───────────────────────────
// pdf-lib origin is BOTTOM-LEFT. y=0 is bottom, y=595 is top.
//
// NOTE: All coordinates are approximate. After first run, open the PDF and
// nudge values until text lands inside each cell.

const P1W = 841.92;
const P1H = 595.32;

// X positions of each day column (left edge of cell)
// Mon=0, Tue=1, Wed=2, Thu=3, Fri=4, Sat=5, Sun=6
const DAY_X = [
  490,  // Mon
  560,  // Tue (blank in template)
  593,  // Wed (blank)
  626,  // Thu (blank)
  659,  // Fri (blank)
  692,  // Sat
  758,  // Sun (blank)
];
const DAY_CELL_W = 30; // width of each day cell

// Y positions of each visual check row (baseline of text)
// Items 1-28, top to bottom
const VIS_ROW_Y = [
  null, // index 0 unused
  516,  // item 1
  507,  // item 2
  498,  // item 3
  486,  // item 4
  477,  // item 5
  468,  // item 6
  456,  // item 7
  447,  // item 8
  438,  // item 9
  426,  // item 10
  417,  // item 11
  405,  // item 12
  396,  // item 13
  384,  // item 14
  375,  // item 15
  366,  // item 16
  354,  // item 17
  345,  // item 18
  336,  // item 19
  327,  // item 20
  315,  // item 21
  306,  // item 22
  297,  // item 23
  288,  // item 24
  279,  // item 25
  267,  // item 26
  258,  // item 27
  249,  // item 28
];

// Function checks 29-43: each has G row and P row
// [item_number]: { g: y_of_G_row, p: y_of_P_row }
const FUNC_ROW_Y = {
  29: { g: 225, p: 215 },
  30: { g: 204, p: 194 },
  31: { g: 183, p: 173 },
  32: { g: 162, p: 152 },
  33: { g: 141, p: 131 },
  34: { g: 120, p: 110 },
  35: { g: 99, p: 89 },
  36: { g: 78, p: 68 },
  37: { g: 57, p: 47 },
  38: { g: 36, p: 26 },
  39: { g: 225, p: 215 }, // page 2 continuation — adjust after visual check
  40: { g: 204, p: 194 },
  41: { g: 183, p: 173 },
  42: { g: 162, p: 152 },
  43: { g: 141, p: 131 },
};

// Header positions (page 1)
const MACHINE_ID_X = 530;
const MACHINE_ID_Y = 572;
const WEEK_COMM_X = 760;
const WEEK_COMM_Y = 572;

// Initials row (bottom of page 1)
const INITIAL_Y = 30;

// ─── Page 2 layout (A4 portrait: 595.32 x 841.92) ────────────────────────────
const P2H = 841.92;

const MACHINE_REF_X = 120;
const MACHINE_REF_Y = P2H - 60;
const DATE_ON_HIRE_X = 380;
const DATE_ON_HIRE_Y = P2H - 60;

// Operator table rows (Mon/Sat only — others blank in template)
const OP_NAME_X = 130;
const OP_STATS_X = 310;
const OP_ROW_Y = {
  Mon: P2H - 155,
  Sat: P2H - 270,
};

const SUPERVISOR_DATE_X = 60;
const SUPERVISOR_DATE_Y = P2H - 380;
const SUPERVISOR_NAME_X = 220;
const SUPERVISOR_NAME_Y = P2H - 380;

async function buildPDF({ mewp, sheet, summaryByItem, operatorsByDay }) {
  const templateBytes = fs.readFileSync(
    path.join(process.cwd(), 'public/template.pdf'),
  );

  const pdfDoc = await PDFDocument.load(templateBytes);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const BLACK = rgb(0, 0, 0);
  const GREEN = rgb(0.086, 0.502, 0.239);
  const RED = rgb(0.725, 0.110, 0.110);

  const pages = pdfDoc.getPages();
  const p1 = pages[0];
  const p2 = pages[1];

  function stamp(page, text, x, y, size, color, useBold) {
    if (!text) return;
    page.drawText(String(text), { x, y, size: size || 7, font: useBold ? bold : font, color: color || BLACK });
  }

  function stampResult(page, result, x, y) {
    if (!result) return;
    const isPass = result === 'P';
    page.drawText(result, { x, y, size: 7, font: bold, color: isPass ? GREEN : RED });
  }

  // ── Page 1: header ──────────────────────────────────────────────────────
  stamp(p1, mewp.machine_ref || '', MACHINE_ID_X, MACHINE_ID_Y, 8, BLACK, true);
  stamp(p1, fmtDate(sheet.week_commencing), WEEK_COMM_X, WEEK_COMM_Y, 8, BLACK, false);

  // ── Page 1: visual checks 1-28 ──────────────────────────────────────────
  for (let num = 1; num <= 28; num++) {
    const row = summaryByItem[num] || {};
    const y = VIS_ROW_Y[num];
    if (!y) continue;
    for (let d = 0; d < 7; d++) {
      const ldk = DAYS[d].toLowerCase();
      const result = toResult(row[`${ldk}_result`] ?? row[ldk] ?? null);
      if (result) stampResult(p1, result, DAY_X[d] + 8, y);
    }
  }

  // ── Page 1: function checks 29-43 ───────────────────────────────────────
  for (let num = 29; num <= 43; num++) {
    const row = summaryByItem[num] || {};
    const rowY = FUNC_ROW_Y[num];
    if (!rowY) continue;
    const page = num <= 38 ? p1 : (pages[1] || p1);
    for (let d = 0; d < 7; d++) {
      const ldk = DAYS[d].toLowerCase();
      const g = toResult(row[`${ldk}_ground_result`] ?? row[`${ldk}_ground`] ?? null);
      const pl = toResult(row[`${ldk}_platform_result`] ?? row[`${ldk}_platform`] ?? null);
      if (g) stampResult(page, g, DAY_X[d] + 2, rowY.g);
      if (pl) stampResult(page, pl, DAY_X[d] + 2, rowY.p);
    }
  }

  // ── Page 1: initials ────────────────────────────────────────────────────
  for (let d = 0; d < 7; d++) {
    const op = operatorsByDay[DAYS[d]] || {};
    if (op.operator_name) {
      const initial = op.operator_name.trim()[0].toUpperCase();
      stamp(p1, initial, DAY_X[d] + 10, INITIAL_Y, 7, BLACK, false);
    }
  }

  // ── Page 2: header ──────────────────────────────────────────────────────
  stamp(p2, mewp.machine_ref || '', MACHINE_REF_X, MACHINE_REF_Y, 8, BLACK, false);

  // ── Page 2: operator rows ───────────────────────────────────────────────
  for (const day of ['Mon', 'Sat']) {
    const op = operatorsByDay[day] || {};
    const y = OP_ROW_Y[day];
    if (!y) continue;
    stamp(p2, op.operator_name || '', OP_NAME_X, y, 7, BLACK, false);
    stamp(p2, op.daily_status === 'ok' ? 'OK' : op.daily_status === 'fault' ? 'X' : '', OP_STATS_X, y, 7, BLACK, false);
  }

  // ── Page 2: supervisor sign-off ─────────────────────────────────────────
  stamp(p2, fmtDate(sheet.supervisor_signoff_1_date), SUPERVISOR_DATE_X, SUPERVISOR_DATE_Y, 7, BLACK, false);
  stamp(p2, sheet.supervisor_signoff_1_name || '', SUPERVISOR_NAME_X, SUPERVISOR_NAME_Y, 7, BLACK, false);

  return Buffer.from(await pdfDoc.save());
}

async function generateReport(mewpId, weekCommencing) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  // 1. Weekly sheet + MEWP metadata
  const { data: sheet, error: sheetErr } = await supabase
    .from('weekly_inspection_sheets')
    .select('*, mewps(machine_ref, model, serial_number, site_id, sites(name, location))')
    .eq('mewp_id', mewpId)
    .eq('week_commencing', weekCommencing)
    .single();

  if (sheetErr || !sheet) throw new Error(`Sheet not found: ${sheetErr?.message}`);

  const mewp = sheet.mewps || {};

  // 2. weekly_sheet_summary
  const { data: summaryRows = [], error: sumErr } = await supabase
    .from('weekly_sheet_summary')
    .select('*')
    .eq('sheet_id', sheet.id);

  if (sumErr) console.warn('[generateReport] weekly_sheet_summary:', sumErr.message);

  const summaryByItem = {};
  (summaryRows || []).forEach(row => { summaryByItem[row.item_number] = row; });

  // 3. weekly_operator_log
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

  // 4. Build PDF
  const pdfBuffer = await buildPDF({ mewp, sheet, summaryByItem, operatorsByDay });

  // 5. Upload to Supabase Storage
  const siteId = mewp.site_id;
  const filePath = `${siteId}/${mewpId}/${weekCommencing}.pdf`;

  const { error: uploadError } = await supabase.storage
    .from('weekly-reports')
    .upload(filePath, pdfBuffer, { contentType: 'application/pdf', upsert: true });

  if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);

  const { data: { publicUrl } } = supabase.storage
    .from('weekly-reports')
    .getPublicUrl(filePath);

  // 6. Persist URL and timestamp
  await supabase
    .from('weekly_inspection_sheets')
    .update({ pdf_url: publicUrl, pdf_generated_at: new Date().toISOString() })
    .eq('id', sheet.id);

  return publicUrl;
}

module.exports = { generateReport };