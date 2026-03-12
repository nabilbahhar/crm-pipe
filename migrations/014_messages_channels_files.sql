-- 014: Messages channels + file storage for team chat
-- Adds channel column to team_messages, creates storage bucket

-- 1. Add channel column (boulot, rappels, blabla)
ALTER TABLE team_messages
ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'boulot';

-- 2. Add file_size column
ALTER TABLE team_messages
ADD COLUMN IF NOT EXISTS file_size bigint;

-- 3. Create index on channel for faster filtering
CREATE INDEX IF NOT EXISTS idx_team_messages_channel ON team_messages(channel);

-- 4. Create shared_files table if not exists
CREATE TABLE IF NOT EXISTS shared_files (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  url text NOT NULL,
  storage_path text,
  uploaded_by text NOT NULL,
  size bigint,
  channel text NOT NULL DEFAULT 'boulot',
  message_id uuid REFERENCES team_messages(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on shared_files
ALTER TABLE shared_files ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "shared_files_all" ON shared_files;
CREATE POLICY "shared_files_all" ON shared_files FOR ALL USING (true) WITH CHECK (true);

-- 5. Create storage bucket for team files (if not exists)
INSERT INTO storage.buckets (id, name, public)
VALUES ('team-files', 'team-files', true)
ON CONFLICT (id) DO NOTHING;

-- 6. Storage policies for team-files bucket
DROP POLICY IF EXISTS "team_files_upload" ON storage.objects;
CREATE POLICY "team_files_upload" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'team-files' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "team_files_select" ON storage.objects;
CREATE POLICY "team_files_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'team-files');

DROP POLICY IF EXISTS "team_files_delete" ON storage.objects;
CREATE POLICY "team_files_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'team-files' AND auth.role() = 'authenticated');

-- 7. Enable realtime on shared_files
ALTER PUBLICATION supabase_realtime ADD TABLE shared_files;
