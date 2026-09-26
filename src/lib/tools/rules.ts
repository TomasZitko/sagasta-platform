import type { ProjectIntake } from "@/lib/project/intake";
import type { OutlineSection } from "./templates";

/**
 * Řízené databáze pravidel pro nástroje, které musí fungovat i bez AI:
 * předávací dokumentace, dotčené orgány a podklady, typy dokumentů.
 * Garant pravidel je ověřuje proti aktuální legislativě a zvyklostem investorů.
 */

const has = (p: ProjectIntake | null, ...types: string[]) => Boolean(p && types.some((t) => (p.constructionTypes as string[]).includes(t)));
const text = (p: ProjectIntake | null) =>
  p ? `${p.description} ${p.documentText}`.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase() : "";

/* ——— 18 Předávací dokumentace ——— */

export interface HandoverItem {
  id: string;
  title: string;
  /** Klíčová slova v názvu souboru nebo textu (bez diakritiky). */
  keywords: string[];
  /** Kdy je doklad vyžadován (null = vždy). */
  when: ((p: ProjectIntake | null) => boolean) | null;
  note: string;
}

export const HANDOVER: HandoverItem[] = [
  { id: "h1", title: "Dokumentace skutečného provedení stavby", keywords: ["skutecneho provedeni", "dsps", "dsp s"], when: null, note: "Včetně změn během výstavby." },
  { id: "h2", title: "Geodetické zaměření skutečného provedení", keywords: ["geodet", "zamereni", "geometricky plan"], when: null, note: "Digitálně dle požadavků investora." },
  { id: "h3", title: "Stavební deník", keywords: ["stavebni denik", "denik"], when: null, note: "Originál nebo ověřená kopie, uzavřený." },
  { id: "h4", title: "Protokoly o zkouškách a měřeních", keywords: ["protokol o zkous", "zkouska", "zkousky", "mereni"], when: null, note: "Zkoušky materiálů a konstrukcí dle KZP." },
  { id: "h5", title: "Kontrolní a zkušební plán s výsledky", keywords: ["kontrolni a zkusebni", "kzp"], when: null, note: "Potvrzené kontrolní body." },
  { id: "h6", title: "Prohlášení o vlastnostech / certifikáty výrobků", keywords: ["prohlaseni o vlastnostech", "certifikat", "dop", "prohlaseni o shode"], when: null, note: "Pro zabudované výrobky." },
  { id: "h7", title: "Revizní zprávy elektrických zařízení", keywords: ["revizni zprava", "revize elektro", "vychozi revize"], when: (p) => !p || (p.activities as string[]).includes("electrical") || has(p, "building", "railway", "utilities"), note: "Výchozí revize." },
  { id: "h8", title: "Doklady o nakládání s odpady", keywords: ["odpad", "vazni list", "evidence odpadu"], when: null, note: "Evidence dle zákona o odpadech." },
  { id: "h9", title: "Zápis o předání a převzetí díla", keywords: ["predani a prevzeti", "predavaci protokol", "prevzeti dila"], when: null, note: "Podepsaný oběma stranami." },
  { id: "h10", title: "Soupis vad a nedodělků s termíny odstranění", keywords: ["vad a nedodelku", "nedodelk", "punch"], when: null, note: "Pokud dílo přebíráno s vadami." },
  { id: "h11", title: "Záruční listy, návody k obsluze a údržbě", keywords: ["zarucni", "navod", "udrzb"], when: null, note: "Pro technická zařízení a výrobky." },
  { id: "h12", title: "Vyjádření správců sítí k převzetí přeložek / ochran", keywords: ["spravce sit", "prelozk", "vyjadreni spravce"], when: (p) => !p || p.undergroundUtilities, note: "Protokoly o převzetí přeložek." },
  { id: "h13", title: "První hlavní prohlídka mostu", keywords: ["hlavni prohlidk", "prohlidka mostu"], when: (p) => has(p, "bridge"), note: "Před uvedením do provozu." },
  { id: "h14", title: "Zatěžovací zkouška mostu (je-li požadována)", keywords: ["zatezovaci zkous"], when: (p) => has(p, "bridge"), note: "Dle projektu / požadavku správce." },
  { id: "h15", title: "Tlakové zkoušky a zkoušky vodotěsnosti potrubí", keywords: ["tlakova zkous", "vodotesnost", "kamerova prohlidka"], when: (p) => has(p, "water", "utilities"), note: "U vodovodů a kanalizací." },
  { id: "h16", title: "Doklady ke zkušebnímu provozu drážních zařízení", keywords: ["zkusebni provoz", "tpd", "technicka prohlidka"], when: (p) => has(p, "railway"), note: "Dle požadavků správce železniční infrastruktury – ověřit." },
];

