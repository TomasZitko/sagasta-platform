import "server-only";
import { z } from "zod";
import {
  CONSTRUCTION_TYPES,
  MACHINERY,
  MATERIALS,
  ProjectIntakeSchema,
  WORK_ACTIVITIES,
  type ProjectIntake,
} from "@/lib/project/intake";
import { textToRows } from "../../analyzers/boq";
import { extractDates, extractObjectCodes, extractQuantities, formatCz, truncate } from "../../analyzers/text";
import { newReport, type Section, type Status, type Table } from "../../report";
import { InputError, type ToolHandler } from "../context";

/* ————————————————————————————————————————————————
 * 02 Extrakce dat projektu
 * ———————————————————————————————————————————————— */

const ids = <T extends readonly { id: string }[]>(l: T) => l.map((x) => x.id) as [T[number]["id"], ...T[number]["id"][]];
const Tri = z.enum(["ano", "ne", "neuvedeno"]);

const ExtractSchema = z.object({
  summary: z.string(),
  projectName: z.string(),
  location: z.string(),
  investor: z.string(),
  constructionTypes: z.array(z.enum(ids(CONSTRUCTION_TYPES))),
  activities: z.array(z.enum(ids(WORK_ACTIVITIES))),
  machinery: z.array(z.enum(ids(MACHINERY))),
  materials: z.array(z.enum(ids(MATERIALS))),
  maxWorkHeightM: z.number().describe("-1 pokud neuvedeno"),
  maxExcavationDepthM: z.number().describe("-1 pokud neuvedeno"),
  durationWorkingDays: z.number().int().describe("-1 pokud neuvedeno"),
  peakWorkers: z.number().int().describe("-1 pokud neuvedeno"),
  contractorsCount: z.number().int().describe("-1 pokud neuvedeno"),
  railwayProximity: z.enum(["none", "adjacent", "on_track", "unknown"]),
  roadTraffic: z.enum(["none", "adjacent", "partial_closure", "full_closure", "unknown"]),
  railwayElectrified: Tri,
  demolition: Tri,
  groundwater: Tri,
  undergroundUtilities: Tri,
  overheadPowerLines: Tri,
  waterProximity: Tri,
  confinedSpaces: Tri,
  nightWork: Tri,
  neighbouringBuildings: Tri,
  publicPresence: Tri,
  description: z.string().describe("Souvislý popis stavby a technologie, 4–8 vět, jen z podkladů."),
  participants: z.array(z.object({ role: z.string(), name: z.string(), source: z.string() })),
  objects: z.array(z.object({ code: z.string(), name: z.string(), source: z.string() })),
  parameters: z.array(z.object({ label: z.string(), value: z.string(), source: z.string(), status: z.enum(["ok", "inferred"]) })),
  dates: z.array(z.object({ label: z.string(), value: z.string(), source: z.string() })),
  conflicts: z.array(z.object({ title: z.string(), detail: z.string() })),
  missing: z.array(z.string()).describe("Klíčové údaje, které v podkladech nejsou."),
});

const tri = (v: z.infer<typeof Tri>) => v === "ano";
const num = (n: number) => (n < 0 ? null : n);

function grab(text: string, labels: string[]): string {
  for (const l of labels) {
    const m = new RegExp(`(?:^|\\n)\\s*${l}\\s*[:–-]\\s*([^\\n]+)`, "iu").exec(text);
    if (m) return m[1].trim();
  }
  return "";
}

