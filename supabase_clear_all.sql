-- Connect to your Supabase SQL Editor and run this to clear ALL data.
-- This will wipe all rows from the specified tables but keep the table structure (columns) intact.

TRUNCATE TABLE 
    accessory_logs,
    accessories,
    cctv_repairs,
    cctv,
    repairs,
    assignments,
    assets,
    staff
RESTART IDENTITY CASCADE;

-- RESTART IDENTITY resets the auto-incrementing primary keys (IDs) back to 1.
