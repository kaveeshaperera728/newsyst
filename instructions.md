# Technical Documentation: IT Inventory Management System (IT-IMS)

## 1. Project Overview
A client-side web application for the IT Division to track hardware lifecycle, staff assignments, repair history, and CCTV maintenance.
Now powered by **Supabase** (PostgreSQL) for backend persistence.

**Tech Stack:**
* **Frontend:** HTML5, Tailwind CSS
* **Logic:** JavaScript (ES6+), `supabase-js`
* **Backend:** Supabase (PostgreSQL)

---

## 2. Database Schema (Supabase)

### Core Tables
* **assets:**
  * `id` (bigint, PK)
  * `serialNumber`, `model`, `type`, `status` (Available/Issued/Repair/Scrap)
  * `specs_processor`, `specs_ram`, `specs_storage`, `specs_storage_2`...
* **staff:**
  * `id` (bigint, PK)
  * `employeeId`, `name`, `department`
* **assignments:**
  * `id` (bigint, PK)
  * `assetId` (FK -> assets), `staffId` (FK -> staff)
  * `issueDate`, `returnDate`
* **repairs:**
  * `id` (bigint, PK)
  * `assetId` (FK -> assets)
  * `faultDescription`, `partsReplaced`, `cost`, `date`, `technician`
* **cctv:**
  * `id` (bigint, PK)
  * `cameraLocation`, `status`, `floor` (text), `premise` (text)
  * `installDate`, `model`, `serialNumber`
* **accessories:**
  * `id` (bigint, PK)
  * `type`, `brand`, `model`, `serialNumber`, `status`
  * `quantity` (for cables/consumables), `assetId` (FK -> assets, optional)
* **accessory_logs:**
  * Log of accessory movements.
* **floors:**
  * `id` (bigint, PK)
  * `name`, `sort_order`

### Required Migrations
To ensure the application runs correctly, the following SQL scripts must be applied in your Supabase SQL Editor:
1. `supabase_schema.sql` (Initial setup)
2. `supabase_update_accessories_v2.sql` (Accessories module)
3. `supabase_update_cctv.sql` (CCTV basic updates)
4. `supabase_add_storage_specs.sql` (Asset specs)
5. `supabase_add_storage2.sql` (Secondary storage spec)
6. `supabase_add_premise.sql` (Multi-premise CCTV support)
7. `supabase_add_floors.sql` (Dynamic floor management)

---

## 3. Functional Modules

### A. Asset Management
* **Inventory CRUD:** Track full lifecycle of laptops and hardware.
* **Cannibalization:** Support for using parts from one asset to repair another.

### B. Staff & Assignments
* **Digital Handover:** Assign assets to staff.
* **PDF Forms:** Auto-generate handover forms for signature.
* **History:** Track strict timeline of who had what and when.

### C. CCTV Monitoring
* **Multi-Premise:** Manage cameras across multiple buildings or locations.
* **Dynamic Floors:** User-configurable floor plans per premise.
* **Status Tracking:** Stock, Active, Faulty, Scrap states.

### D. Accessories
* **Consumables & Peripherals:** Manage keyboards, mice, cables, monitoring stock levels.
* **Asset Allocation:** Link accessories (like docking stations) to specific main assets.