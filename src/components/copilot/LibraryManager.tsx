"use client";

import { useMemo, useRef, useState } from "react";
import { addDocs, clearLibrary, removeDoc, useLibrary } from "@/lib/library";
import { useCommands } from "../ux/hotkeys";
import { toast } from "../ux/toast";

const fmt = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} kB`);

export function LibraryManager() {
  const { docs, ready } = useLibrary();
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [q, setQ] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const search = useRef<HTMLInputElement>(null);

  const shown = useMemo(() => docs.filter((d) => d.name.toLowerCase().includes(q.toLowerCase())), [docs, q]);
  const total = docs.reduce((n, d) => n + d.text.length, 0);

  useCommands([
    { id: "lib-add", label: "Přidat dokumenty do knihovny", group: "Knihovna", keys: "alt+n", run: () => input.current?.click() },
    { id: "lib-search", label: "Hledat v knihovně", group: "Knihovna", keys: "/", run: () => search.current?.focus() },
  ]);

  async function upload(list: File[]) {
    if (!list.length) return;
    setBusy(true);
    try {
      let added = 0;
      // po dávkách – drží velikost požadavků pod limitem
      for (let i = 0; i < list.length; i += 8) {
        const batch = await Promise.all(
          list.slice(i, i + 8).map(async (f) => ({ name: f.name, size: f.size, data: await toBase64(f) })),
        );
        const res = await fetch("/api/extract", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ files: batch }) });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? "Chyba");
        for (const d of data as { name: string; warning?: string; text: string }[]) if (d.warning && !d.text) toast(d.warning, "bad");
        added += await addDocs(data);
      }
      toast(added ? `Přidáno do knihovny: ${added}` : "Žádné nové dokumenty (duplicity se přeskakují)", added ? "good" : "default");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Nahrání selhalo", "bad");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack" style={{ gap: 20, paddingBottom: 80 }}>
      <div
        className="dropzone dropzone--big"
        data-over={over}
        role="button"
        tabIndex={0}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), input.current?.click())}
        onDragOver={(e) => (e.preventDefault(), setOver(true))}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void upload([...e.dataTransfer.files]);
        }}
      >
        {busy ? (
          <span className="row" style={{ justifyContent: "center" }}>
            <span className="spinner" aria-hidden /> Čtu dokumenty…
          </span>
        ) : (
          <>
            <strong>Přetáhněte dokumenty sem</strong>
            <div className="field__hint">PDF, DOCX, XLSX, TXT · text se extrahuje na serveru a uloží jen ve vašem prohlížeči</div>
          </>
        )}
        <input ref={input} type="file" multiple hidden accept=".pdf,.docx,.xlsx,.csv,.txt,.md" onChange={(e) => (void upload([...(e.target.files ?? [])]), (e.target.value = ""))} />
      </div>

      <div className="toolbar">
        <div className="stats" style={{ flex: 1 }}>
          <div className="card stat">
            <div className="stat__value">{docs.length}</div>
            <div className="stat__label">dokumentů</div>
          </div>
          <div className="card stat">
            <div className="stat__value">{fmt(total)}</div>
            <div className="stat__label">textu</div>
          </div>
        </div>
      </div>

      <div className="toolbar">
        <input ref={search} className="input search" type="search" placeholder="Filtrovat…  ( / )" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filtrovat dokumenty" />
        {docs.length > 0 && (
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => {
              if (confirm("Smazat celou knihovnu z tohoto prohlížeče?")) void clearLibrary().then(() => toast("Knihovna vymazána"));
            }}
          >
            Vymazat knihovnu
          </button>
        )}
      </div>

      {ready && !docs.length && <p className="muted">Knihovna je zatím prázdná.</p>}
      <ul className="lib-list">
        {shown.map((d) => (
          <li key={d.id} className="card">
            <div style={{ minWidth: 0 }}>
              <div className="lib-list__name">{d.name}</div>
              <div className="muted small">
                {fmt(d.text.length)} textu · přidáno {new Date(d.addedAt).toLocaleDateString("cs-CZ")}
              </div>
              <p className="lib-list__preview">{d.text.slice(0, 220)}…</p>
            </div>
            <button type="button" className="btn btn--ghost btn--icon" aria-label={`Odebrat ${d.name}`} onClick={() => void removeDoc(d.id).then(() => toast(`Odebráno: ${d.name}`))}>
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function toBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}
