-- Migration 009: Supplier contacts + Line-by-line tracking
-- Run this in Supabase SQL Editor (https://supabase.com/dashboard → SQL Editor)

-- 1. Table: supplier_contacts (multiple contacts per supplier)
CREATE TABLE IF NOT EXISTS supplier_contacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  contact_name TEXT NOT NULL,
  email TEXT,
  tel TEXT,
  role TEXT,              -- ex: 'commercial', 'technique', 'direction'
  brands TEXT,            -- ex: 'Fortinet, FortiGate' ou 'NetApp'
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supplier_contacts_supplier ON supplier_contacts(supplier_id);

-- RLS: allow authenticated users
ALTER TABLE supplier_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "supplier_contacts_all" ON supplier_contacts
  FOR ALL USING (true) WITH CHECK (true);

-- 2. Add tracking columns to purchase_lines
ALTER TABLE purchase_lines ADD COLUMN IF NOT EXISTS line_status TEXT DEFAULT 'pending';
ALTER TABLE purchase_lines ADD COLUMN IF NOT EXISTS eta DATE;
ALTER TABLE purchase_lines ADD COLUMN IF NOT EXISTS eta_updated_at TIMESTAMPTZ;
ALTER TABLE purchase_lines ADD COLUMN IF NOT EXISTS status_note TEXT;

-- Line statuses: pending, commande, sous_douane, en_stock, livre, pas_de_visibilite
-- These are set by Supply (Salim) and visible to BDM (Nabil) on deal detail page
