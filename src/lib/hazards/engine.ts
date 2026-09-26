import type { ProjectIntake } from "@/lib/project/intake";
import { CATEGORIES, HAZARD_LIBRARY, HAZARDS_BY_ID, REGULATIONS, type CategoryId, type HazardDefinition } from "./library";
import { clampLevel, riskBand, riskScore, type Level, type RiskBand } from "./risk";

/* ————————————————————————————————————————————————————————————————
 * Datové typy katalogu
 * ———————————————————————————————————————————————————————————————— */

/**
 * GREEN  – potvrzeno (pravidlo i AI / doložitelné z dokumentace)
 * YELLOW – odvozeno (pouze pravidlo nebo pouze AI) – ověřit
 * RED    – zařazeno, ale chybí vstupní údaj pro posouzení
 */
export type Confidence = "confirmed" | "inferred" | "missing_info";

export type Source = "rule" | "ai" | "rule+ai";

export interface CatalogueEntry {
  hazardId: string;
  name: string;
  category: CategoryId;
  categoryLabel: string;
  cause: string;
  risk: string;
  measures: string[];
  regulations: string[];
  probability: Level;
  severity: Level;
  score: number;
  band: RiskBand;
  confidence: Confidence;
  source: Source;
  /** Proč bylo nebezpečí zařazeno (pravidlo, citace z dokumentace). */
  rationale: string[];
  annex5: string | null;
}

export type FindingSeverity = "error" | "warning" | "info";

export interface Finding {
  severity: FindingSeverity;
  title: string;
  detail: string;
}

export interface BozpObligations {
  coordinatorRequired: boolean | null;
  notificationRequired: boolean | null;
  planRequired: boolean | null;
  reasons: string[];
}

export interface Catalogue {
  project: { name: string; location: string; investor: string };
  generatedAt: string;
  mode: "rules" | "ai";
  model: string | null;
  entries: CatalogueEntry[];
  /** Potenciálně chybějící kategorie nebezpečí a nesoulady vstupů. */
  coverage: Finding[];
  /** Chybějící nebo podezřelé vstupní údaje. */
  missingInfo: Finding[];
  /** Otázky pro projektanta / zhotovitele. */
  questions: string[];
  /** Nebezpečí, která AI identifikovala, ale nejsou v řízené knihovně. */
  librarySuggestions: { name: string; reason: string }[];
  obligations: BozpObligations;
  notes: string[];
}

/* ————————————————————————————————————————————————————————————————
 * Pomocné funkce
 * ———————————————————————————————————————————————————————————————— */

export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

const num = (v: number | null | undefined) => v ?? 0;

const GENERIC_REASON = "Obecné nebezpečí každého staveniště.";

/* ————————————————————————————————————————————————————————————————
 * 1) Výběr podle pravidel
 * ———————————————————————————————————————————————————————————————— */

export interface RuleMatch {
  hazardId: string;
  reason: string;
  /** Pravidlo zařadilo nebezpečí jen proto, že chybí údaj („ověřit“). */
  uncertain: boolean;
}

export function matchRules(intake: ProjectIntake): RuleMatch[] {
  const out: RuleMatch[] = [];
  for (const h of HAZARD_LIBRARY) {
    const reason = h.applies(intake);
    if (reason) out.push({ hazardId: h.id, reason, uncertain: /ověřit|neověřen|neuveden/i.test(reason) });
  }
  return out;
}

export function entryFromDefinition(
  h: HazardDefinition,
  intake: ProjectIntake,
  opts: Partial<Pick<CatalogueEntry, "probability" | "severity" | "confidence" | "source" | "rationale" | "cause" | "risk" | "measures">> = {},
): CatalogueEntry {
  const probability = clampLevel(opts.probability ?? h.defaultProbability);
  const severity = clampLevel(opts.severity ?? h.defaultSeverity);
  const score = riskScore(probability, severity);
  const annex5Applies = h.annex5 && (h.annex5When ? h.annex5When(intake) : true);
  return {
    hazardId: h.id,
    name: h.name,
    category: h.category,
    categoryLabel: CATEGORIES[h.category],
    cause: opts.cause ?? h.cause,
    risk: opts.risk ?? h.risk,
    measures: opts.measures ?? h.measures,
    regulations: h.regulations.map((r) => REGULATIONS[r]),
    probability,
    severity,
    score,
    band: riskBand(score),
    confidence: opts.confidence ?? "inferred",
    source: opts.source ?? "rule",
    rationale: opts.rationale ?? [],
    annex5: annex5Applies ? h.annex5! : null,
  };
}

