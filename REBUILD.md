# MEWP Inspection App — Full Rebuild Guide

Use this as the `CLAUDE.md` in your new project. It documents every design decision,
workaround, and gotcha encountered while building the production app.

---

## What This App Does

A public web app (no user accounts for workers) for UK construction sites to complete
daily MEWP (Mobile Elevated Work Platform) pre-use inspections digitally, replacing the
paper IPAF TE-1049-EN-V4.0 form.

- Site manager scans a QR code → opens site dashboard
- Worker scans NFC tag on machine → opens daily inspection form
- Worker completes 43-item checklist, takes a photo, signs → data saves to Supabase
- PDF report generated immediately after each submission and stored in Supabase Storage
- Weekly PDF archived for compliance records

---

## 1. Tech Stack

### Framework
- **Next.js 16.2.4** — pages router (NOT app router). JSX files, no TypeScript in pages.
- No Tailwind. All styling is inline CSS using plain style objects.
- Font: `system-ui, -apple-system, sans-serif`

### package.json (exact versions)
```json
{
  "dependencies": {
    "@supabase/supabase-js": "^2.104.1",
    "docxtemplater": "^3.68.5",
    "next": "16.2.4",
    "pdf-lib": "^1.17.1",
    "pdfkit": "^0.18.0",
    "pizzip": "^3.2.0",
    "qrcode": "^1.5.4",
    "react": "19.2.4",
    "react-dom": "19.2.4",
    "signature_pad": "^5.1.3"
  },
  "devDependencies": {
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "pdf-parse": "^2.4.5",
    "typescript": "^5"
  }
}
```

**Note:** `pdfkit`, `docxtemplater`, `pizzip` are installed but unused in production.
Only `pdf-lib` is used for PDF generation. They can be omitted in a clean rebuild.

### Environment Variables
```
NEXT_PUBLIC_APP_URL=https://mewp.proliftingsoftware.app
NEXT_PUBLIC_SUPABASE_URL=https://[project-ref].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[anon JWT]
SUPABASE_SERVICE_ROLE_KEY=[service role JWT]
ADMIN_BYPASS_TOKEN=[random 32-char string]
```

---

## 2. Project Structure

```
mewp-inspection/
├── lib/
│   ├── supabase.js          # anon client (browser-safe)
│   ├── supabase-admin.js    # service role client (server-only)
│   ├── generateReport.js    # PDF build + upload (737 lines)
│   └── createTemplate.js    # Creates template.pdf + exports COORDS (529 lines)
├── pages/
│   ├── check/[mewpId].jsx   # Worker inspection form (728 lines)
│   ├── site/[siteId].jsx    # Site manager dashboard (1005 lines)
│   ├── login.jsx            # Supabase auth login
│   ├── admin/
│   │   ├── index.jsx        # Main admin dashboard
│   │   └── bypass.jsx       # Admin bypass token page
│   ├── site/
│   │   └── bypass.jsx       # Site bypass token page
│   └── api/
│       ├── trigger-pdf.js         # POST — triggers PDF for one inspection
│       ├── generate-report.js     # Cron-compatible PDF endpoint
│       ├── admin/
│       │   ├── add-site.js
│       │   ├── create-site-admin.js
│       │   ├── verify-bypass.js
│       │   ├── data.js
│       │   ├── archive-site.js
│       │   └── archive-site-admin.js
│       ├── site/
│       │   └── verify-bypass.js
│       └── cron/
│           └── weekly-archive.js  # stub, not active
├── public/
│   ├── logo.png
│   └── template.pdf         # REQUIRED — 2-page A4 PDF with placeholder text
├── supabase/
│   ├── add_is_archived_to_mewps.sql
│   └── storage-setup.sql
├── next.config.ts
└── CLAUDE.md
```

---

## 3. Supabase Database Schema

### Table: `sites`
| column | type | notes |
|---|---|---|
| id | uuid PK | gen_random_uuid() |
| name | text | Site name |
| location | text | Address |
| postcode | text | |
| manager_name | text | |
| qr_code_url | text | Full URL of this site's QR code PNG |
| is_archived | boolean | default false |
| created_at | timestamptz | default now() |

### Table: `mewps`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| site_id | uuid FK → sites | |
| machine_ref | text | e.g. "MEWP-01" |
| model | text | e.g. "Genie GS-2632" |
| serial_number | text | |
| nfc_url | text | Full URL: https://[app]/check/[id] |
| active | boolean | default true |
| is_archived | boolean | default false |
| thorough_exam_url | text | Public URL of uploaded certificate |
| thorough_exam_expiry | date | |
| thorough_exam_filename | text | Original filename |
| thorough_exam_uploaded_at | timestamptz | |
| created_at | timestamptz | |

