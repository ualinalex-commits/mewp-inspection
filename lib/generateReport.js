'use strict';

const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const { createClient } = require('@supabase/supabase-js');
const fs   = require('fs');
const path = require('path');

const DAYS     = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_KEYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

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
  return `${String(d.getUTCDate()).padStart(2,'0')}/${String(d.getUTCMonth()+1).padStart(2,'0')}/${d.getUTCFullYear()}`;
}

function toResult(val) {
  if (val === 'pass') return 'P';
  if (val === 'fail') return 'F';
  return '';
}

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

  // 2. weekly_sheet_summary — 43 items × 7 day columns
  const { data: summaryRows = [], error: sumErr } = await supabase
    .from('weekly_sheet_summary')
    .select('*')
    .eq('sheet_id', sheet.id);

  if (sumErr) console.warn('[generateReport] weekly_sheet_summary:', sumErr.message);

  const summaryByItem = {};
  (summaryRows || []).forEach(row => { summaryByItem[row.item_number] = row; });

  // 3. weekly_operator_log — one row per day
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

  // 4. Defect log
  const { data: defects = [] } = await supabase
    .from('defect_log')
    .select('item_number, defect_details, date_noted, date_reported, engineer_name, date_repaired, further_notes')
    .eq('sheet_id', sheet.id)
    .order('item_number');

  // 5. Build template data
  const data = {
    MACHINE_REF:     mewp.machine_ref || '',
    WEEK_COMMENCING: fmtDate(weekCommencing),
  };

  // Visual checks 1–28: {{MON_01}} … {{SUN_28}}
  for (let num = 1; num <= 28; num++) {
    const row = summaryByItem[num] || {};
    for (let d = 0; d < 7; d++) {
      const dk  = DAY_KEYS[d];
      const ldk = DAYS[d].toLowerCase();
      const key = `${dk}_${String(num).padStart(2, '0')}`;
      data[key] = toResult(row[`${ldk}_result`] ?? row[ldk] ?? null);
    }
  }

  // Function checks 29–43: {{MON_29_G}} {{MON_29_P}} … {{SUN_43_G}} {{SUN_43_P}}
  for (let num = 29; num <= 43; num++) {
    const row = summaryByItem[num] || {};
    for (let d = 0; d < 7; d++) {
      const dk  = DAY_KEYS[d];
      const ldk = DAYS[d].toLowerCase();
      data[`${dk}_${num}_G`] = toResult(row[`${ldk}_ground_result`]   ?? row[`${ldk}_ground`]   ?? null);
      data[`${dk}_${num}_P`] = toResult(row[`${ldk}_platform_result`] ?? row[`${ldk}_platform`] ?? null);
    }
  }

  // Operator rows per day
  for (let d = 0; d < 7; d++) {
    const dk = DAY_KEYS[d];
    const op = operatorsByDay[DAYS[d]] || {};
    data[`${dk}_OPERATOR`] = op.operator_name    || '';
    data[`${dk}_PAL`]      = op.pal_card_number  || '';
    data[`${dk}_STATUS`]   = op.daily_status === 'ok'    ? 'OK'
                           : op.daily_status === 'fault'  ? 'X'
                           : '';
    data[`${dk}_INITIALS`] = op.operator_name
      ? op.operator_name.trim()[0].toUpperCase()
      : '';
  }

  // Defect log — up to 10 rows
  for (let i = 0; i < 10; i++) {
    const ri  = String(i + 1).padStart(2, '0');
    const def = (defects || [])[i] || {};
    data[`DEFECT_${ri}_ITEM`]     = def.item_number != null ? String(def.item_number) : '';
    data[`DEFECT_${ri}_DETAILS`]  = def.defect_details  || '';
    data[`DEFECT_${ri}_DATE`]     = fmtDate(def.date_noted);
    data[`DEFECT_${ri}_ENGINEER`] = def.engineer_name   || '';
    data[`DEFECT_${ri}_REPAIRED`] = fmtDate(def.date_repaired);
    data[`DEFECT_${ri}_NOTES`]    = def.further_notes   || '';
  }

  // Supervisor sign-off
  data.SUPERVISOR_1_NAME = sheet.supervisor_signoff_1_name || '';
  data.SUPERVISOR_1_DATE = fmtDate(sheet.supervisor_signoff_1_date);
  data.SUPERVISOR_2_NAME = sheet.supervisor_signoff_2_name || '';
  data.SUPERVISOR_2_DATE = fmtDate(sheet.supervisor_signoff_2_date);

  // 6. Fill template.docx
  const templateBytes = fs.readFileSync(
    path.join(process.cwd(), 'public/template.docx'),
  );
  const zip = new PizZip(templateBytes);
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
  doc.render(data);
  const docxBuffer = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });

  // 7. Upload to Supabase Storage
  const siteId   = mewp.site_id;
  const filePath = `${siteId}/${mewpId}/${weekCommencing}.docx`;

  const { error: uploadError } = await supabase.storage
    .from('weekly-reports')
    .upload(filePath, docxBuffer, {
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      upsert: true,
    });

  if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);

  const { data: { publicUrl } } = supabase.storage
    .from('weekly-reports')
    .getPublicUrl(filePath);

  // 8. Persist URL and timestamp
  await supabase
    .from('weekly_inspection_sheets')
    .update({ pdf_url: publicUrl, pdf_generated_at: new Date().toISOString() })
    .eq('id', sheet.id);

  // 9. Return Google Docs viewer URL so browsers can open the .docx directly
  return `https://docs.google.com/viewer?url=${encodeURIComponent(publicUrl)}`;
}

module.exports = { generateReport };
