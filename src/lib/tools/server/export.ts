import "server-only";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  Packer,
  PageNumber,
  PageOrientation,
  Paragraph,
  ShadingType,
  Table as DocxTable,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { neutralizeFormula, SEVERITY_LABEL, STATUS_LABEL, type Report, type Table, type Tone } from "../report";

const FONT = "Arial";
const INK = "0B1B2B";
const MUTED = "6B7280";
const TONE_FILL: Record<Tone, string | undefined> = { default: undefined, good: "DCF2E3", warn: "FFF1C2", bad: "F8C4C4", accent: "FFF4CC" };
const STATUS_COLOR = { ok: "15803D", inferred: "A16207", missing: "B91C1C" } as const;
const SEV_COLOR = { error: "B91C1C", warning: "A16207", info: "475569", ok: "15803D" } as const;

const run = (text: string, o: { bold?: boolean; size?: number; color?: string; italics?: boolean } = {}) =>
  new TextRun({ text, font: FONT, size: o.size ?? 20, bold: o.bold, color: o.color, italics: o.italics });

const p = (children: TextRun[] | string, o: { after?: number; before?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; indent?: number } = {}) =>
  new Paragraph({
    children: typeof children === "string" ? [run(children)] : children,
    spacing: { after: o.after ?? 80, before: o.before },
    alignment: o.align,
    indent: o.indent ? { left: o.indent } : undefined,
  });

const heading = (text: string, size = 24, before = 280) => p([run(text, { bold: true, size, color: INK })], { before, after: 100 });

const border = { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" };

function table(t: Table, compact: boolean): DocxTable {
  const size = compact ? 16 : 18;
  return new DocxTable({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
    rows: [
      new TableRow({
        tableHeader: true,
        children: t.columns.map(
          (c) =>
            new TableCell({
              children: [p([run(c, { bold: true, color: "FFFFFF", size })], { after: 0 })],
              shading: { type: ShadingType.CLEAR, color: "auto", fill: INK },
              margins: { top: 60, bottom: 60, left: 80, right: 80 },
            }),
        ),
      }),
      ...t.rows.map(
        (r, i) =>
          new TableRow({
            cantSplit: true,
            children: t.columns.map((_, ci) => {
              const fill = TONE_FILL[t.rowTones?.[i] ?? "default"];
              return new TableCell({
                children: String(r[ci] ?? "")
                  .split("\n")
                  .map((line) => p([run(line, { size })], { after: 0 })),
                shading: fill ? { type: ShadingType.CLEAR, color: "auto", fill } : undefined,
                margins: { top: 50, bottom: 50, left: 80, right: 80 },
              });
            }),
          }),
      ),
    ],
  });
}

export async function reportToDocx(r: Report): Promise<Buffer> {
  const wide = r.sections.some((s) => (s.table?.columns.length ?? 0) > 5);
  const date = new Date(r.generatedAt).toLocaleDateString("cs-CZ");
  const body: (Paragraph | DocxTable)[] = [];

  if (r.letter) {
    body.push(p([run("SAGASTA s.r.o.", { bold: true, size: 22, color: INK })], { after: 400 }));
    if (r.letter.recipient) body.push(...r.letter.recipient.split(/\s*[–,]\s*|\n/).map((l) => p(l, { after: 0 })));
    body.push(p([run(`V Praze dne ${date}`, { color: MUTED })], { before: 300, after: 200, align: AlignmentType.RIGHT }));
    if (r.letter.reference) body.push(p([run("Značka: ", { bold: true }), run(r.letter.reference)]));
    body.push(p([run("Věc: ", { bold: true }), run(r.letter.subject, { bold: true })], { after: 240 }));
    for (const m of r.meta) body.push(p([run(`${m.label}: `, { bold: true }), run(m.value)]));
  } else {
    body.push(p([run(r.title, { bold: true, size: 34, color: INK })], { after: 60 }));
    if (r.subtitle) body.push(p([run(r.subtitle, { size: 22, color: MUTED })], { after: 160 }));
    for (const m of r.meta) body.push(p([run(`${m.label}: `, { bold: true }), run(m.value)], { after: 20 }));
    body.push(p([run(`Datum: ${date}   ·   ${r.mode === "ai" ? `AI (${r.model})` : "deterministické kontroly"}`, { color: MUTED, size: 18 })], { before: 60, after: 160 }));
    body.push(
      p([run("Pracovní podklad vygenerovaný nástrojem SAGASTA AI. Před použitím ověří a podepíše odpovědná osoba.", { italics: true, size: 16, color: MUTED })], { after: 200 }),
    );
    if (r.stats.length) body.push(p(r.stats.map((s, i) => run(`${i ? "   ·   " : ""}${s.label}: ${s.value}`, { size: 18, bold: true, color: INK }))));
    if (r.summary) {
      body.push(heading("Shrnutí", 22, 200));
      body.push(...r.summary.split(/\n\s*\n/).map((t) => p(t)));
    }
  }

  for (const s of r.sections) {
    if (r.letter) {
      if (s.id !== "body" && s.id !== "closing") body.push(heading(s.title, 20, 160));
    } else {
      body.push(
        p([run(s.title, { bold: true, size: 24, color: INK }), ...(s.status ? [run(`   ${STATUS_LABEL[s.status]}`, { size: 16, bold: true, color: STATUS_COLOR[s.status] })] : [])], { before: 300, after: 100 }),
      );
    }
    if (s.body) body.push(...s.body.split(/\n\s*\n/).map((t) => p(t.split("\n").flatMap((line, i) => (i ? [new TextRun({ break: 1, text: "" }), run(line)] : [run(line)])), { after: 120 })));
    for (const b of s.bullets ?? []) body.push(p(`•  ${b}`, { indent: 200, after: 40 }));
    if (s.table) {
      body.push(table(s.table, s.table.columns.length > 5));
      body.push(p("", { after: 60 }));
    }
    for (const f of s.findings ?? []) {
      body.push(
        p([run(`${SEVERITY_LABEL[f.severity]}: `, { bold: true, color: SEV_COLOR[f.severity], size: 18 }), run(f.title, { bold: true }), ...(f.detail ? [run(` – ${f.detail}`)] : [])], { after: 20 }),
      );
      if (f.evidence) body.push(p([run(f.evidence.replace(/\n/g, " | "), { italics: true, size: 16, color: MUTED })], { indent: 300, after: 80 }));
    }
    if (s.gaps?.length && !r.letter) {
      for (const g of s.gaps) body.push(p([run(`▸ ${g}`, { size: 17, color: "A16207" })], { indent: 200, after: 20 }));
    }
  }

  if (r.letter) {
    body.push(p("S pozdravem", { before: 300, after: 600 }));
    body.push(...r.letter.signature.split(/,\s*/).map((l, i) => p([run(l, { bold: i === 0 })], { after: 0 })));
  }

  if (r.questions.length) {
    body.push(heading("Otázky k upřesnění", 22));
    r.questions.forEach((q, i) => body.push(p(`${i + 1}. ${q}`, { after: 40 })));
  }

  if (!r.letter) {
    body.push(p("", { before: 500 }));
    body.push(p([run("Zpracoval: ……………………………        Ověřil: ……………………………        Datum: ………………", { color: MUTED })]));
  }

  const doc = new Document({
    creator: "SAGASTA AI platforma",
    title: r.title,
    styles: { default: { document: { run: { font: FONT, size: 20 } } } },
    sections: [
      {
        properties: {
          page: {
            size: wide ? { orientation: PageOrientation.LANDSCAPE, width: 16838, height: 11906 } : { width: 11906, height: 16838 },
            margin: { top: 1000, bottom: 1000, left: 1100, right: 1000 },
          },
        },
        headers: {
          default: new Header({ children: [p([run(`SAGASTA · ${r.letter ? "" : `${r.title} · `}PRACOVNÍ NÁVRH`, { size: 14, color: MUTED })], { align: AlignmentType.RIGHT })] }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  run("Strana ", { size: 14, color: MUTED }),
                  new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 14, color: MUTED }),
                  run(" z ", { size: 14, color: MUTED }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: 14, color: MUTED }),
                ],
              }),
            ],
          }),
        },
        children: body,
      },
    ],
  });
  return Packer.toBuffer(doc);
}

