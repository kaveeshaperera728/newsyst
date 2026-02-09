-- Add new fields to CCTV table for inventory and floor management
ALTER TABLE cctv ADD COLUMN IF NOT EXISTS "serialNumber" text;
ALTER TABLE cctv ADD COLUMN IF NOT EXISTS "model" text;
ALTER TABLE cctv ADD COLUMN IF NOT EXISTS "floor" text; -- 'Ground', '1st', '2nd', etc.
ALTER TABLE cctv ADD COLUMN IF NOT EXISTS "installDate" date;

-- Update status options to include inventory states if they don't exist
-- We will handle this in application logic, but 'In Stock', 'Damaged', 'Installed' are new expected states.
