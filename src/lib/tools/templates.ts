/**
 * Osnovy dokumentů a pravidla struktury.
 *
 * Osnovy jsou interní šablony SAGASTA odvozené z vyhlášky o dokumentaci staveb
 * (131/2024 Sb.). Číslování oddílů se mezi druhy dokumentace liší – kontrola
 * proto páruje podle názvu a klíčových slov, ne podle čísla. Garant šablon
 * ověřuje osnovy proti aktuálnímu znění předpisu.
 */

export interface OutlineSection {
  id: string;
  title: string;
  /** Co má sekce obsahovat – vodítko pro AI i pro kontrolu úplnosti. */
  guidance: string;
  /** Klíčová slova (bez diakritiky, malými písmeny) pro nalezení v textu. */
  keywords: string[];
  required: boolean;
}

export const TECHNICAL_REPORT: OutlineSection[] = [
  { id: "tz1", title: "Identifikační údaje objektu", guidance: "Název stavby a objektu (SO/PS), místo, katastrální území, stupeň dokumentace, investor, zpracovatel, odpovědný projektant.", keywords: ["identifikacni udaje", "nazev stavby", "investor", "zpracovatel"], required: true },
  { id: "tz2", title: "Stávající stav a účel objektu", guidance: "Popis stávajícího stavu, důvod stavby, účel a funkce objektu.", keywords: ["stavajici stav", "ucel", "popis objektu"], required: true },
  { id: "tz3", title: "Umístění a vztah k okolí", guidance: "Poloha, staničení, křížení, vztah k okolním objektům a komunikacím.", keywords: ["umisteni", "poloha", "staniceni", "situovani"], required: true },
  { id: "tz4", title: "Navržené technické řešení", guidance: "Hlavní koncepce řešení, rozsah prací, varianty a důvod volby.", keywords: ["technicke reseni", "navrzene reseni", "koncepce"], required: true },
  { id: "tz5", title: "Konstrukční a statické řešení", guidance: "Nosný systém, rozpětí, zatížení, statické posouzení (odkaz).", keywords: ["konstrukcni", "staticke", "nosna konstrukce", "nosny system"], required: true },
  { id: "tz6", title: "Zakládání a geotechnické podmínky", guidance: "Základové poměry, způsob založení, hladina podzemní vody, odkaz na průzkum.", keywords: ["zaklad", "geotechn", "podlozi", "hpv", "podzemni voda"], required: true },
  { id: "tz7", title: "Materiály a technické parametry", guidance: "Třídy betonu, oceli, prostředí, hlavní rozměry, plochy a objemy.", keywords: ["material", "beton c", "trida", "parametr", "rozmer"], required: true },
  { id: "tz8", title: "Odvodnění a izolace", guidance: "Odvodnění objektu a okolí, hydroizolace, ochrana konstrukcí.", keywords: ["odvodneni", "izolace", "hydroizol"], required: false },
  { id: "tz9", title: "Postup výstavby", guidance: "Etapizace, výluky/uzavírky, technologické přestávky, dočasné stavy.", keywords: ["postup vystavby", "etap", "harmonogram", "postup prac"], required: true },
  { id: "tz10", title: "Napojení na sítě a související objekty", guidance: "Přeložky a ochrana sítí, návaznost na další SO/PS.", keywords: ["inzenyrske site", "napojeni", "preloz", "souvisejici objekt"], required: false },
  { id: "tz11", title: "Vliv na okolí a životní prostředí", guidance: "Hluk, prach, vibrace, odpady, ochrana vod a zeleně.", keywords: ["zivotni prostredi", "vliv na okoli", "hluk", "odpad"], required: false },
  { id: "tz12", title: "Bezpečnost a ochrana zdraví", guidance: "Rizikové činnosti, hlavní opatření, odkaz na plán BOZP.", keywords: ["bezpecnost", "bozp", "ochrana zdravi"], required: true },
  { id: "tz13", title: "Údržba, kontroly a zkoušky", guidance: "Kontrolní a zkušební plán, prohlídky, požadavky na údržbu.", keywords: ["udrzba", "zkousk", "kontrol", "prohlidk"], required: false },
  { id: "tz14", title: "Seznam podkladů", guidance: "Průzkumy, zaměření, normy, předchozí stupně dokumentace, vyjádření.", keywords: ["podklad", "vstupni podklady", "seznam podkladu"], required: true },
];

