import { createClient } from '@supabase/supabase-js';
import { generateReport } from '../../lib/generateReport';

// Use service role key so the handler can read all tables and write to Storage
function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

// Returns the Monday (week_commencing) for any given date string
function weekCommencingFor(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  const daysToMon = (d.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
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

  try {
    const supabase = adminClient();
    let weekCommencing;

    if (sheet_id) {
      // If the caller already knows which sheet, look up its week_commencing directly
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
      // Default to the current week
      weekCommencing = weekCommencingFor(new Date().toISOString().split('T')[0]);

      // Verify a sheet exists for this MEWP this week; fall back to the most recent one
      const { data: sheet } = await supabase
        .from('weekly_inspection_sheets')
        .select('week_commencing')
        .eq('mewp_id', mewp_id)
        .eq('week_commencing', weekCommencing)
        .maybeSingle();

      if (!sheet) {
        // No sheet this week — use the most recent one instead
        const { data: latest } = await supabase
          .from('weekly_inspection_sheets')
          .select('week_commencing')
          .eq('mewp_id', mewp_id)
          .order('week_commencing', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!latest) {
          return res.status(404).json({ error: 'No inspection sheet found for this MEWP' });
        }
        weekCommencing = latest.week_commencing;
      }
    }

    const pdfUrl = await generateReport(mewp_id, weekCommencing);
    return res.status(200).json({ success: true, pdf_url: pdfUrl });
  } catch (err) {
    console.error('[generate-report]', err);
    return res.status(500).json({ error: err.message || 'PDF generation failed' });
  }
}
