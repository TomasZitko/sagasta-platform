import "server-only";
import { safeName } from "../claude";
import { z } from "zod";
import { HAZARD_LIBRARY } from "@/lib/hazards/library";
import { matchRules } from "@/lib/hazards/engine";
import type { ProjectIntake } from "@/lib/project/intake";
import { findPlaceholders, relevantParagraphs } from "../../analyzers/text";
import { newReport, statusStats, type Finding, type Report, type Section } from "../../report";
import { DEMOLITION_PROCEDURE, TECHNICAL_REPORT, TECH_PROCEDURE, ZOV, outlineForPrompt, type OutlineSection } from "../../templates";
import { InputError, projectForPrompt, type ToolContext, type ToolHandler } from "../context";
import type { ProcessedDoc } from "../files";

const OutlineOutput = (ids: [string, ...string[]]) =>
  z.object({
    summary: z.string().describe("2–3 věty: co dokument popisuje a hlavní otevřené body."),
    sections: z.array(
      z.object({
        id: z.enum(ids),
        status: z.enum(["ok", "inferred", "missing"]).describe("ok = obsah doložen podklady; inferred = odvozeno/obecné, ověřit; missing = chybí podstatné údaje"),
        content: z.string().describe("Text sekce ve stylu technické dokumentace. Odstavce odděl prázdným řádkem. Chybějící údaje označ [DOPLNIT: …]."),
        bullets: z.array(z.string()).describe("Volitelné odrážky (např. kroky postupu). Prázdné, pokud nejsou vhodné."),
        sources: z.array(z.string()).describe("Názvy podkladů, ze kterých sekce čerpá."),
        missingItems: z.array(z.string()).describe("Konkrétní údaje, které chybí a musí je doplnit projektant."),
      }),
    ),
    inconsistencies: z.array(z.object({ title: z.string(), detail: z.string() })).describe("Rozpory mezi podklady (čísla, termíny, objekty)."),
    questions: z.array(z.string()).describe("Max. 10 otázek pro projektanta, seřazené podle důležitosti."),
  });

export interface OutlineJob {
  ctx: ToolContext;
  slug: string;
  title: string;
  subtitle: string;
  outline: OutlineSection[];
  role: string;
  instructions: string;
  docs: ProcessedDoc[];
  reference?: ProcessedDoc[];
  meta: { label: string; value: string }[];
  /** Deterministická kostra sekce (bez AI). */
  skeleton: (s: OutlineSection) => Pick<Section, "body" | "bullets" | "status">;
}