export const ZOV: OutlineSection[] = [
  { id: "z1", title: "Potřeby a spotřeby médií a hmot, jejich zajištění", guidance: "Voda, elektřina, rozhodující materiály – zdroje a způsob zajištění.", keywords: ["media", "spotreb", "elektrick energ", "voda"], required: true },
  { id: "z2", title: "Odvodnění staveniště", guidance: "Povrchové vody, čerpání z výkopů, vypouštění.", keywords: ["odvodneni stavenist", "cerpani"], required: true },
  { id: "z3", title: "Napojení staveniště na dopravní a technickou infrastrukturu", guidance: "Příjezdy, vjezdy, trasy staveništní dopravy, přípojky.", keywords: ["napojeni stavenist", "prijezd", "vjezd", "staveništní doprav", "stavenistni doprav"], required: true },
  { id: "z4", title: "Vliv provádění stavby na okolní stavby a pozemky", guidance: "Pasportizace, dočasné užívání pozemků, omezení provozu.", keywords: ["vliv provadeni", "okolni stavby", "pasport"], required: true },
  { id: "z5", title: "Ochrana okolí staveniště, asanace, demolice, kácení", guidance: "Oplocení, ochrana zeleně, bourání, kácení dřevin.", keywords: ["ochrana okoli", "kaceni", "demolic", "asanac", "oploceni"], required: true },
  { id: "z6", title: "Dočasné a trvalé zábory", guidance: "Plochy záboru, zařízení staveniště, deponie, doba záboru.", keywords: ["zabor", "zarizeni stavenist"], required: true },
  { id: "z7", title: "Bezbariérové obchozí trasy", guidance: "Náhradní trasy pro pěší a osoby s omezenou schopností pohybu.", keywords: ["bezbarier", "obchozi tras"], required: false },
  { id: "z8", title: "Odpady a emise při výstavbě", guidance: "Druhy a množství odpadů (katalog), nakládání, emise prachu a hluku.", keywords: ["odpad", "emis"], required: true },
  { id: "z9", title: "Bilance zemních prací a deponie", guidance: "Výkopy, násypy, přebytek/deficit, mezideponie, trvalé skládky.", keywords: ["bilance zemnich", "deponi", "zemni prace"], required: true },
  { id: "z10", title: "Ochrana životního prostředí při výstavbě", guidance: "Ochrana vod, půdy, ovzduší, zeleně a živočichů během výstavby.", keywords: ["zivotniho prostredi", "ochrana vod", "ochrana zelene"], required: true },
  { id: "z11", title: "Zásady bezpečnosti a ochrany zdraví při práci", guidance: "Rizikové práce, koordinátor BOZP, oznámení, plán BOZP.", keywords: ["bezpecnost", "bozp", "koordinator"], required: true },
  { id: "z12", title: "Dopravně inženýrská opatření", guidance: "Uzavírky, objížďky, přechodné dopravní značení, výluky.", keywords: ["dopravne inzenyr", "uzavir", "objizd", "dio", "vyluk"], required: true },
  { id: "z13", title: "Speciální podmínky pro provádění stavby", guidance: "Provoz za výluky, práce u vody, noční práce, omezení hmotnosti.", keywords: ["specialni podminky", "zvlastni podminky"], required: false },
  { id: "z14", title: "Postup výstavby a rozhodující termíny", guidance: "Etapy, fáze, výluky, rozhodující dílčí termíny, doba výstavby.", keywords: ["postup vystavby", "termin", "harmonogram", "etap"], required: true },
];

export const TECH_PROCEDURE: OutlineSection[] = [
  { id: "t1", title: "Rozsah a předmět postupu", guidance: "Čeho se postup týká, objekt, rozsah, návaznosti.", keywords: [], required: true },
  { id: "t2", title: "Podklady a předpisy", guidance: "Projektová dokumentace, TKP/normy obecně, výrobní dokumentace.", keywords: [], required: true },
  { id: "t3", title: "Příprava a předpoklady zahájení", guidance: "Převzetí pracoviště, povolení, vytyčení, kontrola podkladu.", keywords: [], required: true },
  { id: "t4", title: "Organizace pracoviště", guidance: "Zařízení, skládky, přístupy, ohrožený prostor.", keywords: [], required: true },
  { id: "t5", title: "Materiály", guidance: "Specifikace, přejímka, skladování.", keywords: [], required: true },
  { id: "t6", title: "Stroje, nářadí a pracovníci", guidance: "Mechanizace, kvalifikace, obsazení čet.", keywords: [], required: true },
  { id: "t7", title: "Pracovní postup", guidance: "Očíslovaný sled kroků včetně technologických přestávek.", keywords: [], required: true },
  { id: "t8", title: "Kontrola kvality a zkoušky", guidance: "Kontrolní body, zkoušky, přejímky, záznamy.", keywords: [], required: true },
  { id: "t9", title: "Bezpečnost práce", guidance: "Rizika a opatření vázaná na jednotlivé kroky.", keywords: [], required: true },
  { id: "t10", title: "Ochrana životního prostředí a odpady", guidance: "Úniky, prach, hluk, odpady.", keywords: [], required: true },
  { id: "t11", title: "Dokončení a předání", guidance: "Úklid, dokumentace skutečného provedení, předání.", keywords: [], required: true },
];

