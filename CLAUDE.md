# MEWP Pre-Use Inspection App — Project Context

## What This App Does
A public web app (no user accounts) for UK construction sites to complete daily MEWP (Mobile Elevated Work Platform) pre-use inspections digitally, replacing the paper IPAF TE-1049-EN-V4.0 form.

## How It Works
- Site manager scans a QR code unique to their site → opens site dashboard
- Each MEWP has an NFC tag programmed with a unique URL
- Worker scans NFC tag → opens daily inspection form for that machine
- If already inspected today → shows "Already done" screen with details
- Worker completes 43-item checklist → data saves to Supabase
- Every Sunday → auto-generates weekly PDF → saves to Google Drive → Glide reads it

## Tech Stack
- Framework: Next.js (pages router, no TypeScript, no Tailwind)
- Database: Supabase (PostgreSQL)
- Deployment: Vercel
- QR codes: qrcode npm package
- Repo: GitHub, auto-deploys to Vercel on every push

## Environment Variables
NEXT_PUBLIC_SUPABASE_URL=https://wxnqkarbmrluclgwysrq.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
NEXT_PUBLIC_APP_URL=https://mewp-inspection.vercel.app

## Project Structure
mewp-inspection/
├── lib/
│   └── supabase.js
├── pages/
│   ├── check/[mewpId].jsx
│   └── site/[siteId].jsx
├── .env.local
└── CLAUDE.md

## Database Tables
- sites: id, name, location, postcode, manager_name, qr_code_url
- mewps: id, site_id, machine_ref, model, serial_number, nfc_url, active
- weekly_inspection_sheets: id, mewp_id, site_id, machine_ref, week_commencing, week_ending, supervisor_signoff_1/2_name/date, pdf_url, pdf_generated_at
- daily_inspection_entries: id, sheet_id, mewp_id, site_id, inspection_date, day_of_week, operator_name, pal_card_number, initialled, daily_status (pending/ok/fault)
- visual_check_results: id, entry_id, sheet_id, mewp_id, inspection_date, item_number (1-28), category, result (pass/fail)
- function_check_results: id, entry_id, sheet_id, mewp_id, inspection_date, item_number (29-43), ground_result, platform_result
- defect_log: id, entry_id, sheet_id, mewp_id, site_id, inspection_date, item_number, check_type, defect_details, date_noted, date_reported, engineer_name, date_repaired, further_notes, status (open/reported/repaired/closed)
- check_items: item_number (1-43 PK), check_type, category, description, has_gp

## Supabase Functions
- get_week_commencing(date): returns Monday of any given date
- get_or_create_weekly_sheet(p_mewp_id, p_site_id, p_machine_ref, p_date): finds or creates weekly sheet, returns sheet_id

## Supabase Views
- today_inspection_status: mewp + site + today entry + defect count
- weekly_operator_log: operator/PAL/status per day per sheet
- weekly_sheet_summary: all 43 items pivoted across 7 day columns for PDF generation

## Inspection Items
Visual checks 1-28 (single PASS/FAIL):
- Documentation: 1-3
- Wheels/Tyres: 4-6
- Engine/Power Source: 7-9
- Hydraulics: 10-11
- Hoses and Cables: 12-13
- Outriggers/Stabilisers: 14-16
- Chassis Boom Scissor: 17-19
- Platform or Cage: 20-25
- Decals and Signage: 26-28

Function checks 29-43 (PASS/FAIL for Ground AND Platform controls each)

## Form Flow (check/[mewpId].jsx)
Step 0: Operator name + PAL card
Step 1: Visual checks 1-28 (large PASS/FAIL toggles)
Step 2: Function checks 29-43 (G + P toggles)
Step 3: Review + describe faults
Submit writes to 5 tables: weekly sheet (RPC) → daily entry → 28 visual rows → 15 function rows → defect_log rows

## Site Dashboard (site/[siteId].jsx)
- Stats panel: Total / Done Today / Faults Today
- Progress bar
- Site QR code for printing
- MEWP list with today status
- Add MEWP modal
- NFC QR code per MEWP

## Design
- White/light theme for outdoor daylight use
- Blue #1d4ed8 primary, green #15803d pass, red #b91c1c fault
- Large PASS/FAIL toggles for construction workers
- system-ui font, mobile-first, no Tailwind

## What Still Needs Building
1. Sunday Supabase Edge Function: runs 23:59 every Sunday, queries weekly_sheet_summary, generates PDF matching IPAF TE-1049 layout, uploads to Google Drive, writes URL to Google Sheet for Glide
2. Defect management page: site managers view open defects, mark repaired, add engineer name and date
3. PWA support: manifest.json + service worker for offline capability

## Key Decisions
- No authentication, public URLs, security through UUID obscurity
- One inspection per MEWP per day enforced by UNIQUE constraint
- Visual checks stored as individual rows not JSON
- Function checks store ground_result and platform_result separately
- NFC URL: https://mewp-inspection.vercel.app/check/[uuid]
- Site URL: https://mewp-inspection.vercel.app/site/[uuid]
