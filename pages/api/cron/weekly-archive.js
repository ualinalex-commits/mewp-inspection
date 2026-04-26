import { createClient } from '@supabase/supabase-js';
import { generateReport } from '../../../lib/generateReport';

export const config = { maxDuration: 300 };

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
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (req.query.secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabase = adminClient();
  const today = new Date().toISOString().split('T')[0];
  const weekCommencing = weekCommencingFor(today);

  // Fetch all active, non-archived MEWPs across all sites
  const { data: mewps, error: mewpErr } = await supabase
    .from('mewps')
    .select('id, site_id, machine_ref')
    .eq('active', true)
    .or('is_archived.eq.false,is_archived.is.null');

  if (mewpErr) {
    console.error('[weekly-archive] fetch MEWPs error:', mewpErr.message);
    return res.status(500).json({ error: mewpErr.message });
  }

  const results = [];
  for (const mewp of mewps || []) {
    // Only generate if there's an inspection sheet for this week
    const { data: sheet } = await supabase
      .from('weekly_inspection_sheets')
      .select('id')
      .eq('mewp_id', mewp.id)
      .eq('week_commencing', weekCommencing)
      .maybeSingle();

    if (!sheet) {
      results.push({ mewp_id: mewp.id, machine_ref: mewp.machine_ref, status: 'skipped' });
      continue;
    }

    try {
      await generateReport(mewp.id, weekCommencing);
      results.push({ mewp_id: mewp.id, machine_ref: mewp.machine_ref, status: 'ok' });
    } catch (err) {
      console.error(`[weekly-archive] mewp ${mewp.id} failed:`, err.message);
      results.push({ mewp_id: mewp.id, machine_ref: mewp.machine_ref, status: 'error', error: err.message });
    }
  }

  const ok = results.filter(r => r.status === 'ok').length;
  const skipped = results.filter(r => r.status === 'skipped').length;
  const errors = results.filter(r => r.status === 'error').length;

  console.log(`[weekly-archive] done. ok=${ok} skipped=${skipped} errors=${errors}`);
  return res.status(200).json({ ok: true, weekCommencing, ok, skipped, errors, results });
}
