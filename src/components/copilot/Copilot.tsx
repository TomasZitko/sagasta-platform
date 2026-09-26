"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useLibrary } from "@/lib/library";
import { read, write } from "@/lib/prefs";
import { useActiveProject } from "@/lib/project/store";
import type { ProjectIntake } from "@/lib/project/intake";
import { TOOLS_BY_SLUG } from "@/lib/tools/registry";
import { Bm25Index, highlightSnippet, type Hit } from "@/lib/tools/search";
import { formatKeys, useCommands } from "../ux/hotkeys";
import { toast } from "../ux/toast";

interface Source {
  n: number;
  doc: string;
  text: string;
  matched: string[];
}

interface Msg {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  citations?: number[];
  actions?: { slug: string; reason: string }[];
  followUps?: string[];
  mode?: "ai" | "rules";
}

const KEY = "sagasta.copilot.v1";

const SUGGESTIONS = [
  "Shrň projekt v pěti bodech",
  "Které důležité údaje v podkladech chybí?",
  "Jaké jsou termíny zahájení a dokončení?",
  "Jak je řešeno založení?",
  "Jaká jsou hlavní rizika BOZP?",
  "Které objekty SO/PS stavba obsahuje?",
];

function projectSummary(p: ProjectIntake | null): string {
  if (!p) return "";
  return [
    `Název: ${p.projectName}`,
    p.location && `Místo: ${p.location}`,
    p.investor && `Investor: ${p.investor}`,
    p.durationWorkingDays && `Doba výstavby: ${p.durationWorkingDays} prac. dní`,
    p.peakWorkers && `Osob současně: ${p.peakWorkers}`,
    p.description && `Popis: ${p.description}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function Copilot({ aiEnabled }: { aiEnabled: boolean }) {
  const [project, , ready] = useActiveProject();
  const { docs } = useLibrary();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);
  const storeKey = `${KEY}.${project?.projectName ?? "_"}`;

  useEffect(() => {
    if (ready) setMsgs(read<Msg[]>(storeKey, []));
  }, [ready, storeKey]);
  useEffect(() => {
    if (ready) write(storeKey, msgs.slice(-30));
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs, ready, storeKey]);

  const index = useMemo(() => {
    const corpus = docs.map((d) => ({ name: d.name, text: d.text }));
    if (project?.documentText) corpus.push({ name: `Projekt: ${project.projectName}`, text: project.documentText });
    return new Bm25Index(corpus);
  }, [docs, project]);

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    setQ("");
    // follow-up otázky hledáme i s kontextem předchozí otázky
    const lastUser = [...msgs].reverse().find((m) => m.role === "user")?.content ?? "";
    let hits: Hit[] = index.search(question, 8);
    if (hits.length < 3 && lastUser) hits = index.search(`${question} ${lastUser}`, 8);
    const sources: Source[] = hits.map((h, i) => ({ n: i + 1, doc: h.doc, text: h.text.slice(0, 2400), matched: h.matched }));
    const next: Msg[] = [...msgs, { role: "user", content: question }];
    setMsgs(next);
    setBusy(true);
    const ctrl = new AbortController();
    abort.current = ctrl;
    try {
      const res = await fetch("/api/copilot", {
        method: "POST",
        signal: ctrl.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          history: next.slice(-9, -1).map((m) => ({ role: m.role, content: m.content.slice(0, 4000) })),
          passages: sources.map(({ n, doc, text }) => ({ n, doc, text })),
          project: projectSummary(project).slice(0, 8000),
          useAi: aiEnabled,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Chyba");
      setMsgs((m) => [...m, { role: "assistant", content: data.answer, sources, citations: data.citations, actions: data.actions, followUps: data.followUps, mode: data.mode }]);
    } catch (e) {
      if ((e as Error).name !== "AbortError") toast(e instanceof Error ? e.message : "Dotaz selhal", "bad");
      setMsgs((m) => m.slice(0, -1));
      setQ(question);
    } finally {
      setBusy(false);
      abort.current = null;
      input.current?.focus();
    }
  }

  useCommands(
    [
      { id: "cp-focus", label: "Psát dotaz", group: "Copilot", keys: "/", run: () => input.current?.focus() },
      { id: "cp-new", label: "Nová konverzace", group: "Copilot", keys: "alt+n", run: () => (setMsgs([]), toast("Nová konverzace")) },
      ...(busy ? [{ id: "cp-stop", label: "Zastavit odpověď", group: "Copilot", keys: "escape", run: () => abort.current?.abort() }] : []),
    ],
    [busy],
  );

  const empty = msgs.length === 0;

  return (
    <div className="copilot">
      <header className="copilot__head">
        <div>
          <span className="eyebrow">Projektový Copilot</span>
          <h1 className="h2" style={{ margin: "4px 0 0" }}>
            {project ? project.projectName : "Zeptejte se na svůj projekt"}
          </h1>
        </div>
        <div className="row">
          <span className={`pill ${project ? "pill--ok" : ""}`}>{project ? "◆ Aktivní projekt" : "Bez projektu"}</span>
          <Link href="/knihovna" className={`pill ${docs.length ? "pill--ok" : ""}`}>
            📚 {docs.length} v knihovně
          </Link>
          <span className="pill">{aiEnabled ? "Claude" : "Jen vyhledávání"}</span>
          {!empty && (
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setMsgs([])} title={formatKeys("alt+n")}>
              Nová konverzace
            </button>
          )}
        </div>
      </header>

      <div className="copilot__stream" aria-live="polite">
        {empty && (
          <div className="copilot__empty">
            <p className="lead" style={{ margin: "0 auto 18px" }}>
              Copilot odpovídá z aktivního projektu a z dokumentů ve vaší <Link href="/knihovna">knihovně</Link> – vždy s odkazy na zdroj.
            </p>
            {!docs.length && !project?.documentText && (
              <p className="note" style={{ maxWidth: 560, margin: "0 auto 18px" }}>
                Zatím nemám z čeho odpovídat. <Link href="/knihovna">Nahrajte dokumenty</Link> nebo <Link href="/nastroje/extrakce-dat">vytěžte data projektu</Link>.
              </p>
            )}
            <div className="chips" style={{ justifyContent: "center" }}>
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" className="chip" onClick={() => void send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {msgs.map((m, i) => (
          <article key={i} className="msg" data-role={m.role}>
            {m.role === "user" ? (
              <p>{m.content}</p>
            ) : (
              <>
                <RichText text={m.content} onCite={(n) => setOpen(`${i}-${n}`)} />
                {m.sources && m.sources.length > 0 && (
                  <div className="msg__sources">
                    {m.sources
                      .filter((s) => !m.citations?.length || m.citations.includes(s.n) || m.mode === "rules")
                      .map((s) => (
                        <details key={s.n} open={open === `${i}-${s.n}`} onToggle={(e) => (e.currentTarget.open ? setOpen(`${i}-${s.n}`) : open === `${i}-${s.n}` && setOpen(null))}>
                          <summary>
                            <span className="cite">{s.n}</span> {s.doc}
                          </summary>
                          <p>{highlightSnippet(s.text, s.matched, 700)}</p>
                        </details>
                      ))}
                  </div>
                )}
                {Boolean(m.actions?.length || m.followUps?.length) && (
                  <div className="chips" style={{ marginTop: 10 }}>
                    {m.actions?.map((a) => {
                      const t = TOOLS_BY_SLUG.get(a.slug)!;
                      return (
                        <Link key={a.slug} href={t.href ?? `/nastroje/${t.slug}`} className="chip chip--action" title={a.reason}>
                          → {t.title}
                        </Link>
                      );
                    })}
                    {i === msgs.length - 1 &&
                      m.followUps?.map((f) => (
                        <button key={f} type="button" className="chip" onClick={() => void send(f)}>
                          {f}
                        </button>
                      ))}
                  </div>
                )}
              </>
            )}
          </article>
        ))}
        {busy && (
          <article className="msg" data-role="assistant">
            <span className="typing" aria-label="Copilot přemýšlí">
              <i />
              <i />
              <i />
            </span>
          </article>
        )}
        <div ref={bottom} />
      </div>

      <form
        className="copilot__input"
        onSubmit={(e) => {
          e.preventDefault();
          void send(q);
        }}
      >
        <textarea
          ref={input}
          rows={1}
          className="textarea"
          placeholder="Zeptejte se… (Enter odeslat, Shift+Enter nový řádek)"
          value={q}
          autoFocus
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send(q);
            }
            if (e.key === "ArrowUp" && !q) {
              const last = [...msgs].reverse().find((m) => m.role === "user");
              if (last) (e.preventDefault(), setQ(last.content));
            }
          }}
          aria-label="Dotaz pro Copilota"
        />
        {busy ? (
          <button type="button" className="btn btn--ghost" onClick={() => abort.current?.abort()}>
            Zastavit
          </button>
        ) : (
          <button type="submit" className="btn btn--primary" disabled={!q.trim()}>
            Odeslat ↵
          </button>
        )}
      </form>
    </div>
  );
}

/** Jednoduché formátování odpovědi: odstavce, odrážky, **tučně**, citace [n]. */
function RichText({ text, onCite }: { text: string; onCite: (n: number) => void }) {
  const blocks = text.split(/\n\s*\n/);
  const inline = (s: string) =>
    s.split(/(\[\d+\]|\*\*[^*]+\*\*)/g).map((part, i) => {
      const cite = /^\[(\d+)\]$/.exec(part);
      if (cite)
        return (
          <button key={i} type="button" className="cite" onClick={() => onCite(Number(cite[1]))} aria-label={`Zdroj ${cite[1]}`}>
            {cite[1]}
          </button>
        );
      if (/^\*\*.+\*\*$/.test(part)) return <strong key={i}>{part.slice(2, -2)}</strong>;
      return <Fragment key={i}>{part}</Fragment>;
    });
  return (
    <div className="prose">
      {blocks.map((b, i) => {
        const lines = b.split("\n");
        if (lines.every((l) => /^\s*[-•]\s+/.test(l)))
          return (
            <ul key={i} className="list">
              {lines.map((l, j) => (
                <li key={j}>{inline(l.replace(/^\s*[-•]\s+/, ""))}</li>
              ))}
            </ul>
          );
        return <p key={i}>{inline(b)}</p>;
      })}
    </div>
  );
}
