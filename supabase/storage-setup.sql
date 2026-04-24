-- Run this in the Supabase SQL editor once to set up the weekly-reports storage bucket.

-- 1. Create the bucket (public = true means files are readable without auth)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'weekly-reports',
  'weekly-reports',
  true,
  52428800,             -- 50 MB per file
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 2. Public read (anyone with the URL can download the PDF)
CREATE POLICY "weekly-reports: public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'weekly-reports');

-- 3. Service-role write (only server-side code with the service role key can upload)
CREATE POLICY "weekly-reports: service role insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'weekly-reports');

CREATE POLICY "weekly-reports: service role update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'weekly-reports');

CREATE POLICY "weekly-reports: service role delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'weekly-reports');
