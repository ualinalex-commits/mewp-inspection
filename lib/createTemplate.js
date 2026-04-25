'use strict';

const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const fs   = require('fs');
const path = require('path');

// ─── Page dimensions ──────────────────────────────────────────────────────────
const PW  = 841.92;  // A4 landscape (page 1)
const PH  = 595.32;
const PW2 = 595.32;  // A4 portrait  (page 2)
const PH2 = 841.92;

// ─── Colours ──────────────────────────────────────────────────────────────────
const BLACK    = rgb(0,    0,    0   );
const WHITE    = rgb(1,    1,    1   );
const RED      = rgb(0.72, 0.11, 0.11);
const SECT_BG  = rgb(0.20, 0.20, 0.20);  // VISUAL / FUNCTION headers
const CAT_BG   = rgb(0.78, 0.78, 0.78);  // category headers
const PH_COL   = rgb(0.50, 0.50, 0.85);  // placeholder text colour
const GRID_COL = rgb(0.70, 0.70, 0.70);  // light grid lines
const ALT_ROW  = rgb(0.96, 0.96, 0.96);  // alternating row tint

// ─── Page 1 layout ────────────────────────────────────────────────────────────
const LABEL_W   = 220;
const DAY_W     = (PW - LABEL_W) / 7;         // ≈ 88.85
const DAY_NAMES = ['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY'];
const DAY_KEYS  = ['MON','TUE','WED','THU','FRI','SAT','SUN'];

const dayX = i => LABEL_W + i * DAY_W;

// Row heights
const BIG_H = 9;    // VISUAL CHECKS / FUNCTION CHECKS
const CAT_H = 8;    // category headers (Documentation, Wheels/Tyres …)
const VIS_H = 8;    // visual-check item rows (1–28)
const FUN_H = 6.5;  // one G-or-P sub-row (items 29–43)

// Top of the inspection grid (bottom-left origin → higher y = higher on page)
const GRID_TOP = 551;

// ─── Check item data ──────────────────────────────────────────────────────────
const VISUAL_SECTIONS = [
  { label: 'Documentation',          items: [1,2,3]            },
  { label: 'Wheels / Tyres',         items: [4,5,6]            },
  { label: 'Engine / Power Source',  items: [7,8,9]            },
  { label: 'Hydraulics',             items: [10,11]            },
  { label: 'Hoses and Cables',       items: [12,13]            },
  { label: 'Outriggers/Stabilisers', items: [14,15,16]         },
  { label: 'Chassis Boom Scissor',   items: [17,18,19]         },
  { label: 'Platform or Cage',       items: [20,21,22,23,24,25]},
  { label: 'Decals and Signage',     items: [26,27,28]         },
];
const FUNC_ITEMS = [29,30,31,32,33,34,35,36,37,38,39,40,41,42,43];

const ITEM_DESC = {
   1: '1  Compliance / insurance documentation',
   2: '2  Maintenance record book',
   3: '3  Operator manual on board',
   4: '4  Tyre condition and pressure',
   5: '5  Wheel nuts secure',
   6: '6  Wheel damage and cracks',
   7: '7  Fuel / power level',
   8: '8  Oil levels',
   9: '9  No leaks (engine / power)',
  10: '10  Hydraulic oil level',
  11: '11  No hydraulic leaks',
  12: '12  Hoses – condition, no chafing',
  13: '13  Cables – condition, no chafing',
  14: '14  Outriggers / stabilisers – damage',
  15: '15  Outrigger pads present',
  16: '16  Outrigger pins and locks',
  17: '17  Chassis – cracks and damage',
  18: '18  Boom / scissor mechanism',
  19: '19  Boom / scissor pins and locks',
  20: '20  Platform / cage damage',
  21: '21  Platform gate or chain',
  22: '22  Guardrails secure',
  23: '23  Platform floor condition',
  24: '24  Harness attachment points',
  25: '25  No foreign objects in platform',
  26: '26  Load plate – present and legible',
  27: '27  Safety decals – present and legible',
  28: '28  Emergency instructions displayed',
  29: '29  Engine / power ON',
  30: '30  Emergency stop',
  31: '31  Drive (fwd / rev / left / right)',
  32: '32  Lift (up / down)',
  33: '33  Tilt / slew',
  34: '34  Horn',
  35: '35  Lights (if applicable)',
  36: '36  Outrigger / stabiliser extension',
  37: '37  Brakes',
  38: '38  Overload protection',
  39: '39  Platform controls',
  40: '40  Ground controls override',
  41: '41  Lowering alarm',
  42: '42  Tilt / motion alarm',
  43: '43  All safety devices operative',
};

