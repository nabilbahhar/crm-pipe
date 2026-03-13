-- 016: Add segment column to prospects (align with accounts)
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS segment text DEFAULT 'Privé';

-- Migrate existing type values to segment
UPDATE prospects SET segment = CASE
  WHEN type = 'Marché Public' THEN 'Public'
  WHEN type = 'Prescripteur' THEN 'Semi-public'
  ELSE 'Privé'
END;