/** Všechny tabulky reportu (sheets + tabulky sekcí) jako Excel se stylovaným záhlavím. */
export async function reportToXlsx(r: Report): Promise<Buffer> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "SAGASTA AI";
  const tables: Table[] = r.sheets?.length ? r.sheets : r.sections.filter((s) => s.table).map((s) => ({ ...s.table!, name: s.table!.name ?? s.title }));
  const used = new Set<string>();
  const fills: Record<Tone, string | undefined> = { default: undefined, good: "FFDCF2E3", warn: "FFFFF1C2", bad: "FFF8C4C4", accent: "FFFFF4CC" };

  tables.forEach((t, i) => {
    let name = (t.name ?? `Tabulka ${i + 1}`).replace(/[\\/?*[\]:]/g, " ").slice(0, 28).trim() || `Tabulka ${i + 1}`;
    while (used.has(name)) name = `${name.slice(0, 25)} ${i + 1}`;
    used.add(name);
    const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
    ws.addRow(t.columns.map(neutralizeFormula));
    for (const row of t.rows) ws.addRow(row.map(toCellValue));
    const header = ws.getRow(1);
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B1B2B" } };
    header.alignment = { vertical: "middle", wrapText: true };
    t.rowTones?.forEach((tone, ri) => {
      const argb = fills[tone];
      if (argb) ws.getRow(ri + 2).fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
    });
    ws.columns.forEach((col, ci) => {
      const longest = Math.max(t.columns[ci]?.length ?? 8, ...t.rows.slice(0, 200).map((r) => String(r[ci] ?? "").length));
      col.width = Math.min(60, Math.max(8, longest + 2));
      col.alignment = { wrapText: true, vertical: "top" };
    });
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: t.columns.length } };
  });

  if (!tables.length) wb.addWorksheet("Report").addRow([r.title]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Čísla v českém zápisu uloží jako čísla, aby s nimi šlo v Excelu počítat. */
function toCellValue(v: string): string | number {
  const s = String(v ?? "").trim();
  if (/^-?\d{1,3}(?:[\s ]\d{3})*(?:,\d+)?$|^-?\d+(?:[.,]\d+)?$/.test(s)) {
    const n = Number(s.replace(/[\s ]/g, "").replace(",", "."));
    if (Number.isFinite(n) && !/^0\d/.test(s)) return n;
  }
  return neutralizeFormula(s);
}

export function fileSlug(title: string): string {
  return (
    title
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 60) || "SAGASTA"
  );
}
