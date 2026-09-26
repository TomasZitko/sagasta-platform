import "server-only";
import { z } from "zod";
import { formatCz, parseCzNumber, truncate } from "../../analyzers/text";
import { newReport, sortFindings, type Finding, type Section, type Tone } from "../../report";
import { InputError, projectForPrompt, type ToolContext, type ToolHandler } from "../context";

const docsBlock = (ctx: ToolContext, ...ids: string[]) =>
  ids
    .flatMap((id) => ctx.files(id))
    .filter((d) => !d.pdfBase64)
    .map((d) => `<dokument nazev="${d.name}">\n${truncate(d.text, 60_000)}\n</dokument>`)
    .join("\n");

const pdfs = (ctx: ToolContext, ...ids: string[]) => ids.flatMap((id) => ctx.files(id)).filter((d) => d.pdfBase64);

const czDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("cs-CZ");
};

/* ————————————————————————————————————————————————
 * 10 Registr připomínek
 * ———————————————————————————————————————————————— */

const STATUS_LABEL = {
  open: "🔴 Otevřeno",
  addressed: "🟢 Vypořádáno",
  partial: "🟠 Částečně",
  not_addressed: "🔴 Nevypořádáno",
  unclear: "⚪ Nelze ověřit",
} as const;
const STATUS_TONE: Record<keyof typeof STATUS_LABEL, Tone> = { open: "default", addressed: "good", partial: "warn", not_addressed: "bad", unclear: "default" };
const PRIORITY = { high: "Vysoká", medium: "Střední", low: "Nízká" } as const;

/** Rozdělí text připomínek na jednotlivé body (1., 2) , -, •). */
export function splitComments(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  for (const l of lines) {
    const m = /^\s*(?:\d{1,3}[.)]|[-•–])\s+(.*)$/.exec(l);
    if (m) out.push(m[1].trim());
    else if (out.length && l.trim() && !/^\s*$/.test(l)) out[out.length - 1] += ` ${l.trim()}`;
  }
  return out;
}

export const comments: ToolHandler = async (ctx) => {
  const src = ctx.textOf("comments", "text", "Vložené připomínky");
  if (!src.length) throw new InputError("Nahrajte nebo vložte připomínky.");
  const hasRevised = ctx.files("revised").length > 0;

  const ai = await ctx.ai({
    system: `Zpracováváš připomínky objednatele/dotčených orgánů k projektové dokumentaci do registru. Každou připomínku rozlož na samostatný požadavek (složenou připomínku rozděl a čísla označ 1a, 1b…). Pro každý požadavek urči konkrétní akci projektanta, dotčený dokument/výkres a kapitolu, kategorii (technická / formální / doplnění podkladu / koordinace) a prioritu. ${
      hasRevised
        ? "Poté ověř v REVIDOVANÉ dokumentaci, zda je požadavek zapracován: addressed (doloženo citací), partial, not_addressed, unclear (nelze posoudit z dodaných dokumentů). Stav vždy dolož krátkou citací nebo zdůvodněním."
        : "Revidovaná dokumentace nebyla dodána – stav všech požadavků je open."
    }`,
    prompt: `PŘIPOMÍNKY:\n${src.filter((d) => !ctx.files("comments").find((f) => f.name === d.name)?.pdfBase64).map((d) => `<pripominky zdroj="${d.name}">\n${d.text}\n</pripominky>`).join("\n")}${
      hasRevised ? `\n\nREVIDOVANÁ DOKUMENTACE:\n${docsBlock(ctx, "revised")}` : ""
    }`,
    docs: pdfs(ctx, "comments", "revised"),
    schema: z.object({
      summary: z.string(),
      items: z.array(
        z.object({
          no: z.string(),
          comment: z.string(),
          action: z.string(),
          document: z.string(),
          category: z.string(),
          priority: z.enum(["high", "medium", "low"]),
          status: z.enum(["open", "addressed", "partial", "not_addressed", "unclear"]),
          evidence: z.string(),
        }),
      ),
    }),
  });

  const items =
    ai?.items ??
    src.flatMap((d) => splitComments(d.text)).map((c, i) => ({ no: String(i + 1), comment: c, action: "", document: "", category: "", priority: "medium" as const, status: "open" as const, evidence: "" }));

  const report = newReport("pripominky", "Registr připomínek", {
    subtitle: src.map((s) => s.name).join(", "),
    summary: ai?.summary ?? `Rozpoznáno ${items.length} připomínek. Akce, dokumenty a kontrolu vypořádání doplní AI.`,
  });
  const count = (s: string) => items.filter((i) => i.status === s).length;
  report.stats = hasRevised
    ? [
        { label: "vypořádáno", value: count("addressed"), tone: "good" },
        { label: "částečně", value: count("partial"), tone: "warn" },
        { label: "nevypořádáno", value: count("not_addressed"), tone: "bad" },
        { label: "celkem požadavků", value: items.length },
      ]
    : [
        { label: "požadavků", value: items.length },
        { label: "vysoká priorita", value: items.filter((i) => i.priority === "high").length, tone: "bad" },
      ];
  report.sections = [
    {
      id: "register",
      title: "Registr připomínek",
      table: {
        columns: ["Č.", "Připomínka", "Požadovaná akce", "Dokument / kapitola", "Priorita", "Stav", hasRevised ? "Doklad" : "Kategorie"],
        rows: items.map((i) => [i.no, i.comment, i.action, i.document, PRIORITY[i.priority], STATUS_LABEL[i.status], hasRevised ? i.evidence : i.category]),
        rowTones: items.map((i) => STATUS_TONE[i.status]),
      },
    },
  ];
  if (hasRevised) {
    const open = items.filter((i) => i.status !== "addressed");
    report.sections.push({
      id: "open",
      title: "Nevypořádané body",
      findings: open.length
        ? open.map((i): Finding => ({ severity: i.status === "not_addressed" ? "error" : "warning", title: `${i.no}: ${i.comment}`, detail: i.action, evidence: i.evidence }))
        : [{ severity: "ok", title: "Všechny připomínky jsou vypořádány." }],
    });
  }
  report.sheets = report.sections[0].table ? [{ ...report.sections[0].table, name: "Registr připomínek" }] : undefined;
  return ctx.finish(report);
};

