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
