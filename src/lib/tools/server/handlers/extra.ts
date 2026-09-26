import "server-only";
import { z } from "zod";
import { HAZARD_LIBRARY } from "@/lib/hazards/library";
import { extractDates, extractObjectCodes, extractQuantities, firstObjectCode, fold, paragraphs, truncate } from "../../analyzers/text";
import { newReport, sortFindings, type Finding, type Section, type Tone } from "../../report";
import { DOC_TYPES, handoverFor, permitRules, TECH_SPEC, type PermitLevel } from "../../rules";
import { Bm25Index, highlightSnippet } from "../../search";
import { safeName } from "../claude";
import { InputError, projectForPrompt, type ToolContext, type ToolHandler } from "../context";
import type { ProcessedDoc } from "../files";
import { generateOutline } from "./generators";

const textDocs = (docs: ProcessedDoc[], max = 60_000) =>
  docs
    .filter((d) => !d.pdfBase64 && !d.image && d.text)
    .map((d) => `<dokument nazev="${safeName(d.name)}">\n${truncate(d.text, max)}\n</dokument>`)
    .join("\n");
const binaryDocs = (docs: ProcessedDoc[]) => docs.filter((d) => d.pdfBase64 || d.image);
const photos = (ctx: ToolContext, id: string) => ctx.files(id).filter((d) => d.image);

/* ————————————————————————————————————————————————
 * 17 Starý projekt → nový projekt
 * ———————————————————————————————————————————————— */

/** Odstavec je „projektově specifický“, pokud obsahuje čísla s jednotkou, objekty, data nebo vlastní jména. */
export function specificity(p: string): string[] {
  const why: string[] = [];
  if (extractQuantities(p).length) why.push("rozměry / množství");
  if (extractObjectCodes(p).length) why.push("označení objektů");
  if (extractDates(p).length || /\b20\d{2}\b/.test(p)) why.push("termíny");
  if (/\b(k\.\s?ú\.|p\.\s?č\.|km\s?\d)/iu.test(p)) why.push("lokalizace");
  if (/(investor|stavebník|objednatel|zhotovitel)\s*:/iu.test(p)) why.push("účastníci");
  return why;
}

export const converter: ToolHandler = async (ctx) => {
  const old = ctx.files("old");
  if (!old.length) throw new InputError("Nahrajte dokument ze starého projektu.");
  const newFacts = ctx.value("newFacts");
  const oldText = old.map((d) => d.text).join("\n\n");
  const paras = paragraphs(oldText);
  const flagged = paras.map((p) => ({ p, why: specificity(p) }));
  const reusable = flagged.filter((f) => !f.why.length).length;
  const reusePct = paras.length ? Math.round((reusable / paras.length) * 100) : 0;

  const ai = await ctx.ai({
    system:
      "Převádíš dokument z PŘEDCHOZÍHO projektu na první návrh pro NOVÝ projekt při zachování struktury, rozsahu a stylu psaní kanceláře. Nahraď všechny projektově specifické údaje (název, místo, investor, objekty, rozměry, materiály, technologie, termíny, etapy) údaji nového projektu. Údaj, který pro nový projekt neznáš, NEPŘEBÍREJ ze starého – nahraď značkou [DOPLNIT: …]. U každé sekce urči: reused = převzato beze změny, adapted = upraveno, rewrite = nutno přepsat (jiná technologie / podmínky).",
    prompt: `${projectForPrompt(ctx.project)}\n\nNOVÉ ÚDAJE OD UŽIVATELE:\n${newFacts || "—"}\n\nSTARÝ DOKUMENT:\n${textDocs(old, 100_000)}`,
    docs: binaryDocs(old),
    schema: z.object({
      summary: z.string(),
      reusePercent: z.number().int(),
      sections: z.array(z.object({ title: z.string(), status: z.enum(["reused", "adapted", "rewrite"]), content: z.string(), changes: z.array(z.string()) })),
      replacements: z.array(z.object({ old: z.string(), new: z.string(), note: z.string() })),
      missing: z.array(z.string()),
    }),
    maxTokens: 64000,
  });

  const report = newReport("stary-novy-projekt", "Adaptovaný návrh dokumentu", {
    subtitle: `Z: ${old.map((d) => d.name).join(", ")}`,
    summary:
      ai?.summary ??
      `Odhad znovupoužitelnosti: ${reusePct} % odstavců neobsahuje projektově specifické údaje. Odstavce níže obsahují údaje, které je nutné nahradit. Automatický přepis provede AI.`,
    questions: ai?.missing ?? [],
  });
  const statusMap = { reused: "ok", adapted: "inferred", rewrite: "missing" } as const;
  if (ai) {
    report.stats = [
      { label: "lze převzít", value: `${ai.reusePercent} %`, tone: "accent" },
      { label: "sekcí převzato", value: ai.sections.filter((s) => s.status === "reused").length, tone: "good" },
      { label: "upraveno", value: ai.sections.filter((s) => s.status === "adapted").length, tone: "warn" },
      { label: "k přepsání", value: ai.sections.filter((s) => s.status === "rewrite").length, tone: "bad" },
    ];
    report.sections = [
      ...ai.sections.map((s, i): Section => ({ id: `s${i}`, title: s.title, status: statusMap[s.status], body: s.content, gaps: s.changes })),
      { id: "repl", title: "Provedené záměny", table: { columns: ["Původně", "Nově", "Poznámka"], rows: ai.replacements.map((r) => [r.old, r.new, r.note]) } },
    ];
  } else {
    report.stats = [
      { label: "odstavců lze převzít", value: `${reusePct} %`, tone: "accent" },
      { label: "odstavců k úpravě", value: flagged.length - reusable, tone: "warn" },
    ];
    report.sections = [
      {
        id: "specific",
        title: "Odstavce se specifickými údaji starého projektu",
        table: {
          columns: ["#", "Odstavec", "Obsahuje"],
          rows: flagged.map((f, i) => [String(i + 1), f.p, f.why.join(", ") || "— lze převzít —"]),
          rowTones: flagged.map((f) => (f.why.length ? "warn" : "good") as Tone),
        },
      },
    ];
  }
  return ctx.finish(report);
};

