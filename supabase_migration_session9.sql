-- ══════════════════════════════════════════════════════════════════════════
-- CRM-PIPE Session 9 — Migration SQL COMPLÈTE
-- Corrige TOUTES les tables/colonnes manquantes
-- À exécuter dans Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════════════════

-- ── 1. Colonnes manquantes sur user_profiles ──────────────────────────
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS job_title TEXT;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS mobile TEXT;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS location TEXT;

-- ── 2. Colonnes manquantes sur purchase_info ──────────────────────────
ALTER TABLE purchase_info ADD COLUMN IF NOT EXISTS payment_terms TEXT;

-- ── 3. Colonnes manquantes sur purchase_lines ─────────────────────────
ALTER TABLE purchase_lines ADD COLUMN IF NOT EXISTS warranty_months INT;
ALTER TABLE purchase_lines ADD COLUMN IF NOT EXISTS license_months INT;
ALTER TABLE purchase_lines ADD COLUMN IF NOT EXISTS warranty_end DATE;
ALTER TABLE purchase_lines ADD COLUMN IF NOT EXISTS license_end DATE;
ALTER TABLE purchase_lines ADD COLUMN IF NOT EXISTS warranty_expiry DATE;
ALTER TABLE purchase_lines ADD COLUMN IF NOT EXISTS license_expiry DATE;

-- ── 4. Table: deal_registrations ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS deal_registrations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  opportunity_id UUID REFERENCES opportunities(id) ON DELETE CASCADE,
  bu TEXT,
  card TEXT,
  platform TEXT,
  dr_number TEXT,
  expiry_date DATE,
  status TEXT DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE deal_registrations ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'deal_registrations' AND policyname = 'auth_all_dr') THEN
    CREATE POLICY "auth_all_dr" ON deal_registrations FOR ALL USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- ── 5. Table: expense_reports ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS expense_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_email TEXT NOT NULL,
  month INT,
  year INT,
  status TEXT DEFAULT 'brouillon',
  total_ttc NUMERIC DEFAULT 0,
  submitted_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE expense_reports ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'expense_reports' AND policyname = 'auth_all_er') THEN
    CREATE POLICY "auth_all_er" ON expense_reports FOR ALL USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- ── 6. Table: expense_lines ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS expense_lines (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  expense_report_id UUID REFERENCES expense_reports(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  description TEXT NOT NULL,
  amount_ttc NUMERIC NOT NULL DEFAULT 0,
  file_name TEXT,
  file_url TEXT,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE expense_lines ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'expense_lines' AND policyname = 'auth_all_el') THEN
    CREATE POLICY "auth_all_el" ON expense_lines FOR ALL USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- ── 7. Table: invoices ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  opportunity_id UUID REFERENCES opportunities(id) ON DELETE CASCADE,
  invoice_number TEXT,
  amount NUMERIC NOT NULL DEFAULT 0,
  issue_date DATE,
  due_date DATE,
  status TEXT DEFAULT 'emise',
  payment_terms TEXT,
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'invoices' AND policyname = 'auth_all_inv') THEN
    CREATE POLICY "auth_all_inv" ON invoices FOR ALL USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- ── 8. Table: project_services ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_services (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  opportunity_id UUID REFERENCES opportunities(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  assigned_to TEXT,
  bu TEXT,
  status TEXT DEFAULT 'planifie',
  start_date DATE,
  end_date DATE,
  sort_order INT DEFAULT 0,
  notes TEXT,
  prescription_status TEXT DEFAULT 'en_attente',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE project_services ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'project_services' AND policyname = 'auth_all_ps') THEN
    CREATE POLICY "auth_all_ps" ON project_services FOR ALL USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- ── 9. Table: support_tickets ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  opportunity_id UUID REFERENCES opportunities(id) ON DELETE CASCADE,
  account_id UUID REFERENCES accounts(id),
  title TEXT NOT NULL,
  description TEXT,
  type TEXT DEFAULT 'sav',
  priority TEXT DEFAULT 'normal',
  status TEXT DEFAULT 'ouvert',
  assigned_to TEXT,
  resolved_at TIMESTAMPTZ,
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'support_tickets' AND policyname = 'auth_all_st') THEN
    CREATE POLICY "auth_all_st" ON support_tickets FOR ALL USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- ── 10. Bucket expense-files (à créer dans Storage UI si pas fait) ───

-- ══════════════════════════════════════════════════════════════════════════
-- FIN MIGRATION SESSION 9
-- ══════════════════════════════════════════════════════════════════════════