export const handoverFor = (p: ProjectIntake | null) => HANDOVER.filter((h) => !h.when || h.when(p));

/* ——— 25 Dotčené orgány, správci a podklady ——— */

export type PermitLevel = "required" | "likely" | "verify";

export interface PermitRule {
  id: string;
  authority: string;
  document: string;
  level: PermitLevel;
  reason: string;
}

export function permitRules(p: ProjectIntake | null, notes = ""): PermitRule[] {
  const t = `${text(p)} ${notes.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()}`;
  const out: PermitRule[] = [];
  const add = (r: PermitRule) => out.push(r);

  add({ id: "p1", authority: "Stavební úřad (obecný / specializovaný dle druhu stavby)", document: "Povolení stavby / záměru", level: "required", reason: "Stavební záměr – příslušnost úřadu ověřit dle druhu stavby." });
  add({ id: "p2", authority: "Správci technické infrastruktury (elektro, plyn, voda, kanalizace, telekomunikace)", document: "Vyjádření k existenci sítí a podmínky ochrany", level: "required", reason: "Nezbytné pro každou stavbu se zemními pracemi nebo v zastavěném území." });

  if (has(p, "railway") || (p && p.railwayProximity !== "none") || /zeleznic|kolej|trat/.test(t)) {
    add({ id: "p3", authority: "Správa železnic (vlastník / provozovatel dráhy)", document: "Vyjádření k PD, podmínky výluk a vstupu do obvodu dráhy", level: "required", reason: "Stavba na dráze nebo v jejím ochranném pásmu." });
    add({ id: "p4", authority: "Drážní správní úřad / specializovaný stavební úřad pro dráhy", document: "Stanovisko / povolení dle druhu dráhy", level: "verify", reason: "Příslušnost se liší dle druhu dráhy a platné právní úpravy – ověřit." });
  }
  if (has(p, "road") || (p && p.roadTraffic !== "none") || /komunikac|silnic|uzavir/.test(t)) {
    add({ id: "p5", authority: "Silniční správní úřad", document: "Povolení uzavírky / zvláštního užívání komunikace", level: p && p.roadTraffic !== "none" ? "required" : "likely", reason: "Omezení provozu na pozemní komunikaci." });
    add({ id: "p6", authority: "Policie ČR – dopravní inspektorát", document: "Stanovisko k DIO a přechodnému dopravnímu značení", level: p && p.roadTraffic !== "none" ? "required" : "likely", reason: "Dopravně inženýrská opatření." });
    add({ id: "p7", authority: "Vlastník / správce pozemní komunikace", document: "Souhlas a podmínky", level: "likely", reason: "Zásah do komunikace nebo jejího tělesa." });
  }
  if (has(p, "water") || p?.waterProximity || /vodni tok|reka|potok|povod/.test(t)) {
    add({ id: "p8", authority: "Vodoprávní úřad", document: "Povolení / souhlas dle vodního zákona", level: "required", reason: "Stavba na vodním toku nebo v jeho blízkosti." });
    add({ id: "p9", authority: "Správce vodního toku (Povodí / Lesy ČR …)", document: "Vyjádření, povodňový plán stavby", level: "required", reason: "Práce v korytě nebo inundačním území." });
  }
  if (p?.groundwater) add({ id: "p10", authority: "Vodoprávní úřad", document: "Povolení k čerpání / vypouštění podzemní vody (snížení HPV)", level: "likely", reason: "Snižování hladiny podzemní vody." });
  if (p?.demolition || /bouran|demolic|odstraneni stavby/.test(t)) {
    add({ id: "p11", authority: "Stavební úřad", document: "Povolení / ohlášení odstranění stavby (dle rozsahu)", level: "likely", reason: "Bourací práce." });
    add({ id: "p12", authority: "Orgán odpadového hospodářství (ORP)", document: "Vyjádření k nakládání se stavebními odpady", level: "likely", reason: "Odpady z bourání." });
  }
  if ((p && (p.materials as string[]).includes("asbestos")) || /azbest|eternit/.test(t)) {
    add({ id: "p13", authority: "Krajská hygienická stanice", document: "Ohlášení prací s azbestem", level: "required", reason: "Odstraňování materiálů s azbestem." });
  }
  if (p?.nightWork || /nocni/.test(t)) add({ id: "p14", authority: "Krajská hygienická stanice", document: "Časově omezené povolení překročení hlukových limitů (noční práce)", level: "verify", reason: "Hlučné práce v noci." });
  if (/kacen|drevin|zelen|stromu/.test(t)) add({ id: "p15", authority: "Orgán ochrany přírody", document: "Povolení kácení dřevin", level: "likely", reason: "Kácení dřevin rostoucích mimo les." });
  if (/pamatk|pamatkov/.test(t)) add({ id: "p16", authority: "Orgán státní památkové péče", document: "Závazné stanovisko", level: "likely", reason: "Kulturní památka / památkově chráněné území." });
  if (/zpf|zemedelsk|orna puda/.test(t)) add({ id: "p17", authority: "Orgán ochrany ZPF", document: "Souhlas s odnětím / dočasným záborem ZPF", level: "likely", reason: "Zábor zemědělské půdy." });
  if (/les|pupfl/.test(t)) add({ id: "p18", authority: "Orgán státní správy lesů", document: "Souhlas s dotčením PUPFL / 50 m od okraje lesa", level: "verify", reason: "Stavba v blízkosti lesa." });
  if (p && (p.activities as string[]).includes("earthworks")) add({ id: "p19", authority: "Archeologický ústav / oprávněná organizace", document: "Oznámení zemních prací, archeologický dohled", level: "likely", reason: "Zemní práce na území s možnými archeologickými nálezy." });
  if (has(p, "building")) add({ id: "p20", authority: "Hasičský záchranný sbor kraje", document: "Stanovisko k požárně bezpečnostnímu řešení", level: "likely", reason: "Pozemní stavba." });
  if (has(p, "railway", "road", "water") && p && (p.durationWorkingDays ?? 0) > 200) add({ id: "p21", authority: "Orgán posuzování vlivů na ŽP", document: "Zjišťovací řízení EIA – ověřit, zda záměr naplňuje přílohu zákona", level: "verify", reason: "Rozsáhlý liniový nebo vodohospodářský záměr." });
  if (p && (p.contractorsCount ?? 0) > 1) add({ id: "p22", authority: "Oblastní inspektorát práce", document: "Oznámení o zahájení prací (je-li splněn limit), určení koordinátora BOZP", level: "verify", reason: "Více zhotovitelů – ověřit limity zákona 309/2006 Sb. v Katalogu nebezpečí." });
  if (p?.overheadPowerLines) add({ id: "p23", authority: "Provozovatel distribuční soustavy", document: "Souhlas s činností v ochranném pásmu, vypnutí vedení", level: "required", reason: "Práce v ochranném pásmu venkovního vedení." });
  return out;
}

