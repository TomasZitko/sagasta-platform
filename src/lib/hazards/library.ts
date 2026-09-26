import type { ProjectIntake } from "@/lib/project/intake";
import type { Level } from "./risk";

/**
 * Řízená knihovna nebezpečí.
 *
 * Katalog smí obsahovat POUZE položky z této knihovny – AI vybírá podle `id`,
 * nevymýšlí vlastní názvy. Knihovnu spravuje koordinátor BOZP / garant; změny
 * procházejí revizí stejně jako interní šablony dokumentů.
 */

export const REGULATIONS = {
  Z309: "Zákon č. 309/2006 Sb. (další podmínky BOZP)",
  Z262: "Zákon č. 262/2006 Sb., zákoník práce",
  NV591: "NV č. 591/2006 Sb. (BOZP na staveništích)",
  NV362: "NV č. 362/2005 Sb. (práce ve výškách a nad volnou hloubkou)",
  NV378: "NV č. 378/2001 Sb. (stroje, technická zařízení, nářadí)",
  NV101: "NV č. 101/2005 Sb. (pracoviště a pracovní prostředí)",
  NV361: "NV č. 361/2007 Sb. (ochrana zdraví při práci)",
  NV272: "NV č. 272/2011 Sb. (hluk a vibrace)",
  NV375: "NV č. 375/2017 Sb. (bezpečnostní značky a signály)",
  NV390: "NV č. 390/2021 Sb. (poskytování OOPP)",
  Z250: "Zákon č. 250/2021 Sb. (vyhrazená technická zařízení)",
  EN50110: "ČSN EN 50110-1 (obsluha a práce na elektrických zařízeních)",
  Z266: "Zákon č. 266/1994 Sb., o drahách",
  V177: "Vyhláška č. 177/1995 Sb., stavební a technický řád drah",
  SZBP1: "Předpis SŽ Bp1 (BOZP na zařízeních SŽ)",
  Z361: "Zákon č. 361/2000 Sb., o silničním provozu",
  V294: "Vyhláška č. 294/2015 Sb. (dopravní značení)",
  TP66: "TP 66 Zásady pro označování pracovních míst na PK",
  Z258: "Zákon č. 258/2000 Sb., o ochraně veřejného zdraví",
  Z541: "Zákon č. 541/2020 Sb., o odpadech",
  Z133: "Zákon č. 133/1985 Sb., o požární ochraně",
  V87: "Vyhláška č. 87/2000 Sb. (požární bezpečnost při svařování)",
  Z350: "Zákon č. 350/2011 Sb., chemický zákon",
  V55: "Vyhláška ČBÚ č. 55/1996 Sb. (činnost prováděná hornickým způsobem)",
  Z61: "Zákon č. 61/1988 Sb., o hornické činnosti, výbušninách",
  Z254: "Zákon č. 254/2001 Sb., vodní zákon",
  Z283: "Zákon č. 283/2021 Sb., stavební zákon",
  CSN733050: "ČSN 73 3050 Zemní práce",
  CSN736133: "ČSN 73 6133 Návrh a provádění zemního tělesa PK",
} as const;

export type RegulationId = keyof typeof REGULATIONS;

export const CATEGORIES = {
  height: "Práce ve výškách",
  excavation: "Zemní práce a výkopy",
  machinery: "Stroje a zdvihací zařízení",
  transport: "Doprava a provoz",
  railway: "Železniční provoz",
  energy: "Elektřina a energie",
  structures: "Konstrukce a bourání",
  health: "Zdraví a prostředí",
  fire: "Požár a výbuch",
  water: "Voda",
  site: "Organizace staveniště",
} as const;

export type CategoryId = keyof typeof CATEGORIES;

export interface HazardDefinition {
  id: string;
  /** Schválený název nebezpečí – jediný povolený název v katalogu. */
  name: string;
  category: CategoryId;
  cause: string;
  risk: string;
  measures: string[];
  regulations: RegulationId[];
  defaultProbability: Level;
  defaultSeverity: Level;
  /** Činnost dle přílohy č. 5 NV 591/2006 Sb. – zakládá povinnost plánu BOZP. */
  annex5?: string;
  /** Podmínka, za které nebezpečí skutečně naplňuje přílohu č. 5 (výchozí: vždy). */
  annex5When?: (p: ProjectIntake) => boolean;
  /**
   * Pravidlo zařazení: vrací zdůvodnění (proč nebezpečí patří do katalogu),
   * nebo null. Pravidla jsou úmyslně konzervativní – raději zařadit a nechat
   * inženýra vyřadit, než opomenout.
   */
  applies: (p: ProjectIntake) => string | null;
  /** Klíčová slova pro kontrolu textu dokumentace (bez diakritiky, malá písmena, kmeny slov). */
  keywords: string[];
}

const has = <T extends string>(list: readonly T[], ...ids: T[]) => ids.some((id) => list.includes(id));
const num = (v: number | null | undefined) => v ?? 0;