/** Katalog čistě z pravidel – funguje bez AI a slouží jako záchranná síť pro AI výstup. */
export function buildRuleEntries(intake: ProjectIntake): CatalogueEntry[] {
  return matchRules(intake).map((m) =>
    entryFromDefinition(HAZARDS_BY_ID.get(m.hazardId)!, intake, {
      source: "rule",
      confidence: m.uncertain ? "missing_info" : m.reason === GENERIC_REASON ? "confirmed" : "inferred",
      rationale: [m.reason],
    }),
  );
}

/* ————————————————————————————————————————————————————————————————
 * 2) Kontrola pokrytí – „potenciálně chybějící kategorie“
 * ———————————————————————————————————————————————————————————————— */

interface TextSignal {
  /** Kmeny slov v normalizovaném textu. */
  terms: string[];
  /** Nebezpečí, které by mělo být v katalogu, pokud text signál obsahuje. */
  expects: string[];
  title: string;
  /** Kontrola strukturovaného vstupu – vrací true, pokud vstup signál již pokrývá. */
  coveredByIntake: (p: ProjectIntake) => boolean;
  intakeHint: string;
}

const TEXT_SIGNALS: TextSignal[] = [
  {
    terms: ["kolej", "zeleznic", "vyluk", "trat ", "trati", "obvod drahy"],
    expects: ["NB-040"],
    title: "Práce u provozované železniční infrastruktury",
    coveredByIntake: (p) => p.railwayProximity !== "none",
    intakeHint: "Nastavte „Blízkost železnice“.",
  },
  {
    terms: ["trakcn", "trolej"],
    expects: ["NB-041"],
    title: "Trakční vedení",
    coveredByIntake: (p) => p.railwayElectrified,
    intakeHint: "Označte trať jako elektrizovanou.",
  },
  {
    terms: ["bouran", "demolic", "odstraneni konstrukce", "snesen"],
    expects: ["NB-060"],
    title: "Bourací práce",
    coveredByIntake: (p) => p.demolition,
    intakeHint: "Zapněte „Bourací práce“.",
  },
  {
    terms: ["azbest", "eternit", "osinko"],
    expects: ["NB-070"],
    title: "Azbest",
    coveredByIntake: (p) => p.materials.includes("asbestos"),
    intakeHint: "Doplňte materiál „Azbest (podezření)“.",
  },
  {
    terms: ["olov", "minium", "stare natery", "puvodni nater"],
    expects: ["NB-073"],
    title: "Nátěry s obsahem olova / nebezpečné látky při bourání",
    coveredByIntake: (p) => p.materials.includes("chemicals") || p.activities.includes("coatings"),
    intakeHint: "Doplňte „Nátěry, chemické látky“.",
  },
  {
    terms: ["reka", "potok", "vodni tok", "vodotec", "nadrz", "berounk", "vltav", "labe", "morav", "odr"],
    expects: ["NB-090"],
    title: "Práce u vody",
    coveredByIntake: (p) => p.waterProximity,
    intakeHint: "Zapněte „Práce u vody“.",
  },
  {
    terms: ["vn ", "vvn", "venkovni vedeni", "22 kv", "110 kv"],
    expects: ["NB-050"],
    title: "Venkovní elektrické vedení",
    coveredByIntake: (p) => p.overheadPowerLines,
    intakeHint: "Zapněte „Venkovní vedení VN/VVN“.",
  },
  {
    terms: ["plynovod", "kabel", "inzenyrske site", "vodovod", "kanalizac", "optick"],
    expects: ["NB-012"],
    title: "Podzemní inženýrské sítě",
    coveredByIntake: (p) => p.undergroundUtilities,
    intakeHint: "Zapněte „Podzemní sítě v území“.",
  },
  {
    terms: ["v noci", "nocni", "nocn"],
    expects: ["NB-102"],
    title: "Noční práce",
    coveredByIntake: (p) => p.nightWork,
    intakeHint: "Zapněte „Noční práce“.",
  },
  {
    terms: ["sacht", "stoka", "kolektor", "komora", "stisnen"],
    expects: ["NB-075"],
    title: "Stísněné prostory",
    coveredByIntake: (p) => p.confinedSpaces,
    intakeHint: "Zapněte „Stísněné prostory“.",
  },
  {
    terms: ["jerab", "autojerab"],
    expects: ["NB-021"],
    title: "Zdvihací zařízení",
    coveredByIntake: (p) => p.machinery.includes("crane"),
    intakeHint: "Doplňte mechanizaci „Jeřáby“.",
  },
  {
    terms: ["predpin", "predpjat"],
    expects: ["NB-063"],
    title: "Předpínání",
    coveredByIntake: (p) => p.activities.includes("prestressing"),
    intakeHint: "Doplňte činnost „Předpínání“.",
  },
  {
    terms: ["odstrel", "trhac"],
    expects: ["NB-082"],
    title: "Trhací práce",
    coveredByIntake: (p) => p.activities.includes("blasting"),
    intakeHint: "Doplňte činnost „Trhací práce“.",
  },
  {
    terms: ["podzemni voda", "podzemni vody", "hpv", "cerpani vody", "snizeni hladiny"],
    expects: ["NB-013"],
    title: "Podzemní voda ve výkopu",
    coveredByIntake: (p) => p.groundwater,
    intakeHint: "Zapněte „Podzemní voda“.",
  },
  {
    terms: ["sousedni objekt", "sousedni budov", "prilehl", "pasport"],
    expects: ["NB-062"],
    title: "Sousední objekty",
    coveredByIntake: (p) => p.neighbouringBuildings,
    intakeHint: "Zapněte „Sousední objekty v dosahu“.",
  },
];

