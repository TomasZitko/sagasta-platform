"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { saveProject } from "@/lib/project/store";
import { cycleTheme, FAVORITES, read, RECENT } from "@/lib/prefs";
import { TOOLS } from "@/lib/tools/registry";
import { allCommands, COMMANDS_EVENT, formatKeys, useCommands, type Command } from "./hotkeys";
import { toast } from "./toast";

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Skóre shody: všechna slova dotazu musí být obsažena; přednost mají začátky slov. */
function score(q: string, text: string): number {
  const t = fold(text);
  const words = fold(q).split(/\s+/).filter(Boolean);
  let s = 0;
  for (const w of words) {
    const i = t.indexOf(w);
    if (i < 0) return -1;
    s += i === 0 ? 3 : /\s/.test(t[i - 1] ?? "") ? 2 : 1;
  }
  return s;
}

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [, force] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const on = () => force((n) => n + 1);
    window.addEventListener(COMMANDS_EVENT, on);
    return () => window.removeEventListener(COMMANDS_EVENT, on);
  }, []);

  const go = (href: string) => router.push(href);

  useCommands([
    { id: "palette", label: "Paleta příkazů", group: "Obecné", keys: "mod+k", run: () => setOpen((o) => !o), hidden: true },
    { id: "help", label: "Klávesové zkratky", group: "Obecné", keys: "?", run: () => setHelp(true) },
    { id: "go-home", label: "Přejít na nástroje", group: "Navigace", keys: "g h", run: () => go("/") },
    { id: "go-project", label: "Přejít na data projektu", group: "Navigace", keys: "g p", run: () => go("/nastroje/extrakce-dat") },
    { id: "go-copilot", label: "Otevřít Copilot", group: "Navigace", keys: "g c", run: () => go("/copilot") },
    { id: "go-library", label: "Otevřít knihovnu dokumentů", group: "Navigace", keys: "g k", run: () => go("/knihovna") },
    { id: "go-bozp", label: "Otevřít Katalog nebezpečí", group: "Navigace", keys: "g b", run: () => go("/katalog-nebezpeci") },
    { id: "theme", label: "Přepnout motiv (systém / světlý / tmavý)", group: "Obecné", keys: "mod+shift+l", run: () => toast(`Motiv: ${({ system: "podle systému", light: "světlý", dark: "tmavý" } as const)[cycleTheme()]}`) },
    {
      id: "clear-project",
      label: "Odebrat aktivní projekt",
      group: "Projekt",
      run: () => {
        saveProject(null);
        toast("Aktivní projekt odebrán");
      },
    },
  ]);

  const items = useMemo(() => {
    if (!open) return [];
    const favs = read<string[]>(FAVORITES, []);
    const recent = read<string[]>(RECENT, []);
    const toolCmds: Command[] = TOOLS.map((t) => ({
      id: `tool-${t.slug}`,
      label: `${t.title}`,
      group: favs.includes(t.slug) ? "Oblíbené nástroje" : recent.includes(t.slug) ? "Naposledy použité" : "Nástroje",
      run: () => go(t.href ?? `/nastroje/${t.slug}`),
      keys: undefined,
      hint: t.flow,
    })) as (Command & { hint?: string })[];
    const all = [...allCommands().filter((c) => !c.hidden), ...toolCmds] as (Command & { hint?: string })[];
    if (!q.trim()) {
      const rank = (c: Command) => (c.group === "Tento nástroj" ? 0 : c.group === "Oblíbené nástroje" ? 1 : c.group === "Naposledy použité" ? 2 : c.group === "Nástroje" ? 4 : 3);
      return all.sort((a, b) => rank(a) - rank(b));
    }
    return all
      .map((c) => ({ c, s: score(q, `${c.label} ${c.group} ${(c as { hint?: string }).hint ?? ""}`) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.c);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, q]);

  useEffect(() => {
    if (open) {
      setQ("");
      setActive(0);
      requestAnimationFrame(() => input.current?.focus());
    }
  }, [open]);
  useEffect(() => setActive(0), [q]);

  const runItem = (c?: Command) => {
    if (!c) return;
    setOpen(false);
    requestAnimationFrame(() => c.run());
  };

  return (
    <>
      {open && (
        <div className="overlay" onMouseDown={() => setOpen(false)}>
          <div className="palette" role="dialog" aria-modal="true" aria-label="Paleta příkazů" onMouseDown={(e) => e.stopPropagation()}>
            <input
              ref={input}
              className="palette__input"
              placeholder="Hledat nástroj nebo příkaz…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              role="combobox"
              aria-expanded="true"
              aria-controls="palette-list"
              aria-activedescendant={items[active] ? `pc-${items[active].id}` : undefined}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") (e.preventDefault(), setActive((a) => Math.min(items.length - 1, a + 1)));
                else if (e.key === "ArrowUp") (e.preventDefault(), setActive((a) => Math.max(0, a - 1)));
                else if (e.key === "Enter") (e.preventDefault(), runItem(items[active]));
                else if (e.key === "Escape") (e.preventDefault(), setOpen(false));
              }}
            />
            <ul className="palette__list" id="palette-list" role="listbox">
              {items.slice(0, 60).map((c, i) => (
                <li
                  key={c.id}
                  id={`pc-${c.id}`}
                  role="option"
                  aria-selected={i === active}
                  className="palette__item"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => runItem(c)}
                  ref={(el) => {
                    if (i === active) el?.scrollIntoView({ block: "nearest" });
                  }}
                >
                  <span className="palette__label">
                    {c.label}
                    {(c as { hint?: string }).hint && <span className="palette__hint">{(c as { hint?: string }).hint}</span>}
                  </span>
                  <span className="palette__group">{c.group}</span>
                  {c.keys && <kbd>{formatKeys(c.keys)}</kbd>}
                </li>
              ))}
              {!items.length && <li className="palette__empty">Nic nenalezeno</li>}
            </ul>
            <div className="palette__foot">
              <span>
                <kbd>↑</kbd>
                <kbd>↓</kbd> výběr
              </span>
              <span>
                <kbd>↵</kbd> spustit
              </span>
              <span>
                <kbd>Esc</kbd> zavřít
              </span>
            </div>
          </div>
        </div>
      )}
      {help && <ShortcutsHelp onClose={() => setHelp(false)} />}
    </>
  );
}

