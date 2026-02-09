-- Add premise column to cctv table
ALTER TABLE cctv
ADD COLUMN premise text DEFAULT 'Main Premises';

-- Update existing records if needed (optional)
UPDATE cctv SET premise = 'Main Premises' WHERE premise IS NULL;
