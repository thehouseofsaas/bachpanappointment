// Reads an uploaded roster (.xlsx or .csv) into plain rows. Tolerates title
// rows above the header, extra columns, blank rows and odd header spellings.
import ExcelJS from "exceljs";
import Papa from "papaparse";

export type RawRow = {
  rowNumber: number; // as the admin sees it in the spreadsheet (1-based)
  admissionNo: unknown;
  name: unknown;
  className: unknown;
  section: unknown;
  teacher: unknown;
  phones: Array<{ label: string; value: unknown }>;
};

export type ParseResult = { ok: true; rows: RawRow[]; sheetName?: string } | { ok: false; error: string };

export const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_ROWS = 2000;

const hkey = (v: unknown) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

type Field = "admissionNo" | "name" | "className" | "section" | "teacher" | "phone";

function classify(header: unknown): Field | null {
  const h = hkey(header);
  if (!h) return null;
  if (/(phone|mobile|contact|whatsapp|cell)/.test(h)) return "phone";
  if (/teacher/.test(h)) return "teacher";
  if (/^(adm|admn|admission|reg|registration|enrol|enroll)/.test(h)) return "admissionNo";
  if (/^(section|sec|div|division)$/.test(h)) return "section";
  if (/^(class|classname|grade|std|standard|classsection|classandsection)$/.test(h)) return "className";
  if (/^(name|studentname|studentsname|student|childname|child|nameofstudent|nameofthestudent|nameofchild)$/.test(h)) return "name";
  return null;
}

function phoneLabel(header: unknown): string {
  const h = String(header ?? "").toLowerCase();
  if (/father|dad|papa/.test(h)) return "Father";
  if (/mother|mom|mum|mummy/.test(h)) return "Mother";
  if (/guardian/.test(h)) return "Guardian";
  return "";
}

function cellValue(v: unknown): unknown {
  if (v === null || v === undefined) return "";
  if (typeof v === "number" || typeof v === "string" || typeof v === "boolean") return v;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (Array.isArray(o.richText)) return (o.richText as Array<{ text: string }>).map((t) => t.text).join("");
    if ("result" in o) return cellValue(o.result); // formula
    if ("text" in o) return cellValue(o.text); // hyperlink
    if ("error" in o) return "";
  }
  return String(v);
}

const isBlank = (v: unknown) => v === "" || v === null || v === undefined || (typeof v === "string" && !v.trim());

function fromGrid(grid: unknown[][], firstRowNumber = 1): ParseResult {
  // The header is the row (among the first 15) that names the most known columns.
  let best = -1;
  let bestScore = 0;
  for (let i = 0; i < Math.min(grid.length, 15); i++) {
    const kinds = new Set(grid[i].map(classify).filter(Boolean));
    if (kinds.has("name") && kinds.size > bestScore) {
      best = i;
      bestScore = kinds.size;
    }
  }
  if (best < 0) {
    return { ok: false, error: 'Could not find the header row. The sheet needs a "Student Name" column (see the template).' };
  }
  const header = grid[best];
  const cols: Partial<Record<Exclude<Field, "phone">, number>> = {};
  const phoneCols: Array<{ index: number; label: string }> = [];
  header.forEach((h, index) => {
    const f = classify(h);
    if (!f) return;
    if (f === "phone") phoneCols.push({ index, label: phoneLabel(h) });
    else if (cols[f] === undefined) cols[f] = index;
  });
  if (cols.className === undefined) return { ok: false, error: 'The sheet needs a "Class" column.' };
  if (phoneCols.length === 0) return { ok: false, error: 'The sheet needs at least one "Parent Phone" column.' };

  const rows: RawRow[] = [];
  for (let i = best + 1; i < grid.length; i++) {
    const r = grid[i];
    if (!r || r.every(isBlank)) continue;
    const get = (f: Exclude<Field, "phone">) => (cols[f] === undefined ? "" : (r[cols[f]!] ?? ""));
    rows.push({
      rowNumber: firstRowNumber + i,
      admissionNo: get("admissionNo"),
      name: get("name"),
      className: get("className"),
      section: get("section"),
      teacher: get("teacher"),
      phones: phoneCols.map((p) => ({ label: p.label, value: r[p.index] ?? "" })),
    });
    if (rows.length > MAX_ROWS) return { ok: false, error: `This sheet has more than ${MAX_ROWS} rows. Is it the right file?` };
  }
  if (rows.length === 0) return { ok: false, error: "The sheet has a header but no student rows." };
  return { ok: true, rows };
}

export async function parseRosterFile(data: ArrayBuffer | Buffer, filename: string): Promise<ParseResult> {
  const size = data.byteLength;
  if (size === 0) return { ok: false, error: "That file is empty." };
  if (size > MAX_FILE_BYTES) return { ok: false, error: "That file is larger than 2 MB. Is it the right file?" };
  const lower = filename.toLowerCase();
  try {
    if (lower.endsWith(".xlsx")) {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(data as ArrayBuffer);
      const sheets = wb.worksheets.filter((w) => w.actualRowCount > 0);
      if (sheets.length === 0) return { ok: false, error: "That workbook has no data." };
      const sheet = sheets.find((w) => /student|roster|class/i.test(w.name)) ?? sheets[0];
      const grid: unknown[][] = [];
      sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
        const values: unknown[] = [];
        row.eachCell({ includeEmpty: true }, (cell, col) => {
          values[col - 1] = cellValue(cell.value);
        });
        grid[rowNumber - 1] = Array.from(values, (v) => v ?? "");
      });
      for (let i = 0; i < grid.length; i++) grid[i] ??= [];
      const res = fromGrid(grid);
      return res.ok ? { ...res, sheetName: sheet.name } : res;
    }
    if (lower.endsWith(".csv") || lower.endsWith(".txt")) {
      const text = new TextDecoder("utf-8").decode(data).replace(/^﻿/, "");
      const parsed = Papa.parse<string[]>(text, { skipEmptyLines: false });
      return fromGrid(parsed.data as unknown[][]);
    }
    if (lower.endsWith(".xls")) {
      return { ok: false, error: 'Old ".xls" files are not supported. In Excel choose Save As → "Excel Workbook (.xlsx)".' };
    }
    return { ok: false, error: "Please upload an Excel (.xlsx) or CSV (.csv) file." };
  } catch {
    return { ok: false, error: "That file could not be read. Save it again as .xlsx or .csv and retry." };
  }
}

export const TEMPLATE_HEADERS = [
  "Admission No",
  "Student Name",
  "Class",
  "Section",
  "Class Teacher",
  "Parent Phone 1",
  "Parent Phone 2",
];