/**
 * Najde výskyt kmene v textu a vrátí krátký úryvek jako doklad.
 * U textu v NFC má normalizovaný řetězec stejnou délku (odstraní se jen
 * kombinující diakritika), takže úryvek lze vzít z původního textu.
 */
function findEvidence(normText: string, rawText: string, terms: string[]): string | null {
  const source = rawText.length === normText.length ? rawText : normText;
  for (const t of terms) {
    const i = normText.indexOf(t);
    if (i < 0) continue;
    const start = Math.max(0, i - 40);
    const end = Math.min(source.length, i + t.length + 50);
    const snippet = source.slice(start, end).replace(/\s+/g, " ").trim();
    return (start > 0 ? "…" : "") + snippet + (end < source.length ? "…" : "");
  }
  return null;
}

export function checkCoverage(intake: ProjectIntake, entries: CatalogueEntry[]): Finding[] {
  const findings: Finding[] = [];
  const selected = new Set(entries.map((e) => e.hazardId));
  const raw = ` ${intake.description}\n${intake.documentText} `.normalize("NFC");
  const text = normalize(raw);

  for (const s of TEXT_SIGNALS) {
    const evidence = findEvidence(text, raw, s.terms);
    if (!evidence) continue;
    const missing = s.expects.filter((id) => !selected.has(id));
    if (missing.length) {
      findings.push({
        severity: "error",
        title: `Potenciálně chybějící kategorie: ${s.title}`,
        detail: `Dokumentace zmiňuje „${evidence}“, ale katalog neobsahuje: ${missing
          .map((id) => HAZARDS_BY_ID.get(id)?.name)
          .join(", ")}.`,
      });
    } else if (!s.coveredByIntake(intake)) {
      findings.push({
        severity: "warning",
        title: `Nesoulad vstupů: ${s.title}`,
        detail: `Text dokumentace zmiňuje „${evidence}“, ve formuláři však údaj není vyplněn. ${s.intakeHint}`,
      });
    }
  }

  // Kategorie, které téměř každá stavba má, ale katalog je nemá.
  const catsPresent = new Set(entries.map((e) => e.category));
  if (!catsPresent.has("height") && (intake.constructionTypes.includes("building") || intake.constructionTypes.includes("bridge"))) {
    findings.push({
      severity: "warning",
      title: "Potenciálně chybějící kategorie: Práce ve výškách",
      detail: "Pozemní i mostní stavby zpravidla zahrnují práce nad 1,5 m. Doplňte maximální výšku práce.",
    });
  }
  if (!catsPresent.has("machinery") && intake.machinery.length === 0 && intake.activities.length > 0) {
    findings.push({
      severity: "warning",
      title: "Potenciálně chybějící kategorie: Stroje a zdvihací zařízení",
      detail: "Nebyla uvedena žádná mechanizace. Ověřte technologii provádění.",
    });
  }

  return findings;
}

