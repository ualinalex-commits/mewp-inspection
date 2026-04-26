'use strict';

const { PDFDocument, PDFName, StandardFonts, rgb, decodePDFRawStream } = require('pdf-lib');
const { createClient } = require('@supabase/supabase-js');
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

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
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
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

// ─── Exact template coords (extracted from template.pdf via pdfjs-dist) ───────
// pdf-lib shares the same coordinate convention as PDF: origin = bottom-left.
//
// Page 0 = first page  (842×595 landscape) — header, visual checks, func 29-42
// Page 1 = second page (842×595 landscape) — func 43, initials
// Page 2 = third page  (595×842 portrait)  — operator log, supervisor sign-off

const MACHINE_ID = { x: 484, y: 559 };   // {{machine_id}}
const WEEK_COMM  = { x: 701, y: 559 };   // {{week_comm}}

// X position of each day column (visual checks baseline)
const DAY_X = { Mon: 442, Tue: 492, Wed: 541, Thu: 591, Fri: 640, Sat: 690, Sun: 740 };
const DAYS  = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Visual checks 1-28: two-digit item numbers nudge the stamp 3px left
function visX(day, item) { return DAY_X[day] + (item > 9 ? -3 : 0); }

// Visual checks 1-28 row Y positions
const VIS_Y = [
  null,                                         // index 0 unused
  527, 516, 506, 495, 485, 474, 464, 453, 443, // 1-9
  432, 421, 411, 400, 390, 379, 369, 358, 347, // 10-18
  337, 327, 316, 305, 295, 285, 274, 263, 253, 242, // 19-28
];

// Function checks 29-43: G (Ground) and P (Platform) sub-columns sit at fixed
// offsets left/right of the day column x.
const FUNC_G_OFFSET = -7;  // e.g. Mon: 442-7=435
const FUNC_P_OFFSET = +17; // e.g. Mon: 442+17=459

const FUNC = {
  29: { y: 223, page: 0 },
  30: { y: 206, page: 0 },
  31: { y: 189, page: 0 },
  32: { y: 173, page: 0 },
  33: { y: 156, page: 0 },
  34: { y: 139, page: 0 },
  35: { y: 123, page: 0 },
  36: { y: 106, page: 0 },
  37: { y:  89, page: 0 },
  38: { y:  73, page: 0 },
  39: { y:  56, page: 0 },
  40: { y:  39, page: 0 },
  41: { y:  23, page: 0 },
  42: { y:   6, page: 0 },
  43: { y: 562, page: 1 },
};

// Page 1 initials: single character at left edge of each day column
const INITIAL_Y        = 531;
const INITIAL_X_OFFSET = -6; // Mon: 442-6=436

// Page 2 fields
const MACHINE_REF_NO = { x: 201, y: 767 }; // {{machine_ref_no}}
const MON_PERSON     = { x: 153, y: 690 }; // {{mon_person_completing_daily_check}}
const MON_STATS      = { x: 256, y: 690 }; // {{mon_stats}}
const SAT_PERSON     = { x: 153, y: 567 }; // {{sat_person_completing_daily_check}}
const SAT_STATS      = { x: 256, y: 567 }; // {{sat_stats}}
const DATE_SUPER     = { x: 106, y: 505 }; // {{date_supervisor_sign}}
const WEEKLY_SUPER   = { x: 153, y: 505 }; // {{weekly_supervisor_sign_off}}

function stripPlaceholders(pdfDoc) {
  for (const page of pdfDoc.getPages()) {
    const contentsVal = page.node.get(PDFName.of('Contents'));
    if (!contentsVal) continue;

    const processRef = (ref) => {
      const obj = pdfDoc.context.lookup(ref);
      if (!obj || !('contents' in obj)) return;

      const decoded = decodePDFRawStream(obj).decode();
      let content = Buffer.from(decoded).toString('latin1');
      if (!content.includes('{') && !content.includes('}')) return;

      content = content.replace(/BT[\s\S]*?ET/g, block => {
        if (!/\([^)]*[{}]/.test(block)) return block;
        return block.replace(/\(([^)]*)\)/g, (_, s) => '(' + ' '.repeat(s.length) + ')');
      });

      const newBytes = Buffer.from(content, 'latin1');
      const compressed = zlib.deflateSync(newBytes);
      obj.contents = compressed;
      obj.dict.set(PDFName.of('Length'), pdfDoc.context.obj(compressed.length));
    };

    if (contentsVal.constructor.name === 'PDFArray') {
      for (let i = 0; i < contentsVal.size(); i++) processRef(contentsVal.get(i));
    } else {
      processRef(contentsVal);
    }
  }
}

