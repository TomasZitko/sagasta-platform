"use client";

import Link from "next/link";
import { useId, useRef, useState } from "react";
import { useActiveProject } from "@/lib/project/store";
import type { SampleFile, ToolWithSample } from "@/lib/tools/registry";
import type { Report } from "@/lib/tools/report";
import type { InputSpec, UploadedFile } from "@/lib/tools/types";
import { ReportView } from "./ReportView";

type FileState = Record<string, (UploadedFile & { sample?: boolean })[]>;

const MAX_FILE = 25 * 1024 * 1024;

export function ToolRunner({ tool, aiEnabled }: { tool: ToolWithSample; aiEnabled: boolean }) {
  const [values, setValues] = useState<Record<string, string>>(() => defaults(tool.inputs));
  const [files, setFiles] = useState<FileState>({});
  const [useAi, setUseAi] = useState(aiEnabled);
  const [useProject, setUseProject] = useState(true);
  const [project, , ready] = useActiveProject();
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  const hasSample = Boolean(tool.sample || tool.sampleFiles);

  function loadSample() {
    setValues({ ...defaults(tool.inputs), ...(tool.sample ?? {}) });
    const f: FileState = {};
    for (const [k, list] of Object.entries(tool.sampleFiles ?? {})) f[k] = list.map(sampleToUpload);
    setFiles(f);
    setReport(null);
    setError(null);
  }

  function reset() {
    setValues(defaults(tool.inputs));
    setFiles({});
    setReport(null);
    setError(null);
  }

  function validate(): string | null {
    for (const i of tool.inputs) {
      if (!("required" in i) || !i.required) continue;
      if (i.kind === "files" ? !(files[i.id]?.length) : !values[i.id]?.trim()) {
        // pole „…nebo vložte text“ může nahradit soubor
        const alt = tool.inputs.find((x) => x.kind === "text" && x.id !== i.id && x.label.startsWith("…nebo"));
        if (alt && values[alt.id]?.trim()) continue;
        return `Vyplňte pole „${i.label}“.`;
      }
    }
    return null;
  }

  async function run() {
    const v = validate();
    if (v) return setError(v);
    setLoading(true);
    setError(null);
    setReport(null);
    requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    try {
      const res = await fetch(`/api/tools/${tool.slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          values,
          files: Object.fromEntries(Object.entries(files).map(([k, l]) => [k, l.map(({ name, data, size }) => ({ name, data, size }))])),
          project: tool.usesProject && useProject ? project : null,
          useAi,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Chyba ${res.status}`);
      setReport(data as Report);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Zpracování selhalo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="tool-layout">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="row small muted">
          {tool.worksWithoutAi ? <span className="pill pill--ok">Funguje i bez AI</span> : <span className="pill">Vyžaduje AI</span>}
          {tool.usesProject && <span className="pill">Čte aktivní projekt</span>}
        </div>
        <div className="row">
          {hasSample && (
            <button type="button" className="btn btn--ghost btn--sm" onClick={loadSample}>
              Načíst ukázku
            </button>
          )}
          <button type="button" className="btn btn--ghost btn--sm" onClick={reset}>
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
                Vytěžte data v nástroji <Link href="/nastroje/extrakce-dat">Extrakce dat projektu</Link> nebo vyplňte{" "}
                <Link href="/katalog-nebezpeci">formulář projektu</Link>. Nástroj funguje i bez něj.
              </div>
            </div>
          )}
        </div>
      )}

      <div className="card card--pad form-grid">
        {tool.inputs.map((i) => (
          <Field
            key={i.id}
            spec={i}
            value={values[i.id] ?? ""}
            onChange={(v) => setValues((s) => ({ ...s, [i.id]: v }))}
            files={files[i.id] ?? []}
            onFiles={(l) => setFiles((s) => ({ ...s, [i.id]: l }))}
          />
        ))}
      </div>

      <div className="actionbar">
        <label className="toggle toggle--bare" title={aiEnabled ? "" : "Nastavte ANTHROPIC_API_KEY na serveru"}>
          <input type="checkbox" checked={useAi && aiEnabled} disabled={!aiEnabled} onChange={(e) => setUseAi(e.target.checked)} />
          <span className="toggle__track" aria-hidden />
          <span className="toggle__label">
            <strong>AI</strong>{" "}
            <span className="muted small">{aiEnabled ? "Claude + kontroly" : tool.worksWithoutAi ? "nenakonfigurováno – jen kontroly" : "nenakonfigurováno"}</span>
          </span>
        </label>
        <button type="button" className="btn btn--primary" onClick={run} disabled={loading}>
          {loading ? (
            <>
              <span className="spinner" aria-hidden /> Zpracovávám…
            </>
          ) : (
            <>
              {tool.action} <span aria-hidden>→</span>
            </>
          )}
        </button>
      </div>

      <div ref={resultRef} style={{ scrollMarginTop: 80 }} aria-live="polite" aria-busy={loading}>
        {error && (
          <div className="banner banner--bad" role="alert">
            {error}
          </div>
        )}
        {loading && (
          <div className="stack">
            <p className="muted small">{useAi && aiEnabled ? "Claude čte podklady – u rozsáhlé dokumentace to může trvat i minutu…" : "Probíhají kontroly…"}</p>
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton" style={{ animationDelay: `${i * 0.12}s` }} />
            ))}
          </div>
        )}
        {report && <ReportView key={report.generatedAt} report={report} />}
      </div>
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
  onFiles,
}: {
  spec: InputSpec;
  value: string;
  onChange: (v: string) => void;
  files: UploadedFile[];
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
          <input id={id} className="input" value={value} placeholder={spec.placeholder} onChange={(e) => onChange(e.target.value)} />
          {hint}
        </div>
      );
    case "date":
      return (
        <div className="field">
          {label}
          <input id={id} type="date" className="input" value={value} onChange={(e) => onChange(e.target.value)} />
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
          {label}
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
          <FileDrop spec={spec} files={files} onFiles={onFiles} />
          {hint}
        </div>
      );
  }
}