/* ————————————————————————————————————————————————
 * 18 Vyhledávání v předchozích projektech
 * ———————————————————————————————————————————————— */

export const search: ToolHandler = async (ctx) => {
  const query = ctx.value("query");
  const docs = ctx.files("docs").filter((d) => d.text);
  if (!query) throw new InputError("Zadejte, co hledáte.");
  if (!docs.length) throw new InputError("Nahrajte dokumenty nebo je vyberte z knihovny.");

  const index = new Bm25Index(docs.map((d) => ({ name: d.name, text: d.text })));
  const hits = index.search(query, 12);

  const ai = hits.length
    ? await ctx.ai({
        system:
          "Odpovídáš na dotaz inženýra nad archivem dokumentů předchozích projektů. Používej POUZE dodané pasáže; každé tvrzení dolož odkazem [n] na číslo pasáže. Pokud pasáže odpověď neobsahují, řekni to. Na konci doporuč, které dokumenty otevřít.",
        prompt: `DOTAZ: ${query}\n\nPASÁŽE:\n${hits.map((h, i) => `[${i + 1}] (${safeName(h.doc)})\n${h.text}`).join("\n\n")}`,
        schema: z.object({
          answer: z.string(),
          relevantDocs: z.array(z.object({ doc: z.string(), why: z.string() })),
          followUps: z.array(z.string()),
        }),
      })
    : null;

  const byDoc = new Map<string, number>();
  for (const h of hits) byDoc.set(h.doc, (byDoc.get(h.doc) ?? 0) + h.score);

  const report = newReport("vyhledavani", `Hledání: ${query}`, {
    subtitle: `${docs.length} dokumentů · ${index.size} pasáží`,
    summary: ai?.answer ?? (hits.length ? `Nalezeno ${hits.length} relevantních pasáží v ${byDoc.size} dokumentech.` : "Dotazu neodpovídá žádná pasáž. Zkuste jiná slova nebo obecnější formulaci."),
    questions: ai?.followUps ?? [],
  });
  report.stats = [
    { label: "nalezených pasáží", value: hits.length, tone: hits.length ? "good" : "bad" },
    { label: "dokumentů s výskytem", value: byDoc.size },
    { label: "prohledáno dokumentů", value: docs.length },
  ];
  report.sections = [
    ...(ai?.relevantDocs.length ? [{ id: "docs", title: "Doporučené dokumenty", table: { columns: ["Dokument", "Proč"], rows: ai.relevantDocs.map((d) => [d.doc, d.why]) } }] : []),
    {
      id: "hits",
      title: "Nalezené pasáže",
      findings: hits.map((h, i): Finding => ({ severity: "info", title: `[${i + 1}] ${h.doc}`, detail: highlightSnippet(h.text, h.matched, 420), evidence: `relevance ${h.score.toFixed(1)} · shoda: ${h.matched.join(", ")}` })),
    },
  ];
  return ctx.finish(report);
};

/* ————————————————————————————————————————————————
 * 19 Zpráva z kontrolního dne
 * ———————————————————————————————————————————————— */