async function buildPDF({ mewp, sheet, summaryByItem, operatorsByDay }) {
  const templateBytes = fs.readFileSync(
    path.join(process.cwd(), 'public/template.pdf'),
  );

  const pdfDoc = await PDFDocument.load(templateBytes);
  stripPlaceholders(pdfDoc);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const BLACK = rgb(0, 0, 0);
  const GREEN = rgb(0.086, 0.502, 0.239);
  const RED   = rgb(0.725, 0.110, 0.110);

  const pages = pdfDoc.getPages();
  const p1 = pages[0]; // landscape — header + visual checks + func 29-42
  const p2 = pages[1]; // landscape — func 43 + initials
  const p3 = pages[2]; // portrait  — operator log + supervisor sign-off

  function stamp(page, text, x, y, size, color, useBold) {
    if (!text) return;
    page.drawText(String(text), {
      x, y,
      size: size || 7,
      font: useBold ? bold : font,
      color: color || BLACK,
    });
  }

  function stampResult(page, result, x, y) {
    if (!result) return;
    page.drawText(result, {
      x, y, size: 7, font: bold,
      color: result === 'P' ? GREEN : RED,
    });
  }

  // ── Page 0: header ──────────────────────────────────────────────────────────
  stamp(p1, mewp.machine_ref || '', MACHINE_ID.x, MACHINE_ID.y, 8, BLACK, true);
  stamp(p1, fmtDate(sheet.week_commencing), WEEK_COMM.x, WEEK_COMM.y, 8, BLACK, false);

  // ── Page 0: visual checks 1-28 ─────────────────────────────────────────────
  for (let num = 1; num <= 28; num++) {
    const row = summaryByItem[num] || {};
    const y   = VIS_Y[num];
    for (const day of DAYS) {
      const dl = day.toLowerCase();
      const r  = toResult(row[`${dl}_result`] ?? row[dl] ?? null);
      if (r) stampResult(p1, r, visX(day, num), y);
    }
  }

  // ── Pages 0-1: function checks 29-43 ──────────────────────────────────────
  for (let num = 29; num <= 43; num++) {
    const row = summaryByItem[num] || {};
    const fc  = FUNC[num];
    const pg  = pages[fc.page];
    for (const day of DAYS) {
      const dl = day.toLowerCase();
      const g  = toResult(row[`${dl}_ground_result`] ?? row[`${dl}_ground`] ?? null);
      const p  = toResult(row[`${dl}_platform_result`] ?? row[`${dl}_platform`] ?? null);
      if (g) stampResult(pg, g, DAY_X[day] + FUNC_G_OFFSET, fc.y);
      if (p) stampResult(pg, p, DAY_X[day] + FUNC_P_OFFSET, fc.y);
    }
  }

  // ── Page 1: initials ────────────────────────────────────────────────────────
  for (const day of DAYS) {
    const op = operatorsByDay[day] || {};
    if (op.operator_name) {
      stamp(p2, op.operator_name.trim()[0].toUpperCase(), DAY_X[day] + INITIAL_X_OFFSET, INITIAL_Y);
    }
  }

  const monOp = operatorsByDay['Mon'] || {};
  const satOp = operatorsByDay['Sat'] || {};

  // ── Page 2: header ──────────────────────────────────────────────────────────
  stamp(p3, mewp.machine_ref || '', MACHINE_REF_NO.x, MACHINE_REF_NO.y, 8, BLACK, false);

  // ── Page 2: operator rows ───────────────────────────────────────────────────
  stamp(p3, monOp.operator_name || '', MON_PERSON.x, MON_PERSON.y);
  stamp(p3, monOp.daily_status === 'ok' ? 'OK' : monOp.daily_status === 'fault' ? 'X' : '', MON_STATS.x, MON_STATS.y);
  stamp(p3, satOp.operator_name || '', SAT_PERSON.x, SAT_PERSON.y);
  stamp(p3, satOp.daily_status === 'ok' ? 'OK' : satOp.daily_status === 'fault' ? 'X' : '', SAT_STATS.x, SAT_STATS.y);

  // ── Page 2: supervisor sign-off ─────────────────────────────────────────────
  stamp(p3, fmtDate(sheet.supervisor_signoff_1_date), DATE_SUPER.x, DATE_SUPER.y);
  stamp(p3, sheet.supervisor_signoff_1_name || '', WEEKLY_SUPER.x, WEEKLY_SUPER.y);

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

module.exports = { generateReport, buildPDF };
