"use client";

import type { Report } from "./tools/report";
import { STORES, tx } from "./idb";

/** Historie výsledků nástrojů (lokálně, posledních 10 na nástroj). */

export interface HistoryEntry {
  id: string;
  tool: string;
  title: string;
  createdAt: number;
  report: Report;
}

const PER_TOOL = 10;

export async function saveHistory(report: Report): Promise<void> {
  try {
    const entry: HistoryEntry = { id: crypto.randomUUID(), tool: report.tool, title: report.subtitle ? `${report.title} – ${report.subtitle}` : report.title, createdAt: Date.now(), report };
    await tx(STORES.history, "readwrite", (s) => s.put(entry));
    const list = await listHistory(report.tool);
    const extra = list.slice(PER_TOOL);
    if (extra.length) await tx(STORES.history, "readwrite", (s) => extra.forEach((e) => s.delete(e.id)));
  } catch {
    /* historie je jen pohodlí – chyby ignorujeme */
  }
}

export async function listHistory(tool: string): Promise<HistoryEntry[]> {
  try {
    const all = (await tx<HistoryEntry[]>(STORES.history, "readonly", (s) => s.index("tool").getAll(tool))) ?? [];
    return all.sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

export async function clearHistory(tool: string): Promise<void> {
  const list = await listHistory(tool);
  await tx(STORES.history, "readwrite", (s) => list.forEach((e) => s.delete(e.id)));
}
