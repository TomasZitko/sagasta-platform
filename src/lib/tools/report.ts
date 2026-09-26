import { z } from "zod";

/**
 * Jednotný výstupní model všech nástrojů.
 *
 * Každý nástroj převádí svůj výsledek (AI + deterministické kontroly) na
 * `Report`. Jeden prohlížeč a jeden exportér (DOCX / XLSX) pak obslouží
 * všechny nástroje stejně kvalitně.
 */

/** ok = nalezeno/potvrzeno · inferred = odvozeno, ověřit · missing = chybí vstup */
export type Status = "ok" | "inferred" | "missing";
export type Severity = "error" | "warning" | "info" | "ok";
export type Tone = "default" | "good" | "warn" | "bad" | "accent";

export interface Finding {
  severity: Severity;
  title: string;
  detail?: string;
  /** Doklad / citace / umístění v dokumentu. */
  evidence?: string;
}

export interface Table {
  name?: string;
  columns: string[];
  rows: string[][];
  /** Volitelné zvýraznění řádků (stejná délka jako rows). */
  rowTones?: Tone[];
}

export interface Section {
  id: string;
  title: string;
  status?: Status;
  /** Odstavce oddělené prázdným řádkem. */
  body?: string;
  bullets?: string[];
  table?: Table;
  findings?: Finding[];
  /** Co chybí / co ověřit – zobrazeno jako poznámka pod sekcí. */
  gaps?: string[];
}

export interface Stat {
  label: string;
  value: string | number;
  tone?: Tone;
}

export interface Report {
  tool: string;
  title: string;
  subtitle?: string;
  generatedAt: string;
  mode: "ai" | "rules";
  model: string | null;
  meta: { label: string; value: string }[];
  summary?: string;
  stats: Stat[];
  sections: Section[];
  /** Upozornění na běh nástroje (např. AI nedostupná). */
  notes: string[];
  /** Otázky pro projektanta / odpovědnou osobu. */
  questions: string[];
  /** Data projektu k uložení jako aktivní projekt (nástroj Extrakce dat). */
  project?: unknown;
  /** Tabulky určené k exportu do Excelu jako samostatné listy. */
  sheets?: Table[];
  /** Návrh přejmenování souborů (nástroj Pojmenování) – klient z nich sestaví ZIP. */
  renames?: { from: string; to: string }[];
  /** Dokument je dopis – DOCX se vysází jako korespondence. */
  letter?: {
    recipient: string;
    subject: string;
    reference: string;
    signature: string;
  };
}

export const STATUS_LABEL: Record<Status, string> = {
  ok: "Nalezeno",
  inferred: "Odvozeno – ověřit",
  missing: "Chybí údaje",
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  error: "Chyba",
  warning: "Upozornění",
  info: "Informace",
  ok: "V pořádku",
};

export function newReport(tool: string, title: string, partial: Partial<Report> = {}): Report {
  return {
    tool,
    title,
    generatedAt: new Date().toISOString(),
    mode: "rules",
    model: null,
    meta: [],
    stats: [],
    sections: [],
    notes: [],
    questions: [],
    ...partial,
  };
}

export function countStatuses(sections: Section[]): Record<Status, number> {
  const c: Record<Status, number> = { ok: 0, inferred: 0, missing: 0 };
  for (const s of sections) if (s.status) c[s.status]++;
  return c;
}

export function statusStats(sections: Section[]): Stat[] {
  const c = countStatuses(sections);
  return [
    { label: "sekcí nalezeno", value: c.ok, tone: "good" },
    { label: "odvozeno – ověřit", value: c.inferred, tone: c.inferred ? "warn" : "default" },
    { label: "chybí údaje", value: c.missing, tone: c.missing ? "bad" : "default" },
  ];
}

export const severityRank: Record<Severity, number> = { error: 0, warning: 1, info: 2, ok: 3 };

export const sortFindings = (f: Finding[]) => [...f].sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);

/** Prostý text reportu – pro kopírování do e-mailu. */
export function reportToText(r: Report): string {
  const out: string[] = [r.title];
  if (r.subtitle) out.push(r.subtitle);
  if (r.letter) out.push(`Věc: ${r.letter.subject}`);
  if (r.summary) out.push("", r.summary);
  for (const s of r.sections) {
    out.push("", s.title.toUpperCase());
    if (s.body) out.push(s.body);
    if (s.bullets?.length) out.push(...s.bullets.map((b) => `• ${b}`));
    if (s.table) {
      out.push(s.table.columns.join(" | "));
      for (const row of s.table.rows) out.push(row.join(" | "));
    }
    if (s.findings?.length) out.push(...s.findings.map((f) => `[${SEVERITY_LABEL[f.severity]}] ${f.title}${f.detail ? ` – ${f.detail}` : ""}`));
    if (s.gaps?.length) out.push(...s.gaps.map((g) => `(!) ${g}`));
  }
  if (r.letter) out.push("", r.letter.signature);
  if (r.questions.length) out.push("", "OTÁZKY", ...r.questions.map((q, i) => `${i + 1}. ${q}`));
  return out.join("\n");
}

/* ——— Validace reportu pro export (vstup od klienta) ——— */

const Str = (max: number) => z.string().max(max);
const TableSchema = z.object({
  name: Str(300).optional(),
  columns: z.array(Str(300)).max(40),
  rows: z.array(z.array(Str(20_000)).max(40)).max(5000),
  rowTones: z.array(z.enum(["default", "good", "warn", "bad", "accent"])).max(5000).optional(),
});
const FindingSchema = z.object({ severity: z.enum(["error", "warning", "info", "ok"]), title: Str(2000), detail: Str(20_000).optional(), evidence: Str(20_000).optional() });

export const ReportSchema = z.object({
  tool: Str(80),
  title: Str(500),
  subtitle: Str(2000).optional(),
  generatedAt: Str(40),
  mode: z.enum(["ai", "rules"]),
  model: Str(80).nullable(),
  meta: z.array(z.object({ label: Str(200), value: Str(5000) })).max(50),
  summary: Str(50_000).optional(),
  stats: z.array(z.object({ label: Str(200), value: z.union([Str(200), z.number()]), tone: z.enum(["default", "good", "warn", "bad", "accent"]).optional() })).max(20),
  sections: z
    .array(
      z.object({
        id: Str(80),
        title: Str(500),
        status: z.enum(["ok", "inferred", "missing"]).optional(),
        body: Str(200_000).optional(),
        bullets: z.array(Str(20_000)).max(500).optional(),
        table: TableSchema.optional(),
        findings: z.array(FindingSchema).max(1000).optional(),
        gaps: z.array(Str(5000)).max(200).optional(),
      }),
    )
    .max(300),
  notes: z.array(Str(2000)).max(50),
  questions: z.array(Str(2000)).max(100),
  project: z.unknown().optional(),
  sheets: z.array(TableSchema).max(30).optional(),
  renames: z.array(z.object({ from: Str(300), to: Str(300) })).max(100).optional(),
  letter: z.object({ recipient: Str(1000), subject: Str(1000), reference: Str(300), signature: Str(1000) }).optional(),
});

/** Ochrana proti vzorcové injekci v tabulkových procesorech (CSV/XLSX). */
export function neutralizeFormula(v: string): string {
  return /^[=+\-@\t\r]/.test(v) && !/^-?\d+([.,]\d+)?$/.test(v.trim()) ? `'${v}` : v;
}