### Table: `weekly_inspection_sheets`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| mewp_id | uuid FK → mewps | |
| site_id | uuid FK → sites | |
| machine_ref | text | Denormalised for speed |
| week_commencing | date | Monday of the week |
| week_ending | date | Sunday of the week |
| supervisor_signoff_1_name | text | |
| supervisor_signoff_1_date | date | |
| supervisor_signoff_2_name | text | |
| supervisor_signoff_2_date | date | |
| pdf_url | text | Public URL of generated PDF |
| pdf_generated_at | timestamptz | |

**UNIQUE constraint:** `(mewp_id, week_commencing)`

### Table: `daily_inspection_entries`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| sheet_id | uuid FK → weekly_inspection_sheets | |
| mewp_id | uuid FK → mewps | |
| site_id | uuid FK → sites | |
| inspection_date | date | |
| day_of_week | text | 'monday', 'tuesday', etc. (lowercase) |
| operator_name | text | |
| pal_card_number | text | nullable |
| initialled | boolean | always true on submit |
| daily_status | text | CHECK IN ('pending','ok','fault') |
| submitted_at | timestamptz | |
| mewp_owner | text | nullable — hire company name |
| photo_url | text | Public URL in mewp-photos bucket |
| signature_url | text | Public URL in signatures bucket |

**UNIQUE constraint:** `(mewp_id, inspection_date)` — enforces one inspection per machine per day.

### Table: `visual_check_results`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| entry_id | uuid FK → daily_inspection_entries | |
| sheet_id | uuid FK → weekly_inspection_sheets | |
| mewp_id | uuid FK → mewps | |
| inspection_date | date | |
| item_number | int | 1–28 |
| category | text | section ID, e.g. 'documentation', 'wheels_tyres' |
| result | text | CHECK IN ('pass','fail','na') |

### Table: `function_check_results`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| entry_id | uuid FK → daily_inspection_entries | |
| sheet_id | uuid FK → weekly_inspection_sheets | |
| mewp_id | uuid FK → mewps | |
| inspection_date | date | |
| item_number | int | 29–43 |
| ground_result | text | CHECK IN ('pass','fail','na') |
| platform_result | text | CHECK IN ('pass','fail','na') |

### Table: `defect_log`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| entry_id | uuid FK → daily_inspection_entries | |
| sheet_id | uuid FK → weekly_inspection_sheets | |
| mewp_id | uuid FK → mewps | |
| site_id | uuid FK → sites | |
| inspection_date | date | |
| item_number | int | 1–43 |
| check_type | text | 'visual' or 'function' |
| defect_details | text | |
| date_noted | date | Same as inspection_date |
| date_reported | date | nullable |
| engineer_name | text | nullable |
| date_repaired | date | nullable |
| further_notes | text | nullable |
| status | text | CHECK IN ('open','reported','repaired','closed') |

### Table: `check_items` (reference data, seed once)
| column | type | notes |
|---|---|---|
| item_number | int PK | 1–43 |
| check_type | text | 'visual' or 'function' |
| category | text | section label |
| description | text | Full question text |
| has_gp | boolean | true for items 29–43 |

### Table: `user_profiles`
| column | type | notes |
|---|---|---|
| id | uuid PK FK → auth.users | |
| name | text | |
| email | text | |
| role | text | CHECK IN ('main_admin','site_admin') |
| site_id | uuid FK → sites | nullable (null for main_admin) |
| must_change_password | boolean | default true for created accounts |
| is_archived | boolean | default false |

### Views

**`today_inspection_status`** — joins mewps + sites + today's entry + defect count.
Used on the site dashboard to show each MEWP's status for today.

**`weekly_operator_log`** — one row per day per sheet: day_of_week, operator_name,
pal_card_number, daily_status. Used in PDF generation.

**`weekly_sheet_summary`** — all 43 items pivoted across 7 day columns.
Columns: `item_number`, `mon_result`, `tue_result`, ... `sun_result` (visual items),
`mon_ground_result`, `mon_platform_result`, ... `sun_platform_result` (function items).
Used in PDF generation.

### RPC Functions

**`get_week_commencing(p_date date) → date`**
Returns the Monday of the week containing the given date.
```sql
RETURN date_trunc('week', p_date::timestamp)::date;
```

**`get_or_create_weekly_sheet(p_mewp_id uuid, p_site_id uuid, p_machine_ref text, p_date date) → uuid`**
Finds or creates the weekly sheet for this MEWP and week. Returns the sheet_id.
Uses INSERT ... ON CONFLICT DO NOTHING then SELECT.

---

## 4. Supabase Storage Buckets

All buckets are **public** (public read). Uploads go via the anon key from the browser,
except `weekly-reports` which is written by the service role from the API.

### `mewp-photos`
- Path: `{siteId}/{mewpId}/{inspection_date}.jpg`
- Stores: JPEG photos taken by workers during inspection
- RLS: anon INSERT allowed, public SELECT
- `upsert: true` — one photo per MEWP per day; retaking replaces the file

### `signatures`
- Path: `{siteId}/{mewpId}/{inspection_date}.png`
- Stores: PNG signature images from SignaturePad
- RLS: anon INSERT allowed, public SELECT
- `upsert: true` — same one-per-day uniqueness

