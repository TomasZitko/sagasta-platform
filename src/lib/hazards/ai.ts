import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { ProjectIntake } from "@/lib/project/intake";
import {
  checkCoverage,
  checkMissingInfo,
  entryFromDefinition,
  evaluateObligations,
  matchRules,
  ruleQuestions,
  sortEntries,
  type Catalogue,
  type CatalogueEntry,
  type Finding,
} from "./engine";
import { CATEGORIES, HAZARD_LIBRARY, HAZARDS_BY_ID, REGULATIONS } from "./library";
import { clampLevel } from "./risk";
import { AiUnavailableError, jsonSchemaFormat, parseMessage } from "@/lib/tools/server/claude";

export { AiUnavailableError };

export const DEFAULT_MODEL = "claude-opus-5";

const HAZARD_IDS = HAZARD_LIBRARY.map((h) => h.id) as [string, ...string[]];

/**
 * Výstup modelu. `hazardId` je enum z řízené knihovny – model tak technicky
 * nemůže vrátit nebezpečí mimo schválené názvy. Nová nebezpečí smí jen
 * navrhnout do `librarySuggestions`, do katalogu se nedostanou.
 */
export const AiOutputSchema = z.object({
  selected: z.array(
    z.object({
      hazardId: z.enum(HAZARD_IDS),
      confidence: z.enum(["confirmed", "inferred"]),
      evidence: z.string().describe("Krátká doslovná citace ze vstupu, která nebezpečí dokládá; prázdné, pokud není."),
      projectCause: z.string().describe("Příčina konkretizovaná pro tuto stavbu (1–2 věty)."),
      projectRisk: z.string().describe("Možný následek konkretizovaný pro tuto stavbu (1 věta)."),
      measures: z.array(z.string()).describe("Preventivní opatření – vycházejí z knihovny, doplněná o specifika stavby."),
      probability: z.number().int().describe("Pravděpodobnost 1–5"),
      severity: z.number().int().describe("Závažnost 1–5"),
    }),
  ),
  rejected: z.array(z.object({ hazardId: z.enum(HAZARD_IDS), reason: z.string() })),
  missingCategories: z.array(z.object({ title: z.string(), detail: z.string() })),
  questions: z.array(z.string()),
  librarySuggestions: z.array(z.object({ name: z.string(), reason: z.string() })),
});

export type AiOutput = z.infer<typeof AiOutputSchema>;

export interface PdfInput {
  name: string;
  base64: string;
}

function libraryForPrompt(): string {
  return HAZARD_LIBRARY.map(
    (h) =>
      `- ${h.id} | ${h.name} | kategorie: ${CATEGORIES[h.category]} | výchozí P=${h.defaultProbability}, Z=${h.defaultSeverity}` +
      `\n  příčina: ${h.cause}\n  opatření: ${h.measures.join(" / ")}\n  předpisy: ${h.regulations.map((r) => REGULATIONS[r]).join("; ")}`,
  ).join("\n");
}

const SYSTEM_PROMPT = `Jsi specialista BOZP a koordinátor bezpečnosti na staveništi v projekční kanceláři SAGASTA (dopravní a pozemní stavby, mosty, železnice, vodní hospodářství). Připravuješ PRVNÍ NÁVRH katalogu nebezpečí pro konkrétní stavbu. Návrh vždy ověřuje a podepisuje odborně způsobilá osoba – tvým cílem je, aby měla co nejméně práce a nic podstatného neopomenula.

Pravidla:
1. Nebezpečí vybírej VÝHRADNĚ z řízené knihovny níže podle jejich ID. Názvy nebezpečí nevymýšlej ani nepřejmenovávej.
2. Pokud podle tebe stavba obsahuje nebezpečí, které v knihovně není, uveď ho do "librarySuggestions" – do katalogu ho nezařazuj.
3. Dostaneš seznam kandidátů, které zařadil deterministický pravidlový engine. Každého kandidáta buď zařaď do "selected", nebo uveď v "rejected" s konkrétním zdůvodněním opřeným o vstup. Kandidáty nevyřazuj jen proto, že údaj chybí – v takovém případě je zařaď s confidence "inferred".
4. Doplň i další nebezpečí z knihovny, která ze vstupu a dokumentace vyplývají, i když je pravidla nenašla.
5. confidence "confirmed" použij jen tehdy, když nebezpečí přímo dokládá vstup nebo dokumentace – do "evidence" dej krátkou doslovnou citaci. Jinak "inferred".
6. Příčinu, následek a opatření konkretizuj pro danou stavbu (objekty, technologie, místo). Opatření knihovny ber jako základ; doplň je, ale neoslabuj. Nevymýšlej čísla norem ani paragrafy, které nejsou v knihovně.
7. P a Z hodnoť na stupnici 1–5 (P: 1 nepravděpodobná … 5 trvalá; Z: 1 bez PN … 5 smrtelný úraz). Hodnoť riziko PŘED zavedením opatření.
8. "missingCategories": oblasti rizik, které vstup naznačuje, ale nejsou dostatečně popsané, nebo nesoulady mezi formulářem a dokumentací.
9. "questions": konkrétní otázky pro projektanta nebo zhotovitele, jejichž odpověď by změnila katalog. Max. 8, seřazené podle důležitosti.
10. Piš česky, věcně, stylem technické dokumentace. Žádný marketing, žádné obecné fráze.

Řízená knihovna nebezpečí:
${libraryForPrompt()}`;

