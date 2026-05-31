import { createReadStream, createWriteStream } from "fs";
import { createInterface } from "readline";
import { resolve } from "path";

const INPUT = resolve("Crane Log 3.0.csv");
const OUTPUT = resolve("crane_logs_import.csv");

// DD/MM/YYYY → YYYY-MM-DD
function parseDate(raw) {
  const s = raw.trim();
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return s;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

// DD/MM/YYYY HH:MM → YYYY-MM-DD HH:mm:ss
function parseDateTime(raw) {
  const s = raw.trim();
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/);
  if (!m) return s;
  return `${m[3]}-${m[2]}-${m[1]} ${m[4]}:${m[5]}:00`;
}

// Minimal CSV row parser that handles double-quoted fields with embedded commas
function parseRow(line) {
  const fields = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      let j = i + 1;
      while (j < line.length && !(line[j] === '"' && line[j + 1] !== '"')) {
        if (line[j] === '"' && line[j + 1] === '"') j++; // escaped quote
        j++;
      }
      fields.push(line.slice(i + 1, j).replace(/""/g, '"'));
      i = j + 2; // skip closing quote and comma
    } else {
      const end = line.indexOf(",", i);
      if (end === -1) {
        fields.push(line.slice(i));
        break;
      }
      fields.push(line.slice(i, end));
      i = end + 1;
    }
  }
  return fields;
}

function quoteField(v) {
  const s = String(v ?? "").trim();
  return s.includes(",") || s.includes('"') || s.includes("\n")
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

const COLS = ["site", "status", "crane", "supervisor_name", "company", "load_description", "date", "start_time", "end_time"];

const rl = createInterface({ input: createReadStream(INPUT), crlfDelay: Infinity });
const out = createWriteStream(OUTPUT);

let header = null;
let colIdx = {};
let written = 0;
let skipped = 0;

out.write(COLS.join(",") + "\n");

for await (const line of rl) {
  if (!line.trim()) continue;

  if (!header) {
    header = parseRow(line);
    for (const col of COLS) {
      const idx = header.indexOf(col);
      if (idx === -1) {
        console.error(`Column not found: "${col}". Available: ${header.join(", ")}`);
        process.exit(1);
      }
      colIdx[col] = idx;
    }
    continue;
  }

  const fields = parseRow(line);
  const row = {};
  for (const col of COLS) {
    row[col] = fields[colIdx[col]] ?? "";
  }

  row.date = parseDate(row.date);
  row.start_time = parseDateTime(row.start_time);
  row.end_time = parseDateTime(row.end_time);

  out.write(COLS.map((c) => quoteField(row[c])).join(",") + "\n");
  written++;
}

out.end();
console.log(`Done. ${written} rows written to crane_logs_import.csv (${skipped} skipped).`);
