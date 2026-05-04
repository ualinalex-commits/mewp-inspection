'use strict';

const { PDFDocument, PDFName, StandardFonts, rgb, decodePDFRawStream } = require('pdf-lib');
const { createClient } = require('@supabase/supabase-js');
const zlib = require('zlib');
const fs   = require('fs');
const path = require('path');
const { ITEM_DESC } = require('./createTemplate');

// ─── Exact question text from check/[mewpId].jsx (used in Description column) ─
const FULL_ITEM_DESC = {
  1:  'Statutory examination / periodic inspection in date',
  2:  "Manufacturer's operator manual with the machine",
  3:  'Rescue plan in place and name of nominated ground rescue person identified',
  4:  'No missing, loose or damaged nuts and retainers',
  5:  'Tyre pressure (pneumatic, foam filled or solid)',
  6:  'Condition (no cuts, splits, exposed braiding, damaged rims)',
  7:  'Fluid levels (engine oil, coolant, fuel)',
  8:  'No fluid leakage on ground and around engine',
  9:  'Battery (electrolyte, connections, terminals, security and charging plug condition)',
  10: 'Hydraulic fluid level',
  11: 'No leaks (hoses, pipe connections, rams, cylinders)',
  12: 'Security and condition (no cuts, chaffing, bulges)',
  13: 'Power track cable trays (free from damage and debris)',
  14: 'General condition, pins/retainers, footplate',
  15: 'Spreader plates (present, condition, secure for travel)',
  16: 'Interlocks (functioning, engaged)',
  17: 'General condition (no damage, misalignment, corrosion)',
  18: 'No cracks in weld',
  19: 'Pins, retainers and chains (good condition, secure)',
  20: 'Canopies, guards, engine covers (security and condition)',
  21: 'Steps for access/egress secure (undamaged, clear of debris)',
  22: 'Entrance gate, guard rails and retaining pins',
  23: 'Harness / lanyard anchorage points',
  24: 'Clear of rubbish, debris and obstructions',
  25: 'Secondary Guarding',
  26: 'ID/compliance plate, safety, warning and information decals (all present, legible)',
  27: 'Controls (identification decals, directional arrows clearly marked)',
  28: 'Platform loads (SWL, max. wind speed, max. number of persons clearly marked)',
  29: 'Security device (power isolator, keypad, smart card)',
  30: 'Function enable works correctly (ignition key, foot switch, hold to run device)',
  31: 'Emergency stops and emergency / auxiliary lowering system are fully functional',
  32: 'All switches, function controls (move freely, return to neutral, operate as expected)',
  33: 'Elevating functions (raise, lower, slew, tele-out, tele-in)',
  34: 'Travel functions (forward, reverse, steer, brakes)',
  35: 'Elevated drive speed activates when platform is raised (reduced or prevented)',
  36: 'Lights, beacons, warning devices',
  37: 'Audible alarms (tilt, descent and travel)',
  38: 'Interlock, limit switches (e.g. descent, SWL, outreach, rotation)',
  39: 'Pothole protection device (fully deploys and retracts)',
  40: 'Oscillating axle locks and extending axles operate correctly',
  41: 'Accessories, power to platform, extending decks',
  42: 'Jacks-legs, stabilisers, outriggers, levelling devices',
  43: 'Secondary guarding (function, operation, reset)',
};

// ─── Day helpers ──────────────────────────────────────────────────────────────

const DAY_NORM = {
  monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu',
  friday: 'Fri', saturday: 'Sat', sunday: 'Sun',
  mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun',
};

function normDay(val) {
  return val ? DAY_NORM[String(val).toLowerCase()] ?? null : null;
}

function dayFromDate(dateStr) {
  if (!dateStr) return null;
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const d = new Date(dateStr + 'T00:00:00Z');
  return DAYS[(d.getUTCDay() + 6) % 7];
}

function fmtDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00Z');
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
}

function formatTime(isoStr) {
  if (!isoStr) return '—';
  try {
    const d = new Date(isoStr);
    return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
  } catch { return '—'; }
}

