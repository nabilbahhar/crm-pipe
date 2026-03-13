-- 015: Add lost_reason + next_step_date to opportunities
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS lost_reason text;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS next_step_date date;
