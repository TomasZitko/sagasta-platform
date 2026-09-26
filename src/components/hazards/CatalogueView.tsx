"use client";

import { useMemo, useState } from "react";
import { evaluateObligations, type Catalogue, type CatalogueEntry, type Finding } from "@/lib/hazards/engine";
import {
  clampLevel,
  PROBABILITY_LABELS,
  RISK_BANDS,
  riskBand,
  riskScore,
  SEVERITY_LABELS,
  type Level,
} from "@/lib/hazards/risk";
import type { ProjectIntake } from "@/lib/project/intake";

const CONFIDENCE = {
  confirmed: { label: "Potvrzeno", cls: "pill--ok" },
  inferred: { label: "Odvozeno – ověřit", cls: "pill--warn" },
  missing_info: { label: "Chybí údaje", cls: "pill--bad" },
} as const;

const SOURCE = { rule: "Pravidlo", ai: "AI", "rule+ai": "Pravidlo + AI" } as const;

type Filter = "all" | "high" | "review";

const LEVELS: Level[] = [1, 2, 3, 4, 5];

export function CatalogueView({ catalogue, intake }: { catalogue: Catalogue; intake: ProjectIntake }) {
  const [entries, setEntries] = useState<CatalogueEntry[]>(catalogue.entries);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<Filter>("all");
  const [exporting, setExporting] = useState(false);

  const active = entries.filter((e) => !removed.has(e.hazardId));
  const obligations = useMemo(() => evaluateObligations(intake, active), [intake, active]);

  const counts = {
    total: active.length,
    high: active.filter((e) => e.band === "high" || e.band === "critical").length,
    review: active.filter((e) => e.confidence !== "confirmed").length,
  };

  const visible = entries.filter((e) =>
    filter === "high" ? e.band === "high" || e.band === "critical" : filter === "review" ? e.confidence !== "confirmed" : true,
  );

  function update(id: string, patch: Partial<Pick<CatalogueEntry, "probability" | "severity">>) {
    setEntries((list) =>
      list.map((e) => {
        if (e.hazardId !== id) return e;
        const probability = clampLevel(patch.probability ?? e.probability);
        const severity = clampLevel(patch.severity ?? e.severity);
        const score = riskScore(probability, severity);
        return { ...e, probability, severity, score, band: riskBand(score) };
      }),
    );
  }

  function toggleRemoved(id: string) {
    setRemoved((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  const finalCatalogue = (): Catalogue => ({ ...catalogue, entries: active, obligations });

  async function exportDocx() {
    setExporting(true);
    try {
      const res = await fetch("/api/hazards/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(finalCatalogue()),
      });
      if (!res.ok) throw new Error();
      const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "KatalogNebezpeci.docx";
      download(await res.blob(), name);
    } catch {
      alert("Export do DOCX selhal.");
    } finally {
      setExporting(false);
    }
  }

  function exportCsv() {
    const header = ["ID", "Nebezpečí", "Kategorie", "Příčina", "Možný následek", "P", "Z", "R", "Úroveň", "Opatření", "Předpisy", "Stav", "Zdroj"];
    const rows = active.map((e) => [
      e.hazardId,
      e.name,
      e.categoryLabel,
      e.cause,
      e.risk,
      e.probability,
      e.severity,
      e.score,
      RISK_BANDS[e.band].label,
      e.measures.join(" | "),
      e.regulations.join(" | "),
      CONFIDENCE[e.confidence].label,
      SOURCE[e.source],
    ]);
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\r\n");
    download(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }), "KatalogNebezpeci.csv");
  }

  const openItems: Finding[] = [...catalogue.coverage, ...catalogue.missingInfo];

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="toolbar">
        <div>
          <span className="eyebrow">
            {catalogue.mode === "ai" ? `AI + pravidla · ${catalogue.model}` : "Pouze pravidla"} ·{" "}
            {new Date(catalogue.generatedAt).toLocaleString("cs-CZ")}
          </span>
          <h2 className="h2" style={{ marginTop: 6 }}>
            {catalogue.project.name}
          </h2>
        </div>
        <div className="row">
          <button type="button" className="btn btn--ghost btn--sm" onClick={exportCsv}>
            CSV
          </button>
          <button type="button" className="btn btn--accent" onClick={exportDocx} disabled={exporting || active.length === 0}>
            {exporting ? <span className="spinner" aria-hidden /> : <span aria-hidden>↓</span>} Stáhnout DOCX
          </button>
        </div>
      </div>

      {catalogue.notes.map((n) => (
        <div key={n} className="banner">
          {n}
        </div>
      ))}

      <div className="stats">
        <Stat value={counts.total} label="nebezpečí v katalogu" />
        <Stat value={counts.high} label="významná a nepřijatelná rizika" tone={counts.high ? "bad" : undefined} />
        <Stat value={counts.review} label="položek k ověření" tone={counts.review ? "warn" : undefined} />
        <Stat
          value={obligations.planRequired === null ? "?" : obligations.planRequired ? "ANO" : "NE"}
          label="plán BOZP povinný"
          tone={obligations.planRequired ? "accent" : undefined}
        />
      </div>

      <div className="panel-grid">
        <div className="card card--pad stack" style={{ gap: 12 }}>
          <h3 className="h3">Kontrola úplnosti</h3>
          {openItems.length === 0 ? (
            <p className="muted small">Nebyly nalezeny chybějící kategorie ani chybějící údaje.</p>
          ) : (
            <div className="findings">
              {openItems.map((f, i) => (
                <FindingRow key={i} f={f} />
              ))}
            </div>
          )}
        </div>
        <div className="stack" style={{ gap: 16, alignContent: "start" }}>
          <div className="card card--pad stack" style={{ gap: 10 }}>
            <h3 className="h3">Povinnosti dle zák. 309/2006 Sb.</h3>
            <ul className="hz__measures">
              {obligations.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
          {catalogue.questions.length > 0 && (
            <div className="card card--pad stack" style={{ gap: 10 }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <h3 className="h3">Otázky pro projektanta</h3>
                <CopyButton text={catalogue.questions.map((q, i) => `${i + 1}. ${q}`).join("\n")} />
              </div>
              <ol className="hz__measures">
                {catalogue.questions.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ol>
            </div>
          )}
          {catalogue.librarySuggestions.length > 0 && (
            <div className="card card--pad stack" style={{ gap: 10 }}>
              <h3 className="h3">Návrhy na doplnění knihovny</h3>
              <p className="muted small" style={{ margin: 0 }}>
                AI zjistila nebezpečí, která řízená knihovna neobsahuje. Do katalogu nebyla zařazena – předejte garantovi knihovny.
              </p>
              <ul className="hz__measures">
                {catalogue.librarySuggestions.map((s) => (
                  <li key={s.name}>
                    <b>{s.name}</b> – {s.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <div className="toolbar">
        <div className="segmented" role="group" aria-label="Filtr">
          {(
            [
              ["all", `Vše (${entries.length})`],
              ["high", "Významná rizika"],
              ["review", "K ověření"],
            ] as [Filter, string][]
          ).map(([id, label]) => (
            <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)}>
              {label}
            </button>
          ))}
        </div>
        <div className="legend small">
          <span className="pill pill--ok">
            <span className="dot" /> Potvrzeno
          </span>
          <span className="pill pill--warn">
            <span className="dot" /> Odvozeno
          </span>
          <span className="pill pill--bad">
            <span className="dot" /> Chybí údaje
          </span>
        </div>
      </div>

      <div className="hz-list">
        {visible.map((e, i) => (
          <HazardRow
            key={e.hazardId}
            e={e}
            index={i}
            removed={removed.has(e.hazardId)}
            onToggle={() => toggleRemoved(e.hazardId)}
            onChange={(patch) => update(e.hazardId, patch)}
          />
        ))}
        {visible.length === 0 && <p className="muted">Žádné položky pro zvolený filtr.</p>}
      </div>

      <p className="disclaimer">
        Pracovní návrh z řízené knihovny nebezpečí. Nenahrazuje posouzení odborně způsobilou osobou; před použitím musí být
        ověřen a podepsán koordinátorem BOZP / odpovědnou osobou. Riziko je hodnoceno před zavedením opatření (R = P × Z).
      </p>
    </div>
  );
}

function HazardRow({
  e,
  index,
  removed,
  onToggle,
  onChange,
}: {
  e: CatalogueEntry;
  index: number;
  removed: boolean;
  onToggle: () => void;
  onChange: (p: { probability?: Level; severity?: Level }) => void;
}) {
  const conf = CONFIDENCE[e.confidence];
  return (
    <article className="hz" data-removed={removed} style={{ animationDelay: `${Math.min(index, 12) * 30}ms` }}>
      <div className="hz__score" data-band={e.band} aria-label={`Riziko ${e.score}, ${RISK_BANDS[e.band].label}`}>
        <strong>{e.score}</strong>
        <span>{RISK_BANDS[e.band].label}</span>
      </div>

      <div>
        <div className="hz__name">{e.name}</div>
        <div className="hz__meta">
          <span className="pill pill--ghost mono">{e.hazardId}</span>
          <span className="pill pill--ghost">{e.categoryLabel}</span>
          <span className={`pill ${conf.cls}`}>
            <span className="dot" /> {conf.label}
          </span>
          {e.annex5 && <span className="pill pill--accent" title={e.annex5}>Příl. 5 NV 591</span>}
        </div>
        <p className="hz__text">
          <b>Příčina:</b> {e.cause}
        </p>
        <p className="hz__text">
          <b>Následek:</b> {e.risk}
        </p>
        {e.rationale.length > 0 && (
          <div className="hz__why">
            {e.rationale.map((r) => (
              <div key={r}>{r}</div>
            ))}
            <div>Zdroj: {SOURCE[e.source]}</div>
          </div>
        )}
      </div>

      <div>
        <ul className="hz__measures">
          {e.measures.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
        <div className="hz__regs">{e.regulations.join(" · ")}</div>
      </div>

      <div className="hz__controls">
        <div className="hz__pz">
          <label>
            Pravděpodobnost
            <select value={e.probability} disabled={removed} onChange={(ev) => onChange({ probability: Number(ev.target.value) as Level })}>
              {LEVELS.map((l) => (
                <option key={l} value={l} title={PROBABILITY_LABELS[l]}>
                  {l} – {PROBABILITY_LABELS[l]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Závažnost
            <select value={e.severity} disabled={removed} onChange={(ev) => onChange({ severity: Number(ev.target.value) as Level })}>
              {LEVELS.map((l) => (
                <option key={l} value={l} title={SEVERITY_LABELS[l]}>
                  {l} – {SEVERITY_LABELS[l]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onToggle}>
          {removed ? "Vrátit do katalogu" : "Vyřadit"}
        </button>
      </div>
    </article>
  );
}

function Stat({ value, label, tone }: { value: number | string; label: string; tone?: "bad" | "warn" | "accent" }) {
  const color = tone === "bad" ? "var(--bad)" : tone === "warn" ? "var(--warn)" : undefined;
  return (
    <div className="card stat" style={tone === "accent" ? { background: "var(--accent)", color: "var(--accent-ink)", borderColor: "transparent" } : undefined}>
      <div className="stat__value" style={{ color }}>
        {value}
      </div>
      <div className="stat__label" style={tone === "accent" ? { color: "inherit", opacity: 0.8 } : undefined}>
        {label}
      </div>
    </div>
  );
}

function FindingRow({ f }: { f: Finding }) {
  return (
    <div className="finding" data-sev={f.severity}>
      <span className="finding__icon" aria-hidden>
        {f.severity === "error" ? "!" : f.severity === "warning" ? "?" : "i"}
      </span>
      <div>
        <div className="finding__title">{f.title}</div>
        <div className="finding__detail">{f.detail}</div>
      </div>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
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
      {done ? "Zkopírováno ✓" : "Kopírovat"}
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