function toResult(val) {
  if (val === 'pass') return 'PASS';
  if (val === 'fail') return 'FAIL';
  if (val === 'na')   return 'N/A';
  return '';
}

function getInitials(name) {
  if (!name) return '';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] || '').toUpperCase() + (parts[1][0] || '').toUpperCase();
}

// ─── Exact template coords (extracted from template.pdf via pdfjs-dist) ───────
// pdf-lib shares the same coordinate convention as PDF: origin = bottom-left.
//
// Page 0 = first page  (842×595 landscape) — header, visual checks, func 29-42
// Page 1 = second page (842×595 landscape) — func 43, initials
// Page 2 = third page  (595×842 portrait)  — REMOVED from output

const MACHINE_ID = { x: 484, y: 559 };
const WEEK_COMM  = { x: 701, y: 559 };

const DAY_X = { Mon: 442, Tue: 492, Wed: 541, Thu: 591, Fri: 640, Sat: 690, Sun: 740 };
const DAYS  = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function visX(day, item) { return DAY_X[day] + (item > 9 ? -3 : 0); }

const VIS_Y = [
  null,
  527, 516, 506, 495, 485, 474, 464, 453, 443,
  432, 421, 411, 400, 390, 379, 369, 358, 347,
  337, 327, 316, 305, 295, 285, 274, 263, 253, 242,
];

const FUNC_G_OFFSET = -7;
const FUNC_P_OFFSET = +17;

const FUNC = {
  29: { y: 223, page: 0 },
  30: { y: 206, page: 0 },
  31: { y: 189, page: 0 },
  32: { y: 173, page: 0 },
  33: { y: 156, page: 0 },
  34: { y: 139, page: 0 },
  35: { y: 123, page: 0 },
  36: { y: 106, page: 0 },
  37: { y:  89, page: 0 },
  38: { y:  73, page: 0 },
  39: { y:  56, page: 0 },
  40: { y:  39, page: 0 },
  41: { y:  23, page: 0 },
  42: { y:   6, page: 0 },
  43: { y: 562, page: 1 },
};

const INITIAL_Y        = 531;
const INITIAL_X_OFFSET = -6;

// ─── Strip placeholder text from template streams ─────────────────────────────

function stripPlaceholders(pdfDoc) {
  for (const page of pdfDoc.getPages()) {
    const contentsVal = page.node.get(PDFName.of('Contents'));
    if (!contentsVal) continue;

    const processRef = (ref) => {
      const obj = pdfDoc.context.lookup(ref);
      if (!obj || !('contents' in obj)) return;

      const decoded = decodePDFRawStream(obj).decode();
      let content = Buffer.from(decoded).toString('latin1');
      if (!content.includes('{') && !content.includes('}')) return;

      content = content.replace(/BT[\s\S]*?ET/g, block => {
        if (!/\([^)]*[{}]/.test(block)) return block;
        return block.replace(/\(([^)]*)\)/g, (_, s) => '(' + ' '.repeat(s.length) + ')');
      });

      const newBytes   = Buffer.from(content, 'latin1');
      const compressed = zlib.deflateSync(newBytes);
      obj.contents = compressed;
      obj.dict.set(PDFName.of('Length'), pdfDoc.context.obj(compressed.length));
    };

    if (contentsVal.constructor.name === 'PDFArray') {
      for (let i = 0; i < contentsVal.size(); i++) processRef(contentsVal.get(i));
    } else {
      processRef(contentsVal);
    }
  }
}

// ─── Word-wrap helper ─────────────────────────────────────────────────────────

