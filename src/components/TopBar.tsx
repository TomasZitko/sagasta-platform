"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { applyTheme, cycleTheme, THEME, usePref, type Theme } from "@/lib/prefs";
import { formatKeys } from "./ux/hotkeys";

const NAV = [
  { href: "/", label: "Nástroje" },
  { href: "/copilot", label: "Copilot" },
  { href: "/knihovna", label: "Knihovna" },
];

const THEME_ICON: Record<Theme, string> = { system: "◐", light: "☀", dark: "☾" };
const THEME_LABEL: Record<Theme, string> = { system: "Motiv podle systému", light: "Světlý motiv", dark: "Tmavý motiv" };

export function TopBar() {
  const path = usePathname();
  const [theme] = usePref<Theme>(THEME, "system");
  useEffect(() => applyTheme(theme), [theme]);

  return (
    <header className="topbar">
      <div className="container topbar__inner">
        <Link href="/" className="brand" aria-label="SAGASTA AI – přehled nástrojů">
          <span className="brand__mark" aria-hidden />
          SAGASTA <span className="brand__tag">AI</span>
        </Link>
        <nav className="topbar__nav" aria-label="Hlavní navigace">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} aria-current={path === n.href ? "page" : undefined}>
              {n.label}
            </Link>
          ))}
        </nav>
        <button
          type="button"
          className="kbd-btn"
          onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", code: "KeyK", metaKey: /Mac/.test(navigator.platform), ctrlKey: !/Mac/.test(navigator.platform) }))}
          aria-label="Otevřít paletu příkazů"
          title="Paleta příkazů"
        >
          <span aria-hidden>⌕</span>
          <kbd suppressHydrationWarning>{typeof navigator === "undefined" ? "Ctrl K" : formatKeys("mod+k")}</kbd>
        </button>
        <button type="button" className="btn btn--ghost btn--icon theme-btn" onClick={cycleTheme} aria-label={THEME_LABEL[theme]} title={THEME_LABEL[theme]}>
          {THEME_ICON[theme]}
        </button>
      </div>
    </header>
  );
}