export const siteReport: ToolHandler = async (ctx) => {
  const pics = photos(ctx, "photos");
  const notes = ctx.value("notes");
  if (!pics.length && !notes) throw new InputError("Nahrajte fotografie nebo zadejte poznámky.");

  const ai = await ctx.ai({
    system:
      "Sestavuješ ZÁPIS Z KONTROLNÍHO DNE stavby z fotografií a hlasových/písemných poznámek. Popisuj jen to, co je na fotografiích vidět nebo je v poznámkách. Nedostatky formuluj jako „zjištěno / pravděpodobně“ – nevyslovuj definitivní závěry o porušení předpisů. Ke každé fotografii napiš věcný popis. Nápravná opatření formuluj konkrétně s odpovědností, pokud je známa.",
    prompt: `${projectForPrompt(ctx.project).slice(0, 6000)}\n\nDatum: ${ctx.value("date") || "neuvedeno"}\nObjekt / úsek: ${ctx.value("object") || "neuvedeno"}\nPočasí: ${ctx.value("weather") || "neuvedeno"}\nÚčastníci: ${ctx.value("participants") || "neuvedeno"}\n\nPOZNÁMKY:\n${notes || "—"}`,
    docs: pics,
    schema: z.object({
      summary: z.string(),
      progress: z.array(z.object({ object: z.string(), status: z.string() })),
      safety: z.array(z.string()),
      quality: z.array(z.string()),
      issues: z.array(z.object({ issue: z.string(), photo: z.string(), action: z.string(), responsible: z.string(), deadline: z.string(), severity: z.enum(["error", "warning", "info"]) })),
      photos: z.array(z.object({ photo: z.string(), caption: z.string() })),
      nextSteps: z.array(z.string()),
    }),
  });

  const report = newReport("kontrolni-den", "ZÁPIS Z KONTROLNÍHO DNE", {
    subtitle: [ctx.value("object"), ctx.value("date") && new Date(ctx.value("date")).toLocaleDateString("cs-CZ")].filter(Boolean).join(" · "),
    meta: [
      ...(ctx.value("weather") ? [{ label: "Počasí", value: ctx.value("weather") }] : []),
      ...(ctx.value("participants") ? [{ label: "Účastníci", value: ctx.value("participants") }] : []),
    ],
    summary: ai?.summary ?? "Text zápisu z fotografií sestaví AI. Níže jsou poznámky a seznam fotodokumentace.",
  });
  if (ai) {
    const table = {
      name: "Nápravná opatření",
      columns: ["Zjištění", "Foto", "Opatření", "Odpovídá", "Termín"],
      rows: ai.issues.map((i) => [i.issue, i.photo, i.action, i.responsible, i.deadline]),
      rowTones: ai.issues.map((i) => (i.severity === "error" ? "bad" : i.severity === "warning" ? "warn" : "default") as Tone),
    };
    report.stats = [
      { label: "fotografií", value: pics.length },
      { label: "zjištění", value: ai.issues.length, tone: ai.issues.length ? "warn" : "good" },
      { label: "závažných", value: ai.issues.filter((i) => i.severity === "error").length, tone: "bad" },
    ];
    report.sections = [
      { id: "progress", title: "Postup prací", table: { columns: ["Objekt / část", "Stav"], rows: ai.progress.map((p) => [p.object, p.status]) } },
      { id: "safety", title: "BOZP na staveništi", bullets: ai.safety },
      { id: "quality", title: "Kvalita provádění", bullets: ai.quality },
      { id: "issues", title: "Zjištění a nápravná opatření", table },
      { id: "photos", title: "Fotodokumentace", table: { columns: ["Foto", "Popis"], rows: ai.photos.map((p) => [p.photo, p.caption]) } },
      { id: "next", title: "Další postup", bullets: ai.nextSteps },
    ];
    report.sheets = [table];
  } else {
    report.sections = [
      { id: "notes", title: "Poznámky", body: notes || "—" },
      { id: "photos", title: "Fotodokumentace", table: { columns: ["Č.", "Soubor"], rows: pics.map((p, i) => [String(i + 1), p.name]) } },
    ];
  }
  return ctx.finish(report);
};

/* ————————————————————————————————————————————————
 * 20 Fotografie → možné problémy
 * ———————————————————————————————————————————————— */

const HAZARD_IDS = ["", ...HAZARD_LIBRARY.map((h) => h.id)] as [string, ...string[]];

export const photoIssues: ToolHandler = async (ctx) => {
  const pics = photos(ctx, "photos");
  if (!pics.length) throw new InputError("Nahrajte fotografie ze stavby (JPG, PNG, WEBP).");

  const ai = await ctx.ai({
    system: `Prohlížíš fotografie ze staveniště a hledáš MOŽNÉ problémy: BOZP (chybějící zábradlí/zajištění hrany, OOPP, nezajištěné výkopy, lešení, pohyb pod břemenem, přístupové cesty), organizaci staveniště (skladování, zablokované trasy, oplocení, značení), kvalitu (poškození, nečistoty, vady povrchu) a životní prostředí (úniky, odpady). Vždy piš „možný problém“ / „ověřit na místě“ – nejsi oprávněn konstatovat porušení předpisu. Pokud fotografie problém nevykazuje, uveď prázdný seznam. Nevymýšlej detaily, které nejsou vidět. hazardId vyber z knihovny, pokud se hodí, jinak "".\n\nKnihovna: ${HAZARD_LIBRARY.map((h) => `${h.id} ${h.name}`).join("; ")}`,
    prompt: `Fotografií: ${pics.length}. ${ctx.value("context") ? `Kontext: ${ctx.value("context")}` : ""}`,
    docs: pics,
    schema: z.object({
      summary: z.string(),
      photos: z.array(
        z.object({
          photo: z.string().describe("Fotografie č. N – název souboru"),
          description: z.string(),
          issues: z.array(z.object({ category: z.enum(["BOZP", "organizace", "kvalita", "prostředí"]), issue: z.string(), severity: z.enum(["error", "warning", "info"]), confidence: z.enum(["vysoká", "střední", "nízká"]), hazardId: z.enum(HAZARD_IDS), action: z.string() })),
        }),
      ),
    }),
  });

  const report = newReport("foto-problemy", "Fotografie – možné problémy", {
    subtitle: `${pics.length} fotografií`,
    summary: ai?.summary ?? "Analýza fotografií vyžaduje AI (Claude vision).",
  });
  report.notes.push("Jde o upozornění na MOŽNÉ problémy. Konstatování porušení předpisů přísluší oprávněné osobě po ověření na místě.");
  if (ai) {
    const all = ai.photos.flatMap((p) => p.issues.map((i) => ({ ...i, photo: p.photo })));
    const table = {
      name: "Možné problémy",
      columns: ["Foto", "Kategorie", "Možný problém", "Doporučení", "Závažnost", "Jistota", "Nebezpečí z knihovny"],
      rows: all.map((i) => [i.photo, i.category, i.issue, i.action, i.severity === "error" ? "Vysoká" : i.severity === "warning" ? "Střední" : "Nízká", i.confidence, HAZARD_LIBRARY.find((h) => h.id === i.hazardId)?.name ?? ""]),
      rowTones: all.map((i) => (i.severity === "error" ? "bad" : i.severity === "warning" ? "warn" : "default") as Tone),
    };
    report.stats = [
      { label: "fotografií", value: pics.length },
      { label: "možných problémů", value: all.length, tone: all.length ? "warn" : "good" },
      { label: "vysoká závažnost", value: all.filter((i) => i.severity === "error").length, tone: "bad" },
      { label: "bez nálezu", value: ai.photos.filter((p) => !p.issues.length).length, tone: "good" },
    ];
    report.sections = [
      { id: "table", title: "Přehled", table },
      ...ai.photos.map((p, i): Section => ({
        id: `p${i}`,
        title: p.photo,
        body: p.description,
        findings: p.issues.length ? p.issues.map((x) => ({ severity: x.severity, title: `${x.category}: ${x.issue}`, detail: x.action, evidence: `jistota: ${x.confidence}` })) : [{ severity: "ok", title: "Bez zjevného problému" }],
      })),
    ];
    report.sheets = [table];
  } else {
    report.sections = [{ id: "list", title: "Nahrané fotografie", bullets: pics.map((p) => p.name) }];
  }
  return ctx.finish(report);
};

