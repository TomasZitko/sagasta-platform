"use client";

import { useEffect, useState } from "react";
import type { ToastMsg } from "./toast";

export function Toaster() {
  const [items, setItems] = useState<ToastMsg[]>([]);
  useEffect(() => {
    const on = (e: Event) => {
      const t = (e as CustomEvent<ToastMsg>).detail;
      setItems((l) => [...l.slice(-3), t]);
      setTimeout(() => setItems((l) => l.filter((x) => x.id !== t.id)), t.action ? 6000 : 3200);
    };
    window.addEventListener("sagasta:toast", on);
    return () => window.removeEventListener("sagasta:toast", on);
  }, []);
  return (
    <div className="toaster" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className="toast" data-tone={t.tone}>
          <span>{t.text}</span>
          {t.action && (
            <button type="button" className="toast__action" onClick={() => (t.action!.run(), setItems((l) => l.filter((x) => x.id !== t.id)))}>
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
