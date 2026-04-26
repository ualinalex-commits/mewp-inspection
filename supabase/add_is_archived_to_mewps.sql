-- Migration: add is_archived column to mewps table
-- Run this once in the Supabase SQL editor.
ALTER TABLE public.mewps
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;

-- Optional: index for fast filtering of active MEWPs
CREATE INDEX IF NOT EXISTS mewps_is_archived_idx ON public.mewps (is_archived);
