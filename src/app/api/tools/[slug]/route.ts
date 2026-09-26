import { NextResponse } from "next/server";
import { z } from "zod";
import { guard } from "@/lib/security/guard";
import { InputError, ToolContext } from "@/lib/tools/server/context";
import { MAX_TOTAL_BYTES, totalBytes } from "@/lib/tools/server/files";
import { HANDLERS } from "@/lib/tools/server/handlers";

export const runtime = "nodejs";
export const maxDuration = 300;

const File = z.object({ name: z.string().max(260), data: z.string(), size: z.number().nonnegative() });
const RequestSchema = z.object({
  values: z.record(z.string().max(40), z.string().max(400_000)).default({}),
  files: z.record(z.string().max(40), z.array(File).max(50)).default({}),
  project: z.unknown().nullable().default(null),
  useAi: z.boolean().default(true),
});

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const handler = HANDLERS[slug];
  if (!handler) return NextResponse.json({ error: "Neznámý nástroj." }, { status: 404 });

  const blocked = guard(req, { bucket: "tools", perMinute: 30 });
  if (blocked) return blocked;
  const body = RequestSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Neplatný vstup." }, { status: 400 });
  if (totalBytes(body.data.files) > MAX_TOTAL_BYTES) {
    return NextResponse.json({ error: "Soubory překračují celkový limit 30 MB." }, { status: 413 });
  }

  try {
    const ctx = await ToolContext.fromRequest(body.data);
    return NextResponse.json(await handler(ctx));
  } catch (err) {
    if (err instanceof InputError) return NextResponse.json({ error: err.message }, { status: 422 });
    console.error(`[tools/${slug}]`, err);
    return NextResponse.json({ error: "Zpracování selhalo." }, { status: 500 });
  }
}