/* ————————————————————————————————————————————————————————————————
 * 3) Chybějící vstupní údaje
 * ———————————————————————————————————————————————————————————————— */

export function checkMissingInfo(intake: ProjectIntake): Finding[] {
  const f: Finding[] = [];
  const err = (title: string, detail: string) => f.push({ severity: "error", title, detail });
  const warn = (title: string, detail: string) => f.push({ severity: "warning", title, detail });

  if (intake.constructionTypes.length === 0) err("Druh stavby není uveden", "Bez druhu stavby nelze spolehlivě zvolit kategorie nebezpečí.");
  if (intake.activities.length === 0) err("Nejsou uvedeny technologie / činnosti", "Doplňte hlavní stavební činnosti.");
  if (intake.maxWorkHeightM === null) warn("Chybí maximální výška práce", "Rozhoduje o pracích ve výškách (1,5 m) a o příloze č. 5 (10 m).");
  if (intake.activities.includes("earthworks") && intake.maxExcavationDepthM === null)
    err("Chybí hloubka výkopu", "Zemní práce jsou uvedeny, hloubka výkopu ne – rozhoduje o pažení a příloze č. 5 (5 m).");
  if (intake.durationWorkingDays === null) warn("Chybí doba výstavby", "Nutné pro posouzení povinnosti oznámení zahájení prací (§ 15 zák. 309/2006 Sb.).");
  if (intake.peakWorkers === null) warn("Chybí počet osob na staveništi", "Nutné pro posouzení povinnosti oznámení zahájení prací.");
  if (intake.contractorsCount === null) warn("Chybí počet zhotovitelů", "Rozhoduje o povinnosti určit koordinátora BOZP (§ 14 zák. 309/2006 Sb.).");
  if (!intake.location) warn("Chybí místo stavby", "Údaj je potřebný do identifikace dokumentu.");
  if (!intake.investor) warn("Chybí zadavatel stavby", "Zadavatel odpovídá za určení koordinátora a oznámení prací.");
  if (intake.railwayProximity !== "none" && !intake.railwayElectrified && !/neelektriz|motorov/i.test(intake.description))
    warn("Neověřena elektrizace trati", "Pokud je trať elektrizovaná, přibývá nebezpečí od trakčního vedení.");
  if (intake.demolition && !intake.materials.includes("asbestos") && !/azbest/i.test(intake.description + intake.documentText))
    warn("Chybí informace o průzkumu azbestu", "U bouracích prací je nutné doložit průzkum nebezpečných materiálů.");
  if (!intake.description && !intake.documentText)
    warn("Chybí popis stavby", "Bez popisu nelze provést kontrolu pokrytí nad textem dokumentace.");
  return f;
}

/* ————————————————————————————————————————————————————————————————
 * 4) Povinnosti dle zákona 309/2006 Sb.
 * ———————————————————————————————————————————————————————————————— */