function intakeForPrompt(intake: ProjectIntake): string {
  const { documentText, ...rest } = intake;
  return JSON.stringify(rest, null, 2);
}

export async function generateWithAi(
  intake: ProjectIntake,
  pdfs: PdfInput[],
  opts: { client?: Anthropic; model?: string; now?: Date } = {},
): Promise<Catalogue> {
  const client = opts.client ?? new Anthropic();
  const model = opts.model || process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
  const candidates = matchRules(intake);

  const content: Anthropic.Beta.BetaContentBlockParam[] = [
    ...pdfs.map(
      (pdf): Anthropic.Beta.BetaContentBlockParam => ({
        type: "document",
        title: pdf.name,
        source: { type: "base64", media_type: "application/pdf", data: pdf.base64 },
      }),
    ),
    {
      type: "text",
      text:
        `Údaje o stavbě (formulář):\n${intakeForPrompt(intake)}\n\n` +
        (intake.documentText ? `Text z projektové dokumentace:\n<dokumentace>\n${intake.documentText}\n</dokumentace>\n\n` : "") +
        `Kandidáti z pravidlového enginu:\n${candidates.map((c) => `- ${c.hazardId}: ${c.reason}`).join("\n")}\n\n` +
        "Připrav návrh katalogu nebezpečí.",
    },
  ];

  const response = await client.beta.messages.create({
    model,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content }],
    // Enumy SDK převádí jen do popisu – ID mimo knihovnu odfiltruje tolerantní parser (lenient.ts).
    output_config: { format: jsonSchemaFormat(AiOutputSchema) },
  });
  const parsed = parseMessage(response, AiOutputSchema);

  return mergeAiOutput(intake, parsed, { model: response.model, now: opts.now });
}


/**
 * Sloučí výstup AI s pravidly. Pravidla jsou záchranná síť: kandidát, kterého
 * AI vyřadí nebo opomene, v katalogu zůstává s označením k ověření.
 */
export function mergeAiOutput(
  intake: ProjectIntake,
  ai: AiOutput,
  meta: { model: string | null; now?: Date },
): Catalogue {
  const rules = new Map(matchRules(intake).map((m) => [m.hazardId, m]));
  const rejected = new Map(ai.rejected.map((r) => [r.hazardId, r.reason]));
  const entries = new Map<string, CatalogueEntry>();
  const notes: string[] = [];

  for (const s of ai.selected) {
    const def = HAZARDS_BY_ID.get(s.hazardId);
    if (!def || entries.has(def.id)) continue;
    const rule = rules.get(def.id);
    const rationale: string[] = [];
    if (rule) rationale.push(`Pravidlo: ${rule.reason}`);
    if (s.evidence.trim()) rationale.push(`Dokumentace: „${s.evidence.trim()}“`);

    const confidence =
      s.confidence === "confirmed" && s.evidence.trim()
        ? "confirmed"
        : rule && !rule.uncertain
          ? "confirmed"
          : rule?.uncertain && !s.evidence.trim()
            ? "missing_info"
            : "inferred";

    entries.set(
      def.id,
      entryFromDefinition(def, intake, {
        probability: clampLevel(s.probability),
        severity: clampLevel(s.severity),
        cause: s.projectCause.trim() || def.cause,
        risk: s.projectRisk.trim() || def.risk,
        measures: s.measures.filter((m) => m.trim()).length ? s.measures.filter((m) => m.trim()) : def.measures,
        source: rule ? "rule+ai" : "ai",
        confidence,
        rationale,
      }),
    );
  }

  for (const [id, rule] of rules) {
    if (entries.has(id)) continue;
    const def = HAZARDS_BY_ID.get(id)!;
    const reason = rejected.get(id);
    entries.set(
      id,
      entryFromDefinition(def, intake, {
        source: "rule",
        confidence: rule.uncertain ? "missing_info" : "inferred",
        rationale: [`Pravidlo: ${rule.reason}`, reason ? `AI navrhuje vyřadit: ${reason}` : "AI nezařadila – ověřte."],
      }),
    );
    if (reason) notes.push(`${def.name}: AI navrhuje vyřadit (${reason}). Ponecháno k rozhodnutí inženýra.`);
  }

  const list = sortEntries([...entries.values()]);
  const missingInfo = checkMissingInfo(intake);
  const aiCoverage: Finding[] = ai.missingCategories.map((m) => ({ severity: "warning", title: m.title, detail: m.detail }));
  const questions = dedupe([...ai.questions, ...ruleQuestions(intake, missingInfo)]).slice(0, 12);

  return {
    project: { name: intake.projectName, location: intake.location, investor: intake.investor },
    generatedAt: (meta.now ?? new Date()).toISOString(),
    mode: "ai",
    model: meta.model,
    entries: list,
    coverage: [...checkCoverage(intake, list), ...aiCoverage],
    missingInfo,
    questions,
    librarySuggestions: ai.librarySuggestions,
    obligations: evaluateObligations(intake, list),
    notes,
  };
}

function dedupe(items: string[]): string[] {
  const seen = new Set<string>();
  return items.filter((q) => {
    const k = q.trim().toLowerCase();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
