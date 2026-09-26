import { NextResponse, type NextRequest } from "next/server";

/**
 * Volitelná ochrana celé aplikace heslem (HTTP Basic).
 * Aktivuje se nastavením SAGASTA_PASSWORD (uživatel SAGASTA_USER, výchozí „sagasta“).
 * Pro produkci doporučeno SSO na úrovni reverzní proxy.
 */

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function middleware(req: NextRequest) {
  const password = process.env.SAGASTA_PASSWORD;
  if (!password) return NextResponse.next();
  const user = process.env.SAGASTA_USER || "sagasta";
  const header = req.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    try {
      const [u, ...rest] = atob(header.slice(6)).split(":");
      if (safeEqual(u, user) && safeEqual(rest.join(":"), password)) return NextResponse.next();
    } catch {
      /* neplatné kódování – odmítnout */
    }
  }
  return new NextResponse("Přístup vyžaduje přihlášení.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="SAGASTA AI", charset="UTF-8"' },
  });
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
