import { diffArrays } from "diff";
import { extractObjectCodes, extractQuantities, formatCz, paragraphs } from "./text";

/** Deterministické porovnání dvou revizí dokumentu. */

export interface RevisionDiff {
  added: string[];
  removed: string[];
  /** Dvojice odstavců, které se změnily jen částečně (podobné). */
  modified: { before: string; after: string }[];
  unchanged: number;
  objectsAdded: string[];
  objectsRemoved: string[];
  numberChanges: { label: string; before: string; after: string }[];
}

function similarity(a: string, b: string): number {
  const wa = new Set(a.toLowerCase().split(/\s+/));
  const wb = new Set(b.toLowerCase().split(/\s+/));
  let inter = 0;
  for (const w of wa) if (wb.has(w)) inter++;
  return inter / Math.max(1, Math.max(wa.size, wb.size));
}

export function compareRevisions(before: string, after: string): RevisionDiff {
  const pa = paragraphs(before);
  const pb = paragraphs(after);
  const parts = diffArrays(pa, pb);

  const removedRaw: string[] = [];
  const addedRaw: string[] = [];
  let unchanged = 0;
  for (const p of parts) {
    if (p.added) addedRaw.push(...p.value);
    else if (p.removed) removedRaw.push(...p.value);
    else unchanged += p.value.length;
  }

  // spáruj podobné odstavce jako „změněné“
  const modified: { before: string; after: string }[] = [];
  const usedAdded = new Set<number>();
  const removed: string[] = [];
  for (const r of removedRaw) {
    let best = -1;
    let bestScore = 0.45;
    addedRaw.forEach((a, i) => {
      if (usedAdded.has(i)) return;
      const s = similarity(r, a);
      if (s > bestScore) (bestScore = s), (best = i);
    });
    if (best >= 0) {
      usedAdded.add(best);
      modified.push({ before: r, after: addedRaw[best] });
    } else removed.push(r);
  }
  const added = addedRaw.filter((_, i) => !usedAdded.has(i));

  const ca = new Set(extractObjectCodes(before));
  const cb = new Set(extractObjectCodes(after));

  // změny číselných hodnot se stejným popiskem
  const qa = new Map(extractQuantities(before).filter((q) => q.label).map((q) => [`${q.label}|${q.unit}`, q]));
  const numberChanges: RevisionDiff["numberChanges"] = [];
  for (const q of extractQuantities(after)) {
    const prev = qa.get(`${q.label}|${q.unit}`);
    if (q.label && prev && prev.value !== q.value) {
      numberChanges.push({ label: q.label, before: `${formatCz(prev.value)} ${q.unit}`, after: `${formatCz(q.value)} ${q.unit}` });
    }
  }

  return {
    added,
    removed,
    modified,
    unchanged,
    objectsAdded: [...cb].filter((c) => !ca.has(c)),
    objectsRemoved: [...ca].filter((c) => !cb.has(c)),
    numberChanges: dedupeBy(numberChanges, (n) => `${n.label}|${n.before}|${n.after}`),
  };
}

function dedupeBy<T>(list: T[], key: (t: T) => string): T[] {
  const seen = new Set<string>();
  return list.filter((i) => (seen.has(key(i)) ? false : (seen.add(key(i)), true)));
}

/** Zvýraznění změn na úrovni slov – pro zobrazení „před → po“. */
export { diffWords } from "diff";