### `weekly-reports`
- Path: `{siteId}/{mewpId}/{week_commencing}.pdf`
- Stores: Generated weekly inspection PDFs
- RLS: service role only for INSERT/UPDATE, public SELECT
- Always `remove()` then `upload()` (not upsert) to guarantee a fresh file

### `thorough-exams`
- Path: `{mewpId}/{timestamp}.{ext}`
- Stores: Thorough examination certificates (PDF, JPG, PNG)
- RLS: anon INSERT allowed, public SELECT
- Uploaded from site dashboard by site admin

---

## 5. Authentication & Access Control

### Worker access (no auth)
- `/check/[mewpId]` — fully public, anyone with the URL can access
- Security is through UUID obscurity — the mewpId is a UUID that's only known
  because it's embedded in the NFC tag URL

### Site dashboard access
- `/site/[siteId]` — public read; the "Add MEWP", "Upload Exam", "Archive" buttons
  only appear when the viewer is authenticated as an admin for that site
- Site admins log in via `/login`, then are redirected to `/site/[siteId]` based on
  their `user_profiles.site_id`

### Admin access
Two methods, used in parallel:

**Supabase Auth (Supabase email/password):**
- `/login` — Supabase `signInWithPassword()`
- After login, reads `user_profiles` to get role and site_id
- `main_admin` → `/admin`
- `site_admin` → `/site/[their site_id]`
- Newly created accounts have `must_change_password: true` → forced password change on login
- Session stored in Supabase's default localStorage mechanism

**Bypass token (passwordless):**
- `ADMIN_BYPASS_TOKEN` env var (server-side only) grants main admin access
- GET `/admin/bypass?token=XXX` → API verifies token → sets `localStorage.adminBypass = "1"` → redirects to `/admin`
- GET `/site/bypass?token=XXX&site=[siteId]` → verifies token + site → redirects to `/site/[siteId]`
- The site dashboard reads `localStorage.adminBypass` to show admin controls

---

## 6. QR Code & NFC Flow

### NFC tags
- Each MEWP gets an NFC tag programmed with the URL: `https://[app]/check/[mewpId]`
- Worker taps phone to NFC tag → browser opens `/check/[mewpId]` directly
- No app required — works in mobile Safari and Chrome via NFC web API / native NFC scan

### QR codes (for site dashboard)
Generated server-side on demand using the `qrcode` npm package:
```js
import QRCode from "qrcode";
const dataUrl = await QRCode.toDataURL(url, { width: 400, margin: 2 });
```

- Site QR code URL: `https://[app]/site/[siteId]`
- MEWP QR code URL: `https://[app]/check/[mewpId]` (same URL as NFC)
- Both are rendered as `<img src={dataUrl}>` on the site dashboard
- "Download QR Code" buttons use a hidden `<a download>` with the data URL

### Scan flow
1. Worker scans NFC tag (or QR) → `/check/[mewpId]`
2. Page loads, queries `mewps` and `daily_inspection_entries` for today
3. If entry exists for today → shows "Already Inspected" screen
4. If no entry → shows the 4-step form

---

## 7. Daily Inspection Form — Full Detail

File: `/pages/check/[mewpId].jsx`

### States
- `pageStatus`: loading | not_found | form | submitting | submit_error | already_done | done
- `step`: 0 (operator details) | 1 (visual checks) | 2 (function checks) | 3 (review + sign)
- `visual`: `{ [itemId]: 'pass' | 'fail' | 'na' | null }`
- `fnChecks`: `{ [itemId]: { ground: 'pass'|'fail'|'na'|null, platform: 'pass'|'fail'|'na'|null } }`
- `defects`: `{ [itemId]: string }` — free text per failed item
- `photo`: File object from camera
- `sigPadRef`: ref to SignaturePad instance

### Step 0 — Operator Details
Fields:
- **Your Full Name** (required — submit button disabled until non-empty)
- **PAL Card Number** (optional)
- **MEWP Owner (Company)** (optional — hire company name)

Also shows `ThoroughExamCard` if the MEWP has an exam certificate.

### Step 1 — Visual Checks (items 1–28)
- Grouped into 9 sections with emoji headers
- Each item has a 3-button toggle: ✓ PASS / ✗ FAIL / N/A
- Toggle is a deselect toggle — tapping the active state deselects it
- Orange highlight + "Answer required" shown on missing items when "Next" is clicked
- Progress bar shows % of items answered
- Validation: ALL 28 items must be answered before proceeding

### Step 2 — Function Checks (items 29–43)
- Each item has TWO rows of toggles: G (Ground Control) and P (Platform Control)
- Same PASS/FAIL/N/A options for each
- Both G and P must be answered for every item before proceeding
- Orange highlight shows separately on missing G or P