export const HAZARD_LIBRARY: HazardDefinition[] = [
  // ——— Práce ve výškách ———
  {
    id: "NB-001",
    name: "Pád osoby z výšky nebo do volné hloubky",
    category: "height",
    cause: "Práce na okraji konstrukce, lešení, plošině nebo nad volnou hloubkou bez kolektivní ochrany.",
    risk: "Pád z výšky s následkem těžkého nebo smrtelného úrazu.",
    measures: [
      "Kolektivní zajištění okrajů (zábradlí se zarážkou u podlahy, ochranné sítě) přednostně před OOPP.",
      "Systém zachycení pádu s určenými kotvicími body tam, kde kolektivní ochranu nelze zřídit.",
      "Prokazatelné proškolení a zdravotní způsobilost pro práci ve výškách.",
      "Denní kontrola lešení a plošin před zahájením prací; zápis do stavebního deníku.",
    ],
    regulations: ["NV362", "NV591", "Z309", "NV390"],
    defaultProbability: 3,
    defaultSeverity: 5,
    annex5: "Práce ve výšce nad 10 m nad terénem nebo nad volnou hloubkou.",
    annex5When: (p) => num(p.maxWorkHeightM) > 10,
    applies: (p) => {
      if (num(p.maxWorkHeightM) >= 1.5) return `Práce ve výšce ${p.maxWorkHeightM} m (limit NV 362/2005 Sb. je 1,5 m).`;
      if (has(p.machinery, "mewp")) return "Použití pracovních plošin.";
      if (has(p.constructionTypes, "bridge")) return "Mostní objekt – práce nad volnou hloubkou.";
      if (has(p.activities, "steel", "precast")) return "Montáž konstrukcí probíhá ve výšce.";
      return null;
    },
    keywords: ["vysk", "leseni", "plosin", "volnou hloubk", "zabradl", "okraj"],
  },
  {
    id: "NB-002",
    name: "Pád předmětů a materiálu z výšky",
    category: "height",
    cause: "Odkládání nářadí a materiálu na okrajích, nezajištěné podlahy lešení, práce nad sebou.",
    risk: "Zasažení osob pod pracovištěm padajícím předmětem.",
    measures: [
      "Zarážky u podlahy lešení a ochranné sítě; zákaz shazování materiálu.",
      "Vymezení a označení ohroženého prostoru pod pracovištěm; zákaz práce nad sebou.",
      "Používání ochranné přilby všemi osobami na staveništi.",
    ],
    regulations: ["NV362", "NV591", "NV375"],
    defaultProbability: 3,
    defaultSeverity: 4,
    applies: (p) =>
      num(p.maxWorkHeightM) >= 1.5 || has(p.machinery, "crane", "mewp") || has(p.constructionTypes, "bridge")
        ? "Práce ve výšce / zdvihání nad pracovním prostorem."
        : null,
    keywords: ["pad predmet", "shazov", "ochranna sit"],
  },

  // ——— Zemní práce ———
  {
    id: "NB-010",
    name: "Zasypání osob sesutím stěn výkopu",
    category: "excavation",
    cause: "Nepažený nebo nedostatečně svahovaný výkop, přitížení hrany, podzemní voda, vibrace od dopravy.",
    risk: "Zasypání osob ve výkopu s následkem udušení nebo smrtelného úrazu.",
    measures: [
      "Pažení nebo svahování dle geotechnického posudku; u nesoudržných zemin pažení od hloubky 1,3 m, jinak od 1,5 m.",
      "Ochranný pás podél hrany výkopu min. 0,5 m bez materiálu a strojů.",
      "Kontrola stavu pažení před každou směnou a po dešti, mrazu či otřesech.",
      "Bezpečný sestup do výkopu (žebříky, schodiště) po max. 20 m.",
    ],
    regulations: ["NV591", "CSN733050", "Z309"],
    defaultProbability: 2,
    defaultSeverity: 5,
    annex5: "Práce ve výkopech hlubších než 5 m nebo v podzemí s nebezpečím zasypání.",
    annex5When: (p) => num(p.maxExcavationDepthM) > 5,
    applies: (p) =>
      num(p.maxExcavationDepthM) >= 1.3
        ? `Výkop hloubky ${p.maxExcavationDepthM} m.`
        : has(p.activities, "earthworks") && p.maxExcavationDepthM === null
          ? "Zemní práce bez uvedené hloubky výkopu – ověřit."
          : null,
    keywords: ["vykop", "pazen", "ryh", "jam", "svahov"],
  },
  {
    id: "NB-011",
    name: "Pád osoby nebo stroje do výkopu",
    category: "excavation",
    cause: "Nezajištěná hrana výkopu, chybějící zábradlí nebo zábrany, přiblížení stroje k hraně.",
    risk: "Pád osoby do výkopu, převrácení stroje do výkopu.",
    measures: [
      "Ohrazení výkopu zábradlím ve vzdálenosti min. 1,5 m od hrany, v noci osvětlení.",
      "Stanovení bezpečné vzdálenosti strojů od hrany dle smykové plochy.",
      "Přechody přes výkop opatřené zábradlím.",
    ],
    regulations: ["NV591", "NV362"],
    defaultProbability: 3,
    defaultSeverity: 4,
    applies: (p) => (num(p.maxExcavationDepthM) > 0 || has(p.activities, "earthworks") ? "Otevřené výkopy na staveništi." : null),
    keywords: ["vykop", "hrana"],
  },
  {
    id: "NB-012",
    name: "Poškození podzemních inženýrských sítí",
    category: "excavation",
    cause: "Nevytyčené nebo nepřesně zakreslené sítě (plyn, elektro, sdělovací, voda), strojní výkop v ochranném pásmu.",
    risk: "Úraz el. proudem, výbuch nebo požár plynu, zaplavení výkopu, výpadek služeb.",
    measures: [
      "Vytyčení sítí správci před zahájením prací; zápis o vytyčení.",
      "Ruční výkop v ochranném pásmu sítí; sondy k ověření polohy.",
      "Havarijní postup a kontakty na správce sítí dostupné na stavbě.",
    ],
    regulations: ["NV591", "Z309", "EN50110"],
    defaultProbability: 3,
    defaultSeverity: 5,
    applies: (p) =>
      p.undergroundUtilities
        ? "V území jsou evidovány podzemní sítě."
        : has(p.activities, "earthworks", "piling", "drilling")
          ? "Zemní práce / vrtání – existence sítí neověřena."
          : null,
    keywords: ["inzenyrsk", "sit", "plynovod", "kabel", "vodovod", "kanalizac", "vytycen"],
  },
  {
    id: "NB-013",
    name: "Průval podzemní vody a ztráta stability dna výkopu",
    category: "excavation",
    cause: "Hladina podzemní vody nad dnem výkopu, hydraulické prolomení dna, vyplavování zeminy.",
    risk: "Zaplavení výkopu, sesuv pažení, ohrožení osob a sousedních konstrukcí.",
    measures: [
      "Návrh snížení hladiny podzemní vody (čerpání, jehlové filtry) dle hydrogeologického průzkumu.",
      "Záložní čerpadla a monitoring hladiny; evakuační cesty z výkopu.",
    ],
    regulations: ["NV591", "CSN733050", "Z254"],
    defaultProbability: 2,
    defaultSeverity: 4,
    applies: (p) => (p.groundwater && num(p.maxExcavationDepthM) > 0 ? "Výkop pod hladinou podzemní vody." : null),
    keywords: ["podzemni vod", "hpv", "cerpani", "snizeni hladiny"],
  },

  // ——— Stroje a zdvihání ———
  {
    id: "NB-020",
    name: "Přejetí, zachycení nebo přimáčknutí pojízdným strojem",
    category: "machinery",
    cause: "Couvání a otáčení strojů, omezený výhled obsluhy, pohyb pěších v pracovním prostoru stroje.",
    risk: "Přejetí nebo přimáčknutí osoby s těžkým až smrtelným následkem.",
    measures: [
      "Oddělení pěších tras od pojezdu strojů; vymezení pracovního prostoru stroje.",
      "Couvací signalizace a kamery; poučená osoba navádějící stroj.",
      "Výstražné oděvy s vysokou viditelností pro všechny osoby.",
    ],
    regulations: ["NV591", "NV378", "NV390"],
    defaultProbability: 3,
    defaultSeverity: 5,
    applies: (p) =>
      has(p.machinery, "excavator", "trucks", "compactors", "pile_rig", "concrete_pump")
        ? "Nasazení pojízdné stavební mechanizace."
        : null,
    keywords: ["rypadl", "nakladac", "stroj", "mechanizac", "couv"],
  },
  {
    id: "NB-021",
    name: "Pád břemene nebo zřícení zdvihacího zařízení",
    category: "machinery",
    cause: "Nevhodné vázání, přetížení, nedostatečná únosnost podloží pod podpěrami, vítr.",
    risk: "Zasažení osob břemenem, převrácení jeřábu.",
    measures: [
      "Plán zdvihu pro kritická břemena; ověření únosnosti podloží pod podpěrami.",
      "Vázání pouze osobou s platným vazačským průkazem; kontrola vázacích prostředků.",
      "Zákaz zdržování osob pod zavěšeným břemenem; stanovení limitu rychlosti větru.",
    ],
    regulations: ["NV591", "NV378", "Z250"],
    defaultProbability: 2,
    defaultSeverity: 5,
    annex5: "Montáž a demontáž těžkých konstrukčních stavebních dílů.",
    annex5When: (p) => has(p.activities, "precast", "steel") || p.demolition,
    applies: (p) =>
      has(p.machinery, "crane")
        ? "Nasazení jeřábu."
        : has(p.activities, "precast", "steel")
          ? "Montáž dílců vyžaduje zdvihání."
          : null,
    keywords: ["jerab", "zdvih", "brem", "vazac", "autojerab"],
  },
  {
    id: "NB-022",
    name: "Převrácení stroje na nestabilním podloží",
    category: "machinery",
    cause: "Práce na svahu, u hrany výkopu, na neúnosném nebo rozbředlém podloží.",
    risk: "Převrácení stroje s ohrožením obsluhy a osob v okolí.",
    measures: [
      "Zpevněné pracovní plochy a panely pod podpěry; posouzení únosnosti.",
      "Dodržení maximálního sklonu dle návodu výrobce; ochranná kabina ROPS.",
    ],
    regulations: ["NV378", "NV591"],
    defaultProbability: 2,
    defaultSeverity: 5,
    applies: (p) =>
      has(p.machinery, "crane", "pile_rig", "mewp") ||
      (has(p.machinery, "excavator") && (p.groundwater || p.waterProximity || num(p.maxExcavationDepthM) >= 2))
        ? "Těžká mechanizace na potenciálně neúnosném podloží."
        : null,
    keywords: ["podlozi", "unosnost", "prevraceni", "svah"],
  },

  // ——— Doprava ———
  {
    id: "NB-030",
    name: "Střet s vozidlem silničního provozu",
    category: "transport",
    cause: "Práce v blízkosti nebo na pozemní komunikaci za provozu, nedostatečné dopravní značení.",
    risk: "Sražení pracovníka projíždějícím vozidlem, najetí vozidla do pracoviště.",
    measures: [
      "Přechodné dopravní značení dle schváleného DIO a TP 66; kontrola každou směnu.",
      "Fyzické oddělení pracoviště (svodidla, betonové zábrany) u rychlostí nad 50 km/h.",
      "Výstražné oděvy třídy 3; zákaz vstupu do jízdního pruhu mimo vymezené místo.",
    ],
    regulations: ["Z361", "V294", "TP66", "NV591"],
    defaultProbability: 3,
    defaultSeverity: 5,
    applies: (p) =>
      p.roadTraffic !== "none" && p.roadTraffic !== "full_closure"
        ? "Práce za provozu na pozemní komunikaci nebo v její blízkosti."
        : has(p.constructionTypes, "road") && p.roadTraffic === "none"
          ? "Stavba PK – režim dopravy neuveden, ověřit."
          : null,
    keywords: ["doprav", "komunikac", "silnic", "dio", "objizd", "uzavir", "provoz"],
  },
  {
    id: "NB-031",
    name: "Kolize při pohybu staveništní dopravy a vjezdu na veřejnou komunikaci",
    category: "transport",
    cause: "Výjezd nákladních vozidel ze staveniště, znečištění vozovky, omezený rozhled.",
    risk: "Dopravní nehoda, ohrožení chodců a řidičů.",
    measures: [
      "Stanovené trasy staveništní dopravy v ZOV; regulace vjezdu/výjezdu.",
      "Čištění vozidel a vozovky; dopravní značení u výjezdu.",
    ],
    regulations: ["Z361", "NV591"],
    defaultProbability: 2,
    defaultSeverity: 4,
    applies: (p) => (has(p.machinery, "trucks") ? "Staveništní nákladní doprava." : null),
    keywords: ["vjezd", "vyjezd", "staveniste doprav", "odvoz"],
  },

  // ——— Železnice ———
  {
    id: "NB-040",
    name: "Střet s drážním vozidlem v provozované koleji",
    category: "railway",
    cause: "Práce v koleji nebo v její blízkosti za provozu, nedostatečná hlídka, přeslechnutí výstrahy.",
    risk: "Sražení pracovníka drážním vozidlem – smrtelný úraz.",
    measures: [
      "Organizace prací dle předpisu SŽ Bp1; určení vedoucího prací a hlídek.",
      "Výluka koleje nebo zabezpečení pracoviště (přenosné návěsti, varovný systém).",
      "Dodržení bezpečného prostoru; zákaz přecházení kolejí mimo vyhrazená místa.",
      "Školení zaměstnanců cizích firem pro pohyb v obvodu dráhy.",
    ],
    regulations: ["Z266", "V177", "SZBP1", "Z309"],
    defaultProbability: 2,
    defaultSeverity: 5,
    applies: (p) =>
      p.railwayProximity !== "none"
        ? p.railwayProximity === "on_track"
          ? "Práce přímo v kolejišti."
          : "Práce v blízkosti provozované koleje."
        : has(p.constructionTypes, "railway") || has(p.activities, "rail_track")
          ? "Železniční stavba – vztah k provozu neuveden, ověřit."
          : null,
    keywords: ["kolej", "trat", "zeleznic", "vyluk", "drah", "szdc", "sprava zeleznic", "obvod drahy"],
  },
  {
    id: "NB-041",
    name: "Úraz elektrickým proudem od trakčního vedení",
    category: "railway",
    cause: "Přiblížení osob, strojů nebo břemen k trakčnímu vedení pod napětím, indukované napětí.",
    risk: "Úraz elektrickým proudem, popálení – smrtelný následek.",
    measures: [
      "Vypnutí a uzemnění trakčního vedení; písemný příkaz B a zápis o vypnutí.",
      "Dodržení minimálních vzdáleností od živých částí pro osoby i mechanizaci.",
      "Omezovače dosahu na jeřábech a rypadlech.",
    ],
    regulations: ["SZBP1", "EN50110", "Z250"],
    defaultProbability: 2,
    defaultSeverity: 5,
    annex5: "Práce v ochranném pásmu vedení velmi vysokého a vysokého napětí.",
    applies: (p) => (p.railwayProximity !== "none" && p.railwayElectrified ? "Elektrizovaná trať." : null),
    keywords: ["trakcn", "troleje", "elektrizovan", "25 kv", "3 kv"],
  },
  {
    id: "NB-042",
    name: "Kolize mechanizace s průjezdným průřezem",
    category: "railway",
    cause: "Zasahování strojů, lešení nebo materiálu do průjezdného průřezu sousední provozované koleje.",
    risk: "Střet vlaku s mechanizací, vykolejení, ohrožení cestujících i pracovníků.",
    measures: [
      "Vymezení a fyzické oddělení průjezdného průřezu; zajištění strojů proti otočení do koleje.",
      "Skladování materiálu mimo průjezdný průřez; kontrola po každé směně.",
    ],
    regulations: ["V177", "SZBP1", "Z266"],
    defaultProbability: 2,
    defaultSeverity: 5,
    applies: (p) =>
      p.railwayProximity !== "none" && (has(p.machinery, "crane", "excavator", "rail_machines") || p.demolition)
        ? "Mechanizace u provozované koleje."
        : null,
    keywords: ["prujezdn", "prurez"],
  },

  // ——— Energie ———
  {
    id: "NB-050",
    name: "Úraz elektrickým proudem od venkovního vedení",
    category: "energy",
    cause: "Přiblížení výložníku jeřábu, rypadla nebo sklápěče k venkovnímu vedení VN/VVN.",
    risk: "Přeskok napětí, úraz elektrickým proudem, požár stroje.",
    measures: [
      "Vypnutí vedení ve spolupráci s provozovatelem distribuční soustavy nebo stanovení bezpečných vzdáleností.",
      "Vyznačení ochranného pásma na staveništi (zábrany, portály).",
      "Poučení obsluhy strojů a stanovení postupu při kontaktu s vedením.",
    ],
    regulations: ["EN50110", "NV591", "Z250"],
    defaultProbability: 2,
    defaultSeverity: 5,
    annex5: "Práce v ochranném pásmu vedení velmi vysokého a vysokého napětí.",
    applies: (p) => (p.overheadPowerLines ? "Venkovní vedení v prostoru staveniště." : null),
    keywords: ["venkovni vedeni", "vn", "vvn", "ochranne pasmo", "elektrick vedeni"],
  },
  {
    id: "NB-051",
    name: "Úraz elektrickým proudem od staveništních rozvodů a nářadí",
    category: "energy",
    cause: "Poškozené kabely a nářadí, nevhodné krytí ve vlhkém prostředí, neodborné zásahy.",
    risk: "Úraz elektrickým proudem.",
    measures: [
      "Staveništní rozvaděče s proudovým chráničem; revize elektrického zařízení a nářadí.",
      "Vedení kabelů mimo komunikace nebo jejich mechanická ochrana.",
    ],
    regulations: ["NV101", "Z250", "EN50110"],
    defaultProbability: 2,
    defaultSeverity: 4,
    applies: (p) =>
      has(p.activities, "electrical", "welding") || num(p.durationWorkingDays) > 20
        ? "Staveništní rozvod elektrické energie a elektrické nářadí."
        : null,
    keywords: ["rozvadec", "prodluzovac", "elektricke naradi"],
  },

  // ——— Konstrukce a bourání ———
  {
    id: "NB-060",
    name: "Nekontrolované zřícení konstrukce při bourání",
    category: "structures",
    cause: "Nevhodný postup bourání, oslabení nosných prvků, neznámý stav konstrukce.",
    risk: "Zavalení osob, zřícení na sousední objekty nebo provozovanou komunikaci či kolej.",
    measures: [
      "Postup bourání zpracovaný projektantem včetně dočasného zajištění stability.",
      "Stavebnětechnický průzkum a posouzení stavu konstrukce před bouráním.",
      "Vymezení ohroženého prostoru; strojní bourání z bezpečné vzdálenosti.",
    ],
    regulations: ["NV591", "Z283", "Z309"],
    defaultProbability: 2,
    defaultSeverity: 5,
    applies: (p) => (p.demolition ? "Stavba zahrnuje bourací práce." : null),
    keywords: ["bouran", "demolic", "odstran", "snesen"],
  },
  {
    id: "NB-061",
    name: "Zřícení bednění, podpěrných konstrukcí nebo lešení",
    category: "structures",
    cause: "Nedostatečně dimenzované nebo nesprávně sestavené bednění a skruže, přetížení při betonáži.",
    risk: "Zřícení konstrukce během betonáže, zavalení osob.",
    measures: [
      "Statický návrh bednění/skruže; montáž dle dokumentace výrobce.",
      "Převzetí bednění před betonáží odpovědnou osobou; řízená rychlost betonáže.",
    ],
    regulations: ["NV591", "NV362"],
    defaultProbability: 2,
    defaultSeverity: 5,
    applies: (p) => (has(p.activities, "concrete") ? "Betonáž do bednění / na skruži." : null),
    keywords: ["bedneni", "skruz", "podpern", "betonaz"],
  },
  {
    id: "NB-062",
    name: "Porušení stability sousedních objektů",
    category: "structures",
    cause: "Výkopy, vibrace a snížení hladiny podzemní vody v blízkosti stávajících staveb.",
    risk: "Poškození nebo zřícení sousedních staveb, ohrožení jejich uživatelů.",
    measures: [
      "Pasportizace sousedních objektů před zahájením prací.",
      "Monitoring deformací a vibrací; stanovení varovných a limitních hodnot.",
    ],
    regulations: ["Z283", "NV591"],
    defaultProbability: 2,
    defaultSeverity: 4,
    applies: (p) =>
      p.neighbouringBuildings && (num(p.maxExcavationDepthM) > 0 || p.demolition || has(p.activities, "piling", "blasting"))
        ? "Sousední objekty v dosahu výkopů, bourání nebo vibrací."
        : null,
    keywords: ["sousedn", "pasport", "okolni objekt", "monitoring"],
  },
  {
    id: "NB-063",
    name: "Uvolnění předpínací výztuže",
    category: "structures",
    cause: "Přetržení lana nebo selhání kotvy při napínání.",
    risk: "Vymrštění výztuže nebo kotvy, zasažení osob v ose napínání.",
    measures: [
      "Zákaz pobytu osob v ose napínání; ochranné štíty za kotvami.",
      "Napínání pouze proškolenou četou dle technologického předpisu.",
    ],
    regulations: ["NV378", "NV591"],
    defaultProbability: 1,
    defaultSeverity: 5,
    applies: (p) => (has(p.activities, "prestressing") ? "Předpínání konstrukce." : null),
    keywords: ["predpin", "predpjat", "kabel", "lano"],
  },
  {
    id: "NB-064",
    name: "Zával a nestabilita výrubu v podzemí",
    category: "structures",
    cause: "Nepříznivé geologické podmínky, opožděné zajištění výrubu, přítoky vody.",
    risk: "Zavalení osob, zával čelby.",
    measures: [
      "Geotechnický monitoring a průběžné zatřiďování horniny.",
      "Zajištění výrubu dle technologické třídy; záchranná služba (báňská) v pohotovosti.",
    ],
    regulations: ["V55", "Z61", "NV591"],
    defaultProbability: 2,
    defaultSeverity: 5,
    annex5: "Práce v podzemí, na výstavbě tunelů a štol.",
    applies: (p) =>
      has(p.constructionTypes, "underground") || has(p.activities, "tunneling") ? "Podzemní stavba / ražba." : null,
    keywords: ["razb", "tunel", "stol", "podzem", "vyrub", "celb"],
  },

  // ——— Zdraví a prostředí ———
  {
    id: "NB-070",
    name: "Expozice azbestu",
    category: "health",
    cause: "Bourání nebo úpravy konstrukcí s obsahem azbestu (krytiny, izolace, eternitové trouby).",
    risk: "Vdechování azbestových vláken – nádorová onemocnění.",
    measures: [
      "Průzkum na přítomnost azbestu před bouráním.",
      "Odstranění azbestu specializovanou firmou s ohlášením KHS; uzavřené pracoviště s podtlakem.",
      "Nakládání s azbestovým odpadem jako s nebezpečným odpadem.",
    ],
    regulations: ["Z258", "NV361", "Z541"],
    defaultProbability: 2,
    defaultSeverity: 5,
    annex5: "Práce s chemickými látkami a biologickými činiteli představujícími zvláštní riziko.",
    applies: (p) =>
      has(p.materials, "asbestos")
        ? "Uvedeno podezření na azbest."
        : p.demolition
          ? "Bourací práce – přítomnost azbestu neověřena."
          : null,
    keywords: ["azbest", "eternit", "osinko"],
  },
  {
    id: "NB-071",
    name: "Expozice prachu",
    category: "health",
    cause: "Řezání, vrtání a bourání betonu a zdiva, zemní práce za sucha.",
    risk: "Onemocnění dýchacích cest, silikóza.",
    measures: [
      "Mokré technologie a odsávání u nástrojů; kropení komunikací.",
      "Respirátory FFP2/FFP3 dle měření; kategorizace prací.",
    ],
    regulations: ["NV361", "Z258", "NV390"],
    defaultProbability: 3,
    defaultSeverity: 3,
    applies: (p) =>
      p.demolition || has(p.activities, "drilling", "earthworks", "tunneling") || has(p.machinery, "demolition_tools")
        ? "Prašné činnosti (bourání, vrtání, zemní práce)."
        : null,
    keywords: ["prach", "rezani", "silikoz"],
  },
  {
    id: "NB-072",
    name: "Hluk a vibrace",
    category: "health",
    cause: "Bourací kladiva, beranění, hutnění, provoz těžké mechanizace.",
    risk: "Poškození sluchu, vibrační syndrom horních končetin.",
    measures: [
      "Chrániče sluchu v pásmech nad 85 dB(A); střídání pracovníků.",
      "Nářadí s tlumením vibrací; měření expozice a kategorizace prací.",
    ],
    regulations: ["NV272", "NV361", "Z258"],
    defaultProbability: 4,
    defaultSeverity: 2,
    applies: (p) =>
      has(p.machinery, "demolition_tools", "compactors", "pile_rig") || has(p.activities, "piling", "drilling")
        ? "Hlučné a vibrační technologie."
        : null,
    keywords: ["hluk", "vibrac", "beran", "hutnen"],
  },
  {
    id: "NB-073",
    name: "Poleptání a zasažení chemickými látkami",
    category: "health",
    cause: "Kontakt s cementovým mlékem, přísadami, nátěry, ředidly, rozpouštědly.",
    risk: "Poleptání kůže a očí, dermatitidy, otravy výpary.",
    measures: [
      "Bezpečnostní listy na pracovišti; poučení pracovníků.",
      "Ochranné rukavice, brýle a oděv; výplach očí na pracovišti.",
    ],
    regulations: ["Z350", "NV361", "NV390"],
    defaultProbability: 3,
    defaultSeverity: 2,
    applies: (p) =>
      has(p.activities, "concrete", "coatings") || has(p.materials, "concrete", "chemicals")
        ? "Práce s betonem, nátěry nebo chemickými přípravky."
        : null,
    keywords: ["natery", "nater", "chemick", "redidl", "cement"],
  },
  {
    id: "NB-074",
    name: "Kontakt s kontaminovanou zeminou nebo odpady",
    category: "health",
    cause: "Staré ekologické zátěže, kontaminace ropnými látkami nebo těžkými kovy.",
    risk: "Otrava, kožní onemocnění, únik kontaminace do prostředí.",
    measures: [
      "Průzkum kontaminace a odběr vzorků; oddělené skladování a odvoz vytěžené zeminy.",
      "Hygienické zázemí a OOPP dle charakteru kontaminace.",
    ],
    regulations: ["Z541", "NV361", "Z258"],
    defaultProbability: 2,
    defaultSeverity: 3,
    applies: (p) => (has(p.materials, "contaminated_soil") ? "Uvedena kontaminovaná zemina." : null),
    keywords: ["kontaminac", "ekologick zatez", "ropn"],
  },
  {
    id: "NB-075",
    name: "Nedýchatelné prostředí ve stísněném prostoru",
    category: "health",
    cause: "Práce v šachtách, kanálech, nádržích a komorách s nedostatkem kyslíku nebo toxickými plyny.",
    risk: "Udušení, otrava – často i zachránců.",
    measures: [
      "Měření ovzduší před vstupem a průběžně; nucené větrání.",
      "Povolení ke vstupu, jistící osoba vně prostoru, záchranné prostředky.",
    ],
    regulations: ["NV101", "NV361", "NV591"],
    defaultProbability: 2,
    defaultSeverity: 5,
    applies: (p) => (p.confinedSpaces ? "Práce ve stísněných prostorách." : null),
    keywords: ["sacht", "kanal", "stisnen", "nadrz", "sachta"],
  },
  {
    id: "NB-076",
    name: "Ruční manipulace s břemeny",
    category: "health",
    cause: "Přenášení výztuže, bednicích dílců, obrubníků a pražců.",
    risk: "Poškození páteře, přetížení pohybového aparátu.",
    measures: [
      "Mechanizace manipulace; dodržení hygienických limitů hmotnosti břemen.",
      "Práce ve dvojici u těžkých a rozměrných břemen.",
    ],
    regulations: ["NV361"],
    defaultProbability: 4,
    defaultSeverity: 2,
    applies: (p) =>
      has(p.activities, "concrete", "rail_track", "steel", "precast") ? "Manipulace s výztuží, dílci nebo pražci." : null,
    keywords: ["rucni manipulac", "brem", "prenasen"],
  },
  {
    id: "NB-077",
    name: "Zátěž teplem a chladem",
    category: "health",
    cause: "Práce venku v letních a zimních měsících, práce u horkých hmot.",
    risk: "Přehřátí, úpal, prochlazení, omrzliny.",
    measures: [
      "Pitný režim, přestávky, zastínění; úprava pracovní doby v horku.",
      "Vytápěné zázemí a vhodné OOPP v zimě.",
    ],
    regulations: ["NV361", "NV101"],
    defaultProbability: 3,
    defaultSeverity: 2,
    applies: (p) => (num(p.durationWorkingDays) >= 60 ? "Venkovní práce po více ročních obdobích." : null),
    keywords: ["teplo", "chlad", "mraz", "vedro"],
  },

  // ——— Požár a výbuch ———
  {
    id: "NB-080",
    name: "Požár při svařování a práci s otevřeným ohněm",
    category: "fire",
    cause: "Odlétající jiskry, hořlavé materiály v okolí, nevhodné skladování tlakových lahví.",
    risk: "Požár, výbuch tlakové lahve, popálení.",
    measures: [
      "Písemné příkazy k práci se zvýšeným požárním nebezpečím; požární dohled po ukončení.",
      "Odstranění hořlavin z okolí; hasicí přístroje u pracoviště.",
      "Svářečské průkazy; skladování lahví ve stojanech mimo zdroje tepla.",
    ],
    regulations: ["V87", "Z133", "NV101"],
    defaultProbability: 2,
    defaultSeverity: 4,
    applies: (p) => (has(p.activities, "welding", "steel", "rail_track") ? "Svařování nebo řezání kovů." : null),
    keywords: ["svarov", "rezani plamenem", "otevren ohen", "aluminoterm"],
  },
  {
    id: "NB-081",
    name: "Popálení horkými živičnými směsmi",
    category: "fire",
    cause: "Manipulace s horkou asfaltovou směsí a pojivy, ohřev živice.",
    risk: "Popálení kůže, vdechování výparů.",
    measures: [
      "Ochranný oděv, rukavice, obuv s tepelně odolnou podešví.",
      "Vymezení pracovního prostoru finišeru a válců.",
    ],
    regulations: ["NV361", "NV390", "Z133"],
    defaultProbability: 2,
    defaultSeverity: 3,
    applies: (p) => (has(p.activities, "asphalt") || has(p.materials, "asphalt") ? "Práce s živičnými směsmi." : null),
    keywords: ["asfalt", "zivic", "finiser"],
  },
  {
    id: "NB-082",
    name: "Neřízený výbuch při trhacích pracích",
    category: "fire",
    cause: "Selhání náložky, nedodržení bezpečnostní vzdálenosti, rozlet horniny.",
    risk: "Smrtelné úrazy, poškození okolních staveb a sítí.",
    measures: [
      "Technologický postup trhacích prací a povolení OBÚ; střelmistr s oprávněním.",
      "Vyklizení ohroženého prostoru, návěstní signály, seismický monitoring.",
    ],
    regulations: ["Z61", "V55", "NV591"],
    defaultProbability: 1,
    defaultSeverity: 5,
    annex5: "Práce s výbušninami.",
    applies: (p) => (has(p.activities, "blasting") ? "Trhací práce." : null),
    keywords: ["trhac", "odstrel", "vybusnin"],
  },

  // ——— Voda ———
  {
    id: "NB-090",
    name: "Utonutí při práci nad vodou nebo na vodě",
    category: "water",
    cause: "Práce na mostech, lávkách, plavidlech nebo u břehů vodních toků.",
    risk: "Pád do vody a utonutí, podchlazení.",
    measures: [
      "Záchranné vesty a kruhy; záchranný člun při pracích nad tokem.",
      "Zábradlí na lávkách a pracovních plošinách nad vodou.",
      "Sledování průtoků a povodňový plán stavby.",
    ],
    regulations: ["NV591", "NV362", "Z254"],
    defaultProbability: 2,
    defaultSeverity: 5,
    annex5: "Práce nad vodou nebo v její blízkosti s nebezpečím utonutí.",
    applies: (p) => (p.waterProximity || has(p.constructionTypes, "water") ? "Práce u vodního toku nebo nádrže." : null),
    keywords: ["vodni tok", "reka", "potok", "nadrz", "prutok", "povod", "breh"],
  },
  {
    id: "NB-091",
    name: "Zaplavení staveniště při povodni",
    category: "water",
    cause: "Zvýšení průtoku, zúžení průtočného profilu provizorními konstrukcemi.",
    risk: "Ohrožení osob, odplavení materiálu a strojů, poškození konstrukce.",
    measures: [
      "Povodňový plán stavby odsouhlasený správcem toku.",
      "Sledování hlásné povodňové služby; postup vyklizení průtočného profilu.",
    ],
    regulations: ["Z254"],
    defaultProbability: 2,
    defaultSeverity: 4,
    applies: (p) =>
      (p.waterProximity || has(p.constructionTypes, "water")) && num(p.durationWorkingDays) >= 20
        ? "Dlouhodobé práce v inundačním území / u toku."
        : null,
    keywords: ["povoden", "povodn", "inundac", "prutocn"],
  },

  // ——— Organizace staveniště ———
  {
    id: "NB-100",
    name: "Vstup nepovolaných osob na staveniště",
    category: "site",
    cause: "Nedostatečné oplocení, stavba za provozu, pohyb veřejnosti v okolí.",
    risk: "Úraz osob neznalých rizik staveniště (děti, chodci).",
    measures: [
      "Oplocení staveniště výšky min. 1,8 m, uzamykatelné vstupy, bezpečnostní značení.",
      "Bezpečné koridory pro veřejnost; ostraha v době mimo pracovní dobu.",
    ],
    regulations: ["NV591", "NV375"],
    defaultProbability: 3,
    defaultSeverity: 4,
    applies: (p) =>
      p.publicPresence || p.roadTraffic !== "none" ? "Staveniště v kontaktu s veřejností." : "Obecné nebezpečí každého staveniště.",
    keywords: ["oploceni", "verejnost", "chodc", "za provozu"],
  },
  {
    id: "NB-101",
    name: "Uklouznutí, zakopnutí a pád na komunikacích staveniště",
    category: "site",
    cause: "Nerovný, blátivý nebo zledovatělý povrch, neuklizený materiál, nedostatečné osvětlení.",
    risk: "Pád na rovině, zlomeniny, podvrtnutí.",
    measures: [
      "Udržované a zpevněné komunikace staveniště; úklid pracovišť.",
      "Zimní údržba a osvětlení komunikací.",
    ],
    regulations: ["NV591", "NV101"],
    defaultProbability: 4,
    defaultSeverity: 2,
    applies: () => "Obecné nebezpečí každého staveniště.",
    keywords: ["uklouz", "zakopnut", "komunikace staveniste"],
  },
  {
    id: "NB-102",
    name: "Nedostatečné osvětlení při noční práci",
    category: "site",
    cause: "Práce v noci nebo za snížené viditelnosti, oslnění, stíny u strojů.",
    risk: "Zvýšená pravděpodobnost všech úrazových dějů, přehlédnutí osob obsluhou strojů.",
    measures: [
      "Umělé osvětlení pracovišť a komunikací dle NV 591/2006 Sb.",
      "Výstražné oděvy s retroreflexními prvky; osvětlení strojů.",
    ],
    regulations: ["NV591", "NV101"],
    defaultProbability: 3,
    defaultSeverity: 3,
    applies: (p) => (p.nightWork ? "Plánovaná noční práce." : null),
    keywords: ["nocni", "v noci", "osvetlen", "nocni vyluk"],
  },
  {
    id: "NB-103",
    name: "Nekoordinovaná současná činnost více zhotovitelů",
    category: "site",
    cause: "Více zhotovitelů na jednom pracovišti, překrývání prací v čase a prostoru.",
    risk: "Vzájemné ohrožení pracovníků různých firem, neznalost rizik ostatních.",
    measures: [
      "Určení koordinátora BOZP a pravidelné kontrolní dny koordinátora.",
      "Vzájemné předávání informací o rizicích; harmonogram souběžných prací.",
    ],
    regulations: ["Z309", "NV591"],
    defaultProbability: 3,
    defaultSeverity: 3,
    applies: (p) => (num(p.contractorsCount) > 1 ? `${p.contractorsCount} zhotovitelé na staveništi.` : null),
    keywords: ["koordinator", "zhotovitel", "subdodavatel"],
  },
  {
    id: "NB-104",
    name: "Poranění ručním nářadím a řezné rány",
    category: "site",
    cause: "Práce s úhlovými bruskami, pilami, řezáky; manipulace s ostrými hranami výztuže.",
    risk: "Řezné rány, amputace prstů, zasažení očí odlétajícími částicemi.",
    measures: [
      "Nářadí s ochrannými kryty; pravidelné kontroly nářadí.",
      "Ochranné rukavice a brýle; krytky na vyčnívající výztuž.",
    ],
    regulations: ["NV378", "NV390"],
    defaultProbability: 3,
    defaultSeverity: 3,
    applies: () => "Obecné nebezpečí každého staveniště.",
    keywords: ["bruska", "pila", "rezn", "naradi"],
  },
];

export const HAZARDS_BY_ID = new Map(HAZARD_LIBRARY.map((h) => [h.id, h]));
