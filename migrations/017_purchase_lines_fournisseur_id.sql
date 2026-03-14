-- Add fournisseur_id and selected_contact_ids to purchase_lines
ALTER TABLE purchase_lines ADD COLUMN IF NOT EXISTS fournisseur_id UUID REFERENCES suppliers(id);
ALTER TABLE purchase_lines ADD COLUMN IF NOT EXISTS selected_contact_ids TEXT;