// ─── Coordinate computation ────────────────────────────────────────────────────
// buildCoords() walks the same layout algorithm as createTemplate() and records
// where every placeholder will appear.  generateReport.js imports this map so
// it always stays in sync with the actual template.

function buildCoords() {
  const c = {};

  // ── Page 1 ─────────────────────────────────────────────────────────────────
  const HDR_Y = PH - 12;  // ≈ 583

  c['MACHINE_REF']    = { page: 0, x: 348, y: HDR_Y, size: 9 };
  c['WEEK_COMMENCING']= { page: 0, x: 638, y: HDR_Y, size: 9 };

  let y = GRID_TOP;
  y -= BIG_H;  // VISUAL CHECKS section header

  for (const section of VISUAL_SECTIONS) {
    y -= CAT_H;  // category header
    for (const num of section.items) {
      const bottom = y - VIS_H;
      const ty = bottom + (VIS_H - 6) / 2;
      for (let d = 0; d < 7; d++) {
        const key = `${DAY_KEYS[d]}_${String(num).padStart(2, '0')}`;
        c[key] = { page: 0, cellX: dayX(d), cellW: DAY_W, y: ty, size: 6 };
      }
      y = bottom;
    }
  }

  y -= BIG_H;  // FUNCTION CHECKS section header

  for (const num of FUNC_ITEMS) {
    const gBottom = y - FUN_H;
    const gTy     = gBottom + (FUN_H - 5) / 2;
    const pBottom = gBottom - FUN_H;
    const pTy     = pBottom + (FUN_H - 5) / 2;
    for (let d = 0; d < 7; d++) {
      c[`${DAY_KEYS[d]}_${num}_G`] = { page: 0, cellX: dayX(d),            cellW: DAY_W / 2, y: gTy, size: 6 };
      c[`${DAY_KEYS[d]}_${num}_P`] = { page: 0, cellX: dayX(d) + DAY_W/2, cellW: DAY_W / 2, y: pTy, size: 6 };
    }
    y = pBottom;
  }

  const INIT_Y = 28;
  for (let d = 0; d < 7; d++) {
    c[`${DAY_KEYS[d]}_INITIALS`] = { page: 0, cellX: dayX(d), cellW: DAY_W, y: INIT_Y, size: 6 };
  }

  // ── Page 2 ─────────────────────────────────────────────────────────────────
  const P2M = 20;  // margin

  c['MACHINE_REF_P2'] = { page: 1, x: P2M + 80, y: PH2 - 30, size: 9 };
  c['DATE_ON_HIRE']   = { page: 1, x: P2M + 270, y: PH2 - 30, size: 9 };

  // Operator table: header 12pt, then 7 rows of 22pt
  const OP_HDR_BOTTOM = PH2 - 50 - 12;  // bottom of header row
  const OP_ROW_H = 22;
  const OP_NAME_X = P2M + 75;
  const OP_PAL_X  = P2M + 205;
  const OP_STAT_X = P2M + 40;
  const OP_STAT_W = 35;

  for (let d = 0; d < 7; d++) {
    const rowBottom = OP_HDR_BOTTOM - (d + 1) * OP_ROW_H;
    const ty = rowBottom + (OP_ROW_H - 7) / 2;
    const dk = DAY_KEYS[d];
    c[`${dk}_STATUS`]   = { page: 1, cellX: OP_STAT_X, cellW: OP_STAT_W, y: ty, size: 7 };
    c[`${dk}_OPERATOR`] = { page: 1, x: OP_NAME_X + 2, y: ty, size: 6 };
    c[`${dk}_PAL`]      = { page: 1, x: OP_PAL_X + 2,  y: ty, size: 6 };
  }

  // Defect log: title 20pt gap, header 18pt, then 10 rows of 18pt
  const opTableBottom = OP_HDR_BOTTOM - 7 * OP_ROW_H;
  const DEF_TOP    = opTableBottom - 20;
  const DEF_HDR_Y  = DEF_TOP - 18;
  const DEF_ROW_H  = 18;
  const DEF_COLS_X = {
    item:     P2M,
    details:  P2M + 30,
    noted:    P2M + 160,
    reported: P2M + 210,
    engineer: P2M + 260,
    notes:    P2M + 370,
  };

  for (let r = 1; r <= 10; r++) {
    const rowBottom = DEF_HDR_Y - r * DEF_ROW_H;
    const ty = rowBottom + (DEF_ROW_H - 6) / 2;
    const ri = String(r).padStart(2, '0');
    c[`DEFECT_${ri}_ITEM`]     = { page: 1, cellX: DEF_COLS_X.item,     cellW: 30,  y: ty, size: 6 };
    c[`DEFECT_${ri}_DETAILS`]  = { page: 1, x: DEF_COLS_X.details  + 2, y: ty, size: 5.5 };
    c[`DEFECT_${ri}_NOTED`]    = { page: 1, x: DEF_COLS_X.noted    + 2, y: ty, size: 5.5 };
    c[`DEFECT_${ri}_REPORTED`] = { page: 1, x: DEF_COLS_X.reported + 2, y: ty, size: 5.5 };
    c[`DEFECT_${ri}_ENGINEER`] = { page: 1, x: DEF_COLS_X.engineer + 2, y: ty, size: 5.5 };
    c[`DEFECT_${ri}_NOTES`]    = { page: 1, x: DEF_COLS_X.notes    + 2, y: ty, size: 5.5 };
  }

  // Supervisor sign-off
  const defTableBottom = DEF_HDR_Y - 10 * DEF_ROW_H;
  const SIGN_DATA_Y = defTableBottom - 40;
  c['SUPERVISOR_1_NAME'] = { page: 1, x: P2M + 2,       y: SIGN_DATA_Y, size: 7 };
  c['SUPERVISOR_1_DATE'] = { page: 1, x: P2M + 162,     y: SIGN_DATA_Y, size: 7 };
  c['SUPERVISOR_2_NAME'] = { page: 1, x: P2M + 257,     y: SIGN_DATA_Y, size: 7 };
  c['SUPERVISOR_2_DATE'] = { page: 1, x: P2M + 417,     y: SIGN_DATA_Y, size: 7 };

  return c;
}

