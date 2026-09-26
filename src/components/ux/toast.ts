"use client";

export type ToastTone = "default" | "good" | "bad";
export interface ToastMsg {
  id: number;
  text: string;
  tone: ToastTone;
  action?: { label: string; run: () => void };
}

let seq = 0;

/** Zobrazí krátké oznámení (uloženo, zkopírováno, chyba…). */
export function toast(text: string, tone: ToastTone = "default", action?: ToastMsg["action"]) {
  window.dispatchEvent(new CustomEvent<ToastMsg>("sagasta:toast", { detail: { id: ++seq, text, tone, action } }));
}
