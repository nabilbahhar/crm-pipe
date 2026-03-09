-- Migration 010: Prospect contacts (multi-contacts par prospect)
-- Run this in Supabase SQL Editor (https://supabase.com/dashboard → SQL Editor)

-- 1. Table: prospect_contacts (multiple contacts per prospect, like account_contacts)
CREATE TABLE IF NOT EXISTS prospect_contacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  prospect_id UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  role TEXT,              -- ex: 'DSI', 'Acheteur', 'Dir. Technique'
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prospect_contacts_prospect ON prospect_contacts(prospect_id);

-- RLS: allow authenticated users
ALTER TABLE prospect_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "prospect_contacts_all" ON prospect_contacts
  FOR ALL USING (true) WITH CHECK (true);

-- Note: The main prospect fields (contact_name, contact_email, contact_phone, contact_role)
-- are kept as the primary contact for backward compatibility.
-- Additional contacts are stored in this table.
