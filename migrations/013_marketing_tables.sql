-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 013: Marketing module tables
-- ═══════════════════════════════════════════════════════════════════════════

-- Marketing Campaigns
CREATE TABLE IF NOT EXISTS marketing_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'other', -- linkedin, email, event, website, referral, other
  status TEXT NOT NULL DEFAULT 'draft',  -- draft, active, completed, paused
  start_date DATE,
  end_date DATE,
  budget NUMERIC DEFAULT 0,
  leads_generated INT DEFAULT 0,
  impressions INT DEFAULT 0,
  clicks INT DEFAULT 0,
  notes TEXT,
  owner_email TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- LinkedIn Posts tracking
CREATE TABLE IF NOT EXISTS linkedin_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT,
  post_url TEXT,
  published_date DATE,
  status TEXT NOT NULL DEFAULT 'draft', -- draft, scheduled, published
  impressions INT DEFAULT 0,
  likes INT DEFAULT 0,
  comments INT DEFAULT 0,
  shares INT DEFAULT 0,
  leads INT DEFAULT 0,
  author_email TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Content Calendar
CREATE TABLE IF NOT EXISTS content_calendar (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'linkedin', -- linkedin, email, blog, event
  content_type TEXT NOT NULL DEFAULT 'post', -- post, article, newsletter, case_study, announcement, event_promo
  status TEXT NOT NULL DEFAULT 'idea',       -- idea, draft, scheduled, published
  scheduled_date DATE,
  assigned_to TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Add 'source' column to prospects if not exists (for lead attribution)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='prospects' AND column_name='source') THEN
    ALTER TABLE prospects ADD COLUMN source TEXT DEFAULT 'other';
  END IF;
END $$;

-- RLS Policies
ALTER TABLE marketing_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE linkedin_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_calendar ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users full access
CREATE POLICY "marketing_campaigns_all" ON marketing_campaigns FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "linkedin_posts_all" ON linkedin_posts FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "content_calendar_all" ON content_calendar FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE marketing_campaigns;
ALTER PUBLICATION supabase_realtime ADD TABLE linkedin_posts;
ALTER PUBLICATION supabase_realtime ADD TABLE content_calendar;
