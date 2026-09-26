import "server-only";
import { safeName } from "../claude";
import { z } from "zod";
import { boqTotal, checkBoq, parseBoq, textToRows, type BoqItem } from "../../analyzers/boq";
import { compareRevisions } from "../../analyzers/revision";
import {
  compareLabelledValues,
  compareObjectCodes,
  extractMilestones,
  milestoneConflict,
  findPlaceholders,
  fold,
  formatCz,
  truncate,
  type NamedText,
} from "../../analyzers/text";
import { newReport, sortFindings, type Finding, type Section, type Severity } from "../../report";
import { DOC_STRUCTURES } from "../../templates";
import { InputError, projectForPrompt, type ToolHandler } from "../context";

const FindingOut = z.object({
  severity: z.enum(["error", "warning", "info"]),
  title: z.string(),
  detail: z.string(),
  evidence: z.string().describe("Krátké doslovné citace z dokumentů včetně názvu dokumentu."),
});

const toFinding = (f: z.infer<typeof FindingOut>): Finding => ({ severity: f.severity, title: f.title, detail: f.detail, evidence: f.evidence || undefined });

const docsBlock = (docs: NamedText[], max = 60_000) => docs.map((d) => `<dokument nazev="${safeName(d.name)}">\n${truncate(d.text, max)}\n</dokument>`).join("\n");

/* ————————————————————————————————————————————————
 * 06 Kontrola konzistence
 * ———————————————————————————————————————————————— */

export const consistency: ToolHandler = async (ctx) => {
  const docs = ctx.textOf("docs").filter((d) => d.text || ctx.files("docs").some((f) => f.name === d.name && f.pdfBase64));
  if (docs.length < 2) throw new InputError("Nahrajte alespoň 2 dokumenty.");

  const values = compareLabelledValues(docs);
  const codes = compareObjectCodes(docs).filter((c) => c.missingIn.length && c.presentIn.length);
  const ends = extractMilestones(docs, ["dokonc", "ukonc", "predan"]);
  const starts = extractMilestones(docs, ["zahaj"]);

  const det: Finding[] = [
    ...values.map((v): Finding => ({
      severity: "error",
      title: `Rozdílná hodnota: ${v.label} [${v.unit}]`,
      detail: v.values.map((x) => `${x.doc}: ${formatCz(x.value)} ${v.unit}`).join(" × "),
      evidence: v.values.map((x) => `${x.doc}: ${x.context}`).join("\n"),
    })),
    ...codes.map((c): Finding => ({
      severity: "warning",
      title: `${c.code} chybí v části dokumentace`,
      detail: `Uveden v: ${c.presentIn.join(", ")}. Neuveden v: ${c.missingIn.join(", ")}.`,
    })),
  ];
  for (const [label, list] of [["Dokončení stavby", ends], ["Zahájení stavby", starts]] as const) {
    if (milestoneConflict(list)) {
      det.push({
        severity: "error",
        title: `${label}: různé termíny`,
        detail: list.map((l) => `${l.doc}: ${l.value}`).join(" × "),
        evidence: list.map((l) => `${l.doc}: ${l.context}`).join("\n"),
      });
    }
  }

  const ai = await ctx.ai({
    system:
      "Jsi kontrolor projektové dokumentace. Hledáš ROZPORY mezi dokumenty stejné stavby: čísla (plochy, objemy, délky, hmotnosti), termíny a doby výstavby, seznam objektů SO/PS, materiály a třídy, technologie, účastníky. Také věci uvedené v jednom dokumentu a chybějící v jiném, kde by být měly. Každé zjištění dolož citací z obou dokumentů. Nehlas rozdíly, které jsou vysvětlitelné (např. jiný objekt). Deterministická zjištění ověř – nepravdivá neopakuj.",
    prompt: `${docsBlock(docs.filter((d) => !ctx.files("docs").find((f) => f.name === d.name)?.pdfBase64))}\n\nDETERMINISTICKÁ ZJIŠTĚNÍ (k ověření):\n${det.map((d) => `- ${d.title}: ${d.detail}`).join("\n") || "žádná"}\n\nVrať všechna ověřená i nová zjištění.`,
    docs: ctx.files("docs").filter((d) => d.pdfBase64),
    schema: z.object({ summary: z.string(), findings: z.array(FindingOut), questions: z.array(z.string()) }),
  });

  const findings = sortFindings(ai ? ai.findings.map(toFinding) : det);
  const report = newReport("kontrola-konzistence", "Kontrola konzistence dokumentace", {
    subtitle: `${docs.length} dokumentů`,
    meta: [{ label: "Dokumenty", value: docs.map((d) => d.name).join(", ") }],
    summary: ai?.summary ?? (det.length ? `Nalezeno ${det.length} potenciálních rozporů deterministickou kontrolou.` : "Deterministická kontrola nenašla rozpory v číslech, objektech ani letech."),
    questions: ai?.questions ?? [],
  });
  report.stats = [
    { label: "rozporů", value: findings.filter((f) => f.severity === "error").length, tone: "bad" },
    { label: "upozornění", value: findings.filter((f) => f.severity === "warning").length, tone: "warn" },
    { label: "dokumentů", value: docs.length },
    { label: "objektů SO/PS", value: compareObjectCodes(docs).length },
  ];
  report.sections = [
    { id: "findings", title: "Zjištění", findings: findings.length ? findings : [{ severity: "ok", title: "Nebyly nalezeny rozpory." }] },
    {
      id: "objects",
      title: "Pokrytí objektů v dokumentech",
      table: {
        columns: ["Objekt", ...docs.map((d) => d.name)],
        rows: compareObjectCodes(docs).map((c) => [c.code, ...docs.map((d) => (c.presentIn.includes(d.name) ? "✓" : "—"))]),
        rowTones: compareObjectCodes(docs).map((c) => (c.missingIn.length ? "warn" : "default")),
      },
    },
  ];
  if (ai && det.length) {
    report.sections.push({ id: "det", title: "Automatická zjištění (před ověřením AI)", findings: det.map((d) => ({ ...d, severity: "info" as Severity })) });
  }
  return ctx.finish(report);
};

