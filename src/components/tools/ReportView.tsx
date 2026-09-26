"use client";

import { useMemo, useState } from "react";
import { formatKeys, useCommands } from "../ux/hotkeys";
import { toast } from "../ux/toast";
import type { UploadedFile } from "@/lib/tools/types";
import { ProjectIntakeSchema } from "@/lib/project/intake";
import { saveProject } from "@/lib/project/store";
import { reportToText, SEVERITY_LABEL, STATUS_LABEL, type Finding, type Report, type Section, type Status, type Table } from "@/lib/tools/report";

const STATUS_PILL: Record<Status, string> = { ok: "pill--ok", inferred: "pill--warn", missing: "pill--bad" };
const SEV_ICON = { error: "!", warning: "?", info: "i", ok: "✓" } as const;

type SevFilter = "all" | "error" | "warning";

export function ReportView({ report, files }: { report: Report; files?: Record<string, UploadedFile[]> }) {
  const [busy, setBusy] = useState<"docx" | "xlsx" | "zip" | null>(null);
  const [saved, setSaved] = useState(false);
  const [sev, setSev] = useState<SevFilter>("all");
  const hasTables = Boolean(report.sheets?.length || report.sections.some((s) => s.table));
  const findingCount = useMemo(() => report.sections.reduce((n, s) => n + (s.findings?.length ?? 0), 0), [report]);
  const sections = useMemo(
    () => (sev === "all" ? report.sections : report.sections.map((s) => (s.findings ? { ...s, findings: s.findings.filter((f) => f.severity === sev) } : s))),
    [report, sev],
  );

  async function downloadZip() {
    if (!report.renames?.length || !files) return;
    setBusy("zip");
    try {
      const { zipSync, strToU8 } = await import("fflate");
      const all = Object.values(files).flat();
      const entries: Record<string, Uint8Array> = {};
      for (const r of report.renames) {
        const f = all.find((x) => x.name === r.from);
        if (f) entries[r.to] = Uint8Array.from(atob(f.data), (c) => c.charCodeAt(0));
      }
      entries["_prejmenovani.csv"] = strToU8("\ufeffPůvodní;Nový\r\n" + report.renames.map((r) => `"${r.from}";"${r.to}"`).join("\r\n"));
      download(new Blob([zipSync(entries, { level: 6 }) as BlobPart], { type: "application/zip" }), "Prejmenovane_soubory.zip");
      toast(`ZIP s ${report.renames.length} soubory stažen`, "good");
    } finally {
      setBusy(null);
    }
  }

  useCommands(
    [
      { id: "r-docx", label: "Stáhnout Word", group: "Výsledek", keys: "mod+shift+e", run: () => void exportAs("docx") },
      ...(hasTables ? [{ id: "r-xlsx", label: "Stáhnout Excel", group: "Výsledek", keys: "mod+shift+x", run: () => void exportAs("xlsx") }] : []),
      { id: "r-copy", label: "Kopírovat výsledek jako text", group: "Výsledek", keys: "mod+shift+c", run: () => void copy(reportToText(report), "Výsledek zkopírován") },
      { id: "r-print", label: "Tisk / uložit jako PDF", group: "Výsledek", keys: "mod+shift+p", run: () => window.print() },
      ...(report.renames?.length ? [{ id: "r-zip", label: "Stáhnout přejmenované soubory (ZIP)", group: "Výsledek", keys: "mod+shift+z", run: () => void downloadZip() }] : []),
      { id: "r-top", label: "Přejít na začátek výsledku", group: "Výsledek", keys: "alt+r", run: () => document.querySelector(".report")?.scrollIntoView({ behavior: "smooth" }) },
    ],
    [report],
  );

  async function exportAs(kind: "docx" | "xlsx") {
    setBusy(kind);
    try {
      const res = await fetch(`/api/export/${kind}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(report) });
      if (!res.ok) throw new Error();
      const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? `SAGASTA.${kind}`;
      download(await res.blob(), name);
      toast(`Staženo: ${name}`, "good");
    } catch {
      toast(`Export ${kind.toUpperCase()} selhal.`, "bad");
    } finally {
      setBusy(null);
    }
  }

  function useAsProject() {
    const parsed = ProjectIntakeSchema.safeParse(report.project);
    if (parsed.success) {
      saveProject(parsed.data);
      setSaved(true);
      toast("Aktivní projekt uložen – ostatní nástroje ho použijí", "good");
    }
  }

  return (
    <div className="stack report" style={{ gap: 20 }}>
      <header className="toolbar">
        <div style={{ minWidth: 0 }}>
          <span className="eyebrow">
            {report.mode === "ai" ? `AI · ${report.model}` : "Deterministické kontroly"} · {new Date(report.generatedAt).toLocaleString("cs-CZ")}
          </span>
          <h2 className="h2" style={{ marginTop: 6 }}>
            {report.title}
          </h2>
          {report.subtitle && <p className="muted" style={{ margin: 0 }}>{report.subtitle}</p>}
        </div>
        <div className="row no-print">
          <CopyButton text={reportToText(report)} label="Kopírovat text" title={formatKeys("mod+shift+c")} />
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => window.print()} title={formatKeys("mod+shift+p")}>
            ⎙ Tisk / PDF
          </button>
          {report.renames?.length ? (
            <button type="button" className="btn btn--primary btn--sm" onClick={() => void downloadZip()} disabled={busy !== null} title={formatKeys("mod+shift+z")}>
              {busy === "zip" ? <span className="spinner" aria-hidden /> : "↓"} ZIP přejmenovaných
            </button>
          ) : null}
          {hasTables && (
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => exportAs("xlsx")} disabled={busy !== null} title={formatKeys("mod+shift+x")}>
              {busy === "xlsx" ? <span className="spinner" aria-hidden /> : "↓"} Excel
            </button>
          )}
          <button type="button" className="btn btn--accent btn--sm" onClick={() => exportAs("docx")} disabled={busy !== null} title={formatKeys("mod+shift+e")}>
            {busy === "docx" ? <span className="spinner" aria-hidden /> : "↓"} Word
          </button>
        </div>
      </header>

      {report.project !== undefined && (
        <div className="banner row" style={{ justifyContent: "space-between" }}>
          <span>
            <strong>Data projektu připravena.</strong> Uložte je jako aktivní projekt – ostatní nástroje je pak použijí automaticky.
          </span>
          <button type="button" className="btn btn--primary btn--sm" onClick={useAsProject} disabled={saved}>
            {saved ? "Uloženo ✓" : "Použít jako aktivní projekt"}
          </button>
        </div>
      )}

      {report.notes.map((n) => (
        <div key={n} className="note">
          {n}
        </div>
      ))}

      {report.meta.length > 0 && (
        <dl className="meta">
          {report.meta.map((m) => (
            <div key={m.label}>
              <dt>{m.label}</dt>
              <dd>{m.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {report.stats.length > 0 && (
        <div className="stats">
          {report.stats.map((s) => (
            <div key={s.label} className="card stat" data-tone={s.tone ?? "default"}>
              <div className="stat__value" data-long={String(s.value).length > 9 || undefined}>
                {s.value}
              </div>
              <div className="stat__label">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {report.summary && (
        <div className="card card--pad summary">
          <span className="eyebrow">Shrnutí</span>
          {report.summary.split(/\n\s*\n/).map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      )}

      {!report.letter && (report.sections.length > 3 || findingCount > 5) && (
        <nav className="toc no-print" aria-label="Obsah výsledku">
          {report.sections.length > 3 &&
            report.sections.map((s) => (
              <a key={s.id} href={`#sec-${s.id}`} className="toc__link" data-status={s.status}>
                {s.title}
              </a>
            ))}
          {findingCount > 5 && (
            <div className="segmented toc__filter" role="group" aria-label="Filtr zjištění">
              {(
                [
                  ["all", "Vše"],
                  ["error", "Chyby"],
                  ["warning", "Upozornění"],
                ] as [SevFilter, string][]
              ).map(([id, l]) => (
                <button key={id} type="button" aria-pressed={sev === id} onClick={() => setSev(id)}>
                  {l}
                </button>
              ))}
            </div>
          )}
        </nav>
      )}

      {report.letter ? <LetterView report={report} /> : sections.map((s) => <SectionView key={s.id} s={s} />)}

      {report.questions.length > 0 && (
        <div className="card card--pad stack" style={{ gap: 10 }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h3 className="h3">Otázky k upřesnění</h3>
            <CopyButton text={report.questions.map((q, i) => `${i + 1}. ${q}`).join("\n")} label="Kopírovat" />
          </div>
          <ol className="list">
            {report.questions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ol>
        </div>
      )}

      <p className="disclaimer">
        Pracovní podklad vygenerovaný nástrojem SAGASTA AI. Před použitím ho ověří a podepíše odpovědná osoba. Údaje označené
        „odvozeno“ nebo „chybí“ vyžadují doplnění z podkladů.
      </p>
    </div>
  );
}