/* ————————————————————————————————————————————————
 * 11 Zápis z jednání + úkoly
 * ———————————————————————————————————————————————— */

export const meeting: ToolHandler = async (ctx) => {
  const transcript = [ctx.value("transcript"), ...ctx.files("docs").map((d) => d.text)].filter(Boolean).join("\n\n");
  if (!transcript) throw new InputError("Vložte přepis nebo poznámky z jednání.");

  const ai = await ctx.ai({
    system:
      "Z přepisu nebo poznámek sestavuješ oficiální ZÁPIS Z JEDNÁNÍ projekční kanceláře. Piš ve třetí osobě, věcně, bez citací mluvy. Rozliš: projednané body, přijatá rozhodnutí, úkoly (co, kdo, do kdy – termín jen pokud zazněl; jinak „neurčeno“), otevřené otázky a příští jednání. Nic nepřidávej, co nezaznělo. Relativní termíny („zítra“, „do pátku“) převeď na datum jen když je známo datum jednání, jinak ponech slovně.",
    prompt: `Jednání: ${ctx.value("title") || "neuvedeno"}\nDatum: ${ctx.value("date") || "neuvedeno"}\nÚčastníci: ${ctx.value("participants") || "viz přepis"}\n${ctx.project ? `Projekt: ${ctx.project.projectName}` : ""}\n\nPŘEPIS / POZNÁMKY:\n${truncate(transcript, 120_000)}`,
    schema: z.object({
      title: z.string(),
      place: z.string(),
      participants: z.array(z.object({ name: z.string(), organisation: z.string(), role: z.string() })),
      points: z.array(z.object({ topic: z.string(), discussion: z.string(), decisions: z.array(z.string()) })),
      tasks: z.array(z.object({ task: z.string(), responsible: z.string(), deadline: z.string(), note: z.string() })),
      openQuestions: z.array(z.string()),
      nextMeeting: z.string(),
    }),
  });
  if (!ai) {
    const report = newReport("zapis-z-jednani", "Zápis z jednání", { summary: "Zápis vyžaduje AI. Níže je strukturovaný přepis poznámek." });
    report.sections = [{ id: "raw", title: "Poznámky", body: transcript }];
    return ctx.finish(report);
  }

  const date = ctx.value("date") ? czDate(ctx.value("date")) : "";
  const report = newReport("zapis-z-jednani", "ZÁPIS Z JEDNÁNÍ", {
    subtitle: ai.title || ctx.value("title"),
    meta: [
      ...(date ? [{ label: "Datum", value: date }] : []),
      ...(ai.place ? [{ label: "Místo", value: ai.place }] : []),
      ...(ctx.project ? [{ label: "Projekt", value: ctx.project.projectName }] : []),
    ],
  });
  report.stats = [
    { label: "projednaných bodů", value: ai.points.length },
    { label: "rozhodnutí", value: ai.points.reduce((n, p) => n + p.decisions.length, 0), tone: "good" },
    { label: "úkolů", value: ai.tasks.length, tone: "accent" },
    { label: "otevřených otázek", value: ai.openQuestions.length, tone: ai.openQuestions.length ? "warn" : "default" },
  ];
  const tasksTable = {
    name: "Úkoly",
    columns: ["Č.", "Úkol", "Odpovídá", "Termín", "Poznámka"],
    rows: ai.tasks.map((t, i) => [String(i + 1), t.task, t.responsible, t.deadline, t.note]),
    rowTones: ai.tasks.map((t) => (/neurčen|neuveden/i.test(t.deadline) || !t.deadline ? "warn" : "default") as Tone),
  };
  report.sections = [
    { id: "participants", title: "Účastníci", table: { columns: ["Jméno", "Organizace", "Role"], rows: ai.participants.map((p) => [p.name, p.organisation, p.role]) } },
    ...ai.points.map((p, i): Section => ({ id: `p${i}`, title: `${i + 1}. ${p.topic}`, body: p.discussion, bullets: p.decisions.map((d) => `Rozhodnutí: ${d}`) })),
    { id: "tasks", title: "Úkoly", table: tasksTable },
    ...(ai.openQuestions.length ? [{ id: "open", title: "Otevřené otázky", bullets: ai.openQuestions }] : []),
    ...(ai.nextMeeting ? [{ id: "next", title: "Příští jednání", body: ai.nextMeeting }] : []),
  ];
  report.sheets = [tasksTable];
  return ctx.finish(report);
};

