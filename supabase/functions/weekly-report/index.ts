// Supabase Edge Function — weekly-report
//
// Runs every Sunday at 17:00 UTC (18:00 BST / UK summer time).
// Finds every sheet whose week ends today and hasn't had a PDF generated,
// then calls the Next.js API route to build + upload each PDF.
//
// Schedule (add via Supabase dashboard → Edge Functions → Schedule, or pg_cron):
//   0 17 * * 0   ← 17:00 UTC = 18:00 BST  (adjust to 0 18 * * 0 in winter / GMT)
//
// pg_cron alternative (run in Supabase SQL editor):
//   select cron.schedule(
//     'weekly-report-sunday',
//     '0 17 * * 0',
//     $$
//     select net.http_post(
//       url      := 'https://<project-ref>.supabase.co/functions/v1/weekly-report',
//       headers  := '{"Authorization": "Bearer <ANON_KEY>", "Content-Type": "application/json"}'::jsonb,
//       body     := '{}'::jsonb
//     );
//     $$
//   );

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL            = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const APP_URL                 = Deno.env.get('APP_URL') ?? 'https://mewp-inspection.vercel.app';

Deno.serve(async (_req) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Today's date in ISO format (YYYY-MM-DD)
  const today = new Date().toISOString().split('T')[0];

  // Find all sheets whose week ends today and don't yet have a PDF
  const { data: sheets, error } = await supabase
    .from('weekly_inspection_sheets')
    .select('id, mewp_id, week_commencing')
    .eq('week_ending', today)
    .is('pdf_generated_at', null);

  if (error) {
    console.error('Failed to query sheets:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!sheets || sheets.length === 0) {
    console.log('No pending sheets for', today);
    return new Response(JSON.stringify({ message: 'No pending sheets', date: today }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  console.log(`Processing ${sheets.length} sheet(s) for week ending ${today}`);

  const results: Array<{ sheet_id: string; success: boolean; pdf_url?: string; error?: string }> = [];

  for (const sheet of sheets) {
    try {
      const res = await fetch(`${APP_URL}/api/generate-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mewp_id: sheet.mewp_id, sheet_id: sheet.id }),
      });

      const json = await res.json();

      if (res.ok && json.success) {
        console.log(`✓ Sheet ${sheet.id} → ${json.pdf_url}`);
        results.push({ sheet_id: sheet.id, success: true, pdf_url: json.pdf_url });
      } else {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`✗ Sheet ${sheet.id}:`, msg);
      results.push({ sheet_id: sheet.id, success: false, error: msg });
    }
  }

  const succeeded = results.filter(r => r.success).length;
  const failed    = results.filter(r => !r.success).length;
  console.log(`Done: ${succeeded} succeeded, ${failed} failed`);

  return new Response(JSON.stringify({ date: today, succeeded, failed, results }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