/* ————————————————————————————————————————————————
 * 07 Detektor chybějících informací
 * ———————————————————————————————————————————————— */

export const missingInfo: ToolHandler = async (ctx) => {
  const docs = ctx.textOf("docs", "text");
  if (!docs.length) throw new InputError("Nahrajte dokument nebo vložte text.");
  const docType = ctx.value("docType") || "Jiný dokument";

  const placeholders = docs.flatMap((d) => findPlaceholders(d.text).map((p) => ({ ...p, doc: d.name })));
  const vague = docs.flatMap((d) =>
    [...d.text.matchAll(/[^.\n]*(vhodn[ýéým]+ způsob\w*|bude upřesněn\w*|dle potřeby|případně|v souladu s platnými předpisy)[^.\n]*/giu)].map((m) => ({ doc: d.name, text: m[0].trim() })),
  );

  const ai = await ctx.ai({
    system: `Kontroluješ dokument typu „${docType}“ před odevzdáním. Najdi: (1) povinné nebo očekávané údaje, které chybí (identifikace, účastníci, termíny, parametry, materiály, odkazy na podklady), (2) nedokončená místa a zástupné texty, (3) vágní formulace, které nahrazují konkrétní údaj, (4) objekty/části zmíněné bez popisu. Severity: error = bránící odevzdání, warning = mělo by se doplnit, info = doporučení. Ke každé položce formuluj konkrétní otázku pro projektanta.`,
    prompt: `${projectForPrompt(ctx.project)}\n\n${docsBlock(docs.filter((d) => !ctx.files("docs").find((f) => f.name === d.name)?.pdfBase64))}\n\nAutomaticky nalezená nedokončená místa:\n${placeholders.map((p) => `- ${p.doc}: ${p.kind} – ${p.context}`).join("\n") || "žádná"}`,
    docs: ctx.files("docs").filter((d) => d.pdfBase64),
    schema: z.object({
      summary: z.string(),
      findings: z.array(FindingOut.extend({ question: z.string() })),
    }),
  });

  const det: Finding[] = [
    ...placeholders.map((p): Finding => ({ severity: /DOPLNIT|XXX|\?\?|xx\.xx|TBD/i.test(p.raw) || p.kind.includes("Zástup") || p.kind.includes("datum") ? "error" : "warning", title: p.kind, detail: p.doc, evidence: p.context })),
    ...vague.map((v): Finding => ({ severity: "warning", title: "Vágní formulace místo konkrétního údaje", detail: v.doc, evidence: v.text })),
  ];
  const findings = sortFindings(ai ? ai.findings.map(toFinding) : det);

  const report = newReport("chybejici-informace", "Chybějící a podezřelé informace", {
    subtitle: docType,
    meta: [{ label: "Dokument", value: docs.map((d) => d.name).join(", ") }],
    summary: ai?.summary ?? `Nalezeno ${placeholders.length} nedokončených míst a ${vague.length} vágních formulací.`,
    questions: ai ? ai.findings.map((f) => f.question).filter(Boolean) : placeholders.map((p) => `Doplňte údaj: „${p.context}“`).slice(0, 15),
  });
  report.stats = [
    { label: "blokujících", value: findings.filter((f) => f.severity === "error").length, tone: "bad" },
    { label: "k doplnění", value: findings.filter((f) => f.severity === "warning").length, tone: "warn" },
    { label: "doporučení", value: findings.filter((f) => f.severity === "info").length },
  ];
  report.sections = [{ id: "findings", title: "Chybějící / podezřelé informace", findings: findings.length ? findings : [{ severity: "ok", title: "Nenalezena žádná chybějící místa." }] }];
  return ctx.finish(report);
};