### Step 3 — Review + Sign
Shows:
1. Summary card (machine, site, operator, fault count)
2. Fault description textareas for each failed item (auto-populated with default text)
3. **Photo capture** — `<input type="file" accept="image/*" capture="environment">`
   - `capture="environment"` forces the rear-facing camera, no file picker
   - Preview shown after capture
   - **Required** — cannot submit without photo
4. **Signature pad** — `signature_pad` library on a `<canvas>`
   - Canvas MUST have pixel dimensions set from `offsetWidth`/`offsetHeight` before initialising
   - **Required** — cannot submit without signature
5. Submit button colour: green (all clear) or red (faults)

### Submit flow (`handleSubmit`)

**CRITICAL WORKAROUND — capture signature before any state change:**
```js
// Read sigPadRef.current BEFORE calling setPageStatus("submitting")
// because the canvas unmounts on re-render, triggering the useEffect
// cleanup that calls sigPadRef.current.off() and sets it to null.
const sigDataUrl = (sigPadRef.current && !sigPadRef.current.isEmpty())
  ? sigPadRef.current.toDataURL("image/png")
  : null;
```

Order of operations:
1. Validate: photo present + signature not empty → show errors and scroll if not
2. Set `pageStatus = "submitting"` (shows spinner, unmounts form)
3. Call `supabase.rpc("get_or_create_weekly_sheet", {...})` → get sheetId
4. Upload photo to `mewp-photos` bucket and signature to `signatures` bucket **in parallel**
5. INSERT into `daily_inspection_entries` (includes `photo_url` and `signature_url` in the initial insert)
6. INSERT 28 rows into `visual_check_results`
7. INSERT 15 rows into `function_check_results`
8. If any faults: INSERT rows into `defect_log`
9. POST to `/api/trigger-pdf` and await (fire-and-wait, not fire-and-forget)
10. Set `pageStatus = "done"`

**Why upload before INSERT:** the anon RLS only allows INSERT on `daily_inspection_entries`,
not UPDATE. So photo/signature URLs must be in the initial INSERT, not a follow-up UPDATE.

**Error recovery:** if any step fails after the entry was inserted, the entry is deleted:
```js
if (entryId) {
  await supabase.from("daily_inspection_entries").delete().eq("id", entryId);
}
```

