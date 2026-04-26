import { generateReport } from '../../lib/generateReport';
import { createClient } from '@supabase/supabase-js';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

function weekCommencingFor(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  const daysToMon = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - daysToMon);
  return d.toISOString().split('T')[0];
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { mewp_id, sheet_id } = req.body || {};
  if (!mewp_id) {
    return res.status(400).json({ error: 'mewp_id is required' });
  }

  let weekCommencing;
  try {
    const supabase = adminClient();

    if (sheet_id) {
      const { data: sheet, error } = await supabase
        .from('weekly_inspection_sheets')
        .select('week_commencing')
        .eq('id', sheet_id)
        .single();
      if (error || !sheet) {
        return res.status(404).json({ error: 'Sheet not found' });
      }
      weekCommencing = sheet.week_commencing;
    } else {
      weekCommencing = weekCommencingFor(new Date().toISOString().split('T')[0]);
    }
  } catch (err) {
    console.error('[trigger-pdf] lookup error:', err);
    return res.status(500).json({ error: err.message || 'Failed to resolve sheet' });
  }

  try {
    await generateReport(mewp_id, weekCommencing);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[trigger-pdf] error:', err.stack || err.message);
    return res.status(500).json({ error: 'PDF generation failed', detail: err.message });
  }
}