/* ————————————————————————————————————————————————
 * 08 Kontrola požadované struktury
 * ———————————————————————————————————————————————— */

export const structure: ToolHandler = async (ctx) => {
  const docs = ctx.textOf("docs", "text", "Vložený obsah");
  if (!docs.length) throw new InputError("Nahrajte dokumentaci nebo vložte obsah.");
  const def = DOC_STRUCTURES.find((d) => d.id === ctx.value("structure")) ?? DOC_STRUCTURES[0];
  const corpus = fold(docs.map((d) => `${d.name}\n${d.text}`).join("\n"));

  const det = def.requirements.map((r) => ({ ...r, found: r.keywords.some((k) => corpus.includes(k)) }));

  const ai = await ctx.ai({
    system: `Kontroluješ úplnost dokumentace „${def.label}“ proti řízené osnově. Pro každý požadavek (podle indexu) urči: present = část existuje a má věcný obsah; formal = nadpis existuje, ale obsah je prázdný/obecný; missing = chybí. Uveď, kde v dokumentaci je (název dokumentu / kapitola), a co konkrétně chybí.`,
    prompt: `OSNOVA (index: kód – název):\n${def.requirements.map((r, i) => `${i}: ${r.code} – ${r.title}${r.required ? "" : " (volitelné)"}`).join("\n")}\n\n${docsBlock(docs.filter((d) => !ctx.files("docs").find((f) => f.name === d.name)?.pdfBase64), 40_000)}`,
    docs: ctx.files("docs").filter((d) => d.pdfBase64),
    schema: z.object({
      summary: z.string(),
      items: z.array(z.object({ index: z.number().int(), state: z.enum(["present", "formal", "missing"]), location: z.string(), note: z.string() })),
    }),
  });
  const aiByIndex = new Map(ai?.items.map((i) => [i.index, i]) ?? []);

  const rows = det.map((r, i) => {
    const a = aiByIndex.get(i);
    const state = a?.state ?? (r.found ? "present" : "missing");
    return { r, state, location: a?.location ?? "", note: a?.note ?? (r.found ? "nalezeno podle názvu" : "nenalezeno podle názvu") };
  });
  const icon = { present: "✅ Obsaženo", formal: "⚠️ Jen formálně", missing: "❌ Chybí" } as const;

  const report = newReport("kontrola-struktury", `Kontrola struktury – ${def.label}`, {
    subtitle: def.note,
    summary: ai?.summary,
  });
  const missingRequired = rows.filter((x) => x.state === "missing" && x.r.required).length;
  report.stats = [
    { label: "obsaženo", value: rows.filter((x) => x.state === "present").length, tone: "good" },
    { label: "jen formálně", value: rows.filter((x) => x.state === "formal").length, tone: "warn" },
    { label: "povinných chybí", value: missingRequired, tone: missingRequired ? "bad" : "good" },
    { label: "požadavků v osnově", value: rows.length },
  ];
  report.sections = [
    {
      id: "matrix",
      title: "Požadavky osnovy",
      table: {
        columns: ["Část", "Požadavek", "Stav", "Umístění", "Poznámka"],
        rows: rows.map((x) => [x.r.code, `${x.r.title}${x.r.required ? "" : " (volitelné)"}`, icon[x.state], x.location, x.note]),
        rowTones: rows.map((x) => (x.state === "missing" ? (x.r.required ? "bad" : "warn") : x.state === "formal" ? "warn" : "good")),
      },
    },
    {
      id: "todo",
      title: "K doplnění",
      findings: rows
        .filter((x) => x.state !== "present")
        .map((x): Finding => ({ severity: x.state === "missing" && x.r.required ? "error" : "warning", title: `${x.r.code} ${x.r.title}`, detail: x.note })),
    },
  ];
  if (!ai) report.notes.push("Bez AI se kontroluje jen přítomnost částí podle názvů a klíčových slov, ne jejich obsah.");
  return ctx.finish(report);
};