export async function generateOutline(job: OutlineJob): Promise<Report> {
  const { ctx, outline } = job;
  const report = newReport(job.slug, job.title, { subtitle: job.subtitle, meta: job.meta });
  const ids = outline.map((s) => s.id) as [string, ...string[]];

  const refText = job.reference?.length
    ? `\n\nVZOROVÝ DOKUMENT z předchozího projektu (převezmi strukturu, rozsah a styl; FAKTA z něj NEPŘEBÍREJ – jiná stavba):\n${job.reference.map((d) => `<vzor nazev="${safeName(d.name)}">\n${d.text.slice(0, 40_000)}\n</vzor>`).join("\n")}`
    : "";

  const ai = await ctx.ai({
    system: `${job.role}\n\nOsnova dokumentu (použij přesně tato ID sekcí, každou sekci právě jednou, ve stejném pořadí):\n${outlineForPrompt(outline)}\n\n${job.instructions}\n\nStav sekce: "ok" jen když obsah opíráš o konkrétní podklady; "inferred" když je text obecný nebo odvozený; "missing" když podstatné údaje chybí. Chybějící údaje v textu označ [DOPLNIT: …] a zároveň je vypiš do missingItems.`,
    prompt: `${projectForPrompt(ctx.project)}\n\nVSTUPY NÁSTROJE:\n${Object.entries(ctx.values)
      .filter(([, v]) => v.trim())
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n")}${refText}\n\nPřiprav návrh dokumentu „${job.title}“.`,
    docs: job.docs,
    schema: OutlineOutput(ids),
  });

  const byId = new Map(ai?.sections.map((s) => [s.id, s]) ?? []);
  report.sections = outline.map((o): Section => {
    const s = byId.get(o.id);
    if (!s) {
      const sk = job.skeleton(o);
      // bez AI: převezmi z podkladů odstavce, které k sekci věcně patří
      const hits = sk.body || sk.bullets ? [] : relevantParagraphs(job.docs.map((d) => ({ name: d.name, text: d.text })), o.keywords, 3);
      if (hits.length) {
        return {
          id: o.id,
          title: o.title,
          status: "inferred",
          body: hits.map((h) => h.text).join("\n\n"),
          gaps: [`Převzato z podkladů (${[...new Set(hits.map((h) => h.doc))].join(", ")}) – přeformulovat a doplnit.`, o.guidance],
        };
      }
      return { id: o.id, title: o.title, status: sk.status ?? "missing", body: sk.body, bullets: sk.bullets, gaps: [o.guidance] };
    }
    const placeholders = findPlaceholders(s.content).filter((p) => /DOPLNIT/i.test(p.raw) || p.kind.startsWith("Zástup"));
    return {
      id: o.id,
      title: o.title,
      status: s.status,
      body: s.content,
      bullets: s.bullets.filter(Boolean),
      gaps: [...s.missingItems, ...(s.sources.length ? [`Zdroje: ${s.sources.join(", ")}`] : [])].filter(Boolean).slice(0, 12),
      findings: placeholders.length && s.status === "ok" ? [{ severity: "warning", title: "Sekce označená jako nalezená obsahuje místa k doplnění" }] : undefined,
    };
  });

  if (ai) {
    report.summary = ai.summary;
    report.questions = ai.questions;
    if (ai.inconsistencies.length) {
      report.sections.push({
        id: "inconsistencies",
        title: "Rozpory v podkladech",
        findings: ai.inconsistencies.map((i): Finding => ({ severity: "error", title: i.title, detail: i.detail })),
      });
    }
  } else {
    report.summary =
      "Kostra dokumentu: sekce jsou předvyplněné z dat projektu a z odpovídajících pasáží podkladů. Souvislý text vygeneruje AI – bez ní slouží osnova jako kontrolní seznam.";
  }

  const missingRequired = report.sections.filter((s) => s.status === "missing" && outline.find((o) => o.id === s.id)?.required).length;
  report.stats = [...statusStats(report.sections), { label: "povinných sekcí bez údajů", value: missingRequired, tone: missingRequired ? "bad" : "good" }];
  return ctx.finish(report);
}

/* ——— Pomocné: identifikační údaje z projektu ——— */

function identification(p: ProjectIntake | null, extra: string[] = []): Pick<Section, "body" | "status"> {
  if (!p) return { status: "missing", body: "[DOPLNIT: identifikační údaje – aktivní projekt není zadán]" };
  const lines = [
    `Stavba: ${p.projectName || "[DOPLNIT]"}`,
    `Místo stavby: ${p.location || "[DOPLNIT]"}`,
    `Zadavatel / investor: ${p.investor || "[DOPLNIT]"}`,
    ...extra,
  ];
  return { status: p.location && p.investor ? "ok" : "inferred", body: lines.join("\n") };
}

const allDocs = (ctx: ToolContext, ...ids: string[]) => ids.flatMap((id) => ctx.files(id));

/* ——— Technická zpráva ——— */

export const technicalReport: ToolHandler = async (ctx) => {
  const object = ctx.value("object");
  if (!object) throw new InputError("Zadejte objekt (např. SO 201 …).");
  return generateOutline({
    ctx,
    slug: "technicka-zprava",
    title: `Technická zpráva – ${object}`,
    subtitle: `Stupeň: ${ctx.value("stage") || "neuveden"} · pracovní návrh`,
    outline: TECHNICAL_REPORT,
    role: "Píšeš technickou zprávu stavebního objektu jako hlavní projektant.",
    instructions:
      "Technické údaje (rozměry, materiály, třídy betonu, založení, termíny) uváděj jen tehdy, když jsou v podkladech nebo v datech projektu. Obecné formulace bez opory v podkladech označ jako inferred. U sekce Seznam podkladů vyjmenuj skutečně dodané podklady.",
    docs: allDocs(ctx, "docs"),
    reference: ctx.files("reference"),
    meta: [{ label: "Objekt", value: object }],
    skeleton: (s) => (s.id === "tz1" ? identification(ctx.project, [`Objekt: ${object}`, `Stupeň dokumentace: ${ctx.value("stage") || "[DOPLNIT]"}`]) : { status: "missing" }),
  });
};

