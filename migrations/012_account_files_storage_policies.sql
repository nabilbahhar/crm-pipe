-- Migration 012: Storage policies for account-files bucket
-- Run AFTER creating the 'account-files' bucket in Supabase Storage

-- Allow authenticated users to upload files
CREATE POLICY "Authenticated users can upload account files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'account-files');

-- Allow authenticated users to read/download files
CREATE POLICY "Authenticated users can read account files"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'account-files');

-- Allow authenticated users to delete their files
CREATE POLICY "Authenticated users can delete account files"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'account-files');

-- Allow authenticated users to update files
CREATE POLICY "Authenticated users can update account files"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'account-files');
