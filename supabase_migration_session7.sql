-- ══════════════════════════════════════════════════════════════════════════
-- CRM-PIPE Session 7 — Migration SQL
-- À exécuter dans Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════════════════

-- ── 1. Table: prospect_contacts (si pas encore créée) ───────────────────
CREATE TABLE IF NOT EXISTS prospect_contacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  prospect_id UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  role TEXT,
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── 2. Table: events ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'utd', -- utd, workshop, conference, salon
  date_start DATE,
  date_end DATE,
  location TEXT,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'planifie', -- planifie, en_cours, termine
  budget NUMERIC(12,2),
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ
);

-- ── 3. Table: event_invitations ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS event_invitations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  contact_name TEXT,
  invited_by TEXT,
  attended BOOLEAN DEFAULT false,
  follow_up_status TEXT DEFAULT 'pending', -- pending, contacted, meeting_set, closed
  follow_up_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── 4. Table: team_messages (chat entre Nabil et Salim) ─────────────────
CREATE TABLE IF NOT EXISTS team_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_email TEXT NOT NULL,
  content TEXT NOT NULL,
  file_url TEXT,
  file_name TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── 5. Table: shared_files (fichiers partagés) ─────────────────────────
CREATE TABLE IF NOT EXISTS shared_files (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  uploaded_by TEXT NOT NULL,
  size INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── 6. Table: user_profiles (page profil) ────────────────────────────────
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  phone TEXT,
  role TEXT,
  department TEXT,
  avatar_url TEXT,
  bio TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ
);

-- ── 7. Storage buckets ──────────────────────────────────────────────────
-- Exécuter ces commandes dans l'interface Supabase Storage (pas SQL) :
-- Créer les buckets suivants si pas encore faits :
--   - profile-avatars (public)
--   - team-files (public)

-- ── 8. RLS Policies (désactivé pour simplifier, à activer si nécessaire) ─
ALTER TABLE prospect_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Policies permissives pour les utilisateurs authentifiés
CREATE POLICY "Auth users full access" ON prospect_contacts FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Auth users full access" ON events FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Auth users full access" ON event_invitations FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Auth users full access" ON team_messages FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Auth users full access" ON shared_files FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Auth users full access" ON user_profiles FOR ALL USING (auth.role() = 'authenticated');

-- ── 9. Realtime pour team_messages ──────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE team_messages;

-- ══════════════════════════════════════════════════════════════════════════
-- FIN MIGRATION
-- ══════════════════════════════════════════════════════════════════════════