/* ————————————————————————————————————————————————
 * 09 Porovnání revizí
 * ———————————————————————————————————————————————— */

export const revisions: ToolHandler = async (ctx) => {
  const [a] = ctx.files("before");
  const [b] = ctx.files("after");
  if (!a || !b) throw new InputError("Nahrajte původní i novou verzi.");
  const diff = compareRevisions(a.text, b.text);

  const ai = await ctx.ai({
    system:
      "Porovnáváš dvě revize projektové dokumentace. Shrň změny věcně ve třech skupinách: technické změny (řešení, rozměry, materiály, založení, technologie), změny dokumentace (přidané/odebrané kapitoly, objekty), a POTENCIÁLNÍ DŮSLEDKY (na postup výstavby, termíny, cenu, BOZP, povolení, další objekty). Důsledky formuluj jako „může ovlivnit … – ověřit“. Nevymýšlej změny, které v rozdílu nejsou.",
    prompt: `PŮVODNÍ VERZE: ${a.name}\nNOVÁ VERZE: ${b.name}\n\nZměněné odstavce:\n${diff.modified.map((m) => `- PŘED: ${m.before}\n  PO: ${m.after}`).join("\n").slice(0, 60_000)}\n\nPřidané odstavce:\n${diff.added.join("\n").slice(0, 30_000)}\n\nOdebrané odstavce:\n${diff.removed.join("\n").slice(0, 30_000)}\n\nZměny objektů: přidáno ${diff.objectsAdded.join(", ") || "—"}, odebráno ${diff.objectsRemoved.join(", ") || "—"}\nZměny čísel: ${diff.numberChanges.map((n) => `${n.label}: ${n.before} → ${n.after}`).join("; ") || "—"}`,
    docs: [a, b].filter((d) => d.pdfBase64 && d.text.length < 200),
    schema: z.object({
      summary: z.string(),
      technical: z.array(z.string()),
      documentation: z.array(z.string()),
      consequences: z.array(FindingOut),
    }),
  });

  const report = newReport("porovnani-revizi", "Porovnání revizí", {
    subtitle: `${a.name} → ${b.name}`,
    summary:
      ai?.summary ??
      `Změněno ${diff.modified.length} odstavců, přidáno ${diff.added.length}, odebráno ${diff.removed.length}. ${diff.objectsAdded.length ? `Nové objekty: ${diff.objectsAdded.join(", ")}.` : ""}`,
  });
  report.stats = [
    { label: "změněných pasáží", value: diff.modified.length, tone: diff.modified.length ? "warn" : "default" },
    { label: "přidaných", value: diff.added.length, tone: diff.added.length ? "good" : "default" },
    { label: "odebraných", value: diff.removed.length, tone: diff.removed.length ? "bad" : "default" },
    { label: "změn čísel", value: diff.numberChanges.length },
  ];
  const sections: Section[] = [];
  if (ai) {
    sections.push({ id: "tech", title: "Technické změny", bullets: ai.technical });
    sections.push({ id: "docs", title: "Změny dokumentace", bullets: ai.documentation });
    sections.push({ id: "impact", title: "Potenciální důsledky", findings: sortFindings(ai.consequences.map(toFinding)) });
  }
  if (diff.objectsAdded.length || diff.objectsRemoved.length) {
    sections.push({ id: "objects", title: "Změny objektů", bullets: [...diff.objectsAdded.map((o) => `Přidán ${o}`), ...diff.objectsRemoved.map((o) => `Odebrán ${o}`)] });
  }
  if (diff.numberChanges.length) {
    sections.push({ id: "numbers", title: "Změny číselných údajů", table: { columns: ["Údaj", "Před", "Po"], rows: diff.numberChanges.map((n) => [n.label, n.before, n.after]) } });
  }
  sections.push({
    id: "diff",
    title: "Změněné pasáže",
    table: {
      columns: ["Změna", "Původní znění", "Nové znění"],
      rows: [
        ...diff.modified.map((m) => ["Změněno", m.before, m.after]),
        ...diff.added.map((t) => ["Přidáno", "", t]),
        ...diff.removed.map((t) => ["Odebráno", t, ""]),
      ],
      rowTones: [...diff.modified.map(() => "warn" as const), ...diff.added.map(() => "good" as const), ...diff.removed.map(() => "bad" as const)],
    },
  });
  report.sections = sections;
  if (!a.text || !b.text) report.notes.push("Jedna z verzí nemá textovou vrstvu – deterministické porovnání je neúplné.");
  return ctx.finish(report);
};