/* ————————————————————————————————————————————————
 * 21 Soupis vad a nedodělků (punch list)
 * ———————————————————————————————————————————————— */

export function notesToItems(notes: string): { object: string; item: string }[] {
  let current = "";
  const out: { object: string; item: string }[] = [];
  for (const raw of notes.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const codes = extractObjectCodes(line);
    const bullet = /^(?:\d+[.)]|[-•–*])\s*/.test(line);
    const text = line.replace(/^(?:\d+[.)]|[-•–*])\s*/, "");
    if (!bullet && codes.length && text.length < 60) {
      current = codes[0];
      continue;
    }
    out.push({ object: codes[0] ?? current, item: text });
  }
  return out;
}

export const punchList: ToolHandler = async (ctx) => {
  const pics = photos(ctx, "photos");
  const notes = ctx.value("notes");
  if (!pics.length && !notes) throw new InputError("Nahrajte fotografie nebo zadejte poznámky z prohlídky.");

  const ai = await ctx.ai({
    system:
      "Sestavuješ SOUPIS VAD A NEDODĚLKŮ z prohlídky stavby (fotografie + poznámky). Každou vadu uveď samostatně: objekt (SO/PS), přesné místo, popis vady, požadované odstranění, odpovědnost (je-li známa), priorita (bránící užívání = high), odkaz na fotografii. Nic nepřidávej navíc.",
    prompt: `${ctx.value("deadline") ? `Obecný termín odstranění: ${ctx.value("deadline")}\n` : ""}POZNÁMKY:\n${notes || "—"}`,
    docs: pics,
    schema: z.object({
      summary: z.string(),
      items: z.array(z.object({ object: z.string(), location: z.string(), defect: z.string(), action: z.string(), responsible: z.string(), priority: z.enum(["high", "medium", "low"]), photo: z.string(), deadline: z.string() })),
    }),
  });

  const items =
    ai?.items ??
    notesToItems(notes).map((n) => ({ object: n.object || "—", location: "", defect: n.item, action: "", responsible: "", priority: "medium" as const, photo: "", deadline: ctx.value("deadline") }));
  const pr = { high: "Vysoká", medium: "Střední", low: "Nízká" } as const;
  const table = {
    name: "Vady a nedodělky",
    columns: ["Č.", "Objekt", "Místo", "Vada / nedodělek", "Odstranění", "Odpovídá", "Priorita", "Termín", "Foto"],
    rows: items.map((i, n) => [String(n + 1), i.object, i.location, i.defect, i.action, i.responsible, pr[i.priority], i.deadline, i.photo]),
    rowTones: items.map((i) => (i.priority === "high" ? "bad" : i.priority === "medium" ? "warn" : "default") as Tone),
  };
  const objects = [...new Set(items.map((i) => i.object))];
  const report = newReport("soupis-vad", "SOUPIS VAD A NEDODĚLKŮ", {
    summary: ai?.summary ?? `Z poznámek rozpoznáno ${items.length} položek v ${objects.length} objektech. Místa, odstranění a fotografie doplní AI.`,
    sheets: [table],
  });
  report.stats = [
    { label: "položek", value: items.length },
    { label: "objektů", value: objects.length },
    { label: "vysoká priorita", value: items.filter((i) => i.priority === "high").length, tone: "bad" },
  ];
  report.sections = [
    { id: "all", title: "Soupis", table },
    ...objects.map((o, i): Section => ({ id: `o${i}`, title: o === "—" ? "Bez určení objektu" : o, bullets: items.filter((x) => x.object === o).map((x) => `${x.defect}${x.location ? ` (${x.location})` : ""}`) })),
  ];
  return ctx.finish(report);
};