/* ————————————————————————————————————————————————
 * 12 E-mail → úkol
 * ———————————————————————————————————————————————— */

export const emailTask: ToolHandler = async (ctx) => {
  const email = ctx.value("email");
  if (!email) throw new InputError("Vložte text e-mailu.");

  const ai = await ctx.ai({
    system:
      "Zpracováváš přeposlaný e-mail pro projekční kancelář. Urči, zda vyžaduje akci, a rozlož požadavky na samostatné úkoly (co přesně udělat, priorita, termín – jen pokud je uveden nebo jednoznačně vyplývá, související přílohy). Připrav krátkou zdvořilou odpověď odesílateli potvrzující přijetí a další postup (bez slibů termínů, které nejsou v e-mailu).",
    prompt: `${ctx.value("project") ? `Projekt: ${ctx.value("project")}\n` : ""}E-MAIL:\n${email}`,
    schema: z.object({
      actionRequired: z.boolean(),
      summary: z.string(),
      sender: z.string(),
      project: z.string(),
      tasks: z.array(z.object({ title: z.string(), detail: z.string(), priority: z.enum(["vysoká", "střední", "nízká"]), deadline: z.string(), attachments: z.array(z.string()) })),
      suggestedReply: z.string(),
    }),
  });
  if (!ai) {
    const deadline = /do\s+(\d{1,2}\.\s?\d{1,2}\.(?:\s?20\d{2})?)/.exec(email)?.[1];
    const report = newReport("email-ukol", "E-mail → úkol", { summary: "Úplné zpracování vyžaduje AI. Automaticky nalezené údaje:" });
    report.sections = [{ id: "det", title: "Nalezeno", bullets: [`Předmět: ${/Předmět:\s*(.+)/i.exec(email)?.[1] ?? "—"}`, `Odesílatel: ${/Od:\s*(.+)/i.exec(email)?.[1] ?? "—"}`, `Termín: ${deadline ?? "—"}`] }];
    return ctx.finish(report);
  }
  const report = newReport("email-ukol", ai.actionRequired ? "⚡ VYŽADUJE AKCI" : "Bez nutné akce", {
    subtitle: ai.summary,
    meta: [
      { label: "Odesílatel", value: ai.sender },
      { label: "Projekt", value: ai.project || ctx.value("project") || "neurčen" },
    ],
  });
  report.stats = [
    { label: "úkolů", value: ai.tasks.length, tone: "accent" },
    { label: "vysoká priorita", value: ai.tasks.filter((t) => t.priority === "vysoká").length, tone: "bad" },
  ];
  const table = {
    name: "Úkoly",
    columns: ["Úkol", "Popis", "Priorita", "Termín", "Přílohy"],
    rows: ai.tasks.map((t) => [t.title, t.detail, t.priority, t.deadline || "neurčen", t.attachments.join(", ")]),
    rowTones: ai.tasks.map((t) => (t.priority === "vysoká" ? "bad" : t.priority === "střední" ? "warn" : "default") as Tone),
  };
  report.sections = [
    ...ai.tasks.map((t, i): Section => ({
      id: `t${i}`,
      title: t.title,
      body: t.detail,
      bullets: [`Priorita: ${t.priority}`, `Termín: ${t.deadline || "neurčen"}`, ...(t.attachments.length ? [`Přílohy: ${t.attachments.join(", ")}`] : [])],
    })),
    { id: "reply", title: "Návrh odpovědi", body: ai.suggestedReply },
  ];
  report.sheets = [table];
  return ctx.finish(report);
};