/* ——— 22 Technická specifikace ——— */

export const TECH_SPEC: OutlineSection[] = [
  { id: "s1", title: "Předmět a rozsah specifikace", guidance: "Materiál / výrobek, konstrukce a objekt, pro které platí.", keywords: [], required: true },
  { id: "s2", title: "Popis výrobku / materiálu", guidance: "Druh, složení, provedení, rozměry, povrchová úprava.", keywords: [], required: true },
  { id: "s3", title: "Požadované vlastnosti a parametry", guidance: "Mechanické, fyzikální, trvanlivost, prostředí – s hodnotami a jednotkami.", keywords: [], required: true },
  { id: "s4", title: "Související normy a předpisy", guidance: "Jen obecně nebo ty, které jsou v podkladech; jinak „ověřit“.", keywords: [], required: true },
  { id: "s5", title: "Doprava, skladování a manipulace", guidance: "Podmínky skladování, ochrana, manipulace.", keywords: [], required: false },
  { id: "s6", title: "Požadavky na zabudování / montáž", guidance: "Podklad, podmínky prostředí, postup, tolerance.", keywords: [], required: true },
  { id: "s7", title: "Kontrola kvality a zkoušky", guidance: "Vstupní kontrola, zkoušky během provádění, četnost, kritéria.", keywords: [], required: true },
  { id: "s8", title: "Převzetí a dokladování", guidance: "Doklady od dodavatele (prohlášení o vlastnostech, protokoly), přejímka.", keywords: [], required: true },
  { id: "s9", title: "Záruky a údržba", guidance: "Záruční podmínky, požadavky na údržbu.", keywords: [], required: false },
];

