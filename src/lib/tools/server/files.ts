import "server-only";
import type { UploadedFile } from "../types";

/**
 * Převod nahraných souborů na text (pro deterministické kontroly) a na
 * PDF bloky (aby AI viděla i výkresy a tabulky v původní podobě).
 */

export interface ProcessedDoc {
  name: string;
  kind: "pdf" | "docx" | "sheet" | "text";
  /** Extrahovaný text (u PDF text vrstvy – u skenů může být prázdný). */
  text: string;
  /** Tabulková data (XLSX/CSV) – list řádků. */
  rows?: string[][];
  /** PDF pro AI jako document blok. */
  pdfBase64?: string;
  pages?: number;
  warning?: string;
}

export const MAX_TOTAL_BYTES = 30 * 1024 * 1024;

const ext = (name: string) => name.toLowerCase().split(".").pop() ?? "";

export async function processFile(f: UploadedFile): Promise<ProcessedDoc> {
  const buf = Buffer.from(f.data, "base64");
  const e = ext(f.name);
  try {
    if (e === "pdf") {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(buf));
      const { text, totalPages } = await extractText(pdf, { mergePages: true });
      const clean = String(text).replace(/[ \t]+\n/g, "\n").trim();
      return {
        name: f.name,
        kind: "pdf",
        text: clean,
        pdfBase64: f.data,
        pages: totalPages,
        warning: clean.length < 40 * totalPages ? "PDF má malou nebo žádnou textovou vrstvu (sken?) – čte ho jen AI." : undefined,
      };
    }
    if (e === "docx") {
      const mammoth = await import("mammoth");
      const { value } = await mammoth.extractRawText({ buffer: buf });
      return { name: f.name, kind: "docx", text: value.trim() };
    }
    if (e === "xlsx" || e === "xlsm") {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buf as unknown as ArrayBuffer);
      const rows: string[][] = [];
      const parts: string[] = [];
      wb.eachSheet((ws) => {
        parts.push(`### List: ${ws.name}`);
        ws.eachRow({ includeEmpty: false }, (row) => {
          const values = (row.values as unknown[]).slice(1).map(cellToString);
          rows.push(values);
          parts.push(values.join("\t"));
        });
      });
      return { name: f.name, kind: "sheet", text: parts.join("\n"), rows };
    }
    if (e === "csv") {
      const text = buf.toString("utf8").replace(/^﻿/, "");
      const delim = (text.split("\n")[0].match(/;/g)?.length ?? 0) >= (text.split("\n")[0].match(/,/g)?.length ?? 0) ? ";" : ",";
      const rows = text
        .split(/\r?\n/)
        .filter((l) => l.trim())
        .map((l) => splitCsv(l, delim));
      return { name: f.name, kind: "sheet", text: rows.map((r) => r.join("\t")).join("\n"), rows };
    }
    return { name: f.name, kind: "text", text: buf.toString("utf8").replace(/^﻿/, "").trim() };
  } catch (err) {
    console.error("[files]", f.name, err);
    return { name: f.name, kind: "text", text: "", warning: `Soubor ${f.name} se nepodařilo přečíst.` };
  }
}

function cellToString(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    const o = v as { result?: unknown; text?: unknown; richText?: { text: string }[]; hyperlink?: string };
    if (o.result !== undefined) return cellToString(o.result);
    if (Array.isArray(o.richText)) return o.richText.map((r) => r.text).join("");
    if (o.text !== undefined) return cellToString(o.text);
    if (v instanceof Date) return v.toISOString().slice(0, 10);
  }
  return String(v).trim();
}

function splitCsv(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (q && line[i + 1] === '"') (cur += '"'), i++;
      else q = !q;
    } else if (c === delim && !q) out.push(cur.trim()), (cur = "");
    else cur += c;
  }
  out.push(cur.trim());
  return out;
}

export async function processFiles(files: Record<string, UploadedFile[]>): Promise<Record<string, ProcessedDoc[]>> {
  const out: Record<string, ProcessedDoc[]> = {};
  for (const [key, list] of Object.entries(files)) out[key] = await Promise.all(list.map(processFile));
  return out;
}

export function totalBytes(files: Record<string, UploadedFile[]>): number {
  return Object.values(files)
    .flat()
    .reduce((n, f) => n + Math.floor((f.data.length * 3) / 4), 0);
}
