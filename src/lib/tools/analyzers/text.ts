/**
 * Deterministické analyzátory textu stavební dokumentace.
 * Nepotřebují AI – běží vždy a jejich výsledky AI dostává jako kontext.
 */

export function fold(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Číslo v českém zápisu: „1 250,5“, „1.250,5“, „1250.5“. */
export function parseCzNumber(raw: string): number | null {
  let s = raw.replace(/[\s  ]/g, "");
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, "");
  s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function formatCz(n: number): string {
  return n.toLocaleString("cs-CZ", { maximumFractionDigits: 3 });
}

/* ——— Objekty (SO / PS / IO …) ——— */

const OBJECT_RE = /\b(SO|PS|IO|DIO|ZS|DSO)[\s\-.]?(\d{2,4}(?:\.\d{1,2})?)\b/g;

export function extractObjectCodes(text: string): string[] {
  const set = new Set<string>();
  for (const m of text.matchAll(OBJECT_RE)) set.add(`${m[1]} ${m[2]}`);
  return [...set].sort(compareCodes);
}

function compareCodes(a: string, b: string) {
  const [pa, na] = a.split(" ");
  const [pb, nb] = b.split(" ");
  return pa.localeCompare(pb) || Number(na) - Number(nb);
}

/* ——— Veličiny s jednotkou ——— */

export interface Quantity {
  value: number;
  unit: string;
  raw: string;
  /** Normalizovaný popisek (2–4 slova před hodnotou). */
  label: string;
  context: string;
  index: number;
}

const UNIT_MAP: Record<string, string> = {
  "m2": "m²", "m²": "m²", "m3": "m³", "m³": "m³", "km": "km", "m": "m", "mm": "mm", "cm": "cm",
  "t": "t", "kg": "kg", "ks": "ks", "kč": "Kč", "kc": "Kč", "czk": "Kč", "%": "%", "kn": "kN", "mpa": "MPa",
  "dnu": "dní", "dní": "dní", "dni": "dní", "mesicu": "měsíců", "měsíců": "měsíců", "tydnu": "týdnů", "týdnů": "týdnů",
  "l/s": "l/s", "kv": "kV", "kw": "kW",
};

const NUM = String.raw`\d{1,3}(?:[\s  .]\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?`;
const UNIT = String.raw`m²|m³|m2|m3|km|mm|cm|m|t|kg|ks|Kč|Kc|CZK|%|kN|MPa|dnů|dní|dni|měsíců|mesicu|týdnů|tydnu|l\/s|kV|kW`;
const QTY_RE = new RegExp(String.raw`(${NUM})\s?(${UNIT})(?![\p{L}\d])`, "giu");

const STOP = new Set(["a", "i", "v", "ve", "na", "je", "o", "s", "se", "z", "ze", "do", "k", "ke", "pro", "cca", "celkem", "min", "max", "až", "az", "bude", "činí", "cini", "je", "jsou", "mm", "m"]);

export function labelBefore(text: string, index: number): string {
  const before = text.slice(Math.max(0, index - 80), index);
  const line = before.split(/[\n;:()•]/).pop() ?? "";
  const words = fold(line)
    .replace(/[^\p{L}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w));
  return words.slice(-3).join(" ");
}

export function extractQuantities(text: string): Quantity[] {
  const out: Quantity[] = [];
  for (const m of text.matchAll(QTY_RE)) {
    const value = parseCzNumber(m[1]);
    if (value === null) continue;
    const unit = UNIT_MAP[fold(m[2])] ?? m[2];
    const i = m.index ?? 0;
    out.push({
      value,
      unit,
      raw: m[0],
      label: labelBefore(text, i),
      context: snippet(text, i, m[0].length),
      index: i,
    });
  }
  return out;
}

export function snippet(text: string, index: number, len: number, pad = 50): string {
  const s = Math.max(0, index - pad);
  const e = Math.min(text.length, index + len + pad);
  return (s > 0 ? "…" : "") + text.slice(s, e).replace(/\s+/g, " ").trim() + (e < text.length ? "…" : "");
}

/* ——— Data a termíny ——— */

export interface DateMention {
  raw: string;
  iso: string | null;
  year: number | null;
  label: string;
  context: string;
}

const MONTHS: Record<string, number> = {
  leden: 1, ledna: 1, unor: 2, unora: 2, brezen: 3, brezna: 3, duben: 4, dubna: 4, kveten: 5, kvetna: 5, cerven: 6, cervna: 6,
  cervenec: 7, cervence: 7, srpen: 8, srpna: 8, zari: 9, rijen: 10, rijna: 10, listopad: 11, listopadu: 11, prosinec: 12, prosince: 12,
};

export function extractDates(text: string): DateMention[] {
  const out: DateMention[] = [];
  const dmy = /\b(\d{1,2})\.\s?(\d{1,2})\.\s?(20\d{2})\b/g;
  for (const m of text.matchAll(dmy)) {
    const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) continue;
    out.push({ raw: m[0], iso: `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`, year: y, label: labelBefore(text, m.index ?? 0), context: snippet(text, m.index ?? 0, m[0].length) });
  }
  const my = /\b(leden|ledna|únor|února|březen|března|duben|dubna|květen|května|červen|června|červenec|července|srpen|srpna|září|říjen|října|listopad|listopadu|prosinec|prosince)\s+(20\d{2})\b/giu;
  for (const m of text.matchAll(my)) {
    const mo = MONTHS[fold(m[1])];
    out.push({ raw: m[0], iso: `${m[2]}-${String(mo).padStart(2, "0")}`, year: Number(m[2]), label: labelBefore(text, m.index ?? 0), context: snippet(text, m.index ?? 0, m[0].length) });
  }
  return out;
}