/* ————————————————————————————————————————————————
 * 22 Předávací dokumentace
 * ———————————————————————————————————————————————— */

export const handover: ToolHandler = async (ctx) => {
  const docs = ctx.files("docs");
  const list = ctx.value("list");
  if (!docs.length && !list) throw new InputError("Nahrajte předávané doklady nebo vložte jejich seznam.");
  const required = handoverFor(ctx.project);
  const corpus = docs.map((d) => ({ name: d.name, hay: fold(`${d.name} ${d.text.slice(0, 3000)}`) }));
  const listHay = fold(list);

  const det = required.map((r) => {
    const match = corpus.find((c) => r.keywords.some((k) => c.hay.includes(k)));
    const inList = r.keywords.some((k) => listHay.includes(k));
    return { r, found: match?.name ?? (inList ? "uvedeno v seznamu" : ""), present: Boolean(match || inList) };
  });

  const ai = await ctx.ai({
    system:
      "Kontroluješ úplnost PŘEDÁVACÍ DOKUMENTACE stavby. Pro každý požadovaný doklad (index) posuď, zda je doložen (present), doložen neúplně (partial – např. chybí podpis, část objektů, výsledek zkoušky nevyhovuje) nebo chybí (missing). Uveď doklad a konkrétní důvod. Doplň doklady, které pro tuto stavbu v seznamu chybí a měly by být předány.",
    prompt: `${projectForPrompt(ctx.project).slice(0, 6000)}\n\nPOŽADOVANÉ DOKLADY:\n${required.map((r, i) => `${i}: ${r.title} – ${r.note}`).join("\n")}\n\nSEZNAM OD UŽIVATELE:\n${list || "—"}\n\nPŘEDANÉ SOUBORY:\n${docs.map((d) => `- ${safeName(d.name)}`).join("\n")}\n\n${textDocs(docs, 15_000)}`,
    docs: binaryDocs(docs).filter((d) => d.pdfBase64),
    schema: z.object({
      summary: z.string(),
      items: z.array(z.object({ index: z.number().int(), state: z.enum(["present", "partial", "missing"]), evidence: z.string(), note: z.string() })),
      additional: z.array(z.object({ title: z.string(), reason: z.string() })),
    }),
  });
  const byIdx = new Map(ai?.items.map((i) => [i.index, i]) ?? []);
  const rows = det.map((d, i) => {
    const a = byIdx.get(i);
    const state = a?.state ?? (d.present ? "present" : "missing");
    return { ...d, state, evidence: a?.evidence ?? d.found, note: a?.note ?? d.r.note };
  });
  const icon = { present: "✅ Doloženo", partial: "⚠️ Neúplné", missing: "❌ Chybí" } as const;

  const report = newReport("predavaci-dokumentace", "Kontrola předávací dokumentace", {
    subtitle: ctx.project?.projectName,
    summary: ai?.summary ?? `Doloženo ${rows.filter((r) => r.state === "present").length} z ${rows.length} požadovaných dokladů (podle názvů a obsahu souborů).`,
  });
  const table = {
    name: "Předávací doklady",
    columns: ["Doklad", "Stav", "Doloženo souborem", "Poznámka"],
    rows: rows.map((r) => [r.r.title, icon[r.state], r.evidence, r.note]),
    rowTones: rows.map((r) => (r.state === "present" ? "good" : r.state === "partial" ? "warn" : "bad") as Tone),
  };
  report.stats = [
    { label: "doloženo", value: rows.filter((r) => r.state === "present").length, tone: "good" },
    { label: "neúplné", value: rows.filter((r) => r.state === "partial").length, tone: "warn" },
    { label: "chybí", value: rows.filter((r) => r.state === "missing").length, tone: "bad" },
    { label: "požadováno", value: rows.length },
  ];
  report.sections = [
    { id: "check", title: "Kontrolní seznam", table },
    {
      id: "missing",
      title: "K doložení před předáním",
      findings: rows.filter((r) => r.state !== "present").length
        ? rows.filter((r) => r.state !== "present").map((r): Finding => ({ severity: r.state === "missing" ? "error" : "warning", title: r.r.title, detail: r.note }))
        : [{ severity: "ok", title: "Všechny požadované doklady jsou doloženy." }],
    },
    ...(ai?.additional.length ? [{ id: "extra", title: "Další doporučené doklady", findings: ai.additional.map((a): Finding => ({ severity: "info", title: a.title, detail: a.reason })) }] : []),
  ];
  report.sheets = [table];
  return ctx.finish(report);
};

/* ————————————————————————————————————————————————
 * 23 Technická specifikace
 * ———————————————————————————————————————————————— */

export const techSpec: ToolHandler = async (ctx) => {
  const product = ctx.value("product");
  if (!product) throw new InputError("Zadejte materiál nebo výrobek.");
  return generateOutline({
    ctx,
    slug: "technicka-specifikace",
    title: `Technická specifikace – ${product}`,
    subtitle: ctx.value("element") || "pracovní návrh",
    outline: TECH_SPEC,
    role: "Zpracováváš technickou specifikaci materiálu / výrobku pro projektovou a zadávací dokumentaci. Specifikace musí být výrobkově neutrální (žádné obchodní názvy, pokud nejsou výslovně požadovány s dovětkem „nebo rovnocenný“).",
    instructions:
      "Hodnoty parametrů uváděj jen z podkladů a požadavků uživatele; typické hodnoty označ jako inferred a „ověřit“. Normy uváděj obecně, konkrétní čísla jen pokud jsou v podkladech.",
    docs: ctx.files("docs"),
    meta: [{ label: "Materiál / výrobek", value: product }],
    skeleton: (s) => (s.id === "s3" && ctx.value("requirements") ? { status: "inferred", body: ctx.value("requirements") } : { status: "missing" }),
  });
};