/* ——— ZOV ——— */

export const zov: ToolHandler = async (ctx) =>
  generateOutline({
    ctx,
    slug: "zov",
    title: "Zásady organizace výstavby",
    subtitle: ctx.project?.projectName ?? "pracovní návrh",
    outline: ZOV,
    role: "Zpracováváš zásady organizace výstavby (ZOV) jako specialista přípravy staveb.",
    instructions:
      "U odpadů uváděj druhy dle katalogu odpadů jen s kódem, pokud si jím jsi jistý. Bilanci zemních prací počítej jen z doložených objemů. Pro BOZP uveď, zda je třeba koordinátor BOZP, oznámení zahájení prací a plán BOZP – s odůvodněním z dostupných údajů (počet zhotovitelů, doba výstavby, počet osob, rizikové práce).",
    docs: allDocs(ctx, "docs"),
    meta: [],
    skeleton: (s) => {
      const p = ctx.project;
      if (s.id === "z14" && p?.durationWorkingDays) return { status: "inferred", body: `Předpokládaná doba výstavby: ${p.durationWorkingDays} pracovních dní.\n[DOPLNIT: etapy a rozhodující termíny]` };
      if (s.id === "z3" && ctx.value("site")) return { status: "inferred", body: ctx.value("site") };
      if (s.id === "z12" && ctx.value("phases")) return { status: "inferred", body: ctx.value("phases") };
      return { status: "missing" };
    },
  });

/* ——— Technologický postup / postup bourání ——— */

export const techProcedure: ToolHandler = async (ctx) => {
  const activity = ctx.value("activity");
  if (!activity) throw new InputError("Zadejte činnost.");
  const demolition = ctx.value("mode") === "demolition";
  const outline = demolition ? DEMOLITION_PROCEDURE : TECH_PROCEDURE;

  // navázání na řízenou knihovnu nebezpečí
  const hazards = ctx.project
    ? matchRules({ ...ctx.project, demolition: demolition || ctx.project.demolition, description: `${ctx.project.description}\n${activity}\n${ctx.value("conditions")}` }).map((m) => m.hazardId)
    : [];
  const hazardNames = HAZARD_LIBRARY.filter((h) => hazards.includes(h.id)).map((h) => `${h.id} ${h.name}`);

  const report = await generateOutline({
    ctx,
    slug: "technologicky-postup",
    title: `${demolition ? "Postup bourání" : "Technologický postup"} – ${activity}`,
    subtitle: ctx.value("object") || "pracovní návrh",
    outline,
    role: demolition
      ? "Zpracováváš postup bourání jako zkušený stavbyvedoucí a statik. Důraz na dočasné stavy, stabilitu a ochranu okolí."
      : "Zpracováváš technologický postup (TP) jako zkušený přípravář stavby.",
    instructions: `Pracovní postup piš jako očíslované kroky do pole bullets. U bezpečnosti použij názvy nebezpečí z řízené knihovny SAGASTA, pokud se hodí:\n${
      hazardNames.length ? hazardNames.join("\n") : HAZARD_LIBRARY.map((h) => `${h.id} ${h.name}`).join("\n")
    }\nParametry (teploty, časy, tolerance) uváděj jen jako „dle TKP / výrobce“, pokud nejsou v podkladech.`,
    docs: allDocs(ctx, "docs"),
    meta: [
      { label: "Činnost", value: activity },
      ...(ctx.value("object") ? [{ label: "Objekt", value: ctx.value("object") }] : []),
    ],
    skeleton: (s) =>
      (s.id === "t9" || s.id === "d8") && hazardNames.length
        ? { status: "inferred", bullets: hazardNames.map((h) => `${h} – opatření viz katalog nebezpečí`) }
        : { status: "missing" },
  });

  if (hazardNames.length) {
    report.sections.push({
      id: "hazards",
      title: "Související nebezpečí z řízené knihovny",
      bullets: hazardNames,
      gaps: ["Úplný katalog s hodnocením rizik vygenerujete nástrojem Katalog nebezpečí."],
    });
  }
  return report;
};
