"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { clearHistory, listHistory, saveHistory, type HistoryEntry } from "@/lib/history";
import { libraryDocToUpload, useLibrary } from "@/lib/library";
import { FAVORITES, markRecent, read, toggleFavorite, usePref, write } from "@/lib/prefs";
import { useActiveProject } from "@/lib/project/store";
import type { SampleFile, ToolWithSample } from "@/lib/tools/registry";
import type { Report } from "@/lib/tools/report";
import type { InputSpec, UploadedFile } from "@/lib/tools/types";
import { formatKeys, useCommands } from "../ux/hotkeys";
import { toast } from "../ux/toast";
import { ReportView } from "./ReportView";

type FileState = Record<string, UploadedFile[]>;
type FilesSpec = Extract<InputSpec, { kind: "files" }>;

const MAX_FILE = 25 * 1024 * 1024;
const IMAGE_MAX_PX = 1600;
const draftKey = (slug: string) => `sagasta.draft.${slug}`;

export function ToolRunner({ tool, aiEnabled }: { tool: ToolWithSample; aiEnabled: boolean }) {
  const [values, setValues] = useState<Record<string, string>>(() => defaults(tool.inputs));
  const [files, setFiles] = useState<FileState>({});
  const [useAi, setUseAi] = useState(aiEnabled);
  const [useProject, setUseProject] = useState(true);
  const [project, , ready] = useActiveProject();
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [dragging, setDragging] = useState(false);
  const [favorites] = usePref<string[]>(FAVORITES, []);
  const abort = useRef<AbortController | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const hydrated = useRef(false);

  const fileInputs = tool.inputs.filter((i): i is FilesSpec => i.kind === "files");
  const hasSample = Boolean(tool.sample || tool.sampleFiles);
  const isFav = favorites.includes(tool.slug);

  /* ——— koncept, historie, nedávné ——— */
  useEffect(() => {
    markRecent(tool.slug);
    const draft = read<Record<string, string> | null>(draftKey(tool.slug), null);
    if (draft && Object.values(draft).some((v) => v && v.trim())) {
      setValues({ ...defaults(tool.inputs), ...draft });
      toast("Obnoven rozpracovaný koncept", "default", { label: "Zahodit", run: () => (setValues(defaults(tool.inputs)), write(draftKey(tool.slug), null)) });
    }
    hydrated.current = true;
    void listHistory(tool.slug).then(setHistory);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool.slug]);

  useEffect(() => {
    if (!hydrated.current) return;
    const t = setTimeout(() => write(draftKey(tool.slug), values), 400);
    return () => clearTimeout(t);
  }, [values, tool.slug]);

  /* ——— soubory ——— */
  const addFiles = useCallback(
    async (inputId: string, list: File[]) => {
      const spec = fileInputs.find((f) => f.id === inputId);
      if (!spec) return;
      const max = spec.max ?? 10;
      const current = files[inputId] ?? [];
      const next = [...current];
      const skipped: string[] = [];
      for (const f of list) {
        if (next.length >= max) {
          skipped.push(`${f.name} (max. ${max})`);
          continue;
        }
        if (spec.accept && !accepts(spec.accept, f)) {
          skipped.push(`${f.name} (typ)`);
          continue;
        }
        if (f.size > MAX_FILE && !f.type.startsWith("image/")) {
          skipped.push(`${f.name} (> 25 MB)`);
          continue;
        }
        next.push(await readUpload(f));
      }
      setFiles((s) => ({ ...s, [inputId]: max === 1 ? next.slice(-1) : next }));
      if (skipped.length) toast(`Přeskočeno: ${skipped.join(", ")}`, "bad");
      else if (list.length) toast(`Přidáno ${list.length} ${list.length === 1 ? "soubor" : "souborů"}`, "good");
    },
    [files, fileInputs],
  );

  /** Kam patří soubor: fotky do pole s obrázky, ostatní do prvního dokumentového pole. */
  const targetFor = useCallback(
    (f: File) => {
      const isImg = f.type.startsWith("image/");
      return (fileInputs.find((i) => accepts(i.accept, f) && (isImg ? /jpg|png|webp/.test(i.accept ?? "") : true)) ?? fileInputs[0])?.id;
    },
    [fileInputs],
  );

  const routeFiles = useCallback(
    async (list: File[]) => {
      const groups = new Map<string, File[]>();
      for (const f of list) {
        const id = targetFor(f);
        if (id) groups.set(id, [...(groups.get(id) ?? []), f]);
      }
      for (const [id, fl] of groups) await addFiles(id, fl);
    },
    [addFiles, targetFor],
  );

  // vložení ze schránky (fotky, soubory) a přetažení kamkoli na stránku
  useEffect(() => {
    if (!fileInputs.length) return;
    const onPaste = (e: ClipboardEvent) => {
      const list = [...(e.clipboardData?.files ?? [])];
      if (list.length) {
        e.preventDefault();
        void routeFiles(list.map((f, i) => (f.name === "image.png" ? new File([f], `schranka_${Date.now()}_${i}.png`, { type: f.type }) : f)));
      }
    };
    let depth = 0;
    const onEnter = (e: DragEvent) => e.dataTransfer?.types.includes("Files") && (depth++, setDragging(true));
    const onLeave = () => --depth <= 0 && ((depth = 0), setDragging(false));
    const onOver = (e: DragEvent) => e.dataTransfer?.types.includes("Files") && e.preventDefault();
    const onDrop = (e: DragEvent) => {
      depth = 0;
      setDragging(false);
      if ((e.target as HTMLElement)?.closest?.(".dropzone")) return; // vlastní pole si soubor zpracuje samo
      if (e.dataTransfer?.files.length) {
        e.preventDefault();
        void routeFiles([...e.dataTransfer.files]);
      }
    };
    window.addEventListener("paste", onPaste);
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("dragover", onOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("paste", onPaste);
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("drop", onDrop);
    };
  }, [fileInputs.length, routeFiles]);

  /* ——— akce ——— */
  function loadSample() {
    setValues({ ...defaults(tool.inputs), ...(tool.sample ?? {}) });
    const f: FileState = {};
    for (const [k, list] of Object.entries(tool.sampleFiles ?? {})) f[k] = list.map(sampleToUpload);
    setFiles(f);
    setReport(null);
    setError(null);
    toast("Načtena ukázková data");
  }

  function reset() {
    setValues(defaults(tool.inputs));
    setFiles({});
    setReport(null);
    setError(null);
    write(draftKey(tool.slug), null);
  }

  function validate(): string | null {
    for (const i of tool.inputs) {
      if (!("required" in i) || !i.required) continue;
      const empty = i.kind === "files" ? !files[i.id]?.length : !values[i.id]?.trim();
      if (!empty) continue;
      const alt = tool.inputs.find((x) => x.id !== i.id && x.label.startsWith("…nebo"));
      if (alt && (alt.kind === "files" ? files[alt.id]?.length : values[alt.id]?.trim())) continue;
      return `Vyplňte pole „${i.label}“.`;
    }
    return null;
  }

  async function run() {
    if (loading) return;
    const v = validate();
    if (v) {
      setError(v);
      toast(v, "bad");
      return;
    }
    const ctrl = new AbortController();
    abort.current = ctrl;
    setLoading(true);
    setError(null);
    setReport(null);
    const started = Date.now();
    setElapsed(0);
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    try {
      const res = await fetch(`/api/tools/${tool.slug}`, {
        method: "POST",
        signal: ctrl.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values, files, project: tool.usesProject && useProject ? project : null, useAi }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Chyba ${res.status}`);
      setReport(data as Report);
      void saveHistory(data as Report).then(() => listHistory(tool.slug).then(setHistory));
      toast(`Hotovo za ${Math.max(1, Math.round((Date.now() - started) / 1000))} s`, "good");
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        toast("Zpracování zrušeno");
      } else {
        const msg = e instanceof Error ? e.message : "Zpracování selhalo.";
        setError(msg);
        toast(msg, "bad");
      }
    } finally {
      clearInterval(timer);
      setLoading(false);
      abort.current = null;
    }
  }

  useCommands(
    [
      { id: "tool-run", label: `Spustit: ${tool.action}`, group: "Tento nástroj", keys: "mod+enter", run: () => void run() },
      ...(loading ? [{ id: "tool-cancel", label: "Zrušit zpracování", group: "Tento nástroj", keys: "escape", run: () => abort.current?.abort() }] : []),
      ...(hasSample ? [{ id: "tool-sample", label: "Načíst ukázková data", group: "Tento nástroj", keys: "alt+s", run: loadSample }] : []),
      { id: "tool-reset", label: "Vymazat formulář", group: "Tento nástroj", keys: "alt+backspace", run: reset },
      { id: "tool-fav", label: isFav ? "Odebrat z oblíbených" : "Přidat do oblíbených", group: "Tento nástroj", keys: "alt+f", run: () => (toggleFavorite(tool.slug), toast(isFav ? "Odebráno z oblíbených" : "Přidáno do oblíbených ★")) },
      ...(aiEnabled ? [{ id: "tool-ai", label: useAi ? "Vypnout AI" : "Zapnout AI", group: "Tento nástroj", keys: "alt+a", run: () => setUseAi((u) => !u) }] : []),
      { id: "tool-focus", label: "Přejít na první pole", group: "Tento nástroj", keys: "alt+1", run: () => (document.querySelector(".form-grid input, .form-grid textarea, .form-grid select") as HTMLElement | null)?.focus() },
    ],
    [values, files, useAi, useProject, project, loading, isFav, tool.slug],
  );

  return (
    <div className="tool-layout">
      {dragging && fileInputs.length > 0 && (
        <div className="drop-overlay" aria-hidden>
          <div>Pusťte soubory kamkoli – zařadí se do správného pole</div>
        </div>
      )}

      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="row small muted">
          {tool.worksWithoutAi ? <span className="pill pill--ok">Funguje i bez AI</span> : <span className="pill">Vyžaduje AI</span>}
          {tool.usesProject && <span className="pill">Čte aktivní projekt</span>}
        </div>
        <div className="row">
          <button type="button" className="btn btn--ghost btn--sm" aria-pressed={isFav} onClick={() => toggleFavorite(tool.slug)} title={`Oblíbené (${formatKeys("alt+f")})`}>
            {isFav ? "★" : "☆"} Oblíbené
          </button>
          {history.length > 0 && <HistoryMenu entries={history} onOpen={(r) => (setReport(r), requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: "smooth" })))} onClear={() => void clearHistory(tool.slug).then(() => setHistory([]))} />}
          {hasSample && (
            <button type="button" className="btn btn--ghost btn--sm" onClick={loadSample} title={formatKeys("alt+s")}>
              Načíst ukázku
            </button>
          )}
          <button type="button" className="btn btn--ghost btn--sm" onClick={reset} title={formatKeys("alt+backspace")}>
            Vymazat
          </button>
        </div>
      </div>

      {tool.usesProject && ready && (
        <div className="project-bar card">
          <span className="project-bar__icon" aria-hidden>
            ◆
          </span>
          {project ? (
            <>
              <div style={{ minWidth: 0 }}>
                <span className="eyebrow">Aktivní projekt</span>
                <div className="project-bar__name">{project.projectName}</div>
              </div>
              <label className="toggle toggle--bare">
                <input type="checkbox" checked={useProject} onChange={(e) => setUseProject(e.target.checked)} />
                <span className="toggle__track" aria-hidden />
                <span className="toggle__label">Použít data projektu</span>
              </label>
            </>
          ) : (
            <div style={{ minWidth: 0 }}>
              <span className="eyebrow">Žádný aktivní projekt</span>
              <div className="small muted">
                Vytěžte data v nástroji <Link href="/nastroje/extrakce-dat">Extrakce dat projektu</Link> nebo vyplňte <Link href="/katalog-nebezpeci">formulář projektu</Link>. Nástroj funguje i bez něj.
              </div>
            </div>
          )}
        </div>
      )}

      <form
        className="card card--pad form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
      >
        {tool.inputs.map((i) => (
          <Field
            key={i.id}
            spec={i}
            value={values[i.id] ?? ""}
            onChange={(v) => setValues((s) => ({ ...s, [i.id]: v }))}
            files={files[i.id] ?? []}
            onAdd={(l) => void addFiles(i.id, l)}
            onFiles={(l) => setFiles((s) => ({ ...s, [i.id]: l }))}
          />
        ))}
      </form>

      <div className="actionbar">
        <label className="toggle toggle--bare" title={aiEnabled ? formatKeys("alt+a") : "Nastavte ANTHROPIC_API_KEY na serveru"}>
          <input type="checkbox" checked={useAi && aiEnabled} disabled={!aiEnabled} onChange={(e) => setUseAi(e.target.checked)} />
          <span className="toggle__track" aria-hidden />
          <span className="toggle__label">
            <strong>AI</strong> <span className="muted small">{aiEnabled ? "Claude + kontroly" : tool.worksWithoutAi ? "nenakonfigurováno – jen kontroly" : "nenakonfigurováno"}</span>
          </span>
        </label>
        <div className="row">
          {loading && (
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => abort.current?.abort()}>
              Zrušit <kbd>Esc</kbd>
            </button>
          )}
          <button type="button" className="btn btn--primary" onClick={() => void run()} disabled={loading}>
            {loading ? (
              <>
                <span className="spinner" aria-hidden /> Zpracovávám… {elapsed > 0 && <span className="tabular">{elapsed} s</span>}
              </>
            ) : (
              <>
                {tool.action} <kbd className="kbd--on-dark">{formatKeys("mod+enter")}</kbd>
              </>
            )}
          </button>
        </div>
      </div>

      <div ref={resultRef} style={{ scrollMarginTop: 80 }} aria-live="polite" aria-busy={loading}>
        {error && (
          <div className="banner banner--bad" role="alert">
            {error}
          </div>
        )}
        {loading && (
          <div className="stack">
            <p className="muted small">{useAi && aiEnabled ? "Claude čte podklady – u rozsáhlé dokumentace to může trvat i minutu. Zrušit můžete klávesou Esc." : "Probíhají kontroly…"}</p>
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton" style={{ animationDelay: `${i * 0.12}s` }} />
            ))}
          </div>
        )}
        {report && <ReportView key={report.generatedAt} report={report} files={files} />}
      </div>
    </div>
  );
}

/* ——— historie výsledků ——— */

function HistoryMenu({ entries, onOpen, onClear }: { entries: HistoryEntry[]; onOpen: (r: Report) => void; onClear: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => (window.removeEventListener("mousedown", close), window.removeEventListener("keydown", esc));
  }, [open]);
  return (
    <div className="menu" ref={ref}>
      <button type="button" className="btn btn--ghost btn--sm" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((o) => !o)}>
        ↺ Historie ({entries.length})
      </button>
      {open && (
        <div className="menu__pop" role="menu">
          {entries.map((e) => (
            <button key={e.id} type="button" role="menuitem" className="menu__item" onClick={() => (onOpen(e.report), setOpen(false))}>
              <span>{e.title}</span>
              <span className="muted small">{new Date(e.createdAt).toLocaleString("cs-CZ", { dateStyle: "short", timeStyle: "short" })}</span>
            </button>
          ))}
          <button type="button" role="menuitem" className="menu__item menu__item--danger" onClick={() => (onClear(), setOpen(false))}>
            Vymazat historii
          </button>
        </div>
      )}
    </div>
  );
}

/* ——— pole formuláře ——— */

function defaults(inputs: InputSpec[]): Record<string, string> {
  const v: Record<string, string> = {};
  for (const i of inputs) if (i.kind === "select") v[i.id] = i.options[0].value;
  return v;
}

function Field({
  spec,
  value,
  onChange,
  files,
  onAdd,
  onFiles,
}: {
  spec: InputSpec;
  value: string;
  onChange: (v: string) => void;
  files: UploadedFile[];
  onAdd: (f: File[]) => void;
  onFiles: (f: UploadedFile[]) => void;
}) {
  const id = useId();
  const label = (
    <label className="field__label" htmlFor={id}>
      {spec.label}
      {"required" in spec && spec.required && <span aria-hidden> *</span>}
    </label>
  );
  const hint = spec.hint ? <span className="field__hint">{spec.hint}</span> : null;

  switch (spec.kind) {
    case "line":
      return (
        <div className="field">
          {label}
          <input id={id} className="input" value={value} placeholder={spec.placeholder} onChange={(e) => onChange(e.target.value)} autoComplete="off" />
          {hint}
        </div>
      );
    case "date":
      return (
        <div className="field">
          {label}
          <div className="row" style={{ flexWrap: "nowrap" }}>
            <input id={id} type="date" className="input" value={value} onChange={(e) => onChange(e.target.value)} />
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => onChange(new Date().toISOString().slice(0, 10))}>
              Dnes
            </button>
          </div>
          {hint}
        </div>
      );
    case "select":
      return (
        <div className="field">
          {label}
          <select id={id} className="select" value={value} onChange={(e) => onChange(e.target.value)}>
            {spec.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {hint}
        </div>
      );
    case "text":
      return (
        <div className="field field--wide">
          <div className="field__row">
            {label}
            {value.length > 0 && <span className="field__count">{value.length.toLocaleString("cs-CZ")} znaků</span>}
          </div>
          <textarea id={id} className="textarea" rows={spec.rows ?? 4} value={value} placeholder={spec.placeholder} onChange={(e) => onChange(e.target.value)} />
          {hint}
        </div>
      );
    case "files":
      return (
        <div className="field field--wide">
          <span className="field__label">
            {spec.label}
            {spec.required && <span aria-hidden> *</span>}
          </span>
          <FileDrop spec={spec} files={files} onAdd={onAdd} onFiles={onFiles} />
          {hint}
        </div>
      );
  }
}

function FileDrop({ spec, files, onAdd, onFiles }: { spec: FilesSpec; files: UploadedFile[]; onAdd: (f: File[]) => void; onFiles: (f: UploadedFile[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [picker, setPicker] = useState(false);
  const docsAllowed = !spec.accept || /\.txt|\.pdf/.test(spec.accept);
  const totalSize = files.reduce((n, f) => n + f.size, 0);

  return (
    <div>
      <div
        className="dropzone"
        data-over={over}
        role="button"
        tabIndex={0}
        aria-label={`${spec.label} – vybrat soubory`}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), input.current?.click())}
        onDragOver={(e) => (e.preventDefault(), setOver(true))}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          onAdd([...e.dataTransfer.files]);
        }}
      >
        <strong>{files.length ? "Přidat další soubory" : "Přetáhněte soubory sem"}</strong>
        <div className="field__hint">nebo klikněte · {spec.accept?.replaceAll(",", " ") ?? "PDF, DOCX, TXT"}</div>
        <input ref={input} type="file" accept={spec.accept} multiple={(spec.max ?? 10) > 1} hidden onChange={(e) => (onAdd([...(e.target.files ?? [])]), (e.target.value = ""))} />
      </div>
      {docsAllowed && (
        <button type="button" className="btn btn--ghost btn--sm" style={{ marginTop: 8 }} onClick={() => setPicker(true)}>
          📚 Z knihovny
        </button>
      )}
      {picker && <LibraryPicker onClose={() => setPicker(false)} onPick={(ups) => onFiles([...files, ...ups].slice(0, spec.max ?? 10))} />}
      {files.length > 0 && (
        <>
          <ul className="file-list">
            {files.map((f, i) => (
              <li key={f.name + i}>
                {spec.labelEach && <span className="pill pill--accent">{`${spec.labelEach} ${String.fromCharCode(65 + i)}`}</span>}
                {/^image\//.test(guessType(f.name)) ? <img className="file-list__thumb" src={`data:${guessType(f.name)};base64,${f.data}`} alt="" /> : <span aria-hidden>📄</span>}
                <span className="file-list__name" title={f.name}>
                  {f.name}
                </span>
                <span className="muted small">{formatSize(f.size)}</span>
                <button type="button" className="btn btn--ghost btn--icon" aria-label={`Odebrat ${f.name}`} onClick={() => onFiles(files.filter((_, j) => j !== i))}>
                  ×
                </button>
              </li>
            ))}
          </ul>
          <div className="row small muted" style={{ justifyContent: "space-between", marginTop: 6 }}>
            <span>
              {files.length}/{spec.max ?? 10} souborů · {formatSize(totalSize)}
            </span>
            <button type="button" className="linkbtn" onClick={() => onFiles([])}>
              Odebrat vše
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function LibraryPicker({ onClose, onPick }: { onClose: () => void; onPick: (u: UploadedFile[]) => void }) {
  const { docs, ready } = useLibrary();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const shown = docs.filter((d) => d.name.toLowerCase().includes(q.toLowerCase()));
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Výběr z knihovny" onMouseDown={(e) => e.stopPropagation()}>
        <input className="palette__input" placeholder="Filtrovat dokumenty…" autoFocus value={q} onChange={(e) => setQ(e.target.value)} />
        <ul className="palette__list">
          {!ready ? (
            <li className="palette__empty">Načítám…</li>
          ) : !docs.length ? (
            <li className="palette__empty">
              Knihovna je prázdná. <Link href="/knihovna">Přidat dokumenty</Link>
            </li>
          ) : (
            shown.map((d) => (
              <li key={d.id} className="palette__item" aria-selected={sel.has(d.id)} onClick={() => setSel((s) => (s.has(d.id) ? (s.delete(d.id), new Set(s)) : new Set(s.add(d.id))))}>
                <input type="checkbox" readOnly checked={sel.has(d.id)} tabIndex={-1} />
                <span className="palette__label">{d.name}</span>
                <span className="palette__group">{formatSize(d.text.length)}</span>
              </li>
            ))
          )}
        </ul>
        <div className="palette__foot" style={{ justifyContent: "space-between" }}>
          <button type="button" className="linkbtn" onClick={() => setSel(new Set(shown.map((d) => d.id)))}>
            Vybrat vše
          </button>
          <button
            type="button"
            className="btn btn--primary btn--sm"
            disabled={!sel.size}
            onClick={() => {
              onPick(docs.filter((d) => sel.has(d.id)).map(libraryDocToUpload));
              toast(`Přidáno z knihovny: ${sel.size}`, "good");
              onClose();
            }}
          >
            Přidat {sel.size || ""}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ——— pomocné ——— */

const formatSize = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} kB`);

const guessType = (name: string) => {
  const e = name.toLowerCase().split(".").pop();
  return e === "png" ? "image/png" : e === "jpg" || e === "jpeg" ? "image/jpeg" : e === "webp" ? "image/webp" : "application/octet-stream";
};

function accepts(accept: string | undefined, f: File): boolean {
  if (!accept) return true;
  const ext = `.${f.name.toLowerCase().split(".").pop()}`;
  return accept.split(",").some((a) => a.trim() === ext || (a.trim().endsWith("/*") && f.type.startsWith(a.trim().slice(0, -1))) || a.trim() === f.type);
}

async function readUpload(f: File): Promise<UploadedFile> {
  if (f.type.startsWith("image/") && f.type !== "image/gif") {
    const small = await downscale(f).catch(() => null);
    if (small) return small;
  }
  return { name: f.name, size: f.size, data: await toBase64(f) };
}

/** Zmenší fotku na max. 1600 px (JPEG 85 %) – rychlejší upload a nižší cena AI. */
async function downscale(f: File): Promise<UploadedFile | null> {
  const bmp = await createImageBitmap(f);
  const scale = Math.min(1, IMAGE_MAX_PX / Math.max(bmp.width, bmp.height));
  if (scale === 1 && f.size < 900 * 1024) return null;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
  if (!blob) return null;
  const name = f.name.replace(/\.[^.]+$/, "") + ".jpg";
  return { name, size: blob.size, data: await toBase64(blob) };
}

function toBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function sampleToUpload(f: SampleFile): UploadedFile {
  const bytes = new TextEncoder().encode(f.text);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return { name: f.name, data: btoa(bin), size: bytes.length };
}