export const extractProject: ToolHandler = async (ctx) => {
  const docs = ctx.textOf("docs", "notes", "Doplňující informace");
  if (!ctx.files("docs").length) throw new InputError("Nahrajte alespoň jeden dokument.");
  const corpus = docs.map((d) => d.text).join("\n\n");

  const ai = await ctx.ai({
    system: `Vytěžuješ strukturovaná data stavby z projektové dokumentace pro interní databázi projektu. Každý údaj ber jen z podkladů; neznámé hodnoty vyplň -1 / "neuvedeno" / "unknown" / prázdný řetězec. Ke každému účastníkovi, objektu, parametru a termínu uveď zdrojový dokument. Rozpory mezi dokumenty vypiš do conflicts.\n\nČíselníky:\nconstructionTypes: ${CONSTRUCTION_TYPES.map((c) => `${c.id}=${c.label}`).join(", ")}\nactivities: ${WORK_ACTIVITIES.map((c) => `${c.id}=${c.label}`).join(", ")}\nmachinery: ${MACHINERY.map((c) => `${c.id}=${c.label}`).join(", ")}\nmaterials: ${MATERIALS.map((c) => `${c.id}=${c.label}`).join(", ")}`,
    prompt: docs
      .filter((d) => !ctx.files("docs").find((f) => f.name === d.name)?.pdfBase64)
      .map((d) => `<dokument nazev="${d.name}">\n${truncate(d.text, 80_000)}\n</dokument>`)
      .join("\n\n"),
    docs: ctx.files("docs").filter((d) => d.pdfBase64),
    schema: ExtractSchema,
  });

  let project: ProjectIntake;
  const sections: Section[] = [];
  if (ai) {
    project = ProjectIntakeSchema.parse({
      projectName: ai.projectName || "Nový projekt",
      location: ai.location,
      investor: ai.investor,
      constructionTypes: ai.constructionTypes,
      activities: ai.activities,
      machinery: ai.machinery,
      materials: ai.materials,
      maxWorkHeightM: num(ai.maxWorkHeightM),
      maxExcavationDepthM: num(ai.maxExcavationDepthM),
      durationWorkingDays: num(ai.durationWorkingDays),
      peakWorkers: num(ai.peakWorkers),
      contractorsCount: num(ai.contractorsCount),
      railwayProximity: ai.railwayProximity === "unknown" ? "none" : ai.railwayProximity,
      roadTraffic: ai.roadTraffic === "unknown" ? "none" : ai.roadTraffic,
      railwayElectrified: tri(ai.railwayElectrified),
      demolition: tri(ai.demolition),
      groundwater: tri(ai.groundwater),
      undergroundUtilities: tri(ai.undergroundUtilities),
      overheadPowerLines: tri(ai.overheadPowerLines),
      waterProximity: tri(ai.waterProximity),
      confinedSpaces: tri(ai.confinedSpaces),
      nightWork: tri(ai.nightWork),
      neighbouringBuildings: tri(ai.neighbouringBuildings),
      publicPresence: tri(ai.publicPresence),
      description: ai.description,
      documentText: truncate(corpus, 200_000),
    });
    sections.push(
      identitySection(project),
      { id: "participants", title: "Účastníci výstavby", status: ai.participants.length ? "ok" : "missing", table: { columns: ["Role", "Subjekt", "Zdroj"], rows: ai.participants.map((p) => [p.role, p.name, p.source]) } },
      { id: "objects", title: "Členění na objekty", status: ai.objects.length ? "ok" : "missing", table: { columns: ["Objekt", "Název", "Zdroj"], rows: ai.objects.map((o) => [o.code, o.name, o.source]) } },
      {
        id: "params",
        title: "Technické parametry",
        status: ai.parameters.length ? "ok" : "missing",
        table: { columns: ["Parametr", "Hodnota", "Zdroj", "Stav"], rows: ai.parameters.map((p) => [p.label, p.value, p.source, p.status === "ok" ? "Nalezeno" : "Odvozeno"]), rowTones: ai.parameters.map((p) => (p.status === "ok" ? "default" : "warn")) },
      },
      { id: "dates", title: "Termíny", status: ai.dates.length ? "ok" : "missing", table: { columns: ["Termín", "Hodnota", "Zdroj"], rows: ai.dates.map((d) => [d.label, d.value, d.source]) } },
      conditionsSection(project),
    );
    if (ai.conflicts.length) sections.push({ id: "conflicts", title: "Rozpory mezi dokumenty", findings: ai.conflicts.map((c) => ({ severity: "error", title: c.title, detail: c.detail })) });
    if (ai.missing.length) sections.push({ id: "missing", title: "Chybějící údaje", findings: ai.missing.map((m) => ({ severity: "warning", title: m })) });
  } else {
    // deterministická extrakce: štítky, objekty, veličiny, data
    const codes = extractObjectCodes(corpus);
    const qty = extractQuantities(corpus).filter((q) => q.label);
    const dates = extractDates(corpus);
    const duration = /(\d{2,4})\s*pracovních\s*dn/iu.exec(corpus);
    const workers = /(\d{1,4})\s*osob/iu.exec(corpus);
    project = ProjectIntakeSchema.parse({
      projectName: grab(corpus, ["Název stavby", "Stavba", "Akce"]) || ctx.files("docs")[0].name.replace(/\.[^.]+$/, ""),
      location: grab(corpus, ["Místo stavby", "Místo", "Katastrální území", "k\\. ú\\."]),
      investor: grab(corpus, ["Investor", "Stavebník", "Objednatel", "Zadavatel"]),
      durationWorkingDays: duration ? Number(duration[1]) : null,
      peakWorkers: workers ? Number(workers[1]) : null,
      demolition: /bourán|demolic/i.test(corpus),
      waterProximity: /vodote|řek|potok|berounk|vltav|labe/i.test(corpus),
      railwayProximity: /koleji|kolejí|výluk/i.test(corpus) ? "adjacent" : "none",
      description: truncate(corpus.split(/\n\s*\n/).slice(0, 3).join("\n\n"), 1500),
      documentText: truncate(corpus, 200_000),
    });
    sections.push(
      identitySection(project),
      { id: "objects", title: "Členění na objekty", status: codes.length ? "inferred" : "missing", bullets: codes },
      { id: "params", title: "Nalezené veličiny", status: qty.length ? "inferred" : "missing", table: { columns: ["Popisek", "Hodnota", "Kontext"], rows: qty.slice(0, 60).map((q) => [q.label, `${formatCz(q.value)} ${q.unit}`, q.context]) } },
      { id: "dates", title: "Nalezené termíny", status: dates.length ? "inferred" : "missing", table: { columns: ["Termín", "Kontext"], rows: dates.map((d) => [d.raw, d.context]) } },
    );
  }

  const filled = countFilled(project);
  const report = newReport("extrakce-dat", "Data projektu", {
    subtitle: project.projectName,
    summary: ai?.summary ?? "Základní údaje vytěžené podle štítků a vzorů v textu. Plné vytěžení (účastníci, technologie, podmínky) provede AI.",
    meta: [{ label: "Podklady", value: ctx.files("docs").map((d) => d.name).join(", ") }],
    project,
  });
  report.stats = [
    { label: "vyplněných polí projektu", value: `${filled.filled}/${filled.total}`, tone: filled.filled / filled.total > 0.6 ? "good" : "warn" },
    { label: "dokumentů", value: ctx.files("docs").length },
    { label: "objektů", value: extractObjectCodes(corpus).length },
  ];
  report.sections = sections;
  return ctx.finish(report);
};