/* ————————————————————————————————————————————————
 * 24 Dotčené orgány a podklady (permit checklist)
 * ———————————————————————————————————————————————— */

const LEVEL: Record<PermitLevel, { label: string; tone: Tone }> = {
  required: { label: "✅ Potřebné", tone: "good" },
  likely: { label: "🟡 Pravděpodobně", tone: "warn" },
  verify: { label: "❓ Ověřit", tone: "default" },
};

export const permits: ToolHandler = async (ctx) => {
  const notes = ctx.value("notes");
  if (!ctx.project && !notes) throw new InputError("Aktivujte projekt nebo popište stavbu.");
  const rules = permitRules(ctx.project, notes);

  const ai = await ctx.ai({
    system:
      "Jsi inženýr pro inženýrskou činnost (zajištění povolení). K pravidlovému seznamu dotčených orgánů, správců a podkladů přidej další, které z popisu stavby vyplývají, a ke každé položce z pravidel potvrď nebo uprav úroveň (required / likely / verify) s odůvodněním. Příslušnost úřadů formuluj opatrně („ověřit příslušnost“), protože se liší dle druhu stavby a platné právní úpravy. Nevymýšlej čísla paragrafů.",
    prompt: `${projectForPrompt(ctx.project).slice(0, 8000)}\n\nPOPIS / POZNÁMKY: ${notes || "—"}\nSTUPEŇ: ${ctx.value("stage") || "neuveden"}\n\nPRAVIDLA:\n${rules.map((r) => `${r.id}: ${r.authority} – ${r.document} [${r.level}] (${r.reason})`).join("\n")}`,
    schema: z.object({
      summary: z.string(),
      adjustments: z.array(z.object({ id: z.string(), level: z.enum(["required", "likely", "verify"]), note: z.string() })),
      additional: z.array(z.object({ authority: z.string(), document: z.string(), level: z.enum(["required", "likely", "verify"]), reason: z.string() })),
      missingInfo: z.array(z.string()),
    }),
  });
  const adj = new Map(ai?.adjustments.map((a) => [a.id, a]) ?? []);
  const all = [
    ...rules.map((r) => ({ ...r, level: adj.get(r.id)?.level ?? r.level, reason: adj.get(r.id)?.note || r.reason, source: "pravidlo" })),
    ...(ai?.additional ?? []).map((a, i) => ({ id: `ai${i}`, ...a, source: "AI" })),
  ];
  const table = {
    name: "Orgány a podklady",
    columns: ["Orgán / subjekt", "Podklad / úkon", "Stav", "Důvod", "Zdroj"],
    rows: all.map((r) => [r.authority, r.document, LEVEL[r.level].label, r.reason, r.source]),
    rowTones: all.map((r) => LEVEL[r.level].tone),
  };
  const report = newReport("dotcene-organy", "Dotčené orgány, správci a podklady", {
    subtitle: ctx.project?.projectName ?? "",
    summary: ai?.summary ?? "Seznam sestaven z pravidel podle druhu stavby a podmínek. Příslušnost konkrétních úřadů ověřte.",
    questions: ai?.missingInfo ?? [],
    sheets: [table],
  });
  report.stats = [
    { label: "potřebné", value: all.filter((r) => r.level === "required").length, tone: "good" },
    { label: "pravděpodobně", value: all.filter((r) => r.level === "likely").length, tone: "warn" },
    { label: "k ověření", value: all.filter((r) => r.level === "verify").length },
  ];
  report.sections = [{ id: "list", title: "Kontrolní seznam", table }];
  report.notes.push("Seznam je pracovní pomůcka. Příslušnost orgánů a rozsah podkladů ověřte podle aktuální právní úpravy a vyjádření úřadu.");
  return ctx.finish(report);
};

/* ————————————————————————————————————————————————
 * 25 Úkoly z jednání (tasks only)
 * ———————————————————————————————————————————————— */

export function detectTasks(text: string): { who: string; task: string; deadline: string }[] {
  const out: { who: string; task: string; deadline: string }[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const m = /^([\p{Lu}][\p{L}.]+(?:\s[\p{Lu}][\p{L}.]+)?)\s*:\s*(.+)$/u.exec(line);
    const body = m ? m[2] : line;
    if (!/(dodá|pošl|zajist|připrav|zpracuj|doplní|doplníme|zvládneme|pošleme|dodáme|připravíme|zašle|udělá|musí|potřebujeme)/iu.test(body)) continue;
    const deadline = /(do\s+(?:\d{1,2}\.\s?\d{1,2}\.(?:\s?20\d{2})?|konce\s+\p{L}+|pátku|pondělí|úterý|středy|čtvrtka|zítra|\d{1,2}\.\s?\p{L}+))/iu.exec(body)?.[1] ?? "";
    out.push({ who: m?.[1] ?? "", task: body, deadline });
  }
  return out;
}

