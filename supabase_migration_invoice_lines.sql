-- Migration: Create invoice_lines junction table
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/cnrpaedvqjvepwtypbmw/sql/new

CREATE TABLE IF NOT EXISTS invoice_lines (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  purchase_line_id uuid NOT NULL REFERENCES purchase_lines(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoice ON invoice_lines(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_lines_line ON invoice_lines(purchase_line_id);

-- RLS
ALTER TABLE invoice_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users full access" ON invoice_lines FOR ALL TO authenticated USING (true) WITH CHECK (true);