function identitySection(p: ProjectIntake): Section {
  const rows = [
    ["Název stavby", p.projectName],
    ["Místo", p.location],
    ["Investor / zadavatel", p.investor],
    ["Druh stavby", p.constructionTypes.map((c) => CONSTRUCTION_TYPES.find((x) => x.id === c)?.label).join(", ")],
    ["Doba výstavby", p.durationWorkingDays ? `${p.durationWorkingDays} prac. dní` : ""],
    ["Osob současně", p.peakWorkers ? String(p.peakWorkers) : ""],
    ["Počet zhotovitelů", p.contractorsCount ? String(p.contractorsCount) : ""],
  ];
  const missing = rows.filter((r) => !r[1]).length;
  return {
    id: "identity",
    title: "Identifikace stavby",
    status: (missing === 0 ? "ok" : missing > 3 ? "missing" : "inferred") as Status,
    table: { columns: ["Údaj", "Hodnota"], rows: rows.map(([a, b]) => [a, b || "— neuvedeno —"]), rowTones: rows.map((r) => (r[1] ? "default" : "warn")) },
  };
}

function conditionsSection(p: ProjectIntake): Section {
  const flags: [string, boolean][] = [
    ["Bourací práce", p.demolition],
    ["Práce u vody", p.waterProximity],
    ["Podzemní voda", p.groundwater],
    ["Podzemní sítě", p.undergroundUtilities],
    ["Venkovní vedení", p.overheadPowerLines],
    ["Noční práce", p.nightWork],
    ["Stísněné prostory", p.confinedSpaces],
    ["Elektrizovaná trať", p.railwayElectrified],
  ];
  return {
    id: "conditions",
    title: "Podmínky a technologie",
    status: "inferred",
    bullets: [
      `Činnosti: ${p.activities.map((a) => WORK_ACTIVITIES.find((x) => x.id === a)?.label).join(", ") || "—"}`,
      `Mechanizace: ${p.machinery.map((a) => MACHINERY.find((x) => x.id === a)?.label).join(", ") || "—"}`,
      `Materiály: ${p.materials.map((a) => MATERIALS.find((x) => x.id === a)?.label).join(", ") || "—"}`,
      `Podmínky: ${flags.filter((f) => f[1]).map((f) => f[0]).join(", ") || "—"}`,
    ],
  };
}

