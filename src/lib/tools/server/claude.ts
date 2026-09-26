import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { parseLenient } from "../lenient";
import type { ProcessedDoc } from "./files";

export const DEFAULT_MODEL = "claude-opus-5";

export class AiUnavailableError extends Error {}

export const aiConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

/** Společná „osobnost“ všech nástrojů – připojuje se před systémový prompt nástroje. */
export const BASE_SYSTEM = `Pracuješ jako zkušený inženýr projekční a inženýrské kanceláře SAGASTA (dopravní a pozemní stavby, železnice, mosty, vodní hospodářství, podzemní stavby, inženýrská činnost, zadávání veřejných zakázek). Připravuješ PRACOVNÍ PODKLADY, které ověřuje a podepisuje odpovědná autorizovaná osoba.

Obecná pravidla:
- Piš česky, věcně a stylem technické dokumentace. Žádný marketing ani vatové fráze.
- Nic si nevymýšlej. Údaj, který ve vstupech není, neuváděj jako fakt – označ ho jako chybějící, nebo jako odvozený a uveď z čeho.
- Když citaci opíráš o dokument, uveď krátkou doslovnou citaci a název dokumentu.
- Čísla, jednotky, staničení, označení objektů (SO/PS/IO) a data přebírej přesně.
- Nevymýšlej čísla norem, paragrafy ani názvy předpisů, kterými si nejsi jistý; raději napiš „ověřit příslušný předpis“.`;

export interface RunOptions<T extends z.ZodType> {
  system: string;
  /** Textová část zadání (vstupy, kontext). */
  prompt: string;
  /** Dokumenty – PDF jako document blok, ostatní jako text. */
  docs?: ProcessedDoc[];
  schema: T;
  maxTokens?: number;
  client?: Anthropic;
  model?: string;
}

/** Sestaví obsah zprávy: PDF jako dokumenty, ostatní soubory jako označený text. */
export function buildContent(prompt: string, docs: ProcessedDoc[] = []): Anthropic.Beta.BetaContentBlockParam[] {
  const blocks: Anthropic.Beta.BetaContentBlockParam[] = [];
  const textDocs: string[] = [];
  for (const d of docs) {
    if (d.pdfBase64) {
      blocks.push({ type: "document", title: d.name, source: { type: "base64", media_type: "application/pdf", data: d.pdfBase64 } });
    } else if (d.text) {
      textDocs.push(`<dokument nazev="${d.name.replace(/"/g, "'")}">\n${d.text}\n</dokument>`);
    }
  }
  blocks.push({ type: "text", text: [...textDocs, prompt].join("\n\n") });
  return blocks;
}

export async function runStructured<T extends z.ZodType>(opts: RunOptions<T>): Promise<{ data: z.infer<T>; model: string }> {
  const client = opts.client ?? new Anthropic();
  const model = opts.model || process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;

  // Streamování: dlouhé výstupy (TZ, ZOV) by jinak narazily na HTTP timeout.
  const stream = client.beta.messages.stream({
    model,
    max_tokens: opts.maxTokens ?? 32000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    system: [
      { type: "text", text: BASE_SYSTEM },
      { type: "text", text: opts.system, cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: buildContent(opts.prompt, opts.docs) }],
    // Schéma posíláme bez automatického parsování – výstup opravujeme tolerantně (viz lenient.ts).
    output_config: { format: jsonSchemaFormat(opts.schema) },
  });
  const message = await stream.finalMessage();
  return { data: parseMessage(message, opts.schema), model: message.model };
}

/** JSON schéma pro strukturovaný výstup (převod SDK, bez automatického parsování). */
export function jsonSchemaFormat(schema: z.ZodType): { type: "json_schema"; schema: Record<string, unknown> } {
  return { type: "json_schema", schema: betaZodOutputFormat(schema).schema as Record<string, unknown> };
}

interface MessageLike {
  stop_reason: string | null;
  content: { type: string; text?: string }[];
}

/** Kontrola stop_reason + tolerantní parsování JSON výstupu. */
export function parseMessage<T extends z.ZodType>(message: MessageLike, schema: T): z.infer<T> {
  if (message.stop_reason === "refusal") throw new AiUnavailableError("Model požadavek odmítl zpracovat.");
  if (message.stop_reason === "max_tokens") throw new AiUnavailableError("Výstup modelu byl zkrácen – zkuste menší rozsah vstupů.");
  const text = message.content
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("");
  try {
    return parseLenient(schema, text);
  } catch (err) {
    console.error("[claude] structured output", err);
    throw new AiUnavailableError("Model nevrátil platný strukturovaný výstup.");
  }
}

export function describeAiError(err: unknown): string {
  if (err instanceof AiUnavailableError) return err.message;
  if (err instanceof Anthropic.RateLimitError) return "AI je dočasně přetížena (rate limit).";
  if (err instanceof Anthropic.AuthenticationError) return "Neplatný API klíč.";
  if (err instanceof Anthropic.APIError) return `Chyba AI služby (${err.status ?? "síť"}).`;
  return "Neočekávaná chyba AI.";
}
