"use client";

import { useState } from "react";
import { ProjectIntakeSchema } from "@/lib/project/intake";
import { saveProject } from "@/lib/project/store";
import { reportToText, SEVERITY_LABEL, STATUS_LABEL, type Finding, type Report, type Section, type Status, type Table } from "@/lib/tools/report";

const STATUS_PILL: Record<Status, string> = { ok: "pill--ok", inferred: "pill--warn", missing: "pill--bad" };
const SEV_ICON = { error: "!", warning: "?", info: "i", ok: "✓" } as const;

export function ReportView({ report }: { report: Report }) {
  const [busy, setBusy] = useState<"docx" | "xlsx" | null>(null);
  const [saved, setSaved] = useState(false);
  const hasTables = Boolean(report.sheets?.length || report.sections.some((s) => s.table));

  async function exportAs(kind: "docx" | "xlsx") {
    setBusy(kind);
    try {
      const res = await fetch(`/api/export/${kind}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(report) });
      if (!res.ok) throw new Error();
      const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? `SAGASTA.${kind}`;
      download(await res.blob(), name);
    } catch {
      alert(`Export ${kind.toUpperCase()} selhal.`);
    } finally {
      setBusy(null);
    }
  }

  function useAsProject() {
    const parsed = ProjectIntakeSchema.safeParse(report.project);
    if (parsed.success) {
      saveProject(parsed.data);
      setSaved(true);
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
        <div className="row">
          <CopyButton text={reportToText(report)} label="Kopírovat text" />
          {hasTables && (
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => exportAs("xlsx")} disabled={busy !== null}>
              {busy === "xlsx" ? <span className="spinner" aria-hidden /> : "↓"} Excel
            </button>
          )}
          <button type="button" className="btn btn--accent btn--sm" onClick={() => exportAs("docx")} disabled={busy !== null}>
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

      {report.letter ? <LetterView report={report} /> : report.sections.map((s) => <SectionView key={s.id} s={s} />)}

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
    <section className="card card--pad section-card" data-status={s.status}>
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
  return (
    <div>
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

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn btn--ghost btn--sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1600);
        } catch {
          /* schránka nedostupná */
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
