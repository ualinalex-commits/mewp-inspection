// Extracts x/y coordinates of all {{placeholder}} tokens in template.pdf
// Uses pdfjs-dist directly so we get the raw transform matrix per text item.
// Run:  node extractCoords.mjs

import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// pdfjs-dist v5 ships as pure ESM
const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

// Point to the worker file using a file:// URL
const workerPath = path.join(__dirname, 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs');
pdfjsLib.GlobalWorkerOptions.workerSrc = `file://${workerPath}`;

const pdfBytes = await readFile(path.join(__dirname, 'public/template.pdf'));

const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(pdfBytes), verbosity: 0 });
const pdf = await loadingTask.promise;

const results = [];

for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
  const page = await pdf.getPage(pageNum);
  const { items } = await page.getTextContent();

  // PDF coordinate system: origin = bottom-left, y increases upward.
  // pdf-lib uses the same convention, so these coords go directly into generateReport.js.

  for (const item of items) {
    const str = item.str;
    if (!str) continue;
    const x = Math.round(item.transform[4]);
    const y = Math.round(item.transform[5]);

    // Print every item so we can see all text on the page
    results.push({ page: pageNum, x, y, str });
  }
}

// Sort by page, then y descending (top of page first), then x
results.sort((a, b) => {
  if (a.page !== b.page) return a.page - b.page;
  if (b.y !== a.y) return b.y - a.y;
  return a.x - b.x;
});

console.log('=== ALL TEXT ITEMS BY PAGE (top→bottom) ===\n');
let currentPage = 0;
for (const r of results) {
  if (r.page !== currentPage) {
    currentPage = r.page;
    const dim = await (async () => {
      const pg = await pdf.getPage(currentPage);
      const vp = pg.getViewport({ scale: 1 });
      return `${Math.round(vp.width)} x ${Math.round(vp.height)}`;
    })();
    console.log(`\n--- PAGE ${currentPage} (${dim}) ---`);
  }
  const marker = r.str.includes('{{') ? ' <<<<' : '';
  console.log(`  x=${String(r.x).padStart(4)}  y=${String(r.y).padStart(4)}  "${r.str}"${marker}`);
}

console.log('\n\n=== PLACEHOLDER COORDS ONLY ===\n');
const placeholders = results.filter(r => r.str.includes('{{'));
for (const r of placeholders) {
  console.log(`page=${r.page}  x=${r.x}  y=${r.y}  "${r.str}"`);
}