function SectionView({ s }: { s: Section }) {
  return (
    <section className="card card--pad section-card" data-status={s.status} id={`sec-${s.id}`}>
      <div className="section-card__head">
        <h3 className="h3">{s.title}</h3>
        {s.status && (
          <span className={`pill ${STATUS_PILL[s.status]}`}>
            <span className="dot" /> {STATUS_LABEL[s.status]}
          </span>
        )}
      </div>
      {s.body && (
        <div className="prose">
          {s.body.split(/\n\s*\n/).map((p, i) => (
            <p key={i}>{highlightGaps(p)}</p>
          ))}
        </div>
      )}
      {s.bullets && s.bullets.length > 0 && (
        <ul className="list">
          {s.bullets.map((b, i) => (
            <li key={i}>{highlightGaps(b)}</li>
          ))}
        </ul>
      )}
      {s.table && <TableView t={s.table} />}
      {s.findings && s.findings.length > 0 && (
        <div className="findings">
          {s.findings.map((f, i) => (
            <FindingRow key={i} f={f} />
          ))}
        </div>
      )}
      {s.gaps && s.gaps.length > 0 && (
        <ul className="gaps">
          {s.gaps.map((g, i) => (
            <li key={i}>{g}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

function LetterView({ report }: { report: Report }) {
  const l = report.letter!;
  return (
    <article className="card letter">
      {l.recipient && <div className="letter__to">{l.recipient}</div>}
      <div className="letter__date">V Praze dne {new Date(report.generatedAt).toLocaleDateString("cs-CZ")}</div>
      {l.reference && (
        <div>
          <strong>Značka:</strong> {l.reference}
        </div>
      )}
      <div className="letter__subject">Věc: {l.subject}</div>
      {report.sections.map((s) => (
        <div key={s.id} className="letter__block">
          {s.id !== "body" && s.id !== "closing" && <h4>{s.title}</h4>}
          {s.body?.split(/\n\s*\n/).map((p, i) => <p key={i}>{p}</p>)}
          {s.bullets && (
            <ul>
              {s.bullets.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          )}
        </div>
      ))}
      <p style={{ marginTop: 28 }}>S pozdravem</p>
      <p className="letter__sign">{l.signature}</p>
    </article>
  );
}

function TableView({ t }: { t: Table }) {
  const [expanded, setExpanded] = useState(false);
  const limit = 60;
  const rows = expanded ? t.rows : t.rows.slice(0, limit);
  if (!t.rows.length) return <p className="muted small">Žádné položky.</p>;
  const tsv = [t.columns, ...t.rows].map((r) => r.map((c) => String(c ?? "").replace(/[\t\n]+/g, " ")).join("\t")).join("\n");
  return (
    <div>
      <div className="table-tools no-print">
        <span className="muted small">{t.rows.length} řádků</span>
        <CopyButton text={tsv} label="Kopírovat pro Excel" />
      </div>
      <div className="table-wrap" tabIndex={0} role="region" aria-label={t.name ?? "Tabulka"}>
        <table className="table">
          <thead>
            <tr>
              {t.columns.map((c) => (
                <th key={c} scope="col">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} data-tone={t.rowTones?.[i] ?? "default"}>
                {t.columns.map((_, ci) => (
                  <td key={ci}>{r[ci]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {t.rows.length > limit && (
        <button type="button" className="btn btn--ghost btn--sm" style={{ marginTop: 8 }} onClick={() => setExpanded((e) => !e)}>
          {expanded ? "Zobrazit méně" : `Zobrazit všech ${t.rows.length} řádků`}
        </button>
      )}
    </div>
  );
}

function FindingRow({ f }: { f: Finding }) {
  return (
    <div className="finding" data-sev={f.severity}>
      <span className="finding__icon" aria-label={SEVERITY_LABEL[f.severity]}>
        {SEV_ICON[f.severity]}
      </span>
      <div style={{ minWidth: 0 }}>
        <div className="finding__title">{f.title}</div>
        {f.detail && <div className="finding__detail">{f.detail}</div>}
        {f.evidence && <div className="finding__evidence">{f.evidence}</div>}
      </div>
    </div>
  );
}

/** Zvýrazní značky [DOPLNIT: …] v textu. */
function highlightGaps(text: string) {
  const parts = text.split(/(\[DOPLNIT[^\]]*\])/g);
  return parts.map((p, i) => (p.startsWith("[DOPLNIT") ? <mark key={i}>{p}</mark> : <span key={i}>{p}</span>));
}

async function copy(text: string, msg = "Zkopírováno"): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    toast(msg, "good");
    return true;
  } catch {
    toast("Schránka není dostupná", "bad");
    return false;
  }
}

function CopyButton({ text, label, title }: { text: string; label: string; title?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn btn--ghost btn--sm"
      title={title}
      onClick={async () => {
        if (await copy(text)) {
          setDone(true);
          setTimeout(() => setDone(false), 1600);
        }
      }}
    >
      {done ? "Zkopírováno ✓" : label}
    </button>
  );
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
