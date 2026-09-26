import "server-only";
import { NextResponse } from "next/server";

/**
 * Společná ochrana API:
 *  - same-origin kontrola (ochrana proti CSRF z cizích stránek),
 *  - limit velikosti těla požadavku,
 *  - rate limiting per IP a „bucket“ (klouzavé okno, v paměti procesu).
 * Pro více instancí nahraďte úložiště rate limitu sdíleným (Redis).
 */

const WINDOW_MS = 60_000;
const hits = new Map<string, number[]>();
let lastSweep = Date.now();

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "local").trim();
}

/** true = požadavek je v limitu. */
export function rateLimit(key: string, perMinute: number, now = Date.now()): boolean {
  if (now - lastSweep > WINDOW_MS) {
    for (const [k, list] of hits) if (!list.some((t) => now - t < WINDOW_MS)) hits.delete(k);
    lastSweep = now;
  }
  const list = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length >= perMinute) {
    hits.set(key, list);
    return false;
  }
  list.push(now);
  hits.set(key, list);
  return true;
}

export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // ne-prohlížečoví klienti (curl, testy) Origin neposílají
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export const MAX_BODY_BYTES = 45 * 1024 * 1024; // base64 30 MB souborů + rezerva

export function guard(req: Request, opts: { bucket: string; perMinute: number; maxBytes?: number }): NextResponse | null {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Požadavek z cizího původu byl odmítnut." }, { status: 403 });
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > (opts.maxBytes ?? MAX_BODY_BYTES)) return NextResponse.json({ error: "Požadavek je příliš velký." }, { status: 413 });
  if (!rateLimit(`${opts.bucket}:${clientIp(req)}`, opts.perMinute)) {
    return NextResponse.json({ error: "Příliš mnoho požadavků – zkuste to za minutu znovu." }, { status: 429, headers: { "Retry-After": "60" } });
  }
  return null;
}
