import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  Packer,
  PageNumber,
  PageOrientation,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { Catalogue, CatalogueEntry } from "./engine";
import { RISK_BANDS, type RiskBand } from "./risk";

const FONT = "Arial";
const BAND_FILL: Record<RiskBand, string> = { low: "DCF2E3", moderate: "FFF1C2", high: "FFD8B0", critical: "F8C4C4" };
const CONFIDENCE_LABEL = { confirmed: "Potvrzeno", inferred: "Odvozeno – ověřit", missing_info: "Chybí údaje" } as const;

const text = (t: string, o: { bold?: boolean; size?: number; color?: string; italics?: boolean } = {}) =>
  new TextRun({ text: t, font: FONT, size: o.size ?? 18, bold: o.bold, color: o.color, italics: o.italics });

const para = (t: string | TextRun[], o: { bold?: boolean; size?: number; spacingAfter?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}) =>
  new Paragraph({
    children: typeof t === "string" ? [text(t, o)] : t,
    spacing: { after: o.spacingAfter ?? 60 },
    alignment: o.align,
  });

const cell = (children: Paragraph[], o: { fill?: string; width?: number } = {}) =>
  new TableCell({
    children,
    width: o.width ? { size: o.width, type: WidthType.PERCENTAGE } : undefined,
    shading: o.fill ? { type: ShadingType.CLEAR, color: "auto", fill: o.fill } : undefined,
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
  });

const COLUMNS: { title: string; width: number }[] = [
  { title: "Č.", width: 4 },
  { title: "Nebezpečí", width: 15 },
  { title: "Příčina", width: 16 },
  { title: "Možný následek", width: 13 },
  { title: "P", width: 3 },
  { title: "Z", width: 3 },
  { title: "R", width: 5 },
  { title: "Preventivní opatření", width: 27 },
  { title: "Předpisy", width: 14 },
];

function entryRow(e: CatalogueEntry, i: number): TableRow {
  const fill = BAND_FILL[e.band];
  return new TableRow({
    cantSplit: true,
    children: [
      cell([para(String(i + 1))]),
      cell([
        para(e.name, { bold: true }),
        para([text(`${e.hazardId} · ${e.categoryLabel}`, { size: 14, color: "6B7280" })]),
        para([text(CONFIDENCE_LABEL[e.confidence], { size: 14, color: e.confidence === "confirmed" ? "15803D" : e.confidence === "inferred" ? "A16207" : "B91C1C" })]),
      ]),
      cell([para(e.cause)]),
      cell([para(e.risk)]),
      cell([para(String(e.probability), { align: AlignmentType.CENTER })]),
      cell([para(String(e.severity), { align: AlignmentType.CENTER })]),
      cell([para(String(e.score), { bold: true, align: AlignmentType.CENTER }), para([text(RISK_BANDS[e.band].label, { size: 14 })], { align: AlignmentType.CENTER })], { fill }),
      cell(e.measures.map((m) => para(`• ${m}`))),
      cell(e.regulations.map((r) => para([text(r, { size: 14 })]))),
    ],
  });
}

export async function catalogueToDocx(c: Catalogue): Promise<Buffer> {
  const date = new Date(c.generatedAt).toLocaleDateString("cs-CZ");
  const header = new TableRow({
    tableHeader: true,
    children: COLUMNS.map((col) => cell([para([text(col.title, { bold: true, color: "FFFFFF" })])], { fill: "0B1B2B", width: col.width })),
  });

  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [header, ...c.entries.map(entryRow)],
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" },
      left: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" },
      right: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" },
      insideVertical: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" },
    },
  });

  const openIssues = [...c.missingInfo, ...c.coverage];

  const doc = new Document({
    creator: "SAGASTA AI platforma",
    title: `Katalog nebezpečí – ${c.project.name}`,
    styles: { default: { document: { run: { font: FONT, size: 18 } } } },
    sections: [
      {
        properties: {
          page: {
            size: { orientation: PageOrientation.LANDSCAPE, width: 16838, height: 11906 },
            margin: { top: 900, bottom: 900, left: 800, right: 800 },
          },
        },
        headers: {
          default: new Header({
            children: [para([text("SAGASTA · Katalog nebezpečí · PRACOVNÍ NÁVRH", { size: 14, color: "6B7280" })], { align: AlignmentType.RIGHT })],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  text("Strana ", { size: 14, color: "6B7280" }),
                  new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 14, color: "6B7280" }),
                  text(" z ", { size: 14, color: "6B7280" }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: 14, color: "6B7280" }),
                ],
              }),
            ],
          }),
        },
        children: [
          new Paragraph({ heading: HeadingLevel.TITLE, children: [text("KATALOG NEBEZPEČÍ A HODNOCENÍ RIZIK", { bold: true, size: 32 })], spacing: { after: 120 } }),
          para([text("Stavba: ", { bold: true }), text(c.project.name)]),
          para([text("Místo: ", { bold: true }), text(c.project.location || "—")]),
          para([text("Zadavatel: ", { bold: true }), text(c.project.investor || "—")]),
          para([text("Datum návrhu: ", { bold: true }), text(date), text(`   ·   Režim: ${c.mode === "ai" ? `AI (${c.model})` : "pravidla"}`)], { spacingAfter: 200 }),
          para(
            [
              text(
                "Pracovní návrh vygenerovaný nástrojem SAGASTA AI z řízené knihovny nebezpečí. Nenahrazuje posouzení odborně způsobilou osobou; před použitím musí být ověřen a podepsán koordinátorem BOZP / odpovědnou osobou.",
                { italics: true, size: 16, color: "6B7280" },
              ),
            ],
            { spacingAfter: 200 },
          ),
          new Paragraph({ heading: HeadingLevel.HEADING_2, children: [text("Povinnosti dle zákona č. 309/2006 Sb.", { bold: true, size: 22 })] }),
          ...c.obligations.reasons.map((r) => para(`• ${r}`)),
          new Paragraph({ heading: HeadingLevel.HEADING_2, children: [text("Hodnocení rizika", { bold: true, size: 22 })], spacing: { before: 200 } }),
          para("R = P × Z; P – pravděpodobnost (1–5), Z – závažnost následku (1–5). Riziko hodnoceno před zavedením opatření."),
          para(
            (Object.keys(RISK_BANDS) as RiskBand[])
              .map((b) => `${RISK_BANDS[b].label} (${b === "low" ? "1–4" : b === "moderate" ? "5–9" : b === "high" ? "10–14" : "15–25"}): ${RISK_BANDS[b].action}`)
              .join("   ·   "),
            { spacingAfter: 200 },
          ),
          table,
          ...(openIssues.length || c.questions.length
            ? [
                new Paragraph({ heading: HeadingLevel.HEADING_2, children: [text("Otevřené body k ověření", { bold: true, size: 22 })], spacing: { before: 300 } }),
                ...openIssues.map((f) => para([text(`${f.title}: `, { bold: true }), text(f.detail)])),
                ...c.questions.map((q, i) => para(`${i + 1}. ${q}`)),
              ]
            : []),
          new Paragraph({ children: [], spacing: { before: 600 } }),
          para("Zpracoval: ……………………………………        Ověřil (koordinátor BOZP): ……………………………………        Datum: ………………"),
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}