### Date handling
All date strings are `YYYY-MM-DD` in local time using:
```js
function toLocalDateStr(date) {
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`;
}
```
**Never use** `new Date().toISOString().split('T')[0]` in the browser — in UK winter (UTC+0)
this works, but in summer (UTC+1) it gives yesterday's date in UTC. Always use local date.

---

## 8. All 43 Inspection Items

### Visual Checks (items 1–28, single PASS/FAIL/N/A)

**Documentation (1–3):**
1. Statutory examination / periodic inspection in date
2. Manufacturer's operator manual with the machine
3. Rescue plan in place and name of nominated ground rescue person identified

**Wheels/Tyres (4–6):**
4. No missing, loose or damaged nuts and retainers
5. Tyre pressure (pneumatic, foam filled or solid)
6. Condition (no cuts, splits, exposed braiding, damaged rims)

**Engine/Power Source (7–9):**
7. Fluid levels (engine oil, coolant, fuel)
8. No fluid leakage on ground and around engine
9. Battery (electrolyte, connections, terminals, security and charging plug condition)

**Hydraulics (10–11):**
10. Hydraulic fluid level
11. No leaks (hoses, pipe connections, rams, cylinders)

**Hoses and Cables (12–13):**
12. Security and condition (no cuts, chaffing, bulges)
13. Power track cable trays (free from damage and debris)

**Outriggers/Stabilisers (14–16):**
14. General condition, pins/retainers, footplate
15. Spreader plates (present, condition, secure for travel)
16. Interlocks (functioning, engaged)

**Chassis, Boom & Scissor (17–19):**
17. General condition (no damage, misalignment, corrosion)
18. No cracks in weld
19. Pins, retainers and chains (good condition, secure)

**Platform or Cage (20–25):**
20. Canopies, guards, engine covers (security and condition)
21. Steps for access/egress secure (undamaged, clear of debris)
22. Entrance gate, guard rails and retaining pins
23. Harness / lanyard anchorage points
24. Clear of rubbish, debris and obstructions
25. Secondary Guarding

**Decals and Signage (26–28):**
26. ID/compliance plate, safety, warning and information decals (all present, legible)
27. Controls (identification decals, directional arrows clearly marked)
28. Platform loads (SWL, max. wind speed, max. number of persons clearly marked)

### Function Checks (items 29–43, PASS/FAIL/N/A for Ground AND Platform)
29. Security device (power isolator, keypad, smart card)
30. Function enable works correctly (ignition key, foot switch, hold to run device)
31. Emergency stops and emergency / auxiliary lowering system are fully functional
32. All switches, function controls (move freely, return to neutral, operate as expected)
33. Elevating functions (raise, lower, slew, tele-out, tele-in)
34. Travel functions (forward, reverse, steer, brakes)
35. Elevated drive speed activates when platform is raised (reduced or prevented)
36. Lights, beacons, warning devices
37. Audible alarms (tilt, descent and travel)
38. Interlock, limit switches (e.g. descent, SWL, outreach, rotation)
39. Pothole protection device (fully deploys and retracts)
40. Oscillating axle locks and extending axles operate correctly
41. Accessories, power to platform, extending decks
42. Jacks-legs, stabilisers, outriggers, levelling devices
43. Secondary guarding (function, operation, reset)

---

## 9. PDF Generation — Complete Detail

### Overview
The PDF system has two layers:
1. **Template layer** (`createTemplate.js`) — programmatically creates a 2-page A4 PDF
   with placeholder text like `{{MON_01}}`, `{{TUE_29_G}}`, etc. at precise coordinates.
   Run once to regenerate `public/template.pdf`.
2. **Report layer** (`generateReport.js`) — loads `template.pdf`, strips the placeholder
   text, stamps real data at those coordinates, then appends dynamic daily summary pages.

### Library
**`pdf-lib`** (v1.17.1) — pure JavaScript PDF manipulation. No Node native modules,
works in both browser and server environments. Used for both template creation and report generation.

**Coordinate system:** pdf-lib uses bottom-left origin. `y=0` is the bottom of the page.
- Page 1: A4 landscape = 841.92 × 595.32 pt
- Dynamic pages: A4 portrait = 595.32 × 841.92 pt

### Template structure (`public/template.pdf`)
Created by running `createTemplate.js`. The template has **2 pages**:

**Page 0 (landscape):**
- Header band: "MEWP PRE-USE INSPECTION CHECKLIST", machine ref placeholder, week commencing placeholder
- Column headers: 7 day columns, each split into G (Ground) and P (Platform) sub-columns
- Visual checks 1–28: each item is a row; 7 cells across for days
- Function checks 29–42: each item is TWO sub-rows (G and P)
- Bottom strip: "ALL FAULTS TO BE REPORTED..." warning, "Initialled:" per day

**Page 1 (landscape):**
- Function check 43 (overflows from page 0)
- Initials row per day

**Note:** The original template design included a Page 2 (portrait daily record). This page
is **always removed** by `generateReport.js` after stamping (via `pdfDoc.removePage(2)`),
replaced by dynamic daily summary pages.

### Placeholder text stripping (`stripPlaceholders`)
The template PDF contains visible placeholder text like `{{MON_01}}`. Before stamping,
this must be erased. The approach:
1. For each page, get the Contents stream reference(s)
2. Decode the raw PDF stream bytes (zlib-inflate)
3. Parse the stream looking for BT...ET text blocks containing `{` or `}`
4. Replace the text content inside those blocks with spaces of equal length
5. Re-compress with zlib and update the stream length

This preserves all layout/grid lines while removing only the placeholder text.

### Stamping results
After stripping, data is written at hardcoded coordinates extracted to match the template
layout exactly. The key coordinate maps:

```js
// Visual check Y positions (items 1–28), one Y per row
const VIS_Y = [null, 527, 516, 506, 495, 485, 474, 464, 453, 443, 432, 421, ...];

// Function check Y positions and which page
const FUNC = {
  29: { y: 223, page: 0 }, 30: { y: 206, page: 0 }, ...
  43: { y: 562, page: 1 },
};

// Day X positions (centre of each day column)
const DAY_X = { Mon: 442, Tue: 492, Wed: 541, Thu: 591, Fri: 640, Sat: 690, Sun: 740 };

// Function check ground/platform offsets from column centre
const FUNC_G_OFFSET = -7;  // Ground: left of centre
const FUNC_P_OFFSET = +17; // Platform: right of centre
```

### Dynamic daily summary pages
Appended after the 2 template pages. One block per day that had an inspection:
- Dark header bar: day name + date
- Info row: operator name, PAL card, submission time, status (ALL CLEAR / FAULTS FOUND)
- MEWP Owner row (if provided)
- **Photo + signature side by side** (if available)
- Fault table (if any faults): item #, description, fault details, status

**Image embedding order matters:** pdf-lib requires calling `embedJpg`/`embedPng` before
calling `drawImage`. All images are pre-embedded in a first pass, then drawn in a second pass.

**JPEG/PNG fallback pattern:**
```js
// Photos: try JPEG first (camera output), fall back to PNG
try {
  embedded.photo = await pdfDoc.embedJpg(bytes);
} catch {
  embedded.photo = await pdfDoc.embedPng(bytes);
}

