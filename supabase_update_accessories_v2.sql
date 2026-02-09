-- Re-design Accessories to be individual items
-- First, clean up existing data or migration would be messy for this prototype switch
truncate table accessory_logs;
truncate table accessories cascade;

-- Modify accessories table
alter table accessories drop column if exists quantity;
alter table accessories drop column if exists name; -- We will use type/brand/model instead
alter table accessories drop column if exists description;

alter table accessories add column if not exists "serialNumber" text;
alter table accessories add column if not exists brand text;
alter table accessories add column if not exists model text;
alter table accessories add column if not exists status text default 'Available'; -- Available, Installed, Faulty
alter table accessories add column if not exists "assetId" bigint references assets(id); -- Currently installed on

-- We keep 'type' column from before (RAM, Storage, etc)

-- Update Logs to reference specific accessories better if needed, 
-- but the existing FK references accessories(id) which works for individual items too.
-- We might not need 'quantity_change' anymore in logs, just 'action'.
alter table accessory_logs drop column if exists quantity_change;
