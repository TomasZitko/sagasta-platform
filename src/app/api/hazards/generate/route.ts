import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { z } from "zod";
import { AiUnavailableError, generateWithAi } from "@/lib/hazards/ai";
import { buildRuleCatalogue } from "@/lib/hazards/engine";
import { ProjectIntakeSchema } from "@/lib/project/intake";
import { guard } from "@/lib/security/guard";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_PDF_BYTES = 20 * 1024 * 1024;

const RequestSchema = z.object({
  intake: ProjectIntakeSchema,
  useAi: z.boolean().default(true),
  pdfs: z.array(z.object({ name: z.string().max(200), base64: z.string() })).max(10).default([]),
});

export async function POST(req: Request) {
  const blocked = guard(req, { bucket: "hazards", perMinute: 20 });
  if (blocked) return blocked;
  const body = RequestSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Neplatný vstup", issues: body.error.issues }, { status: 400 });
  }
  const { intake, useAi, pdfs } = body.data;

  const pdfBytes = pdfs.reduce((n, p) => n + Math.floor((p.base64.length * 3) / 4), 0);
  if (pdfBytes > MAX_PDF_BYTES) {
    return NextResponse.json({ error: "Přiložené PDF překračují limit 20 MB." }, { status: 413 });
  }

  const aiConfigured = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
  if (!useAi || !aiConfigured) {
    const catalogue = buildRuleCatalogue(intake);
    if (useAi && !aiConfigured) catalogue.notes.push("AI není nakonfigurována (chybí ANTHROPIC_API_KEY) – katalog sestaven pouze z pravidel.");
    if (pdfs.length) catalogue.notes.push("Přiložená PDF čte jen AI režim; pravidla kontrolují pouze vložený text.");
    return NextResponse.json(catalogue);
  }

  try {
    return NextResponse.json(await generateWithAi(intake, pdfs));
  } catch (err) {
    const reason =
      err instanceof AiUnavailableError
        ? err.message
        : err instanceof Anthropic.RateLimitError
          ? "AI je dočasně přetížena (rate limit)."
          : err instanceof Anthropic.AuthenticationError
            ? "Neplatný API klíč."
            : err instanceof Anthropic.APIError
              ? `Chyba AI služby (${err.status ?? "síť"}).`
              : "Neočekávaná chyba AI.";
    console.error("[hazards/generate]", err);
    const catalogue = buildRuleCatalogue(intake);
    catalogue.notes.push(`${reason} Katalog sestaven pouze z pravidel.`);
    return NextResponse.json(catalogue);
  }
}
