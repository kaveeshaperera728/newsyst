-- Create new storage column and rename old one for clarity if needed, or just add secondary
ALTER TABLE assets ADD COLUMN IF NOT EXISTS "specs_storage_2" text;

-- Optional: rename specs_storage to specs_storage_1 for consistency, but might break existing JS reads
-- Let's keep `specs_storage` as primary for now to avoid breaking too much, 
-- or we can aliases it in JS. Let's just user specs_storage and specs_storage_2.