/* ——— Zástupné texty a nedokončená místa ——— */

const PLACEHOLDERS: [RegExp, string][] = [
  [/\bX{2,}\b/g, "Zástupný text „XXX“"],
  [/\?{2,}/g, "Otazníky „???“"],
  [/\b(doplnit|DOPLNIT|Doplnit|dopln[ií]t)\b/gu, "Poznámka „doplnit“"],
  [/\bTBD\b|\bTODO\b|\bN\/A\b/g, "Poznámka TBD/TODO"],
  [/\[\s*(?:…|\.\.\.)\s*\]/g, "Prázdná závorka […]"],
  [/…{2,}|\.{5,}|_{4,}/g, "Nevyplněné místo (tečky / podtržítka)"],
  [/\bxx\.\s?xx\.\s?(?:xxxx|20xx|20\d{2})\b/gi, "Nevyplněné datum"],
  [/\b(upřesnit|upresnit|ověřit|overit)\b/giu, "Poznámka „upřesnit / ověřit“"],
];

export interface Placeholder {
  kind: string;
  raw: string;
  context: string;
}

export function findPlaceholders(text: string): Placeholder[] {
  const out: Placeholder[] = [];
  for (const [re, kind] of PLACEHOLDERS) {
    for (const m of text.matchAll(re)) out.push({ kind, raw: m[0], context: snippet(text, m.index ?? 0, m[0].length, 60) });
  }
  return out;
}

/* ——— Porovnání dokumentů ——— */

export interface NamedText {
  name: string;
  text: string;
}

export interface ValueConflict {
  label: string;
  unit: string;
  values: { doc: string; value: number; context: string }[];
}

/**
 * Najde stejně pojmenované veličiny (stejný popisek + jednotka), které mají
 * v různých dokumentech různou hodnotu. Např. „zastavěná plocha“ 1 250 m² vs 1 320 m².
 */
