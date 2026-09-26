"use client";

import { useEffect, useState } from "react";
import { ProjectIntakeSchema, type ProjectIntake } from "./intake";

/**
 * Aktivní projekt – sdílený všemi nástroji v prohlížeči uživatele.
 * Ukládá se do localStorage; při nedostupném úložišti funguje jen v paměti.
 */

const KEY = "sagasta.project.v1";
const EVENT = "sagasta:project";
let memory: ProjectIntake | null = null;

export function loadProject(): ProjectIntake | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return memory;
    const parsed = ProjectIntakeSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : memory;
  } catch {
    return memory;
  }
}

export function saveProject(p: ProjectIntake | null) {
  memory = p;
  try {
    if (p) localStorage.setItem(KEY, JSON.stringify(p));
    else localStorage.removeItem(KEY);
  } catch {
    /* úložiště nedostupné – zůstává v paměti */
  }
  window.dispatchEvent(new CustomEvent(EVENT));
}

/** Aktivní projekt s automatickou synchronizací mezi komponentami a záložkami. */
export function useActiveProject(): [ProjectIntake | null, (p: ProjectIntake | null) => void, boolean] {
  const [project, setProject] = useState<ProjectIntake | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const sync = () => setProject(loadProject());
    sync();
    setReady(true);
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return [project, saveProject, ready];
}