// Signatures: try PNG first (SignaturePad outputs PNG), fall back to JPEG
try {
  embedded.signature = await pdfDoc.embedPng(bytes);
} catch {
  embedded.signature = await pdfDoc.embedJpg(bytes);
}
```

### Data fetched for each report (`generateReport.js`)
1. `weekly_inspection_sheets` joined to `mewps.machine_ref/model/serial_number` and `sites.name/location`
2. `weekly_sheet_summary` view — all 43 item results across 7 days for this sheet
3. `weekly_operator_log` view — operator/PAL/status per day
4. `daily_inspection_entries` — direct table query for the week (overrides view data,
   also fetches `photo_url`, `signature_url`, `mewp_owner`, `submitted_at`)
5. Fetch image bytes from photo_url and signature_url URLs in parallel (non-fatal if missing)
6. `defect_log` — all defects for this MEWP in this week

### Trigger mechanism
PDF is generated immediately after form submission:
```js
// In check/[mewpId].jsx after all data inserts:
await fetch("/api/trigger-pdf", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ mewp_id: mewpId, sheet_id: sheetId }),
});
```

The API route (`pages/api/trigger-pdf.js`) resolves `week_commencing` from the sheet,
then calls `generateReport(mewpId, weekCommencing)`.

### Upload & URL storage
```js
const filePath = `${siteId}/${mewpId}/${weekCommencing}.pdf`;

// Always delete first, then upload (don't use upsert — it can fail on existing files)
await supabase.storage.from("weekly-reports").remove([filePath]);
await supabase.storage.from("weekly-reports").upload(filePath, pdfBuffer, {
  contentType: "application/pdf",
  upsert: false,
});

const { data: { publicUrl } } = supabase.storage.from("weekly-reports").getPublicUrl(filePath);

await supabase.from("weekly_inspection_sheets")
  .update({ pdf_url: publicUrl, pdf_generated_at: new Date().toISOString() })
  .eq("id", sheet.id);