export function compareLabelledValues(docs: NamedText[]): ValueConflict[] {
  const groups = new Map<string, { doc: string; value: number; context: string }[]>();
  for (const d of docs) {
    const seen = new Set<string>();
    for (const q of extractQuantities(d.text)) {
      if (!q.label || q.label.split(" ").length < 1 || q.unit === "%") continue;
      const key = `${q.label}|${q.unit}`;
      const dedupe = `${key}|${q.value}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      const g = groups.get(key) ?? [];
      g.push({ doc: d.name, value: q.value, context: q.context });
      groups.set(key, g);
    }
  }
  const out: ValueConflict[] = [];
  for (const [key, vals] of groups) {
    const docsInvolved = new Set(vals.map((v) => v.doc));
    const distinct = new Set(vals.map((v) => v.value));
    if (docsInvolved.size > 1 && distinct.size > 1) {
      const [label, unit] = key.split("|");
      out.push({ label, unit, values: vals });
    }
  }
  return out;
}

export interface CodeCoverage {
  code: string;
  presentIn: string[];
  missingIn: string[];
}

export function compareObjectCodes(docs: NamedText[]): CodeCoverage[] {
  const perDoc = docs.map((d) => ({ name: d.name, codes: new Set(extractObjectCodes(d.text)) }));
  const all = new Set(perDoc.flatMap((d) => [...d.codes]));
  return [...all].sort(compareCodes).map((code) => ({
    code,
    presentIn: perDoc.filter((d) => d.codes.has(code)).map((d) => d.name),
    missingIn: perDoc.filter((d) => !d.codes.has(code)).map((d) => d.name),
  }));
}

export interface Milestone {
  doc: string;
  /** Normalizovaná hodnota: „2027“, „11/2027“ nebo „2027-11-30“. */
  value: string;
  year: number;
  context: string;
}

/**
 * Termíny milníků (zahájení / dokončení / předání) v dokumentech.
 * Rozlišuje přesnost: den, měsíc/rok, rok.
 */
export function extractMilestones(docs: NamedText[], stems: string[]): Milestone[] {
  const out: Milestone[] = [];
  const re = /(zahájen\w*|dokončen\w*|ukončen\w*|předán\w*)[^.\n]{0,40}?\b(?:(\d{1,2})\.\s?(\d{1,2})\.\s?|(\d{1,2})\s?[/.]\s?)?(20\d{2})\b/giu;
  for (const d of docs) {
    for (const m of d.text.matchAll(re)) {
      if (!stems.some((t) => fold(m[1]).startsWith(t))) continue;
      const year = Number(m[5]);
      const value = m[2] ? `${year}-${m[3].padStart(2, "0")}-${m[2].padStart(2, "0")}` : m[4] ? `${m[4].padStart(2, "0")}/${year}` : String(year);
      out.push({ doc: d.name, value, year, context: snippet(d.text, m.index ?? 0, m[0].length) });
    }
  }
  return out;
}

/** Rozpor milníků: porovnává na společné přesnosti (rok vs. měsíc/rok). */
export function milestoneConflict(list: Milestone[]): boolean {
  if (new Set(list.map((l) => l.doc)).size < 2) return false;
  if (new Set(list.map((l) => l.year)).size > 1) return true;
  const months = list.filter((l) => l.value.includes("/") || l.value.includes("-")).map((l) => (l.value.includes("/") ? l.value : `${l.value.slice(5, 7)}/${l.year}`));
  return new Set(months).size > 1;
}

/**
 * Rozdělí text na odstavce (pro diff a vyhledávání).
 * Prázdný řádek vždy ukončí odstavec; jinak se nový odstavec začne, když
 * předchozí řádek končí interpunkcí nebo když řádek vypadá jako nadpis/odrážka.
 * Zalomené řádky z PDF (bez interpunkce na konci) se spojí.
 */
export function paragraphs(text: string): string[] {
  const out: string[] = [];
  let cur = "";
  const flush = () => {
    const t = cur.replace(/\s+/g, " ").trim();
    if (t) out.push(t);
    cur = "";
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    const startsBlock = /^(?:[A-Z]\.\d|\d+(?:\.\d+)*[.)]?\s|[•\-–]\s|[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][^.]{0,60}:)/.test(line);
    if (cur && (/[.:;!?]$/.test(cur.trim()) || startsBlock)) flush();
    cur += (cur ? " " : "") + line;
  }
  flush();
  return out;
}

/** Odstavce obsahující některé z klíčových slov (bez diakritiky). */
export function relevantParagraphs(docs: NamedText[], keywords: string[], limit = 4): { doc: string; text: string }[] {
  if (!keywords.length) return [];
  const hits: { doc: string; text: string; score: number }[] = [];
  for (const d of docs) {
    for (const para of paragraphs(d.text)) {
      const f = fold(para);
      const score = keywords.filter((k) => f.includes(k)).length;
      if (score) hits.push({ doc: d.name, text: para, score });
    }
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}\n[… zkráceno, celkem ${text.length} znaků]` : text;
}
