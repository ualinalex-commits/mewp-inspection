'use strict';

const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
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

  if (sheetErr || !sheet) throw new Error(`Sheet not found: ${sheetErr?.message}`);

  const mewp = sheet.mewps || {};

  // 2. weekly_sheet_summary — 43 items x 7 day columns
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

  // 5. Build template data — keys match actual template placeholders exactly
  const data = {
    machine_id: mewp.machine_ref || '',
    week_comm: fmtDate(weekCommencing),
    machine_ref_no: mewp.machine_ref || '',
    date_on_hire: '',
  };

  // Visual checks 1-28: {{mon1}} ... {{sat28}}
  for (let num = 1; num <= 28; num++) {
    const row = summaryByItem[num] || {};
    for (let d = 0; d < 7; d++) {
      const dk = DAY_KEYS[d];
      const ldk = DAYS[d].toLowerCase();
      data[`${dk}${num}`] = toResult(row[`${ldk}_result`] ?? row[ldk] ?? null);
    }
  }

  // Function checks 29-43: {{mong29}} {{monp29}} ... {{satg43}} {{satp43}}
  for (let num = 29; num <= 43; num++) {
    const row = summaryByItem[num] || {};
    for (let d = 0; d < 7; d++) {
      const dk = DAY_KEYS[d];
      const ldk = DAYS[d].toLowerCase();
      data[`${dk}g${num}`] = toResult(row[`${ldk}_ground_result`] ?? row[`${ldk}_ground`] ?? null);
      data[`${dk}p${num}`] = toResult(row[`${ldk}_platform_result`] ?? row[`${ldk}_platform`] ?? null);
    }
  }

  // Operator rows per day
  for (let d = 0; d < 7; d++) {
    const dk = DAY_KEYS[d];
    const op = operatorsByDay[DAYS[d]] || {};
    data[`${dk}_person_completing_daily_check`] = op.operator_name || '';
    data[`${dk}_stats`] = op.daily_status === 'ok' ? 'OK'
      : op.daily_status === 'fault' ? 'X'
        : '';
    data[`${dk}_initial`] = op.operator_name
      ? op.operator_name.trim()[0].toUpperCase()
      : '';
  }

  // Supervisor sign-off
  data.weekly_supervisor_sign_off = sheet.supervisor_signoff_1_name
    ? `${sheet.supervisor_signoff_1_name}  ${fmtDate(sheet.supervisor_signoff_1_date)}`
    : '';
  data.date_supervisor_sign = fmtDate(sheet.supervisor_signoff_1_date);

  // 6. Fill template.docx
  const templateBytes = fs.readFileSync(
    path.join(process.cwd(), 'public/template.docx'),
  );

  const zip = new PizZip(templateBytes);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    nullGetter() { return ''; },
  });

  try {
    doc.render(data);
  } catch (renderErr) {
    if (renderErr.properties && Array.isArray(renderErr.properties.errors)) {
      const details = renderErr.properties.errors.map(e => ({
        message: e.message,
        id: e.properties?.id,
        xtag: e.properties?.xtag,
        explanation: e.properties?.explanation,
      }));
      console.error('[generateReport] docxtemplater errors:', JSON.stringify(details, null, 2));
      const enriched = new Error('Docxtemplater multi-error: see docxtemplaterErrors for details');
      enriched.docxtemplaterErrors = details;
      throw enriched;
    }
    throw renderErr;
  }

  const docxBuffer = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });

  // 7. Upload to Supabase Storage
  const siteId = mewp.site_id;
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

  // 9. Return Google Docs viewer URL
  return `https://docs.google.com/viewer?url=${encodeURIComponent(publicUrl)}`;
}

module.exports = { generateReport };