/* ——— 29 Typy dokumentů pro pojmenování ——— */

export const DOC_TYPES: { code: string; label: string; keywords: string[] }[] = [
  { code: "TechnickaZprava", label: "Technická zpráva", keywords: ["technicka zprava", "_tz_", " tz ", "tz_"] },
  { code: "SouhrnnaZprava", label: "Souhrnná technická zpráva", keywords: ["souhrnna technicka"] },
  { code: "ZOV", label: "Zásady organizace výstavby", keywords: ["organizace vystavby", "zov"] },
  { code: "VykazVymer", label: "Výkaz výměr / rozpočet", keywords: ["vykaz vymer", "soupis prac", "rozpocet", "vv_", "boq"] },
  { code: "Vykres", label: "Výkres", keywords: ["vykres", "situace", "pricny rez", "podelny rez", "pudorys", "dwg"] },
  { code: "StatickyVypocet", label: "Statický výpočet", keywords: ["staticky vypocet", "statika"] },
  { code: "PlanBOZP", label: "Plán BOZP", keywords: ["plan bozp", "bozp"] },
  { code: "KatalogRizik", label: "Katalog nebezpečí", keywords: ["katalog nebezpeci", "rizik"] },
  { code: "Zapis", label: "Zápis z jednání", keywords: ["zapis z jednani", "zapis", "kontrolni den"] },
  { code: "Vyjadreni", label: "Vyjádření / stanovisko", keywords: ["vyjadreni", "stanovisko"] },
  { code: "Rozhodnuti", label: "Rozhodnutí / povolení", keywords: ["rozhodnuti", "povoleni"] },
  { code: "Smlouva", label: "Smlouva / dodatek", keywords: ["smlouva", "dodatek"] },
  { code: "Nabidka", label: "Nabídka", keywords: ["nabidka", "nabidkova cena"] },
  { code: "Harmonogram", label: "Harmonogram", keywords: ["harmonogram"] },
  { code: "Protokol", label: "Protokol", keywords: ["protokol"] },
  { code: "Pripominky", label: "Připomínky", keywords: ["pripominky", "pripominka"] },
  { code: "Dopis", label: "Korespondence", keywords: ["vazeny", "vazena", "s pozdravem", "dopis"] },
  { code: "Faktura", label: "Faktura", keywords: ["faktura", "danovy doklad"] },
  { code: "Foto", label: "Fotodokumentace", keywords: [".jpg", ".jpeg", ".png", "foto"] },
];