```

### `day_of_week` normalisation
Multiple data sources store day names differently. Always normalise before use:
```js
const DAY_NORM = {
  monday:'Mon', tuesday:'Tue', wednesday:'Wed', thursday:'Thu',
  friday:'Fri', saturday:'Sat', sunday:'Sun',
  mon:'Mon', tue:'Tue', wed:'Wed', thu:'Thu', fri:'Fri', sat:'Sat', sun:'Sun',
};
function normDay(val) {
  return val ? DAY_NORM[String(val).toLowerCase()] ?? null : null;
}
```

Also derive day from date as a fallback:
```js
function dayFromDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  return ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][(d.getUTCDay() + 6) % 7];
}
```

**Always use UTC getters** (`getUTCDay`, `getUTCDate`, etc.) when working with date strings,
to avoid off-by-one errors in UK summer time (UTC+1).

---

## 10. Site Dashboard (`site/[siteId].jsx`)

- Stats panel: Total MEWPs / Done Today / Faults Today
- Progress bar
- Site QR code for printing
- MEWP list — each card shows: machine ref + serial, today's status badge, operator name if done,
  fault count, weekly 7-day dot tracker, thorough exam status and expiry
- Per-MEWP: PDF report links (weekly), QR download button, thorough exam upload
- Add MEWP modal (admin only)
- Archive/restore toggle (admin only)
- Real-time updates via Supabase channel subscriptions

### Thorough exam upload
- Site admin uploads a PDF/image from the MEWP card
- Stored in `thorough-exams` bucket at `{mewpId}/{timestamp}.{ext}`
- `mewps` table updated with `thorough_exam_url`, `thorough_exam_expiry`, `thorough_exam_filename`, `thorough_exam_uploaded_at`
- Expiry date shown with red "Expired" badge if past today
- Expiry warning also shown on the worker inspection form (`ThoroughExamCard` component)

---

## 11. Admin Dashboard (`admin/index.jsx`)

Access: `main_admin` role OR `ADMIN_BYPASS_TOKEN`.

Features:
- List all sites (active + archived)
- Create new site (name, location, postcode, manager name)
- Archive/restore sites
- List all site admins
- Create site admin: name, email, password → calls `/api/admin/create-site-admin`
  which uses the service role client to call `supabase.auth.admin.createUser()`
  and inserts a `user_profiles` row
- Archive/restore site admins

---

## 12. Design System

All inline CSS, no external stylesheet framework.

### Colours
```js
const PRIMARY    = "#d02a35";  // red — topbars, primary buttons
const PASS_GREEN = "#15803d";  // green — pass state, all-clear
const FAULT_RED  = "#b91c1c";  // red — fault state, errors
const GRAY_TEXT  = "#6b7280";  // muted labels
const LIGHT_BG   = "#f3f4f6";  // page background
const CARD_BG    = "#ffffff";  // card background
const BORDER     = "#e5e7eb";  // card borders, input borders
```

### Key UI patterns
- **Toggle buttons:** 3-option PASS/FAIL/N/A as large touchable buttons with coloured
  active state, grey inactive state. Minimum height 0.9rem padding for construction gloves.
- **Progress bar:** 8px height, animated width transition
- **Error highlighting:** orange `boxShadow: "inset 0 0 0 2px #f97316"` on missing items
- **Cards:** white bg, `borderRadius: 12px`, `boxShadow: "0 1px 3px rgba(0,0,0,0.08)"`
- **Card headers:** coloured background band with emoji icon + uppercase bold label
- **Sticky topbar:** `position: sticky, top: 0, zIndex: 100`

---

## 13. Known Issues & Workarounds

### 1. Signature captured before state change
**Problem:** Clicking submit calls `setPageStatus("submitting")`, which triggers a
React re-render. This unmounts the canvas element, which triggers the `useEffect`
cleanup that calls `sigPadRef.current.off()` and sets `sigPadRef.current = null`.
By the time the async upload code tries to read the signature, it's null.

**Fix:** Capture the signature data URL synchronously **before** any `setState` call:
```js
async function handleSubmit() {
  // MUST be first — reads from sigPadRef.current before the canvas unmounts
  const sigDataUrl = (sigPadRef.current && !sigPadRef.current.isEmpty())
    ? sigPadRef.current.toDataURL("image/png") : null;
  const photoFile = photo; // also capture photo ref
  // ... validation ...
  setPageStatus("submitting"); // this unmounts the canvas — too late to read sigPadRef after this
}
```

### 2. Canvas dimensions for SignaturePad
**Problem:** If you set `width: "100%"` in CSS and initialise SignaturePad without setting
`canvas.width` / `canvas.height` from the actual pixel dimensions, the drawing coordinates
are wrong — the signature appears squished or offset.

**Fix:** Before constructing SignaturePad, set canvas pixel dimensions from layout dimensions:
```js
canvas.width  = canvas.offsetWidth  || 320;
canvas.height = canvas.offsetHeight || 160;
sigPadRef.current = new SignaturePad(canvas, { ... });
```

### 3. SignaturePad dynamic import (SSR)
**Problem:** `signature_pad` uses `window` and cannot be imported at module level in Next.js
(SSR will fail with "window is not defined").

**Fix:** Dynamic import inside a `useEffect`:
```js
useEffect(() => {
  if (step !== 3) return;
  requestAnimationFrame(() => {
    import("signature_pad").then(({ default: SignaturePad }) => {
      sigPadRef.current = new SignaturePad(canvasRef.current, { ... });
    });
  });
}, [step]);
```
The `requestAnimationFrame` ensures the canvas has been painted and has real layout dimensions.

### 4. Photo URL in initial INSERT
**Problem:** The anon RLS policy only allows INSERT on `daily_inspection_entries`, not UPDATE.
If photos are uploaded after the entry is inserted and then you try to UPDATE the entry
with the URLs, it fails with a permissions error.

**Fix:** Upload photos and signatures **before** inserting the entry, then include the URLs
in the initial INSERT. Both uploads run in parallel:
```js
await Promise.all(uploads);
// Now both photoUrl and signatureUrl are set
await supabase.from("daily_inspection_entries").insert({ ..., photo_url: photoUrl, signature_url: signatureUrl });
```

### 5. PDF coordinate extraction
**Problem:** Hardcoded coordinates in `generateReport.js` must exactly match where the
template was drawn. If the template is regenerated with different layout parameters,
all coordinates are wrong and results are stamped in the wrong places.

**Fix:** `createTemplate.js` exports a `COORDS` object and an `ITEM_DESC` object.
`generateReport.js` imports `ITEM_DESC` from `createTemplate.js`. The actual pixel
coordinates in `generateReport.js` (`VIS_Y`, `FUNC`, `DAY_X`) were extracted by
visual inspection of the generated template and validated by test runs. They are
separate from `COORDS` because the template was already locked before the extraction
approach was finalised — in a clean rebuild, you could use the COORDS map directly.

### 6. Template placeholder stripping
**Problem:** The template PDF has visible `{{KEY}}` placeholder text. If you just stamp
over it without erasing, both the placeholder and the real value appear on the same spot.

**Fix:** The `stripPlaceholders()` function decodes each page's content stream, regex-matches
BT...ET text blocks that contain `{` or `}`, and replaces the text content with equal-length
spaces. This preserves the stream structure so pdf-lib doesn't get confused.

### 7. PDF `remove()` before `upload()` 
**Problem:** Using `upsert: true` on an existing storage path can fail intermittently
when Supabase Storage considers the file "already exists" and the conditional write fails.

**Fix:** Always explicitly `remove([filePath])` before `upload(..., { upsert: false })`.

### 8. `day_of_week` inconsistency
**Problem:** Different queries return `day_of_week` in different formats — the view
`weekly_operator_log` returns `'monday'` (lowercase full), the direct table returns
whatever was inserted (also lowercase full), but the PDF code uses `'Mon'` (3-letter).

**Fix:** Always normalise via `normDay()` helper. Also derive from date as fallback
via `dayFromDate()` using UTC getters.

### 9. UTC dates in PDF generation
**Problem:** `new Date('2024-06-15').getDay()` returns the wrong day in UK summer (BST = UTC+1)
because JS parses date-only strings as UTC midnight, then `getDay()` uses local time.
In UK summer, UTC midnight is 23:00 the previous day local time.

**Fix:** Always use UTC getters when working with date strings:
```js
const d = new Date(dateStr + 'T00:00:00Z'); // force UTC
return ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][(d.getUTCDay() + 6) % 7];
```

### 10. Image embedding before drawing (pdf-lib)
**Problem:** pdf-lib throws if you call `page.drawImage(img, ...)` where `img` was
embedded in a different PDF document (or if you try to draw before embedding).

**Fix:** Embed all images into the document in one pass, storing references, then
draw in a second pass. Never pass raw bytes to `drawImage` — only use embedded image objects.

### 11. Supabase Storage public URL format
The public URL from `getPublicUrl()` includes the full path including the bucket name.
The URL never expires (public buckets). When the same file is replaced (same path),
the CDN may cache the old version briefly — appending `?t=timestamp` as a cache-buster
is optional but useful for immediately-visible updates.

---

## 14. Deployment

- **Host:** Vercel (auto-deploy on push to `main`)
- **Build command:** `next build` (default)
- **Framework detection:** Next.js (Vercel auto-detects)
- **Node version:** 20.x (set in Vercel project settings)
- **Environment variables:** set in Vercel dashboard (not committed)

### Vercel env vars to set:
```
NEXT_PUBLIC_APP_URL          (production URL)
NEXT_PUBLIC_SUPABASE_URL     (your Supabase project URL)
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY    (server-only, not NEXT_PUBLIC_)
ADMIN_BYPASS_TOKEN            (server-only, not NEXT_PUBLIC_)
```

### Vercel function timeout
PDF generation can take 5–15 seconds (fetching images, building PDF, uploading).
The default Vercel function timeout is 10s on Hobby, 300s on Pro.
If on Hobby, you may need to optimise or upgrade to avoid timeout on the PDF generation call.

---

## 15. What Still Needs Building

1. **Weekly Sunday auto-archive:** Supabase Edge Function stub exists at
   `/supabase/functions/weekly-report/index.ts` but is not active.
   Should run at 23:59 every Sunday, call `generateReport` for all MEWPs
   with activity that week, upload to storage.

2. **Defect management page:** Site managers need to mark defects as repaired,
   add engineer name, date repaired. Currently defects can only be viewed,
   not updated, from the dashboard.

3. **PWA support:** `manifest.json` + service worker for offline capability.
   Workers often have poor site connectivity. The form could cache offline and
   sync when connection returns.

4. **Email/SMS notifications for faults:** When a fault is logged, send alert
   to site manager.

---

## 16. Step-by-Step Rebuild

```bash
# 1. Create project
npx create-next-app@16.2.4 --no-typescript --no-app my-mewp-app
# (or with TypeScript if you prefer, but keep pages router)