/* ————————————————————————————————————————————————
 * 15 Kontrola výkazu výměr
 * ———————————————————————————————————————————————— */

export const boq: ToolHandler = async (ctx) => {
  const file = ctx.files("boq")[0];
  const rows = file?.rows ?? (file ? textToRows(file.text) : ctx.value("boqText") ? textToRows(ctx.value("boqText")) : []);
  if (!rows.length) throw new InputError("Nahrajte výkaz výměr nebo vložte tabulku.");
  const { items, headerRow } = parseBoq(rows);
  if (headerRow === null) ctx.notes.push("Nepodařilo se rozpoznat záhlaví tabulky (popis / MJ / množství) – deterministická kontrola přeskočena.");
  const issues = checkBoq(items);
  const docs = ctx.textOf("docs");
  const total = boqTotal(items);

  const ai = await ctx.ai({
    system:
      "Kontroluješ výkaz výměr proti projektové dokumentaci. Hledej: (1) množství, která neodpovídají dokumentaci (uveď hodnotu z dokumentace i z výkazu), (2) konstrukce/práce popsané v dokumentaci, které ve výkazu chybí, (3) položky ve výkazu bez opory v dokumentaci, (4) podezřelé jednotky a řády. Buď konkrétní – řádek výkazu, citace dokumentace.",
    prompt: `VÝKAZ VÝMĚR (řádky):\n${rows.slice(0, 600).map((r, i) => `${i + 1}\t${r.join("\t")}`).join("\n")}\n\nDETERMINISTICKÁ ZJIŠTĚNÍ:\n${issues.map((i) => `- ${i.title}: ${i.detail}`).join("\n") || "žádná"}\n\n${docsBlock(docs)}`,
    docs: ctx.files("docs").filter((d) => d.pdfBase64 && d.text.length < 200),
    schema: z.object({ summary: z.string(), findings: z.array(FindingOut) }),
  });

  const report = newReport("kontrola-vykazu", "Kontrola výkazu výměr", {
    subtitle: file?.name ?? "vložená tabulka",
    summary: ai?.summary ?? `Rozpoznáno ${items.length} položek, nalezeno ${issues.length} nesrovnalostí.`,
  });
  const issueRows = new Set(issues.flatMap((i) => i.rows));
  report.stats = [
    { label: "položek", value: items.length },
    { label: "chyb", value: issues.filter((i) => i.severity === "error").length, tone: "bad" },
    { label: "upozornění", value: issues.filter((i) => i.severity === "warning").length, tone: "warn" },
    { label: "součet výkazu", value: total === null ? "—" : `${formatCz(Math.round(total))} Kč` },
  ];
  report.sections = [
    {
      id: "issues",
      title: "Nesrovnalosti ve výkazu",
      findings: issues.length ? sortFindings(issues.map((i) => ({ severity: i.severity, title: i.title, detail: i.detail }))) : [{ severity: "ok", title: "Deterministická kontrola nenašla chyby." }],
    },
  ];
  if (ai) report.sections.push({ id: "vsdocs", title: "Porovnání s dokumentací", findings: sortFindings(ai.findings.map(toFinding)) });
  if (items.length) {
    report.sections.push({
      id: "items",
      title: "Rozpoznané položky",
      table: {
        columns: ["Ř.", "Kód", "Popis", "MJ", "Množství", "J. cena", "Celkem"],
        rows: items.map((i: BoqItem) => [String(i.row), i.code, i.description, i.unit, fmt(i.quantity), fmt(i.unitPrice), fmt(i.total)]),
        rowTones: items.map((i) => (issueRows.has(i.row) ? "warn" : "default")),
      },
    });
  }
  return ctx.finish(report);
};

const fmt = (n: number | null) => (n === null ? "" : formatCz(n));