export const meetingTasks: ToolHandler = async (ctx) => {
  const transcript = [ctx.value("transcript"), ...ctx.files("docs").map((d) => d.text)].filter(Boolean).join("\n\n");
  if (!transcript) throw new InputError("Vložte přepis nebo poznámky.");

  const ai = await ctx.ai({
    system:
      "Z přepisu jednání vytáhni VÝHRADNĚ úkoly: konkrétní akce, odpovědná osoba/organizace, termín (převeď na datum, pokud je známo datum jednání; jinak slovně; když nezazněl, „neurčen“), projekt/objekt, závislosti. Zahrň i implicitní závazky („pošlu zítra“). Nezahrnuj pouhé informace.",
    prompt: `Datum jednání: ${ctx.value("date") || "neuvedeno"}\nProjekt: ${ctx.project?.projectName ?? ctx.value("project") ?? ""}\n\n${truncate(transcript, 120_000)}`,
    schema: z.object({ tasks: z.array(z.object({ task: z.string(), responsible: z.string(), deadline: z.string(), project: z.string(), dependsOn: z.string(), priority: z.enum(["vysoká", "střední", "nízká"]) })) }),
  });
  const tasks =
    ai?.tasks ??
    detectTasks(transcript).map((t) => ({ task: t.task, responsible: t.who, deadline: t.deadline || "neurčen", project: ctx.project?.projectName ?? "", dependsOn: "", priority: "střední" as const }));
  const people = [...new Set(tasks.map((t) => t.responsible || "Neurčeno"))];
  const table = {
    name: "Úkoly",
    columns: ["Č.", "Úkol", "Odpovídá", "Termín", "Projekt", "Priorita", "Závisí na"],
    rows: tasks.map((t, i) => [String(i + 1), t.task, t.responsible, t.deadline, t.project, t.priority, t.dependsOn]),
    rowTones: tasks.map((t) => (/neurčen/i.test(t.deadline) || !t.deadline ? "warn" : t.priority === "vysoká" ? "bad" : "default") as Tone),
  };
  const report = newReport("ukoly-z-jednani", "Úkoly z jednání", {
    summary: ai ? `${tasks.length} úkolů pro ${people.length} odpovědných osob.` : `Automaticky rozpoznáno ${tasks.length} úkolů podle formulací závazků („dodáme“, „pošlu“, „do pátku“). Úplné vytěžení provede AI.`,
    sheets: [table],
  });
  report.stats = [
    { label: "úkolů", value: tasks.length, tone: "accent" },
    { label: "odpovědných", value: people.length },
    { label: "bez termínu", value: tasks.filter((t) => /neurčen/i.test(t.deadline) || !t.deadline).length, tone: "warn" },
  ];
  report.sections = [
    { id: "all", title: "Všechny úkoly", table },
    ...people.map((p, i): Section => ({ id: `p${i}`, title: p, bullets: tasks.filter((t) => (t.responsible || "Neurčeno") === p).map((t) => `${t.task} — ${t.deadline || "neurčen"}`) })),
  ];
  return ctx.finish(report);
};

/* ————————————————————————————————————————————————
 * 26 Pojmenování a třídění souborů
 * ———————————————————————————————————————————————— */

export function detectRevision(name: string): string {
  const m = /(?:^|[_\-\s.])(?:v|ver|rev|r)[._\s-]?(\d{1,3}|[A-Z])(?=$|[_\-\s.])/i.exec(name.replace(/\.[^.]+$/, ""));
  return m ? m[1].toUpperCase().padStart(/\d/.test(m[1]) ? 2 : 1, "0") : "";
}

export function detectType(name: string, text: string): string {
  const hay = ` ${fold(name)} ${fold(text.slice(0, 2500))} `;
  const nameHay = ` ${fold(name)} `;
  // název souboru má přednost před obsahem
  return (DOC_TYPES.find((t) => t.keywords.some((k) => nameHay.includes(k))) ?? DOC_TYPES.find((t) => t.keywords.some((k) => hay.includes(k))))?.code ?? "Dokument";
}

const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "")
    .slice(0, 24);