function countFilled(p: ProjectIntake) {
  const checks = [p.projectName, p.location, p.investor, p.constructionTypes.length, p.activities.length, p.machinery.length, p.durationWorkingDays, p.peakWorkers, p.contractorsCount, p.maxWorkHeightM, p.maxExcavationDepthM, p.description];
  return { filled: checks.filter((c) => c !== null && c !== "" && c !== 0).length, total: checks.length };
}

/* ————————————————————————————————————————————————
 * 16 PDF → Excel
 * ———————————————————————————————————————————————— */

export const pdfToExcel: ToolHandler = async (ctx) => {
  const docs = ctx.files("docs");
  if (!docs.length) throw new InputError("Nahrajte PDF.");

  const ai = await ctx.ai({
    system:
      "Převádíš tabulky z dokumentů do čistých dat pro Excel. Najdi všechny tabulky (soupisy prací, výkazy, seznamy, harmonogramy). Pro každou vrať název, stránku a sloupce. Každý řádek musí mít stejný počet buněk jako sloupců. Čísla zapisuj bez mezer mezi tisíci a s desetinnou čárkou. Sloučené buňky rozepiš, nadpisy oddílů dej do samostatného sloupce „Oddíl“, pokud existují. Nic nepřepočítávej ani nedoplňuj.",
    prompt: `${ctx.value("instructions") ? `Pokyn uživatele: ${ctx.value("instructions")}\n\n` : ""}${docs
      .filter((d) => !d.pdfBase64)
      .map((d) => `<dokument nazev="${d.name}">\n${truncate(d.text, 100_000)}\n</dokument>`)
      .join("\n")}`,
    docs: docs.filter((d) => d.pdfBase64),
    schema: z.object({
      summary: z.string(),
      tables: z.array(z.object({ name: z.string(), source: z.string(), columns: z.array(z.string()), rows: z.array(z.array(z.string())) })),
    }),
    maxTokens: 64000,
  });

  let tables: Table[];
  if (ai) {
    tables = ai.tables.map((t) => ({
      name: `${t.name}${t.source ? ` (${t.source})` : ""}`,
      columns: t.columns,
      rows: t.rows.map((r) => (r.length === t.columns.length ? r : [...r, ...Array(Math.max(0, t.columns.length - r.length)).fill("")].slice(0, t.columns.length))),
    }));
  } else {
    tables = docs
      .map((d) => {
        const rows = (d.rows ?? textToRows(d.text)).filter((r) => r.length >= 3);
        const width = mode(rows.map((r) => r.length));
        const clean = rows.filter((r) => r.length === width);
        return clean.length > 1 ? ({ name: d.name, columns: clean[0], rows: clean.slice(1) } as Table) : null;
      })
      .filter((t): t is Table => t !== null);
    if (!tables.length) ctx.notes.push("Bez AI se rozpoznávají jen tabulky se zřetelnými sloupci v textové vrstvě.");
  }

  const report = newReport("pdf-excel", "Tabulky z dokumentu", {
    subtitle: docs.map((d) => d.name).join(", "),
    summary: ai?.summary ?? `Rozpoznáno ${tables.length} tabulek.`,
    sheets: tables,
  });
  report.stats = [
    { label: "tabulek", value: tables.length, tone: tables.length ? "good" : "bad" },
    { label: "řádků celkem", value: tables.reduce((n, t) => n + t.rows.length, 0) },
  ];
  report.sections = tables.map((t, i) => ({ id: `t${i}`, title: t.name ?? `Tabulka ${i + 1}`, table: t }));
  return ctx.finish(report);
};

function mode(list: number[]): number {
  const c = new Map<number, number>();
  for (const n of list) c.set(n, (c.get(n) ?? 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
}