function wrapText(text, font, fontSize, maxWidth) {
  if (!text) return [''];
  const words = text.split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(test, fontSize) <= maxWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

// ─── Fetch image bytes from a URL (used for photo/signature embedding) ────────

async function fetchImageBytes(url, label) {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[generateReport] fetchImageBytes ${label} HTTP ${res.status} for ${url}`);
      return null;
    }
    const bytes = Buffer.from(await res.arrayBuffer());
    console.log(`[generateReport] fetchImageBytes ${label} OK — ${bytes.length} bytes`);
    return bytes;
  } catch (err) {
    console.warn(`[generateReport] fetchImageBytes ${label} fetch error: ${err.message} for ${url}`);
    return null;
  }
}

// ─── Dynamic daily summary pages ─────────────────────────────────────────────

async function appendDailySummaryPages(pdfDoc, font, bold, operatorsByDay, defectsByDay, mediaByDay) {
  const PAGE_W    = 595.32;
  const PAGE_H    = 841.92;
  const MARGIN    = 30;
  const CONTENT_W = PAGE_W - 2 * MARGIN;

  const BLACK    = rgb(0,    0,    0   );
  const WHITE    = rgb(1,    1,    1   );
  const ALT_ROW  = rgb(0.96, 0.96, 0.96);
  const DARK_BG  = rgb(0.20, 0.20, 0.20);
  const CAT_BG   = rgb(0.78, 0.78, 0.78);
  const GREEN    = rgb(0.086, 0.502, 0.239);
  const RED      = rgb(0.725, 0.110, 0.110);
  const GRID_COL = rgb(0.70, 0.70, 0.70);
  const MID_GRAY = rgb(0.45, 0.45, 0.45);

  const DAYS_FULL = {
    Mon:'Monday', Tue:'Tuesday', Wed:'Wednesday', Thu:'Thursday',
    Fri:'Friday', Sat:'Saturday', Sun:'Sunday',
  };

  const blocks = [];
  for (const day of DAYS) {
    const entry = operatorsByDay[day];
    if (!entry) continue;
    blocks.push({ day, entry, defects: defectsByDay[day] || [] });
  }
  if (blocks.length === 0) return;

  const TABLE_ROW_H = 24;
  const DAY_HDR_H   = 22;
  const INFO_ROW_H  = 22;
  const OWNER_ROW_H = 18;
  const FAULT_HDR_H = 16;
  const DAY_GAP     = 12;

  // Max dimensions for embedded media
  const PHOTO_MAX_W  = 160;
  const PHOTO_MAX_H  = 100;
  const SIG_MAX_W    = 130;
  const SIG_MAX_H    = 55;
  const MEDIA_PAD    = 8;

  const COL_ITEM_W   = 30;
  const COL_DESC_W   = 160;
  const COL_DETAIL_W = 225;
  const COL_STATUS_W = CONTENT_W - COL_ITEM_W - COL_DESC_W - COL_DETAIL_W;  // eslint-disable-line no-unused-vars

  const COL_ITEM_X   = MARGIN;
  const COL_DESC_X   = COL_ITEM_X   + COL_ITEM_W;
  const COL_DETAIL_X = COL_DESC_X   + COL_DESC_W;
  const COL_STATUS_X = COL_DETAIL_X + COL_DETAIL_W;

  function dividers(pg, rowY, rowH) {
    [COL_DESC_X, COL_DETAIL_X, COL_STATUS_X].forEach(x =>
      pg.drawLine({ start:{x, y: rowY - rowH}, end:{x, y: rowY}, thickness: 0.3, color: GRID_COL })
    );
  }

  let page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  let y    = PAGE_H - MARGIN;

  function newPage() {
    page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    y    = PAGE_H - MARGIN;
  }

  function ensureSpace(needed) {
    if (y - needed < MARGIN + 8) newPage();
  }

  // Pre-embed all images into the PDF document before drawing
  // (pdf-lib requires embedding before drawing)
  const embeddedMedia = {};
  for (const { day, entry } of blocks) {
    const media = mediaByDay[day] || {};
    embeddedMedia[day] = {};

    if (media.photoBytes) {
      try {
        try {
          embeddedMedia[day].photo = await pdfDoc.embedJpg(media.photoBytes);
          console.log(`[generateReport] ${day}: photo embedded as JPEG`);
        } catch {
          embeddedMedia[day].photo = await pdfDoc.embedPng(media.photoBytes);
          console.log(`[generateReport] ${day}: photo embedded as PNG`);
        }
      } catch (err) {
        console.warn(`[generateReport] ${day}: photo embed failed — ${err.message}`);
      }
    }

    if (media.signatureBytes) {
      try {
        try {
          embeddedMedia[day].signature = await pdfDoc.embedPng(media.signatureBytes);
          console.log(`[generateReport] ${day}: signature embedded as PNG`);
        } catch {
          embeddedMedia[day].signature = await pdfDoc.embedJpg(media.signatureBytes);
          console.log(`[generateReport] ${day}: signature embedded as JPEG`);
        }
      } catch (err) {
        console.warn(`[generateReport] ${day}: signature embed failed — ${err.message}`);
      }
    }
  }

  // ── Page title ─────────────────────────────────────────────────────────────
  page.drawRectangle({ x: 0, y: PAGE_H - 28, width: PAGE_W, height: 28, color: DARK_BG });
  page.drawText('DAILY INSPECTION SUMMARY', {
    x: MARGIN, y: PAGE_H - 19, size: 12, font: bold, color: WHITE,
  });
  y = PAGE_H - 40;

  // ── Per-day blocks ─────────────────────────────────────────────────────────
  for (const { day, entry, defects } of blocks) {
    const media      = mediaByDay[day] || {};
    const embedded   = embeddedMedia[day] || {};
    const hasFaults  = entry.daily_status === 'fault' || defects.length > 0;
    const faultLines = hasFaults && defects.length > 0 ? defects.length : 0;
    const hasOwner   = !!media.mewpOwner;
    const hasPhoto   = !!embedded.photo;
    const hasSig     = !!embedded.signature;
    const hasMedia   = hasPhoto || hasSig;

    // Calculate media block height
    let mediaH = 0;
    if (hasMedia) {
      let photoH = 0;
      let sigH   = 0;
      if (hasPhoto) {
        const img = embedded.photo;
        const scale = Math.min(PHOTO_MAX_W / img.width, PHOTO_MAX_H / img.height, 1);
        photoH = img.height * scale;
      }
      if (hasSig) {
        const img = embedded.signature;
        const scale = Math.min(SIG_MAX_W / img.width, SIG_MAX_H / img.height, 1);
        sigH = img.height * scale;
      }
      mediaH = Math.max(photoH, sigH) + MEDIA_PAD * 2;
    }

    const neededH = DAY_HDR_H + INFO_ROW_H +
                    (hasOwner  ? OWNER_ROW_H : 0) +
                    (hasMedia  ? mediaH : 0) +
                    (faultLines > 0 ? FAULT_HDR_H + faultLines * TABLE_ROW_H + 4 : 0) +
                    DAY_GAP;
    ensureSpace(neededH);

    // Day header bar
    page.drawRectangle({ x: MARGIN, y: y - DAY_HDR_H, width: CONTENT_W, height: DAY_HDR_H, color: DARK_BG });
    const dateStr = entry.inspection_date ? fmtDate(entry.inspection_date) : '';
    page.drawText(`${DAYS_FULL[day]}  ${dateStr}`, {
      x: MARGIN + 5, y: y - DAY_HDR_H + 7, size: 10, font: bold, color: WHITE,
    });
    y -= DAY_HDR_H;

    // Info row (operator / PAL / time / status)
    page.drawRectangle({ x: MARGIN, y: y - INFO_ROW_H, width: CONTENT_W, height: INFO_ROW_H, color: ALT_ROW });
    const timeStr    = formatTime(entry.submitted_at || entry.created_at);
    const statusText = hasFaults ? 'FAULTS FOUND' : 'ALL CLEAR';
    const statusCol  = hasFaults ? RED : GREEN;
    const INFO_Y     = y - INFO_ROW_H + 7;

    page.drawText(`Operator: ${(entry.operator_name || '—').substring(0, 25)}`,
      { x: MARGIN + 4,   y: INFO_Y, size: 8, font, color: BLACK });
    page.drawText(`PAL: ${(entry.pal_card_number || '—').substring(0, 15)}`,
      { x: MARGIN + 185, y: INFO_Y, size: 8, font, color: BLACK });
    page.drawText(`Time: ${timeStr}`,
      { x: MARGIN + 305, y: INFO_Y, size: 8, font, color: BLACK });
    page.drawText('Status: ',
      { x: MARGIN + 385, y: INFO_Y, size: 8, font, color: BLACK });
    page.drawText(statusText,
      { x: MARGIN + 420, y: INFO_Y, size: 8, font: bold, color: statusCol });
    y -= INFO_ROW_H;

    // MEWP Owner row
    if (hasOwner) {
      page.drawRectangle({ x: MARGIN, y: y - OWNER_ROW_H, width: CONTENT_W, height: OWNER_ROW_H, color: WHITE });
      page.drawText('MEWP Owner: ',
        { x: MARGIN + 4, y: y - OWNER_ROW_H + 5, size: 7.5, font: bold, color: MID_GRAY });
      page.drawText(media.mewpOwner.substring(0, 60),
        { x: MARGIN + 62, y: y - OWNER_ROW_H + 5, size: 7.5, font, color: BLACK });
      y -= OWNER_ROW_H;
    }

    // Media row (photo + signature side by side)
    if (hasMedia) {
      ensureSpace(mediaH + 4);
      const MEDIA_TOP = y;
      const IMG_Y_TOP = MEDIA_TOP - MEDIA_PAD;

      if (hasPhoto) {
        const img   = embedded.photo;
        const scale = Math.min(PHOTO_MAX_W / img.width, PHOTO_MAX_H / img.height, 1);
        const w     = img.width  * scale;
        const h     = img.height * scale;
        page.drawText('Photo:', { x: MARGIN + 4, y: IMG_Y_TOP + 4, size: 6.5, font: bold, color: MID_GRAY });
        page.drawImage(img, { x: MARGIN + 4, y: IMG_Y_TOP - h, width: w, height: h });
      }

      if (hasSig) {
        const img   = embedded.signature;
        const scale = Math.min(SIG_MAX_W / img.width, SIG_MAX_H / img.height, 1);
        const w     = img.width  * scale;
        const h     = img.height * scale;
        const sigX  = MARGIN + PHOTO_MAX_W + 20;
        page.drawText('Signature:', { x: sigX, y: IMG_Y_TOP + 4, size: 6.5, font: bold, color: MID_GRAY });
        // Draw a light border behind the signature
        page.drawRectangle({ x: sigX - 2, y: IMG_Y_TOP - h - 2, width: w + 4, height: h + 4, borderColor: GRID_COL, borderWidth: 0.5, color: WHITE });
        page.drawImage(img, { x: sigX, y: IMG_Y_TOP - h, width: w, height: h });
      }

      y -= mediaH;
    }

    // Fault table
    if (faultLines > 0) {
      ensureSpace(FAULT_HDR_H + faultLines * TABLE_ROW_H + 4);

      page.drawRectangle({ x: MARGIN, y: y - FAULT_HDR_H, width: CONTENT_W, height: FAULT_HDR_H, color: CAT_BG });
      [
        { label: '#',             x: COL_ITEM_X   + 2 },
        { label: 'Description',   x: COL_DESC_X   + 2 },
        { label: 'Fault Details', x: COL_DETAIL_X + 2 },
        { label: 'Status',        x: COL_STATUS_X + 2 },
      ].forEach(({ label, x }) =>
        page.drawText(label, { x, y: y - FAULT_HDR_H + 5, size: 6.5, font: bold, color: BLACK })
      );
      dividers(page, y, FAULT_HDR_H);
      page.drawLine({ start:{x: MARGIN, y}, end:{x: MARGIN + CONTENT_W, y}, thickness: 0.4, color: BLACK });
      y -= FAULT_HDR_H;

      for (let ri = 0; ri < defects.length; ri++) {
        const d = defects[ri];
        ensureSpace(TABLE_ROW_H + 2);

        const rowBg = ri % 2 === 0 ? WHITE : ALT_ROW;
        page.drawRectangle({ x: MARGIN, y: y - TABLE_ROW_H, width: CONTENT_W, height: TABLE_ROW_H, color: rowBg });

        const MID_Y   = y - 12;
        const LINE1_Y = y - 8;
        const LINE2_Y = y - 17;

        page.drawText(String(d.item_number),
          { x: COL_ITEM_X + 2, y: MID_Y, size: 6.5, font: bold, color: BLACK });

        const descText  = FULL_ITEM_DESC[d.item_number] || `Item ${d.item_number}`;
        const descLines = wrapText(descText, font, 6, COL_DESC_W - 4);
        page.drawText(descLines[0],
          { x: COL_DESC_X + 2, y: descLines.length > 1 ? LINE1_Y : MID_Y, size: 6, font, color: BLACK });
        if (descLines[1]) page.drawText(descLines[1],
          { x: COL_DESC_X + 2, y: LINE2_Y, size: 6, font, color: BLACK });

        const detailText  = d.defect_details || '—';
        const detailLines = wrapText(detailText, font, 6, COL_DETAIL_W - 4);
        page.drawText(detailLines[0],
          { x: COL_DETAIL_X + 2, y: detailLines.length > 1 ? LINE1_Y : MID_Y, size: 6, font, color: BLACK });
        if (detailLines[1]) page.drawText(detailLines[1],
          { x: COL_DETAIL_X + 2, y: LINE2_Y, size: 6, font, color: BLACK });

        const st     = (d.status || 'open').toLowerCase();
        const stText = st.charAt(0).toUpperCase() + st.slice(1);
        const stCol  = (st === 'repaired' || st === 'closed') ? GREEN : RED;
        page.drawText(stText,
          { x: COL_STATUS_X + 2, y: MID_Y, size: 6.5, font: bold, color: stCol });

        page.drawLine({ start: { x: MARGIN, y: y - TABLE_ROW_H }, end: { x: MARGIN + CONTENT_W, y: y - TABLE_ROW_H }, thickness: 0.2, color: GRID_COL });
        dividers(page, y, TABLE_ROW_H);
        y -= TABLE_ROW_H;
      }

      page.drawLine({ start:{x: MARGIN, y}, end:{x: MARGIN + CONTENT_W, y}, thickness: 0.4, color: BLACK });
    }

    y -= DAY_GAP;
  }
}

// ─── Build PDF ────────────────────────────────────────────────────────────────

async function buildPDF({ mewp, sheet, summaryByItem, operatorsByDay, defectsByDay, mediaByDay }) {
  const templateBytes = fs.readFileSync(
    path.join(process.cwd(), 'public/template.pdf'),
  );

  const pdfDoc = await PDFDocument.load(templateBytes);
  stripPlaceholders(pdfDoc);

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const BLACK = rgb(0, 0, 0);
  const GREEN = rgb(0.086, 0.502, 0.239);
  const RED   = rgb(0.725, 0.110, 0.110);
  const GRAY  = rgb(0.42, 0.42, 0.42);

  const pages = pdfDoc.getPages();
  const p1    = pages[0]; // landscape — header + visual checks + func 29-42
  const p2    = pages[1]; // landscape — func 43 + initials

  function stamp(page, text, x, y, size, color, useBold) {
    if (!text) return;
    page.drawText(String(text), {
      x, y, size: size || 7,
      font: useBold ? bold : font,
      color: color || BLACK,
    });
  }

  function stampResult(page, result, x, y) {
    if (!result) return;
    page.drawText(result, {
      x, y, size: 6, font: bold,
      color: result === 'PASS' ? GREEN : result === 'N/A' ? GRAY : RED,
    });
  }

  // ── Page 0: header ──────────────────────────────────────────────────────────
  const machineLabel = mewp.serial_number
    ? `${mewp.machine_ref || ''} - ${mewp.serial_number}`
    : (mewp.machine_ref || '');
  stamp(p1, machineLabel,              MACHINE_ID.x, MACHINE_ID.y, 8, BLACK, true);
  stamp(p1, fmtDate(sheet.week_commencing), WEEK_COMM.x, WEEK_COMM.y, 8, BLACK, false);

  // ── Page 0: visual checks 1-28 ─────────────────────────────────────────────
  for (let num = 1; num <= 28; num++) {
    const row = summaryByItem[num] || {};
    const y   = VIS_Y[num];
    for (const day of DAYS) {
      const dl = day.toLowerCase();
      const r  = toResult(row[`${dl}_result`] ?? row[dl] ?? null);
      if (r) stampResult(p1, r, visX(day, num), y);
    }
  }

  // ── Pages 0-1: function checks 29-43 ───────────────────────────────────────
  for (let num = 29; num <= 43; num++) {
    const row = summaryByItem[num] || {};
    const fc  = FUNC[num];
    const pg  = pages[fc.page];
    for (const day of DAYS) {
      const dl = day.toLowerCase();
      const g  = toResult(row[`${dl}_ground_result`] ?? row[`${dl}_ground`] ?? null);
      const p  = toResult(row[`${dl}_platform_result`] ?? row[`${dl}_platform`] ?? null);
      if (g) stampResult(pg, g, DAY_X[day] + FUNC_G_OFFSET, fc.y);
      if (p) stampResult(pg, p, DAY_X[day] + FUNC_P_OFFSET, fc.y);
    }
  }

  // ── Page 1: initials ────────────────────────────────────────────────────────
  for (const day of DAYS) {
    const op       = operatorsByDay[day] || {};
    const initials = getInitials(op.operator_name);
    if (initials) stamp(p2, initials, DAY_X[day] + INITIAL_X_OFFSET, INITIAL_Y);
  }

  // ── Remove portrait "Daily Record" page (template page 2) ──────────────────
  pdfDoc.removePage(2);

  // ── Dynamic daily summary pages ─────────────────────────────────────────────
  await appendDailySummaryPages(pdfDoc, font, bold, operatorsByDay, defectsByDay || {}, mediaByDay || {});

  return Buffer.from(await pdfDoc.save());
}

// ─── generateReport: fetch data + build + upload ──────────────────────────────

async function generateReport(mewpId, weekCommencing) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  // 1. Weekly sheet + MEWP metadata
  const { data: sheet, error: sheetErr } = await supabase
    .from('weekly_inspection_sheets')
    .select('*, mewps(machine_ref, model, serial_number, site_id, sites(name, location))')
    .eq('mewp_id', mewpId)
    .eq('week_commencing', weekCommencing)
    .single();

  if (sheetErr || !sheet) throw new Error(`Sheet not found: ${sheetErr?.message}`);

  const mewp = sheet.mewps || {};

  // 2. weekly_sheet_summary (item results per day)
  const { data: summaryRows = [], error: sumErr } = await supabase
    .from('weekly_sheet_summary')
    .select('*')
    .eq('sheet_id', sheet.id);

  if (sumErr) console.warn('[generateReport] weekly_sheet_summary:', sumErr.message);

  const summaryByItem = {};
  (summaryRows || []).forEach(row => { summaryByItem[row.item_number] = row; });

  // 3. weekly_operator_log (operator name / PAL / status per day)
  const { data: operatorRows = [], error: opErr } = await supabase
    .from('weekly_operator_log')
    .select('*')
    .eq('sheet_id', sheet.id);

  if (opErr) console.warn('[generateReport] weekly_operator_log:', opErr.message);

  const operatorsByDay = {};
  (operatorRows || []).forEach(row => {
    const day = normDay(row.day_of_week) || dayFromDate(row.inspection_date);
    if (day) operatorsByDay[day] = row;
  });

  // 4. daily_inspection_entries — include new fields: mewp_owner, photo_url, signature_url
  const weekEndDate = new Date(weekCommencing + 'T00:00:00Z');
  weekEndDate.setUTCDate(weekEndDate.getUTCDate() + 6);
  const weekEnd = weekEndDate.toISOString().split('T')[0];

  const { data: entryRows = [], error: entryErr } = await supabase
    .from('daily_inspection_entries')
    .select('inspection_date, day_of_week, operator_name, pal_card_number, daily_status, submitted_at, mewp_owner, photo_url, signature_url')
    .eq('mewp_id', mewpId)
    .gte('inspection_date', weekCommencing)
    .lte('inspection_date', weekEnd)
    .order('inspection_date');

  if (entryErr) console.warn('[generateReport] daily_inspection_entries:', entryErr.message);

  const mediaByDay = {};
  (entryRows || []).forEach(row => {
    const day = normDay(row.day_of_week) || dayFromDate(row.inspection_date);
    if (!day) return;
    // Direct table row always overrides view data
    operatorsByDay[day] = row;
    const photoUrl     = row.photo_url     || null;
    const signatureUrl = row.signature_url || null;
    console.log(`[generateReport] ${day} (${row.inspection_date}): photo_url=${photoUrl ?? 'null'}, signature_url=${signatureUrl ?? 'null'}, mewp_owner=${row.mewp_owner ?? 'null'}`);
    mediaByDay[day] = {
      mewpOwner: row.mewp_owner || null,
      photoUrl,
      signatureUrl,
    };
  });

  // 5. Fetch image bytes for photo and signature (parallel, non-fatal)
  const fetchPromises = [];
  for (const day of DAYS) {
    const media = mediaByDay[day];
    if (!media) continue;
    if (media.photoUrl) {
      fetchPromises.push(
        fetchImageBytes(media.photoUrl, `photo(${day})`).then(bytes => { media.photoBytes = bytes; })
      );
    } else {
      console.log(`[generateReport] ${day}: no photo_url — skipping photo`);
    }
    if (media.signatureUrl) {
      fetchPromises.push(
        fetchImageBytes(media.signatureUrl, `signature(${day})`).then(bytes => { media.signatureBytes = bytes; })
      );
    } else {
      console.log(`[generateReport] ${day}: no signature_url — skipping signature`);
    }
  }
  await Promise.all(fetchPromises);

  // 6. defect_log
  const { data: defectRows = [], error: defErr } = await supabase
    .from('defect_log')
    .select('item_number, defect_details, status, inspection_date, check_type')
    .eq('mewp_id', mewpId)
    .gte('inspection_date', weekCommencing)
    .lte('inspection_date', weekEnd)
    .order('inspection_date')
    .order('item_number');

  if (defErr) console.warn('[generateReport] defect_log:', defErr.message);

  const defectsByDay = {};
  (defectRows || []).forEach(row => {
    const day = dayFromDate(row.inspection_date);
    if (!day) return;
    if (!defectsByDay[day]) defectsByDay[day] = [];
    defectsByDay[day].push(row);
  });

  // 7. Build PDF
  const pdfBuffer = await buildPDF({ mewp, sheet, summaryByItem, operatorsByDay, defectsByDay, mediaByDay });

  // 8. Upload to Supabase Storage
  const siteId   = mewp.site_id;
  const filePath = `${siteId}/${mewpId}/${weekCommencing}.pdf`;

  await supabase.storage.from('weekly-reports').remove([filePath]);

  const { error: uploadError } = await supabase.storage
    .from('weekly-reports')
    .upload(filePath, pdfBuffer, { contentType: 'application/pdf', upsert: false });

  if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);

  const { data: { publicUrl } } = supabase.storage
    .from('weekly-reports')
    .getPublicUrl(filePath);

  // 9. Persist URL and timestamp
  await supabase
    .from('weekly_inspection_sheets')
    .update({ pdf_url: publicUrl, pdf_generated_at: new Date().toISOString() })
    .eq('id', sheet.id);

  return publicUrl;
}

module.exports = { generateReport, buildPDF };
