"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useActiveProject } from "@/lib/project/store";
import type { ToolWithSample } from "@/lib/tools/registry";
import { CATEGORY_LABEL, type ToolCategory } from "@/lib/tools/types";

const ORDER: ToolCategory[] = ["project", "documents", "checks", "site", "office"];

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function ToolGrid({ tools }: { tools: ToolWithSample[] }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<ToolCategory | "all">("all");
  const [project, setProject, ready] = useActiveProject();

  const filtered = useMemo(
    () =>
      tools.filter(
        (t) => (cat === "all" || t.category === cat) && (!q || fold(`${t.title} ${t.flow} ${t.description}`).includes(fold(q))),
      ),
    [tools, q, cat],
  );

  return (
    <div className="stack" style={{ gap: 24 }}>
      {ready && (
        <div className="project-bar card">
          <span className="project-bar__icon" aria-hidden>
            ◆
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <span className="eyebrow">{project ? "Aktivní projekt" : "Začněte projektem"}</span>
            <div className="project-bar__name">{project ? project.projectName : "Jeden vstup → všechny dokumenty"}</div>
            {!project && <div className="small muted">Vytěžte data z dokumentace – ostatní nástroje je převezmou.</div>}
          </div>
          <div className="row">
            <Link className="btn btn--primary btn--sm" href="/nastroje/extrakce-dat">
              {project ? "Aktualizovat z dokumentace" : "Vytěžit data projektu"}
            </Link>
            {project && (
              <>
                <Link className="btn btn--ghost btn--sm" href="/katalog-nebezpeci">
                  Upravit
                </Link>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => confirm("Odebrat aktivní projekt?") && setProject(null)}>
                  Odebrat
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <div className="toolbar">
        <div className="segmented" role="group" aria-label="Kategorie">
          <button type="button" aria-pressed={cat === "all"} onClick={() => setCat("all")}>
            Vše ({tools.length})
          </button>
          {ORDER.map((c) => (
            <button key={c} type="button" aria-pressed={cat === c} onClick={() => setCat(c)}>
              {CATEGORY_LABEL[c]}
            </button>
          ))}
        </div>
        <input className="input search" type="search" placeholder="Hledat nástroj…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Hledat nástroj" />
      </div>

      {ORDER.map((c) => {
        const list = filtered.filter((t) => t.category === c);
        if (!list.length) return null;
        return (
          <section key={c} className="stack" style={{ gap: 12 }}>
            <h2 className="eyebrow" style={{ margin: 0 }}>
              {CATEGORY_LABEL[c]}
            </h2>
            <div className="grid grid--tools">
              {list.map((t) => (
                <Link key={t.slug} href={t.href ?? `/nastroje/${t.slug}`} className="card tool-card">
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <span className="tool-card__num">{t.n}</span>
                    {t.worksWithoutAi && <span className="pill pill--ok small">i bez AI</span>}
                  </div>
                  <h3 className="h3">{t.title}</h3>
                  <span className="tool-card__flow">{t.flow}</span>
                  <p className="muted small" style={{ margin: 0 }}>
                    {t.description}
                  </p>
                  <span className="tool-card__cta">
                    {t.action} <span aria-hidden>→</span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
      {!filtered.length && <p className="muted">Žádný nástroj neodpovídá hledání.</p>}
    </div>
  );
}
