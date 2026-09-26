"use client";

import { useCallback, useEffect, useState } from "react";
import { STORES, tx } from "./idb";

/**
 * Lokální knihovna dokumentů (IndexedDB) – extrahovaný text dokumentů
 * zůstává v prohlížeči uživatele. Slouží Copilotu, vyhledávání a výběru
 * podkladů v nástrojích. Originály souborů se neukládají.
 */

export interface LibraryDoc {
  id: string;
  name: string;
  text: string;
  size: number;
  kind: string;
  sha256: string;
  addedAt: number;
}

const EVENT = "sagasta:library";
const t = <T,>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void) => tx<T>(STORES.library, mode, fn);

export async function listDocs(): Promise<LibraryDoc[]> {
  try {
    const all = (await t<LibraryDoc[]>("readonly", (s) => s.getAll())) ?? [];
    return all.sort((a, b) => b.addedAt - a.addedAt);
  } catch {
    return [];
  }
}

export async function addDocs(docs: Omit<LibraryDoc, "id" | "addedAt">[]): Promise<number> {
  const existing = new Set((await listDocs()).map((d) => d.sha256));
  const fresh = docs.filter((d) => d.text && !existing.has(d.sha256));
  await t("readwrite", (s) => {
    for (const d of fresh) s.put({ ...d, id: crypto.randomUUID(), addedAt: Date.now() });
  });
  window.dispatchEvent(new CustomEvent(EVENT));
  return fresh.length;
}

export async function removeDoc(id: string) {
  await t("readwrite", (s) => s.delete(id));
  window.dispatchEvent(new CustomEvent(EVENT));
}

export async function clearLibrary() {
  await t("readwrite", (s) => s.clear());
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function useLibrary() {
  const [docs, setDocs] = useState<LibraryDoc[]>([]);
  const [ready, setReady] = useState(false);
  const refresh = useCallback(async () => {
    setDocs(await listDocs());
    setReady(true);
  }, []);
  useEffect(() => {
    void refresh();
    window.addEventListener(EVENT, refresh);
    return () => window.removeEventListener(EVENT, refresh);
  }, [refresh]);
  return { docs, ready, refresh };
}

/** Knihovní dokument jako soubor pro nástroj (text/plain). */
export function libraryDocToUpload(d: LibraryDoc) {
  const bytes = new TextEncoder().encode(d.text);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const name = /\.(txt|md)$/i.test(d.name) ? d.name : `${d.name.replace(/\.[^.]+$/, "")}.txt`;
  return { name, data: btoa(bin), size: bytes.length };
}
