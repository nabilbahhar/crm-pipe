-- ═══════════════════════════════════════════════════════════════
-- Migration 011: Account Meetings (CR) + Account Files (PJ)
-- Run in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- 1. Table: account_meetings (Comptes rendus de réunions)
CREATE TABLE IF NOT EXISTS account_meetings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  title       text NOT NULL,
  meeting_date date NOT NULL DEFAULT CURRENT_DATE,
  attendees   text,
  summary     text NOT NULL,
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz
);

CREATE INDEX IF NOT EXISTS idx_account_meetings_account_id
  ON account_meetings(account_id);

-- 2. Table: account_files (Documents / PJ du compte)
CREATE TABLE IF NOT EXISTS account_files (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  file_type   text NOT NULL DEFAULT 'autre',
  file_name   text NOT NULL,
  file_url    text NOT NULL,
  uploaded_by text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_account_files_account_id
  ON account_files(account_id);

-- 3. RLS policies
ALTER TABLE account_meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_files    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "account_meetings_select" ON account_meetings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "account_meetings_insert" ON account_meetings
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "account_meetings_update" ON account_meetings
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "account_meetings_delete" ON account_meetings
  FOR DELETE TO authenticated USING (true);

CREATE POLICY "account_files_select" ON account_files
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "account_files_insert" ON account_files
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "account_files_delete" ON account_files
  FOR DELETE TO authenticated USING (true);

-- 4. Storage bucket (run manually in Supabase Dashboard > Storage > New Bucket)
-- Name: account-files
-- Public: false
-- File size limit: 15 MB
-- Allowed MIME types: application/pdf, image/*, application/vnd.*, text/csv