/* ————————————————————————————————————————————————
 * 13 Korespondence a RFI
 * ———————————————————————————————————————————————— */

const MODE_PROMPT: Record<string, string> = {
  rfi: "Formuluj TECHNICKÝ DOTAZ (RFI). Struktura: popis problému, technický kontext, konkrétní požadované upřesnění (očíslované otázky), dopad na projekt při nevyřešení, odkazy na podklady, požadovaný termín odpovědi.",
  reply: "Formuluj FORMÁLNÍ ODPOVĚĎ klientovi nebo zhotoviteli. Věcně vysvětli stanovisko, uveď důvody a navrhni další postup nebo rozhodnutí, které je potřeba od adresáta.",
  authority: "Formuluj VYJÁDŘENÍ PRO ÚŘAD / DOTČENÝ ORGÁN. Reaguj bod po bodu na výzvu (pokud je přiložena), odkazuj na části dokumentace, drž úřední styl. Nepřidávej právní argumentaci, kterou poznámky neobsahují.",
};

export const correspondence: ToolHandler = async (ctx) => {
  const notes = ctx.value("notes");
  if (!notes) throw new InputError("Vložte poznámky.");
  const mode = ctx.value("mode") || "rfi";

  const ai = await ctx.ai({
    system: `Píšeš formální korespondenci projekční kanceláře SAGASTA v češtině. ${MODE_PROMPT[mode]} Z hrubých poznámek zachovej všechna fakta, nic nepřidávej. Tón: profesionální, zdvořilý, stručný. Oslovení a zakončení přiměřené adresátovi.`,
    prompt: `${projectForPrompt(ctx.project).slice(0, 4000)}\n\nAdresát: ${ctx.value("recipient") || "neuveden"}\nZnačka/věc: ${ctx.value("reference") || "—"}\nPožadovaný termín odpovědi: ${ctx.value("due") ? czDate(ctx.value("due")) : "neuveden"}\n\nPOZNÁMKY:\n${notes}\n\n${docsBlock(ctx, "docs")}`,
    docs: pdfs(ctx, "docs"),
    schema: z.object({
      subject: z.string(),
      salutation: z.string(),
      paragraphs: z.array(z.string()),
      questions: z.array(z.string()).describe("U RFI očíslované otázky; jinak požadovaná rozhodnutí/akce adresáta."),
      references: z.array(z.string()),
      closing: z.string(),
      impact: z.string().describe("U RFI dopad při nevyřešení; jinak prázdné."),
    }),
  });
  if (!ai) {
    const report = newReport("korespondence", "Korespondence", { summary: "Formulace textu vyžaduje AI." });
    report.sections = [{ id: "notes", title: "Poznámky", body: notes }];
    return ctx.finish(report);
  }
  const signature = ctx.value("signature") || "SAGASTA s.r.o.";
  const title = mode === "rfi" ? "TECHNICKÝ DOTAZ (RFI)" : mode === "authority" ? "VYJÁDŘENÍ" : "ODPOVĚĎ";
  const report = newReport("korespondence", title, {
    subtitle: ai.subject,
    letter: { recipient: ctx.value("recipient"), subject: ai.subject, reference: ctx.value("reference"), signature },
    meta: [
      ...(ctx.project ? [{ label: "Projekt", value: ctx.project.projectName }] : []),
      ...(ctx.value("due") ? [{ label: "Odpověď do", value: czDate(ctx.value("due")) }] : []),
    ],
  });
  report.sections = [
    { id: "body", title: "Text", body: [ai.salutation, ...ai.paragraphs].join("\n\n") },
    ...(ai.questions.length ? [{ id: "q", title: mode === "rfi" ? "Požadované upřesnění" : "Požadované kroky", bullets: ai.questions.map((q, i) => `${i + 1}. ${q}`) }] : []),
    ...(ai.impact ? [{ id: "impact", title: "Dopad při nevyřešení", body: ai.impact }] : []),
    ...(ai.references.length ? [{ id: "refs", title: "Odkazy a přílohy", bullets: ai.references }] : []),
    { id: "closing", title: "Závěr", body: ai.closing },
  ];
  return ctx.finish(report);
};

