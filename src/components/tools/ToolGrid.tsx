"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { FAVORITES, RECENT, toggleFavorite, usePref } from "@/lib/prefs";
import { useActiveProject } from "@/lib/project/store";
import { formatKeys, useCommands } from "../ux/hotkeys";
import type { ToolWithSample } from "@/lib/tools/registry";
import { CATEGORY_LABEL, type ToolCategory } from "@/lib/tools/types";

const ORDER: ToolCategory[] = ["project", "documents", "checks", "site", "office"];


const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function ToolGrid({ tools }: { tools: ToolWithSample[] }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<ToolCategory | "all">("all");
  const [project, setProject, ready] = useActiveProject();
  const [favorites] = usePref<string[]>(FAVORITES, []);
  const [recent] = usePref<string[]>(RECENT, []);
  const search = useRef<HTMLInputElement>(null);
  const grid = useRef<HTMLDivElement>(null);

  useCommands([
    { id: "hub-search", label: "Hledat nástroj", group: "Rozcestník", keys: "/", run: () => search.current?.focus() },
    { id: "hub-first", label: "Otevřít první výsledek hledání", group: "Rozcestník", keys: "mod+enter", run: () => (grid.current?.querySelector(".tool-card") as HTMLElement | null)?.click() },
  ]);

  /** Šipky mezi kartami nástrojů. */
  const onGridKey = (e: React.KeyboardEvent) => {
    if (!["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(e.key)) return;
    const cards = [...(grid.current?.querySelectorAll<HTMLElement>(".tool-card") ?? [])];
    const i = cards.indexOf(document.activeElement as HTMLElement);
    if (i < 0) return;
    e.preventDefault();
    const cols = Math.max(1, Math.round((grid.current!.clientWidth || 1) / (cards[0].offsetWidth + 16)));
    const d = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key]!;
    cards[Math.min(cards.length - 1, Math.max(0, i + d))]?.focus();
  };

  /** Relevance: shoda v názvu > ve „vstup → výstup“ > v popisu; všechna slova dotazu musí sedět. */
  const rank = (t: ToolWithSample): number => {
    const words = fold(q).split(/\s+/).filter(Boolean);
    let s = 0;
    for (const w of words) {
      const title = fold(t.title);
      const v = title.startsWith(w) ? 6 : title.includes(w) ? 4 : fold(t.flow).includes(w) ? 2 : fold(t.description).includes(w) ? 1 : 0;
      if (!v) return 0;
      s += v;
    }
    return s;
  };
  const filtered = useMemo(
    () =>
      tools
        .filter((t) => (cat === "all" || t.category === cat) && (!q.trim() || rank(t) > 0))
        .sort((a, b) => (q.trim() ? rank(b) - rank(a) : 0)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        <input
          ref={search}
          className="input search"
          type="search"
          placeholder="Hledat nástroj…   /"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") (grid.current?.querySelector(".tool-card") as HTMLElement | null)?.click();
            if (e.key === "ArrowDown") (e.preventDefault(), (grid.current?.querySelector(".tool-card") as HTMLElement | null)?.focus());
            if (e.key === "Escape") setQ("");
          }}
          aria-label="Hledat nástroj"
        />
      </div>

      <div ref={grid} className="stack" style={{ gap: 28 }} onKeyDown={onGridKey}>
        {!q && cat === "all" && (
          <>
            <Group title="★ Oblíbené" list={favorites.map((s) => tools.find((t) => t.slug === s)).filter(Boolean) as ToolWithSample[]} favorites={favorites} />
            <Group title="Naposledy použité" list={recent.filter((s) => !favorites.includes(s)).map((s) => tools.find((t) => t.slug === s)).filter(Boolean).slice(0, 4) as ToolWithSample[]} favorites={favorites} />
          </>
        )}
        {q.trim() ? (
          <Group title={`Výsledky hledání (${filtered.length}) – Enter otevře první`} list={filtered} favorites={favorites} />
        ) : (
          ORDER.map((c) => <Group key={c} title={CATEGORY_LABEL[c]} list={filtered.filter((t) => t.category === c)} favorites={favorites} />)
        )}
      </div>
      <p className="small muted">
        Tip: <kbd>{formatKeys("mod+k")}</kbd> paleta příkazů · <kbd>/</kbd> hledat · <kbd>?</kbd> všechny zkratky · šipky mezi kartami
      </p>
      {!filtered.length && <p className="muted">Žádný nástroj neodpovídá hledání.</p>}
    </div>
  );
}

function Group({ title, list, favorites }: { title: string; list: ToolWithSample[]; favorites: string[] }) {
  if (!list.length) return null;
  return (
    <section className="stack" style={{ gap: 12 }}>
      <h2 className="eyebrow" style={{ margin: 0 }}>
        {title}
      </h2>
      <div className="grid grid--tools">
        {list.map((t) => (
          <Link key={t.slug} href={t.href ?? `/nastroje/${t.slug}`} className="card tool-card">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className="tool-card__num">{t.n}</span>
              <span className="row" style={{ gap: 6 }}>
                {t.worksWithoutAi && <span className="pill pill--ok small">i bez AI</span>}
                <button
                  type="button"
                  className="star"
                  aria-pressed={favorites.includes(t.slug)}
                  aria-label={favorites.includes(t.slug) ? `Odebrat ${t.title} z oblíbených` : `Přidat ${t.title} do oblíbených`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleFavorite(t.slug);
                  }}
                >
                  {favorites.includes(t.slug) ? "★" : "☆"}
                </button>
              </span>
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
}
