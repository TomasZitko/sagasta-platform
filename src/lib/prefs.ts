"use client";

import { useEffect, useState } from "react";

/** Drobné uživatelské preference v localStorage (vždy s ošetřením nedostupnosti). */

const EVENT = "sagasta:prefs";

export function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function write(key: string, value: unknown) {
  try {
    if (value === null || value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* úložiště nedostupné */
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: key }));
}

export function usePref<T>(key: string, fallback: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(fallback);
  useEffect(() => {
    const sync = () => setValue(read(key, fallback));
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return [value, (v: T) => write(key, v)];
}

/* ——— oblíbené a naposledy použité nástroje ——— */

export const FAVORITES = "sagasta.favorites";
export const RECENT = "sagasta.recent";

export function markRecent(slug: string) {
  const list = read<string[]>(RECENT, []).filter((s) => s !== slug);
  write(RECENT, [slug, ...list].slice(0, 6));
}

export function toggleFavorite(slug: string) {
  const list = read<string[]>(FAVORITES, []);
  write(FAVORITES, list.includes(slug) ? list.filter((s) => s !== slug) : [...list, slug]);
}

/* ——— motiv ——— */

export type Theme = "system" | "light" | "dark";
export const THEME = "sagasta.theme";

export function applyTheme(t: Theme) {
  const root = document.documentElement;
  if (t === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", t);
}

export function cycleTheme() {
  const order: Theme[] = ["system", "light", "dark"];
  const next = order[(order.indexOf(read<Theme>(THEME, "system")) + 1) % order.length];
  write(THEME, next);
  applyTheme(next);
  return next;
}

/** Inline skript do <head> – aplikuje motiv před vykreslením (bez probliknutí). */
export const THEME_SCRIPT = `try{var t=JSON.parse(localStorage.getItem("${THEME}"));if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;