export function evaluateObligations(intake: ProjectIntake, entries: CatalogueEntry[]): BozpObligations {
  const reasons: string[] = [];

  let coordinatorRequired: boolean | null = null;
  if (intake.contractorsCount !== null) {
    coordinatorRequired = intake.contractorsCount > 1;
    reasons.push(
      coordinatorRequired
        ? `Koordinátor BOZP: ANO – na staveništi působí ${intake.contractorsCount} zhotovitelé (§ 14 zák. 309/2006 Sb.).`
        : "Koordinátor BOZP: dle uvedeného počtu zhotovitelů není povinný.",
    );
  } else {
    reasons.push("Koordinátor BOZP: nelze posoudit – chybí počet zhotovitelů.");
  }

  let notificationRequired: boolean | null = null;
  const d = intake.durationWorkingDays;
  const w = intake.peakWorkers;
  if (d !== null && w !== null) {
    const byDuration = d > 30 && w > 20;
    const personDaysUpperBound = d * w;
    notificationRequired = byDuration;
    if (byDuration) {
      reasons.push(`Oznámení zahájení prací (OIP): ANO – ${d} pracovních dní a až ${w} osob současně (§ 15 odst. 1 zák. 309/2006 Sb.).`);
    } else if (personDaysUpperBound > 500) {
      notificationRequired = null;
      reasons.push(
        `Oznámení zahájení prací: ověřit – horní odhad objemu prací ${personDaysUpperBound} osobodní překračuje limit 500; rozhoduje skutečný objem.`,
      );
    } else {
      reasons.push("Oznámení zahájení prací: dle uvedených údajů není povinné.");
    }
  } else {
    reasons.push("Oznámení zahájení prací: nelze posoudit – chybí doba výstavby nebo počet osob.");
  }

  const annex = entries.filter((e) => e.annex5);
  let planRequired: boolean | null;
  if (annex.length || notificationRequired) {
    planRequired = true;
    if (annex.length)
      reasons.push(
        `Plán BOZP: ANO – práce dle přílohy č. 5 NV 591/2006 Sb.: ${[...new Set(annex.map((e) => e.annex5))].join(" ")}`,
      );
    else reasons.push("Plán BOZP: ANO – stavba podléhá oznámení zahájení prací (§ 15 odst. 2 zák. 309/2006 Sb.).");
  } else {
    planRequired = notificationRequired === null ? null : false;
    reasons.push(planRequired === null ? "Plán BOZP: nelze s jistotou posoudit." : "Plán BOZP: dle uvedených údajů není povinný.");
  }

  return { coordinatorRequired, notificationRequired, planRequired, reasons };
}

/* ————————————————————————————————————————————————————————————————
 * 5) Otázky pro projektanta (deterministické)
 * ———————————————————————————————————————————————————————————————— */

export function ruleQuestions(intake: ProjectIntake, missing: Finding[]): string[] {
  const q: string[] = [];
  const has = (t: string) => missing.some((m) => m.title === t);
  if (has("Chybí maximální výška práce")) q.push("Jaká je maximální výška práce nad terénem nebo nad volnou hloubkou?");
  if (has("Chybí hloubka výkopu")) q.push("Jaká je maximální hloubka výkopů a navržený způsob pažení?");
  if (has("Chybí doba výstavby")) q.push("Jaká je plánovaná doba výstavby v pracovních dnech?");
  if (has("Chybí počet osob na staveništi")) q.push("Kolik osob bude současně pracovat na staveništi ve špičce?");
  if (has("Chybí počet zhotovitelů")) q.push("Kolik zhotovitelů (včetně podzhotovitelů) bude na staveništi působit?");
  if (has("Neověřena elektrizace trati")) q.push("Je dotčená trať elektrizovaná, a pokud ano, jakou napájecí soustavou?");
  if (has("Chybí informace o průzkumu azbestu")) q.push("Byl proveden průzkum nebezpečných materiálů (azbest, olovnaté nátěry) v bouraných konstrukcích?");
  if (intake.undergroundUtilities) q.push("Jsou k dispozici aktuální vyjádření správců sítí a bylo provedeno jejich vytyčení?");
  if (intake.railwayProximity !== "none") q.push("Jaký je rozsah a harmonogram výluk a které koleje zůstanou v provozu?");
  if (intake.waterProximity) q.push("Je zpracován povodňový plán stavby a odsouhlasen správcem toku?");
  if (num(intake.maxExcavationDepthM) >= 1.3 && !intake.groundwater) q.push("Jaká je hladina podzemní vody vůči dnu výkopu?");
  return q;
}

/* ————————————————————————————————————————————————————————————————
 * 6) Sestavení katalogu (pouze pravidla)
 * ———————————————————————————————————————————————————————————————— */

export const sortEntries = (entries: CatalogueEntry[]) =>
  [...entries].sort((a, b) => b.score - a.score || a.hazardId.localeCompare(b.hazardId));

export function buildRuleCatalogue(intake: ProjectIntake, now = new Date()): Catalogue {
  const entries = sortEntries(buildRuleEntries(intake));
  const missingInfo = checkMissingInfo(intake);
  return {
    project: { name: intake.projectName, location: intake.location, investor: intake.investor },
    generatedAt: now.toISOString(),
    mode: "rules",
    model: null,
    entries,
    coverage: checkCoverage(intake, entries),
    missingInfo,
    questions: ruleQuestions(intake, missingInfo),
    librarySuggestions: [],
    obligations: evaluateObligations(intake, entries),
    notes: [],
  };
}
