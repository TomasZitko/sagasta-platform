import { NextResponse } from "next/server";
import { z } from "zod";
import { guard } from "@/lib/security/guard";
import { MAX_TOTAL_BYTES, processFiles, totalBytes } from "@/lib/tools/server/files";

export const runtime = "nodejs";
export const maxDuration = 120;

const Body = z.object({ files: z.array(z.object({ name: z.string().max(260), data: z.string(), size: z.number().nonnegative() })).min(1).max(30) });

/** Extrakce textu pro lokální knihovnu – bez AI, bez ukládání na serveru. */
export async function POST(req: Request) {
  const blocked = guard(req, { bucket: "extract", perMinute: 30 });
  if (blocked) return blocked;
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Neplatný vstup." }, { status: 400 });
  if (totalBytes({ f: body.data.files }) > MAX_TOTAL_BYTES) return NextResponse.json({ error: "Soubory překračují limit 30 MB." }, { status: 413 });
  const { f: docs } = await processFiles({ f: body.data.files });
  return NextResponse.json(
    docs.map((d) => ({ name: d.name, text: d.text, size: d.size, kind: d.kind, sha256: d.sha256, warning: d.warning ?? (d.kind === "image" ? "Obrázky se do knihovny neukládají." : undefined) })),
  );
}