function FileDrop({ spec, files, onFiles }: { spec: Extract<InputSpec, { kind: "files" }>; files: UploadedFile[]; onFiles: (f: UploadedFile[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const max = spec.max ?? 10;

  async function add(list: FileList | null) {
    if (!list) return;
    setError(null);
    const next = [...files];
    for (const f of Array.from(list)) {
      if (next.length >= max) {
        setError(`Maximálně ${max} soubor${max === 1 ? "" : "ů"}.`);
        break;
      }
      if (f.size > MAX_FILE) {
        setError(`${f.name}: větší než 25 MB.`);
        continue;
      }
      next.push({ name: f.name, size: f.size, data: await toBase64(f) });
    }
    onFiles(max === 1 ? next.slice(-1) : next);
  }

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
          void add(e.dataTransfer.files);
        }}
      >
        <strong>{files.length ? "Přidat další soubory" : "Přetáhněte soubory sem"}</strong>
        <div className="field__hint">nebo klikněte · {spec.accept?.replaceAll(",", " ") ?? "PDF, DOCX, TXT"}</div>
        <input ref={input} type="file" accept={spec.accept} multiple={max > 1} hidden onChange={(e) => (void add(e.target.files), (e.target.value = ""))} />
      </div>
      {error && (
        <p className="small" style={{ color: "var(--bad)", margin: "6px 0 0" }} role="alert">
          {error}
        </p>
      )}
      {files.length > 0 && (
        <ul className="file-list">
          {files.map((f, i) => (
            <li key={f.name + i}>
              {spec.labelEach && <span className="pill pill--accent">{`${spec.labelEach} ${String.fromCharCode(65 + i)}`}</span>}
              <span className="file-list__name">{f.name}</span>
              <span className="muted small">{formatSize(f.size)}</span>
              <button type="button" className="btn btn--ghost btn--icon" aria-label={`Odebrat ${f.name}`} onClick={() => onFiles(files.filter((_, j) => j !== i))}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const formatSize = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} kB`);

function toBase64(file: File): Promise<string> {
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