const COORDS = buildCoords();

// ─── Drawing helpers ──────────────────────────────────────────────────────────

function rect(page, x, y, w, h, fill, border) {
  const opts = { x, y, width: w, height: h, color: fill };
  if (border !== null) {
    opts.borderColor = border !== undefined ? border : GRID_COL;
    opts.borderWidth = 0.3;
  }
  page.drawRectangle(opts);
}

function txt(page, font, text, x, y, size, color) {
  if (text == null || text === '') return;
  page.drawText(String(text), { x, y, size, font, color: color || BLACK });
}

function centered(page, font, text, cellX, cellW, y, size, color) {
  const s  = String(text || '');
  if (!s) return;
  const tw = font.widthOfTextAtSize(s, size);
  page.drawText(s, { x: cellX + Math.max(0, (cellW - tw) / 2), y, size, font, color: color || BLACK });
}

function hline(page, x1, x2, y, thickness, color) {
  page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: thickness || 0.3, color: color || GRID_COL });
}
function vline(page, x, y1, y2, thickness, color) {
  page.drawLine({ start: { x, y: y1 }, end: { x, y: y2 }, thickness: thickness || 0.3, color: color || GRID_COL });
}

// ─── Template creation ────────────────────────────────────────────────────────

async function createTemplate() {
  const pdfDoc   = await PDFDocument.create();
  const font     = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // ════════════════════════════════════════════════════════════════════════════
  // PAGE 1 — A4 landscape: all 43 inspection items
  // ════════════════════════════════════════════════════════════════════════════
  const p1 = pdfDoc.addPage([PW, PH]);
  rect(p1, 0, 0, PW, PH, WHITE, null);

  const HDR_Y  = PH - 12;  // ≈ 583
  const BAND_H = 14;        // height of the header band

  // Header band background
  rect(p1, 0, HDR_Y - 3, PW, BAND_H, rgb(0.93, 0.93, 0.93), null);
  hline(p1, 0, PW, HDR_Y - 3, 0.5, BLACK);

  // Title
  txt(p1, boldFont, 'MEWP PRE-USE INSPECTION CHECKLIST', 4, HDR_Y, 10, BLACK);

  // Machine ref
  txt(p1, font, 'MACHINE:', 300, HDR_Y, 9, BLACK);
  txt(p1, boldFont, `{{MACHINE_REF}}`, COORDS.MACHINE_REF.x, HDR_Y, 9, PH_COL);

  // Week commencing
  txt(p1, font, 'WEEK COMMENCING:', 530, HDR_Y, 9, BLACK);
  txt(p1, font, '{{WEEK_COMMENCING}}', COORDS.WEEK_COMMENCING.x, HDR_Y, 9, PH_COL);

  // ── Column headers ─────────────────────────────────────────────────────────
  const COL_Y  = HDR_Y - 16;  // ≈ 567  — day name baseline
  const GP_Y   = COL_Y  - 9;  // ≈ 558  — G / P sub-header baseline
  const GRID_T = GP_Y   - 2;  // ≈ 556  — top edge of the grid

  // Label column header
  rect(p1, 0, GP_Y - 2, LABEL_W, COL_Y - GP_Y + 12, CAT_BG, null);
  txt(p1, font, "All checks per manufacturer's manual", 4, COL_Y, 6, BLACK);

  // Outer border: left + right edges of whole grid
  vline(p1, 0,      28, GRID_T, 0.5, BLACK);
  vline(p1, PW - 1, 28, GRID_T, 0.5, BLACK);
  // Label column right border
  vline(p1, LABEL_W, 28, GRID_T, 0.5, BLACK);

  for (let d = 0; d < 7; d++) {
    const x = dayX(d);
    rect(p1, x, GP_Y - 2, DAY_W, COL_Y - GP_Y + 12, CAT_BG, null);
    centered(p1, boldFont, DAY_NAMES[d], x, DAY_W, COL_Y, 7, BLACK);
    centered(p1, boldFont, 'G', x,           DAY_W / 2, GP_Y, 6, BLACK);
    centered(p1, boldFont, 'P', x + DAY_W/2, DAY_W / 2, GP_Y, 6, BLACK);
    vline(p1, x + DAY_W/2, 28, GRID_T, 0.3, rgb(0.6,0.6,0.6));
    vline(p1, x + DAY_W,   28, GRID_T, 0.3, BLACK);
  }

  // ── Item rows ──────────────────────────────────────────────────────────────
  let y = GRID_TOP;
  let rowIdx = 0;

  function sectionHeader(h, label, bg, labelColor) {
    const bottom = y - h;
    rect(p1, 0, bottom, PW, h, bg, null);
    hline(p1, 0, PW, bottom, 0.4, BLACK);
    txt(p1, boldFont, label, 4, bottom + (h - 7) / 2, 7, labelColor || WHITE);
    y = bottom;
  }

  function catHeader(label) {
    const bottom = y - CAT_H;
    rect(p1, 0, bottom, PW, CAT_H, CAT_BG, null);
    hline(p1, 0, PW, bottom, 0.3, BLACK);
    txt(p1, boldFont, label, 4, bottom + (CAT_H - 6) / 2, 6, BLACK);
    y = bottom;
  }

  function visRow(num) {
    const bottom = y - VIS_H;
    const bg = rowIdx++ % 2 === 0 ? WHITE : ALT_ROW;
    rect(p1, 0, bottom, PW, VIS_H, bg, null);
    hline(p1, 0, PW, bottom, 0.3);
    const ty = bottom + (VIS_H - 6) / 2;
    txt(p1, font, ITEM_DESC[num], 4, ty, 6);
    for (let d = 0; d < 7; d++) {
      const key = `${DAY_KEYS[d]}_${String(num).padStart(2,'0')}`;
      centered(p1, font, `{{${key}}}`, dayX(d), DAY_W, ty, 4, PH_COL);
    }
    y = bottom;
  }

  function funcRow(num) {
    const gBottom = y - FUN_H;
    const pBottom = gBottom - FUN_H;

    // G sub-row
    rect(p1, 0, gBottom, PW, FUN_H, rowIdx++ % 2 === 0 ? WHITE : ALT_ROW, null);
    hline(p1, 0, PW, gBottom, 0.25);
    const gTy = gBottom + (FUN_H - 5) / 2;
    txt(p1, font, ITEM_DESC[num], 4, gTy, 5.5);
    txt(p1, boldFont, 'G', LABEL_W - 12, gTy, 5.5);
    for (let d = 0; d < 7; d++) {
      centered(p1, font, `{{${DAY_KEYS[d]}_${num}_G}}`, dayX(d), DAY_W/2, gTy, 3.5, PH_COL);
    }

    // P sub-row
    rect(p1, 0, pBottom, PW, FUN_H, ALT_ROW, null);
    hline(p1, 0, PW, pBottom, 0.25);
    const pTy = pBottom + (FUN_H - 5) / 2;
    txt(p1, boldFont, 'P', LABEL_W - 12, pTy, 5.5);
    for (let d = 0; d < 7; d++) {
      centered(p1, font, `{{${DAY_KEYS[d]}_${num}_P}}`, dayX(d) + DAY_W/2, DAY_W/2, pTy, 3.5, PH_COL);
    }

    y = pBottom;
  }

  // Draw VISUAL CHECKS
  sectionHeader(BIG_H, 'VISUAL CHECKS', SECT_BG);
  for (const section of VISUAL_SECTIONS) {
    catHeader(section.label);
    for (const num of section.items) visRow(num);
  }

  // Draw FUNCTION CHECKS
  sectionHeader(BIG_H, 'FUNCTION CHECKS    G = Ground controls    P = Platform controls', SECT_BG);
  for (const num of FUNC_ITEMS) funcRow(num);

  // ── Bottom strip ──────────────────────────────────────────────────────────
  // Thin separator above bottom strip
  hline(p1, 0, PW, 38, 0.5, BLACK);

  txt(p1, boldFont,
    'ALL FAULTS OR DEFECTS TO BE REPORTED IMMEDIATELY TO YOUR SUPERVISOR',
    4, 14, 6, RED);

  for (let d = 0; d < 7; d++) {
    const x = dayX(d);
    txt(p1, font, 'Initialled:', x + 2, 34, 5);
    centered(p1, font, `{{${DAY_KEYS[d]}_INITIALS}}`, x, DAY_W, 28, 6, PH_COL);
  }

  // Top border of bottom strip
  hline(p1, LABEL_W, PW, 41, 0.3, GRID_COL);

  // ════════════════════════════════════════════════════════════════════════════
  // PAGE 2 — A4 portrait: daily operator log + defect log + supervisor sign-off
  // ════════════════════════════════════════════════════════════════════════════
  const p2 = pdfDoc.addPage([PW2, PH2]);
  rect(p2, 0, 0, PW2, PH2, WHITE, null);

  const P2M = 20;
  const P2W = PW2 - 2 * P2M;

  // Title band
  rect(p2, 0, PH2 - 22, PW2, 22, SECT_BG, null);
  txt(p2, boldFont, 'MEWP DAILY RECORD OF INSPECTION', P2M, PH2 - 14, 11, WHITE);

  // Meta row
  txt(p2, font, 'Machine Ref No:', P2M, PH2 - 30, 9);
  txt(p2, boldFont, '{{MACHINE_REF}}', COORDS.MACHINE_REF_P2.x, PH2 - 30, 9, PH_COL);
  txt(p2, font, 'Date on hire:', P2M + 200, PH2 - 30, 9);
  txt(p2, font, '{{DATE_ON_HIRE}}', COORDS.DATE_ON_HIRE.x, PH2 - 30, 9, PH_COL);

  // ── Operator table ──────────────────────────────────────────────────────────
  const OP_COLS = [
    { label: 'Day',           x: P2M,       w: 40  },
    { label: 'Status',        x: P2M + 40,  w: 35  },
    { label: 'Operator Name', x: P2M + 75,  w: 130 },
    { label: 'PAL Card No.',  x: P2M + 205, w: 90  },
    { label: 'Date',          x: P2M + 295, w: 60  },
  ];
  const OP_TABLE_TOP  = PH2 - 50;
  const OP_HDR_H      = 12;
  const OP_ROW_H      = 22;
  const OP_HDR_BOTTOM = OP_TABLE_TOP - OP_HDR_H;

  // Header
  txt(p2, boldFont, 'DAILY OPERATOR LOG', P2M, OP_TABLE_TOP + 2, 8);
  for (const col of OP_COLS) {
    rect(p2, col.x, OP_HDR_BOTTOM, col.w, OP_HDR_H, CAT_BG, null);
    centered(p2, boldFont, col.label, col.x, col.w, OP_HDR_BOTTOM + 3, 6);
  }
  hline(p2, P2M, P2M + OP_COLS.reduce((s,c)=>s+c.w,0), OP_HDR_BOTTOM + OP_HDR_H, 0.5, BLACK);

  const DAY_FULL = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  for (let d = 0; d < 7; d++) {
    const rowBottom = OP_HDR_BOTTOM - (d + 1) * OP_ROW_H;
    const bg = d % 2 === 0 ? WHITE : ALT_ROW;
    const tableW = OP_COLS.reduce((s,c)=>s+c.w,0);
    rect(p2, P2M, rowBottom, tableW, OP_ROW_H, bg, null);
    hline(p2, P2M, P2M + tableW, rowBottom, 0.3);
    // Vertical column borders
    let cx = P2M;
    for (const col of OP_COLS) { vline(p2, cx, rowBottom, rowBottom + OP_ROW_H, 0.3, BLACK); cx += col.w; }
    vline(p2, cx, rowBottom, rowBottom + OP_ROW_H, 0.3, BLACK);

    const ty = rowBottom + (OP_ROW_H - 7) / 2;
    const dk = DAY_KEYS[d];
    centered(p2, font, DAY_FULL[d], OP_COLS[0].x, OP_COLS[0].w, ty, 6);
    centered(p2, font, `{{${dk}_STATUS}}`,   OP_COLS[1].x, OP_COLS[1].w, ty, 6, PH_COL);
    txt(p2, font,      `{{${dk}_OPERATOR}}`, OP_COLS[2].x + 2, ty, 5, PH_COL);
    txt(p2, font,      `{{${dk}_PAL}}`,      OP_COLS[3].x + 2, ty, 5, PH_COL);
  }

  // ── Defect log ──────────────────────────────────────────────────────────────
  const DEF_COLS = [
    { label: 'Item No.', x: P2M,       w: 30  },
    { label: 'Details of defect found',       x: P2M + 30,  w: 130 },
    { label: 'Date Noted',             x: P2M + 160, w: 50  },
    { label: 'Date Reported',          x: P2M + 210, w: 50  },
    { label: 'Engineer & Date Repaired',       x: P2M + 260, w: 110 },
    { label: 'Further Notes',          x: P2M + 370, w: 185 },
  ];
  const DEF_ROW_H   = 18;
  const opTableBot  = OP_HDR_BOTTOM - 7 * OP_ROW_H;
  const DEF_TOP     = opTableBot - 20;
  const DEF_HDR_Y   = DEF_TOP - 18;

  txt(p2, boldFont, 'DEFECT LOG', P2M, DEF_TOP + 2, 8);
  for (const col of DEF_COLS) {
    rect(p2, col.x, DEF_HDR_Y, col.w, 18, CAT_BG, null);
    vline(p2, col.x, DEF_HDR_Y, DEF_HDR_Y + 18, 0.3, BLACK);
    // Wrap long labels across two lines
    const words = col.label.split(' ');
    const mid   = Math.ceil(words.length / 2);
    const l1    = words.slice(0, mid).join(' ');
    const l2    = words.slice(mid).join(' ');
    const lw1 = font.widthOfTextAtSize(l1, 5.5);
    p2.drawText(l1, { x: col.x + Math.max(0,(col.w-lw1)/2), y: DEF_HDR_Y + 10, size: 5.5, font: boldFont, color: BLACK });
    if (l2) {
      const lw2 = font.widthOfTextAtSize(l2, 5.5);
      p2.drawText(l2, { x: col.x + Math.max(0,(col.w-lw2)/2), y: DEF_HDR_Y + 3, size: 5.5, font: boldFont, color: BLACK });
    }
  }
  const defTableW = DEF_COLS.reduce((s,c)=>s+c.w,0);
  vline(p2, P2M + defTableW, DEF_HDR_Y, DEF_HDR_Y + 18, 0.3, BLACK);
  hline(p2, P2M, P2M + defTableW, DEF_HDR_Y + 18, 0.5, BLACK);

  for (let r = 1; r <= 10; r++) {
    const rowBottom = DEF_HDR_Y - r * DEF_ROW_H;
    const bg  = r % 2 === 0 ? ALT_ROW : WHITE;
    rect(p2, P2M, rowBottom, defTableW, DEF_ROW_H, bg, null);
    hline(p2, P2M, P2M + defTableW, rowBottom, 0.3);
    let cx2 = P2M;
    for (const col of DEF_COLS) { vline(p2, cx2, rowBottom, rowBottom + DEF_ROW_H, 0.3, BLACK); cx2 += col.w; }
    vline(p2, cx2, rowBottom, rowBottom + DEF_ROW_H, 0.3, BLACK);

    const ri = String(r).padStart(2, '0');
    const ty = rowBottom + (DEF_ROW_H - 6) / 2;
    centered(p2, font, `{{DEFECT_${ri}_ITEM}}`,    DEF_COLS[0].x, DEF_COLS[0].w, ty, 4, PH_COL);
    txt(p2,     font,  `{{DEFECT_${ri}_DETAILS}}`,  DEF_COLS[1].x + 2, ty, 4, PH_COL);
    txt(p2,     font,  `{{DEFECT_${ri}_NOTED}}`,    DEF_COLS[2].x + 2, ty, 4, PH_COL);
    txt(p2,     font,  `{{DEFECT_${ri}_REPORTED}}`, DEF_COLS[3].x + 2, ty, 4, PH_COL);
    txt(p2,     font,  `{{DEFECT_${ri}_ENGINEER}}`, DEF_COLS[4].x + 2, ty, 4, PH_COL);
    txt(p2,     font,  `{{DEFECT_${ri}_NOTES}}`,    DEF_COLS[5].x + 2, ty, 4, PH_COL);
  }

  // ── Supervisor sign-off ────────────────────────────────────────────────────
  const defTableBottom = DEF_HDR_Y - 10 * DEF_ROW_H;
  const SIGN_Y      = defTableBottom - 20;
  const SIGN_DATA_Y = SIGN_Y - 20;

  txt(p2, boldFont, 'WEEKLY SUPERVISOR SIGN-OFF', P2M, SIGN_Y, 8);

  const SIGN_FIELDS = [
    { key: 'SUPERVISOR_1_NAME', label: 'Supervisor 1 Name:', w: 150 },
    { key: 'SUPERVISOR_1_DATE', label: 'Date:',              w: 80  },
    { key: 'SUPERVISOR_2_NAME', label: 'Supervisor 2 Name:', w: 150 },
    { key: 'SUPERVISOR_2_DATE', label: 'Date:',              w: 80  },
  ];
  let sx = P2M;
  for (const sf of SIGN_FIELDS) {
    txt(p2, font, sf.label, sx, SIGN_DATA_Y + 10, 7);
    rect(p2, sx, SIGN_DATA_Y - 4, sf.w, 12, WHITE, null);
    hline(p2, sx, sx + sf.w, SIGN_DATA_Y - 4, 0.5, BLACK);
    txt(p2, font, `{{${sf.key}}}`, sx + 2, SIGN_DATA_Y, 6, PH_COL);
    sx += sf.w + 10;
  }

  // ── Save ───────────────────────────────────────────────────────────────────
  const bytes   = await pdfDoc.save();
  const outPath = path.join(process.cwd(), 'public', 'mewps_template_new.pdf');
  fs.writeFileSync(outPath, bytes);
  console.log(`Template saved → ${outPath}  (${Object.keys(COORDS).length} placeholders)`);
  return COORDS;
}

module.exports = { createTemplate, COORDS };