/* ————————————————————————————————————————————————
 * 14 Porovnání nabídek
 * ———————————————————————————————————————————————— */

export function detectPrice(text: string): number | null {
  const re = /(\d{1,3}(?:[\s\u00a0.]\d{3})+(?:,\d+)?|\d{4,}(?:,\d+)?)\s*(?:Kč|CZK|,-)/giu;
  let first: number | null = null;
  let labelled: number | null = null;
  for (const m of text.matchAll(re)) {
    const n = parseCzNumber(m[1]);
    if (n === null) continue;
    const before = text.slice(Math.max(0, (m.index ?? 0) - 60), m.index).toLowerCase();
    if (first === null) first = n;
    if (labelled === null && /cen|celkem|nabíd|nabid/.test(before) && !/dph\s*$/.test(before)) labelled = n;
  }
  return labelled ?? first;
}

export function detectDays(text: string): number | null {
  const m = /(\d{2,4})\s*(?:pracovních|kalendářních)?\s*dn[ůí]/iu.exec(text);
  return m ? Number(m[1]) : null;
}

export const bids: ToolHandler = async (ctx) => {
  const files = ctx.files("bids");
  if (files.length < 2) throw new InputError("Nahrajte alespoň 2 nabídky.");

  const ai = await ctx.ai({
    system:
      "Porovnáváš nabídky ve veřejné zakázce na stavební práce / projekční služby. Pro KAŽDOU nabídku vytáhni standardizované údaje. NEVYBÍREJ vítěze a nehodnoť kvalitu – jen fakta, odchylky od zadání a chybějící údaje. Cenu uveď přesně jak je v nabídce (bez/s DPH) a číslo bez DPH do priceNumber (-1 neuvedeno). Dobu realizace v pracovních dnech do durationDays (-1 neuvedeno / nelze převést).",
    prompt: `ZADÁNÍ A KRITÉRIA:\n${ctx.value("criteria") || "neuvedeno"}\n\n${files
      .filter((d) => !d.pdfBase64)
      .map((d) => `<nabidka soubor="${d.name}">\n${truncate(d.text, 60_000)}\n</nabidka>`)
      .join("\n")}`,
    docs: files.filter((d) => d.pdfBase64),
    schema: z.object({
      summary: z.string(),
      bids: z.array(
        z.object({
          file: z.string(),
          bidder: z.string(),
          price: z.string(),
          priceNumber: z.number(),
          duration: z.string(),
          durationDays: z.number(),
          warranty: z.string(),
          technicalSolution: z.string(),
          materials: z.string(),
          exclusions: z.array(z.string()),
          deviations: z.array(z.string()),
          assumptions: z.array(z.string()),
          missing: z.array(z.string()),
        }),
      ),
      questions: z.array(z.string()).describe("Žádosti o objasnění nabídek (§ 46 ZZVZ) – jen konkrétní."),
    }),
  });

  const rows = ai
    ? ai.bids
    : files.map((f) => {
        const p = detectPrice(f.text);
        const d = detectDays(f.text);
        return {
          file: f.name,
          bidder: f.text.split("\n").find((l) => l.trim())?.replace(/^nabídka\s*[–-]\s*/i, "").trim() ?? f.name,
          price: p === null ? "" : `${formatCz(p)} Kč`,
          priceNumber: p ?? -1,
          duration: d === null ? "" : `${d} dní`,
          durationDays: d ?? -1,
          warranty: /(\d{2,3})\s*měsíc/iu.exec(f.text)?.[0] ?? "",
          technicalSolution: "",
          materials: "",
          exclusions: [] as string[],
          deviations: [] as string[],
          assumptions: [] as string[],
          missing: [] as string[],
        };
      });

  const priced = rows.filter((r) => r.priceNumber > 0);
  const minPrice = priced.length ? Math.min(...priced.map((r) => r.priceNumber)) : null;
  const minDays = rows.filter((r) => r.durationDays > 0).length ? Math.min(...rows.filter((r) => r.durationDays > 0).map((r) => r.durationDays)) : null;
  const maxDaysReq = /max\.?\s*(\d{2,4})\s*prac/iu.exec(ctx.value("criteria"))?.[1];

  const criteria: [string, (r: (typeof rows)[number]) => string][] = [
    ["Uchazeč", (r) => r.bidder],
    ["Cena", (r) => `${r.price || "—"}${r.priceNumber > 0 && minPrice ? (r.priceNumber === minPrice ? "  ▼ nejnižší" : `  (+${formatCz(Math.round(((r.priceNumber - minPrice) / minPrice) * 1000) / 10)} %)`) : ""}`],
    ["Doba realizace", (r) => `${r.duration || "—"}${r.durationDays > 0 && minDays === r.durationDays ? "  ▼ nejkratší" : ""}`],
    ["Záruka", (r) => r.warranty || "—"],
    ["Technické řešení", (r) => r.technicalSolution || "—"],
    ["Materiály", (r) => r.materials || "—"],
    ["Výluky z plnění", (r) => r.exclusions.join("; ") || "—"],
    ["Odchylky od zadání", (r) => r.deviations.join("; ") || "—"],
    ["Předpoklady", (r) => r.assumptions.join("; ") || "—"],
    ["Chybějící údaje", (r) => r.missing.join("; ") || "—"],
  ];

  const flags: Finding[] = [];
  for (const r of rows) {
    if (maxDaysReq && r.durationDays > Number(maxDaysReq)) flags.push({ severity: "error", title: `${r.bidder}: doba realizace ${r.durationDays} dní překračuje požadavek ${maxDaysReq} dní` });
    if (r.priceNumber <= 0) flags.push({ severity: "warning", title: `${r.bidder}: cenu se nepodařilo určit` });
    for (const d of r.deviations) flags.push({ severity: "warning", title: `${r.bidder}: odchylka`, detail: d });
    for (const e of r.exclusions) flags.push({ severity: "warning", title: `${r.bidder}: výluka z plnění`, detail: e });
    for (const m of r.missing) flags.push({ severity: "info", title: `${r.bidder}: chybí`, detail: m });
  }

  const table = { name: "Srovnání nabídek", columns: ["Kritérium", ...rows.map((r) => r.bidder || r.file)], rows: criteria.map(([label, f]) => [label, ...rows.map(f)]) };
  const report = newReport("porovnani-nabidek", "Srovnání nabídek", {
    subtitle: `${rows.length} nabídek`,
    summary: ai?.summary ?? "Cena, doba a záruka rozpoznány automaticky. Technické řešení, výluky a odchylky doplní AI.",
    questions: ai?.questions ?? [],
    sheets: [table],
  });
  report.stats = [
    { label: "nabídek", value: rows.length },
    { label: "nejnižší cena", value: minPrice ? `${formatCz(minPrice)} Kč` : "—", tone: "accent" },
    { label: "rozpětí cen", value: priced.length > 1 ? `${formatCz(Math.round(((Math.max(...priced.map((r) => r.priceNumber)) - minPrice!) / minPrice!) * 1000) / 10)} %` : "—" },
    { label: "odchylek a výluk", value: flags.filter((f) => f.severity !== "info").length, tone: "warn" },
  ];
  report.sections = [
    { id: "table", title: "Srovnávací tabulka", table },
    { id: "flags", title: "Odchylky, výluky a chybějící údaje", findings: flags.length ? sortFindings(flags) : [{ severity: "ok", title: "Bez zjištěných odchylek." }] },
  ];
  report.notes.push("Nástroj nevybírá vítěze. Hodnocení provádí hodnoticí komise dle zadávací dokumentace.");
  return ctx.finish(report);
};