function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const on = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [onClose]);
  const groups = new Map<string, Command[]>();
  for (const c of [...allCommands(), { id: "p", label: "Paleta příkazů", group: "Obecné", keys: "mod+k", run: () => {} }].filter((c) => c.keys)) {
    if (c.id === "palette") continue;
    groups.set(c.group, [...(groups.get(c.group) ?? []), c]);
  }
  return (
    <div className="overlay" onMouseDown={onClose}>
      <div ref={ref} tabIndex={-1} className="palette help" role="dialog" aria-modal="true" aria-label="Klávesové zkratky" onMouseDown={(e) => e.stopPropagation()}>
        <div className="help__head">
          <h2 className="h3">Klávesové zkratky</h2>
          <button type="button" className="btn btn--ghost btn--icon" onClick={onClose} aria-label="Zavřít">
            ×
          </button>
        </div>
        <div className="help__grid">
          {[...groups.entries()].map(([g, cmds]) => (
            <section key={g}>
              <h3 className="eyebrow">{g}</h3>
              <dl>
                {cmds.map((c) => (
                  <div key={c.id}>
                    <dt>{c.label}</dt>
                    <dd>
                      <kbd>{formatKeys(c.keys!)}</kbd>
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
        <p className="small muted" style={{ margin: 0 }}>
          Tip: soubory můžete na stránku nástroje přetáhnout kamkoli nebo vložit ze schránky.
        </p>
      </div>
    </div>
  );
}
