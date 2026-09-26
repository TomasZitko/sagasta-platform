"use client";

import { useEffect, useRef, useState } from "react";
import { IntakeForm, type PdfFile } from "@/components/intake/IntakeForm";
import type { Catalogue } from "@/lib/hazards/engine";
import { emptyIntake, sampleIntake, type ProjectIntake } from "@/lib/project/intake";
import { loadProject, saveProject } from "@/lib/project/store";
import { CatalogueView } from "./CatalogueView";

export function HazardTool({ aiEnabled }: { aiEnabled: boolean }) {
  const [intake, setIntake] = useState<ProjectIntake>(() => ({ ...emptyIntake(), projectName: "" }));
  const [pdfs, setPdfs] = useState<PdfFile[]>([]);
  const [useAi, setUseAi] = useState(aiEnabled);
  const [result, setResult] = useState<{ catalogue: Catalogue; intake: ProjectIntake } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const hydrated = useRef(false);

  useEffect(() => {
    // Katalog čte i zapisuje aktivní projekt – sdílený se všemi nástroji.
    const draft = loadProject();
    if (draft) setIntake(draft);
    hydrated.current = true;
  }, []);

  useEffect(() => {
    if (hydrated.current && intake.projectName.trim()) saveProject(intake);
  }, [intake]);

  const valid = intake.projectName.trim().length > 0;

  async function generate() {
    if (!valid) {
      setError("Zadejte název stavby.");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    try {
      const res = await fetch("/api/hazards/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intake, useAi, pdfs: pdfs.map(({ name, base64 }) => ({ name, base64 })) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Chyba ${res.status}`);
      setResult({ catalogue: data as Catalogue, intake });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generování selhalo.");
    } finally {
      setLoading(false);
    }
  }

  const step = result ? 2 : 1;

  return (
    <div className="tool-layout">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="steps" aria-label="Postup">
          <span className="step" data-active={step === 1}>
            <b>1</b> Údaje o stavbě
          </span>
          <span className="step" data-active={step === 2}>
            <b>2</b> Kontrola katalogu
          </span>
          <span className="step">
            <b>3</b> Export
          </span>
        </div>
        <div className="row">
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => (setIntake(sampleIntake()), setResult(null))}>
            Načíst ukázkový projekt
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => (setIntake({ ...emptyIntake(), projectName: "" }), setPdfs([]), setResult(null))}
          >
            Vymazat
          </button>
        </div>
      </div>

      <IntakeForm value={intake} onChange={setIntake} pdfs={pdfs} onPdfs={setPdfs} />

      <div className="actionbar">
        <label className="toggle" style={{ border: 0, padding: 0, background: "transparent" }} title={aiEnabled ? "" : "Nastavte ANTHROPIC_API_KEY na serveru"}>
          <input type="checkbox" checked={useAi && aiEnabled} disabled={!aiEnabled} onChange={(e) => setUseAi(e.target.checked)} />
          <span className="toggle__track" aria-hidden />
          <span className="toggle__label">
            <strong>AI upřesnění</strong>{" "}
            <span className="muted small">{aiEnabled ? "Claude + pravidla" : "nenakonfigurováno – pouze pravidla"}</span>
          </span>
        </label>
        <button type="button" className="btn btn--primary" onClick={generate} disabled={loading}>
          {loading ? (
            <>
              <span className="spinner" aria-hidden /> Generuji…
            </>
          ) : (
            <>
              Vygenerovat katalog <span aria-hidden>→</span>
            </>
          )}
        </button>
      </div>

      <div ref={resultsRef} style={{ scrollMarginTop: 80 }} aria-live="polite" aria-busy={loading}>
        {error && (
          <div className="banner" role="alert" style={{ borderColor: "var(--bad)", background: "var(--bad-soft)" }}>
            {error}
          </div>
        )}
        {loading && (
          <div className="stack">
            <p className="muted small">
              {useAi && aiEnabled ? "Claude prochází údaje a dokumentaci, vybírá z řízené knihovny…" : "Vyhodnocuji pravidla knihovny…"}
            </p>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton" style={{ animationDelay: `${i * 0.12}s` }} />
            ))}
          </div>
        )}
        {result && <CatalogueView key={result.catalogue.generatedAt} catalogue={result.catalogue} intake={result.intake} />}
      </div>
    </div>
  );
}