# 2. Install dependencies
npm install @supabase/supabase-js pdf-lib signature_pad qrcode

# 3. Set up Supabase
# - Create project at supabase.com
# - Run schema migrations in the SQL editor (tables listed in section 3)
# - Create the 4 storage buckets with correct RLS policies
# - Create the 2 RPC functions
# - Create the 3 views
# - Seed check_items table with 43 rows

# 4. Copy source files
# - lib/supabase.js, lib/supabase-admin.js, lib/generateReport.js, lib/createTemplate.js
# - pages/check/[mewpId].jsx
# - pages/site/[siteId].jsx
# - pages/api/trigger-pdf.js
# - (plus admin/login pages if needed)

# 5. Generate template.pdf
node -e "require('./lib/createTemplate').createTemplate()"
# This creates public/template.pdf

# 6. Set env vars in .env.local and in Vercel dashboard

# 7. Create first site + MEWP in Supabase, get the MEWP UUID,
#    visit https://yourapp.vercel.app/check/[uuid] to test the form
```

### Supabase RLS Policy checklist
- `sites`: public SELECT, service role INSERT/UPDATE
- `mewps`: public SELECT, service role INSERT/UPDATE  
- `weekly_inspection_sheets`: public SELECT, service role INSERT/UPDATE (also anon INSERT via RPC)
- `daily_inspection_entries`: anon INSERT, public SELECT
- `visual_check_results`: anon INSERT, public SELECT
- `function_check_results`: anon INSERT, public SELECT
- `defect_log`: anon INSERT, public SELECT, service role UPDATE
- `user_profiles`: authenticated SELECT (own row), service role INSERT/UPDATE
- Storage `mewp-photos`: anon INSERT, public SELECT
- Storage `signatures`: anon INSERT, public SELECT
- Storage `weekly-reports`: service role INSERT/DELETE, public SELECT
- Storage `thorough-exams`: anon INSERT, public SELECT

---

## 17. Supabase Clients

```js
// lib/supabase.js — browser-safe anon client
import { createClient } from "@supabase/supabase-js";
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// lib/supabase-admin.js — server-only service role client
const { createClient } = require("@supabase/supabase-js");
function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}
module.exports = { adminClient };
```

Do NOT expose `SUPABASE_SERVICE_ROLE_KEY` to the browser. Only use the admin client
in API routes (`pages/api/`) and `lib/generateReport.js` (called from API routes only).
