import { fold, formatCz, parseCzNumber } from "./text";

/**
 * Deterministická kontrola výkazu výměr / rozpočtu (XLSX/CSV/text).
 * Najde duplicity, nulová a záporná množství, chybné součiny a nejednotné jednotky.
 */

export interface BoqItem {
  row: number;
  code: string;
  description: string;
  unit: string;
  quantity: number | null;
  unitPrice: number | null;
  total: number | null;
}

export interface BoqIssue {
  severity: "error" | "warning" | "info";
  title: string;
  detail: string;
  rows: number[];
}

const HEADERS = {
  code: ["kod", "cislo polozky", "polozka", "c. pol", "cislo", "pc", "kod polozky"],
  description: ["popis", "nazev", "název", "text", "popis polozky", "nazev polozky"],
  unit: ["mj", "m.j.", "jednotka", "jedn"],
  quantity: ["mnozstvi", "vymera", "mnoz", "pocet", "vymery"],
  unitPrice: ["jednotkova cena", "j. cena", "cena/mj", "jedn. cena", "j.cena", "cena mj"],
  total: ["cena celkem", "celkem", "celkova cena", "cena"],
};

type Col = keyof typeof HEADERS;

function matchHeader(cell: string): Col | null {
  const f = fold(cell).replace(/[^\p{L}\d./ ]/gu, "").trim();
  if (!f) return null;
  // pořadí je důležité – „jednotková cena“ dřív než „cena“
  const order: Col[] = ["unitPrice", "total", "quantity", "unit", "description", "code"];
  for (const col of order) if (HEADERS[col].some((h) => f === h || f.startsWith(h))) return col;
  return null;
}

export function parseBoq(rows: string[][]): { items: BoqItem[]; headerRow: number | null; columns: Partial<Record<Col, number>> } {
  let headerRow: number | null = null;
  let columns: Partial<Record<Col, number>> = {};
  for (let r = 0; r < Math.min(rows.length, 30); r++) {
    const cols: Partial<Record<Col, number>> = {};
    rows[r].forEach((c, i) => {
      const m = matchHeader(c);
      if (m && cols[m] === undefined) cols[m] = i;
    });
    if (cols.description !== undefined && (cols.quantity !== undefined || cols.unit !== undefined)) {
      headerRow = r;
      columns = cols;
      break;
    }
  }
  if (headerRow === null) return { items: [], headerRow: null, columns: {} };

  const items: BoqItem[] = [];
  const get = (row: string[], c?: number) => (c === undefined ? "" : (row[c] ?? "").trim());
  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r];
    const description = get(row, columns.description);
    const quantityRaw = get(row, columns.quantity);
    if (!description && !quantityRaw) continue;
    const quantity = quantityRaw ? parseCzNumber(quantityRaw) : null;
    // řádky bez množství i jednotky jsou nadpisy oddílů
    if (quantity === null && !get(row, columns.unit)) continue;
    items.push({
      row: r + 1,
      code: get(row, columns.code),
      description,
      unit: get(row, columns.unit),
      quantity,
      unitPrice: parseMaybe(get(row, columns.unitPrice)),
      total: parseMaybe(get(row, columns.total)),
    });
  }
  return { items, headerRow, columns };
}

const parseMaybe = (s: string) => (s ? parseCzNumber(s.replace(/kč|czk/gi, "")) : null);

const normDesc = (d: string) => fold(d).replace(/[^\p{L}\d]+/gu, " ").trim();

export function checkBoq(items: BoqItem[]): BoqIssue[] {
  const issues: BoqIssue[] = [];

  // duplicity: stejný kód, nebo stejný popis + jednotka
  const byKey = new Map<string, BoqItem[]>();
  for (const it of items) {
    const key = it.code ? `c:${fold(it.code)}` : `d:${normDesc(it.description)}|${fold(it.unit)}`;
    byKey.set(key, [...(byKey.get(key) ?? []), it]);
  }
  for (const group of byKey.values()) {
    if (group.length < 2) continue;
    const same = new Set(group.map((g) => g.quantity)).size === 1;
    issues.push({
      severity: same ? "error" : "warning",
      title: same ? "Duplicitní položka" : "Opakovaná položka s různým množstvím",
      detail: `${group[0].code ? `${group[0].code} – ` : ""}${group[0].description} (${group.map((g) => `ř. ${g.row}: ${g.quantity ?? "?"} ${g.unit}`).join(", ")})`,
      rows: group.map((g) => g.row),
    });
  }

  for (const it of items) {
    if (it.quantity === null) {
      issues.push({ severity: "warning", title: "Chybí množství", detail: `ř. ${it.row}: ${it.description}`, rows: [it.row] });
    } else if (it.quantity === 0) {
      issues.push({ severity: "warning", title: "Nulové množství", detail: `ř. ${it.row}: ${it.description}`, rows: [it.row] });
    } else if (it.quantity < 0) {
      issues.push({ severity: "info", title: "Záporné množství (odpočet?)", detail: `ř. ${it.row}: ${it.description} = ${formatCz(it.quantity)} ${it.unit}`, rows: [it.row] });
    }
    if (!it.unit) issues.push({ severity: "warning", title: "Chybí měrná jednotka", detail: `ř. ${it.row}: ${it.description}`, rows: [it.row] });
    if (it.quantity !== null && it.unitPrice !== null && it.total !== null) {
      const expected = it.quantity * it.unitPrice;
      if (Math.abs(expected - it.total) > Math.max(1, Math.abs(expected) * 0.005)) {
        issues.push({
          severity: "error",
          title: "Nesouhlasí součin množství × jednotková cena",
          detail: `ř. ${it.row}: ${formatCz(it.quantity)} × ${formatCz(it.unitPrice)} = ${formatCz(expected)}, uvedeno ${formatCz(it.total)}`,
          rows: [it.row],
        });
      }
    }
  }

  // stejný popis, různé jednotky
  const byDesc = new Map<string, BoqItem[]>();
  for (const it of items) byDesc.set(normDesc(it.description), [...(byDesc.get(normDesc(it.description)) ?? []), it]);
  for (const group of byDesc.values()) {
    const units = new Set(group.map((g) => fold(g.unit)));
    if (group.length > 1 && units.size > 1) {
      issues.push({
        severity: "warning",
        title: "Stejná položka v různých jednotkách",
        detail: `${group[0].description}: ${group.map((g) => `ř. ${g.row} [${g.unit}]`).join(", ")}`,
        rows: group.map((g) => g.row),
      });
    }
  }

  return issues;
}

export function boqTotal(items: BoqItem[]): number | null {
  const withTotals = items.filter((i) => i.total !== null);
  return withTotals.length ? withTotals.reduce((s, i) => s + (i.total ?? 0), 0) : null;
}

/** Text → řádky (tabulátory, středníky nebo 2+ mezery). */
export function textToRows(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => (l.includes("\t") ? l.split("\t") : l.includes(";") ? l.split(";") : l.split(/\s{2,}/)).map((c) => c.trim()));
}