export const naming: ToolHandler = async (ctx) => {
  const docs = ctx.files("docs");
  if (!docs.length) throw new InputError("Nahrajte soubory k roztřídění.");
  const project = slug(ctx.value("project") || ctx.project?.projectName.split(/\s+/).slice(0, 3).join("") || "Projekt");
  const pattern = ctx.value("pattern") || "{rok}_{projekt}_{objekt}_{typ}_v{rev}";
  const year = String(new Date().getFullYear());

  const det = docs.map((d) => {
    const ext = d.name.includes(".") ? d.name.split(".").pop()!.toLowerCase() : "";
    const years = [...extractDates(d.text).map((x) => x.year), ...[...d.text.matchAll(/\b\d{1,2}\/(20\d{2})\b/g)].map((m) => Number(m[1]))].filter(Boolean) as number[];
    return {
      d,
      ext,
      type: detectType(d.name, d.text),
      // název souboru má přednost, pak první zmínka v textu
      object: (firstObjectCode(d.name.replace(/_/g, " ")) || firstObjectCode(d.text.slice(0, 3000))).replace(" ", ""),
      rev: detectRevision(d.name) || "01",
      year: years.length ? String(Math.max(...years.filter((y) => y <= Number(year) + 1))) : year,
    };
  });

  const ai = await ctx.ai({
    system:
      "Třídíš projektové soubory. Pro každý soubor (index) urči typ dokumentu (krátký kód v PascalCase bez diakritiky, např. TechnickaZprava, VykazVymer, Vykres, Zapis), objekt (např. SO201, prázdné pokud se týká celé stavby), revizi (dvoumístné číslo nebo písmeno), rok a zda soubor patří k projektu. Upozorni na: duplicitní obsah, starší revize téhož dokumentu, soubor z jiného projektu, špatně označenou revizi.",
    prompt: `Projekt: ${ctx.project?.projectName ?? ctx.value("project") ?? "neuveden"}\n\nSOUBORY:\n${det.map((x, i) => `${i}: ${safeName(x.d.name)} (${x.d.kind}, ${Math.round(x.d.size / 1024)} kB)\n${x.d.text.slice(0, 1500).replace(/\s+/g, " ")}`).join("\n\n")}`,
    docs: docs.filter((d) => d.image).slice(0, 10),
    schema: z.object({
      files: z.array(z.object({ index: z.number().int(), type: z.string(), object: z.string(), revision: z.string(), year: z.string(), belongsToProject: z.boolean(), note: z.string() })),
      warnings: z.array(z.object({ title: z.string(), detail: z.string() })),
    }),
  });
  const aiByIdx = new Map(ai?.files.map((f) => [f.index, f]) ?? []);

  const rows = det.map((x, i) => {
    const a = aiByIdx.get(i);
    const type = slug(a?.type || x.type) || "Dokument";
    const object = slug(a?.object ?? x.object);
    const rev = slug(a?.revision || x.rev) || "01";
    const yr = /^20\d{2}$/.test(a?.year ?? "") ? a!.year : x.year;
    const base = pattern
      .replace("{rok}", yr)
      .replace("{projekt}", project)
      .replace("{objekt}", object)
      .replace("{typ}", type)
      .replace("{rev}", rev)
      .replace(/_{2,}/g, "_")
      .replace(/^_|_$/g, "");
    return { x, type, object, rev, name: `${base}${x.ext ? `.${x.ext}` : ""}`, note: a?.note ?? "", foreign: a ? !a.belongsToProject : false };
  });

  // unikátní názvy
  const used = new Map<string, number>();
  for (const r of rows) {
    const n = used.get(r.name) ?? 0;
    used.set(r.name, n + 1);
    if (n) r.name = r.name.replace(/(\.[^.]+)?$/, `_${n + 1}$1`);
  }

  const findings: Finding[] = [];
  const byHash = new Map<string, string[]>();
  for (const x of det) byHash.set(x.d.sha256, [...(byHash.get(x.d.sha256) ?? []), x.d.name]);
  for (const names of byHash.values()) if (names.length > 1) findings.push({ severity: "error", title: "Duplicitní soubory (shodný obsah)", detail: names.join(", ") });
  const byDoc = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = `${r.type}|${r.object}`;
    byDoc.set(key, [...(byDoc.get(key) ?? []), r]);
  }
  for (const group of byDoc.values()) {
    const revs = [...new Set(group.map((g) => g.rev))];
    if (revs.length > 1) {
      const latest = revs.sort().at(-1);
      findings.push({ severity: "warning", title: `Více revizí: ${group[0].type}${group[0].object ? ` ${group[0].object}` : ""}`, detail: `Aktuální je patrně rev ${latest}. Starší: ${group.filter((g) => g.rev !== latest).map((g) => g.x.d.name).join(", ")}` });
    }
  }
  for (const r of rows) if (r.foreign) findings.push({ severity: "warning", title: "Soubor pravděpodobně z jiného projektu", detail: `${r.x.d.name}${r.note ? ` – ${r.note}` : ""}` });
  for (const w of ai?.warnings ?? []) findings.push({ severity: "info", title: w.title, detail: w.detail });

  const table = {
    name: "Přejmenování",
    columns: ["Původní název", "Navržený název", "Typ", "Objekt", "Rev.", "Poznámka"],
    rows: rows.map((r) => [r.x.d.name, r.name, r.type, r.object, r.rev, r.note]),
    rowTones: rows.map((r) => (r.foreign ? "bad" : r.x.d.name === r.name ? "good" : "default") as Tone),
  };
  const report = newReport("pojmenovani-souboru", "Pojmenování a třídění souborů", {
    subtitle: `Konvence: ${pattern}`,
    summary: `${rows.length} souborů. Stáhněte ZIP s přejmenovanými soubory nebo exportujte tabulku do Excelu.`,
    renames: rows.map((r) => ({ from: r.x.d.name, to: r.name })),
    sheets: [table],
  });
  report.stats = [
    { label: "souborů", value: rows.length },
    { label: "duplicit", value: findings.filter((f) => f.title.startsWith("Duplicitní")).length, tone: "bad" },
    { label: "starších revizí", value: findings.filter((f) => f.title.startsWith("Více revizí")).length, tone: "warn" },
    { label: "typů dokumentů", value: new Set(rows.map((r) => r.type)).size },
  ];
  report.sections = [
    { id: "table", title: "Navržené názvy", table },
    { id: "warn", title: "Upozornění", findings: findings.length ? sortFindings(findings) : [{ severity: "ok", title: "Bez duplicit a konfliktů revizí." }] },
  ];
  return ctx.finish(report);
};

