"use client";

import { useEffect, useRef } from "react";

/**
 * Klávesové zkratky. Zápis: "mod+enter", "mod+shift+e", "alt+s", "?", "g h" (sekvence).
 * „mod“ = ⌘ na macOS, Ctrl jinde. Zkratky bez modifikátoru se v polích formuláře ignorují.
 */

export interface Command {
  id: string;
  label: string;
  /** Skupina v paletě příkazů. */
  group: string;
  keys?: string;
  run: () => void;
  /** Příkaz se nezobrazí v paletě. */
  hidden?: boolean;
}

const registry = new Map<string, Command>();
const EVENT = "sagasta:commands";

export const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

export function formatKeys(keys: string): string {
  const mac = isMac();
  return keys
    .split(" ")
    .map((chord) =>
      chord
        .split("+")
        .map((k) => ({ mod: mac ? "⌘" : "Ctrl", shift: mac ? "⇧" : "Shift", alt: mac ? "⌥" : "Alt", enter: "↵", escape: "Esc" })[k] ?? k.toUpperCase())
        .join(mac ? "" : "+"),
    )
    .join(" ");
}

export function allCommands(): Command[] {
  return [...registry.values()];
}

function matches(chord: string, e: KeyboardEvent): boolean {
  const parts = chord.split("+");
  const key = parts[parts.length - 1];
  const mod = parts.includes("mod");
  const wantMod = mod ? (isMac() ? e.metaKey : e.ctrlKey) : !(e.metaKey || e.ctrlKey);
  const k = e.key.toLowerCase();
  const keyOk = key === "enter" ? k === "enter" : key === "escape" ? k === "escape" : k === key || (e.code === `Key${key.toUpperCase()}` && key.length === 1);
  // u symbolů (?, /) je Shift součástí znaku na většině rozložení – nekontrolujeme ho
  const symbol = key.length === 1 && !/[a-z0-9]/.test(key);
  return keyOk && wantMod && (symbol || parts.includes("shift") === e.shiftKey) && parts.includes("alt") === e.altKey;
}

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));

let installed = false;
let pending: { first: string; at: number } | null = null;

function install() {
  if (installed) return;
  installed = true;
  window.addEventListener("keydown", (e) => {
    if (e.defaultPrevented || e.isComposing) return;
    const typing = isTyping(e.target);
    const cmds = [...registry.values()].filter((c) => c.keys);
    // sekvence „g h“
    if (pending && Date.now() - pending.at < 1200 && !typing) {
      const seq = cmds.find((c) => c.keys!.includes(" ") && c.keys!.split(" ")[0] === pending!.first && matches(c.keys!.split(" ")[1], e));
      pending = null;
      if (seq) {
        e.preventDefault();
        seq.run();
        return;
      }
    }
    for (const c of cmds) {
      const keys = c.keys!;
      if (keys.includes(" ")) {
        if (!typing && matches(keys.split(" ")[0], e)) pending = { first: keys.split(" ")[0], at: Date.now() };
        continue;
      }
      const hasMod = keys.includes("mod") || keys.includes("alt") || keys === "escape";
      if (typing && !hasMod) continue;
      if (matches(keys, e)) {
        e.preventDefault();
        c.run();
        return;
      }
    }
  });
}

/** Registruje příkazy (zkratky + paleta) po dobu života komponenty. */
export function useCommands(commands: Command[], deps: unknown[] = []) {
  const ref = useRef(commands);
  ref.current = commands;
  useEffect(() => {
    install();
    const ids = ref.current.map((c) => c.id);
    for (const c of ref.current) registry.set(c.id, { ...c, run: () => ref.current.find((x) => x.id === c.id)?.run() });
    window.dispatchEvent(new CustomEvent(EVENT));
    return () => {
      ids.forEach((id) => registry.delete(id));
      window.dispatchEvent(new CustomEvent(EVENT));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export const COMMANDS_EVENT = EVENT;