export const DEMOLITION_PROCEDURE: OutlineSection[] = [
  { id: "d1", title: "Popis bourané konstrukce", guidance: "Konstrukční systém, materiály, stav, rozměry, nebezpečné látky.", keywords: [], required: true },
  { id: "d2", title: "Průzkumy a předpoklady", guidance: "Stavebně-technický průzkum, azbest, olovnaté nátěry, sítě, odpojení médií.", keywords: [], required: true },
  { id: "d3", title: "Zajištění stability a dočasné podepření", guidance: "Dočasné stavy, podpěry, statické zajištění, kritické fáze.", keywords: [], required: true },
  { id: "d4", title: "Postup bourání", guidance: "Sled bourání po prvcích/fázích, směr, rozsah jednotlivých kroků.", keywords: [], required: true },
  { id: "d5", title: "Mechanizace a technologie", guidance: "Stroje, nůžky, kladiva, řezání, jeřáby, zdvihy.", keywords: [], required: true },
  { id: "d6", title: "Organizace staveniště a ochrana okolí", guidance: "Ohrožený prostor, ochrana provozu, sousedních objektů, sítí.", keywords: [], required: true },
  { id: "d7", title: "Odpady a jejich třídění", guidance: "Druhy odpadů, třídění, recyklace, nebezpečné odpady, doklady.", keywords: [], required: true },
  { id: "d8", title: "Bezpečnost práce", guidance: "Rizika a opatření pro jednotlivé fáze.", keywords: [], required: true },
  { id: "d9", title: "Kontroly a ukončení", guidance: "Kontrolní body, zápisy, předání vybouraného stavu.", keywords: [], required: true },
];

/* ——— Kontrola struktury dokumentace ——— */

export interface Requirement {
  code: string;
  title: string;
  keywords: string[];
  required: boolean;
}

export interface DocStructure {
  id: string;
  label: string;
  note: string;
  requirements: Requirement[];
}

export const DOC_STRUCTURES: DocStructure[] = [
  {
    id: "permit",
    label: "Dokumentace pro povolení stavby",
    note: "Hlavní části a okruhy souhrnné technické zprávy dle vyhlášky o dokumentaci staveb (131/2024 Sb.). Číslování oddílů ověřte proti aktuálnímu znění.",
    requirements: [
      { code: "A", title: "Průvodní list / průvodní zpráva", keywords: ["pruvodni list", "pruvodni zprava"], required: true },
      { code: "A", title: "Identifikační údaje (stavba, stavebník, zpracovatel)", keywords: ["identifikacni udaje"], required: true },
      { code: "A", title: "Seznam vstupních podkladů", keywords: ["vstupni podklad", "seznam podkladu"], required: true },
      { code: "A", title: "Členění stavby na objekty a zařízení", keywords: ["cleneni stavby", "objekty a technicka", "seznam objektu"], required: true },
      { code: "B", title: "Souhrnná technická zpráva", keywords: ["souhrnna technicka zprava"], required: true },
      { code: "B", title: "Popis území stavby", keywords: ["popis uzemi"], required: true },
      { code: "B", title: "Celkový popis stavby", keywords: ["celkovy popis stavby"], required: true },
      { code: "B", title: "Připojení na technickou infrastrukturu", keywords: ["pripojeni na technickou", "technickou infrastrukturu"], required: true },
      { code: "B", title: "Dopravní řešení", keywords: ["dopravni reseni"], required: true },
      { code: "B", title: "Řešení vegetace a terénních úprav", keywords: ["reseni vegetace", "terennich uprav"], required: true },
      { code: "B", title: "Vlivy stavby na životní prostředí a jeho ochrana", keywords: ["zivotni prostredi"], required: true },
      { code: "B", title: "Ochrana obyvatelstva", keywords: ["ochrana obyvatelstva"], required: true },
      { code: "B", title: "Zásady organizace výstavby", keywords: ["zasady organizace vystavby", "organizace vystavby"], required: true },
      { code: "B", title: "Celkové vodohospodářské řešení", keywords: ["vodohospodarske reseni"], required: false },
      { code: "C", title: "Situační výkresy", keywords: ["situacni vykres", "situace stavby", "koordinacni situac"], required: true },
      { code: "D", title: "Dokumentace objektů a technických zařízení", keywords: ["dokumentace objektu", "dokumentace stavebnich objektu", "so 1", "so 0"], required: true },
      { code: "E", title: "Dokladová část", keywords: ["dokladova cast", "doklady", "vyjadreni dotcenych"], required: true },
    ],
  },
  {
    id: "technical_report",
    label: "Technická zpráva objektu (SO)",
    note: "Interní osnova SAGASTA pro technickou zprávu stavebního objektu.",
    requirements: TECHNICAL_REPORT.map((s, i) => ({ code: `${i + 1}`, title: s.title, keywords: s.keywords, required: s.required })),
  },
  {
    id: "zov",
    label: "Zásady organizace výstavby",
    note: "Okruhy ZOV dle vyhlášky o dokumentaci staveb; interní osnova SAGASTA.",
    requirements: ZOV.map((s, i) => ({ code: `${String.fromCharCode(97 + i)})`, title: s.title, keywords: s.keywords, required: s.required })),
  },
];

export const outlineForPrompt = (sections: OutlineSection[]) =>
  sections.map((s) => `- [${s.id}] ${s.title}${s.required ? "" : " (volitelné)"}: ${s.guidance}`).join("\n");
