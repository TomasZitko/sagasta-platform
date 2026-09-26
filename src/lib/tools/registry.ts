import type { ToolMeta } from "./types";

/**
 * Registr nástrojů – čistá metadata (bez serverové logiky), sdílená
 * rozcestníkem, generickou stránkou nástroje i API.
 */

export interface SampleFile {
  name: string;
  text: string;
}

export type ToolWithSample = ToolMeta & { sampleFiles?: Record<string, SampleFile[]> };

const DOC_ACCEPT = ".pdf,.docx,.txt,.md,.csv,.xlsx";

/* ——— Ukázková dokumentace (fiktivní stavba) ——— */

const SAMPLE_TZ = `TECHNICKÁ ZPRÁVA – SO 201 Železniční most v km 23,418
Stavba: Rekonstrukce železničního mostu v km 23,418 trati Praha – Beroun
Investor: Správa železnic, státní organizace
Místo: Karlštejn, k. ú. Karlštejn

Stávající stav: Ocelová nýtovaná konstrukce z roku 1912, rozpětí 24,0 m. Nátěry pravděpodobně obsahují olovo.
Navržené řešení: Nová ŽB spřažená konstrukce se zapuštěnou mostovkou, rozpětí 24,0 m, šířka mostu 5,2 m.
Zastavěná plocha mostu 1 250 m². Beton C30/37 XF2, výztuž B500B.
Založení: nové opěry na mikropilotách délky 12 m. Hladina podzemní vody 1,8 m pod terénem.
Objekty: SO 201, SO 202 Opěrné zdi, PS 01 Přeložka kabelů SŽ.
Postup výstavby: výluka koleje č. 1, doba výstavby 140 pracovních dní, zahájení 03/2027, dokončení 11/2027.
Objem betonu nosné konstrukce 480 m³.`;

const SAMPLE_ZOV = `ZÁSADY ORGANIZACE VÝSTAVBY – Rekonstrukce železničního mostu v km 23,418
Zařízení staveniště bude na pozemku p. č. 512/3 o ploše 1 800 m².
Příjezd ze silnice III/11518, vjezd na staveniště u km 23,300.
Objekty stavby: SO 201 Železniční most, SO 202 Opěrné zdi, SO 203 Úprava koryta, PS 01 Přeložka kabelů SŽ.
Zastavěná plocha mostu 1 320 m².
Doba výstavby 150 pracovních dní, dokončení stavby 12/2027.
Objem betonu nosné konstrukce 480 m³.
Odpady: beton 17 01 01 cca 350 t, železo a ocel 17 04 05 cca 95 t.
Staveništní doprava po silnici III/11518, max. hmotnost 40 t.`;

const SAMPLE_BOZP = `PODKLADY PRO PLÁN BOZP
Stavba: Rekonstrukce železničního mostu v km 23,418
Předpokládaná doba výstavby 140 pracovních dní, max. 28 osob současně.
Práce nad vodou – vodoteč Berounka, práce v kolejišti za provozu sousední koleje.
Objekty: SO 201, SO 202.
Zahájení prací 03/2027.`;

const SAMPLE_TZ_V2 = SAMPLE_TZ.replace("mikropilotách délky 12 m", "velkoprůměrových pilotách délky 14 m")
  .replace("šířka mostu 5,2 m", "šířka mostu 5,6 m")
  .replace("Objekty: SO 201, SO 202 Opěrné zdi, PS 01 Přeložka kabelů SŽ.", "Objekty: SO 201, SO 202 Opěrné zdi, SO 203 Úprava koryta, PS 01 Přeložka kabelů SŽ.")
  .replace("Postup výstavby: výluka koleje č. 1", "Postup výstavby: výluka koleje č. 1 ve dvou etapách, noční výluka obou kolejí pro osazení NK");

const SAMPLE_BOQ = `Kód\tPopis\tMJ\tMnožství\tJ. cena\tCena celkem
131201101\tHloubení jam nezapažených v hornině tř. 3\tm3\t420\t185\t77700
131201101\tHloubení jam nezapažených v hornině tř. 3\tm3\t420\t185\t77700
273321511\tZáklady ze ŽB C30/37\tm3\t156\t4200\t655200
421321128\tMostní NK z betonu C30/37\tm3\t415\t6800\t2822000
421361226\tVýztuž mostní NK B500B\tt\t62\t38000\t2356000
458311131\tVýplň za opěrou ze štěrkodrti\tm3\t0\t950\t0
921111111\tOchranné zábradlí\tm\t52\t\t
966071822\tBourání ocelové NK\tt\t95\t2900\t255000`;

const MEETING_TRANSCRIPT =
  "Novák: potřebujeme mít do konce října upravený výkres volného prostoru pod mostem, Povodí chce doložit průtočný profil.\nDvořáková: to zvládneme do 20. října, pošleme i hydrotechnické posouzení.\nSvoboda: my bychom potřebovali vědět, jestli výluka v listopadu platí. Jinak nestihneme objednat jeřáb.\nNovák: výluka 14.–16. listopadu je potvrzená, písemně pošlu zítra.\nKrál: pozor, na stavbě pořád chybí aktualizovaný plán BOZP, koordinátor to minule vytýkal.\nSvoboda: plán dodáme do pátku.\nDvořáková: otevřená otázka je přeložka kabelů PS 01 – správce se zatím nevyjádřil.\nPříští porada 8. října v 9:00 na stavbě.";

const SAMPLE_LAVKA = `TECHNICKÁ ZPRÁVA – Lávka pro pěší přes Berounku v Radotíně (2019)
Založení: opěry založeny na mikropilotách délky 9 m, hladina podzemní vody 1,2 m pod terénem – během vrtání pažení výpažnicí, čerpání z jímky.
Nosná konstrukce: ocelová příhradová, rozpětí 42 m, šířka 3,5 m.
Postup výstavby: montáž NK z pontonů v období nízkých průtoků, povodňový plán odsouhlasen Povodím Vltavy.`;

const PHOTO_ACCEPT = ".jpg,.jpeg,.png,.webp";

export const TOOLS: ToolWithSample[] = [
  {
    slug: "copilot",
    href: "/copilot",
    n: "",
    title: "Projektový Copilot",
    flow: "Otázka → Odpověď z dokumentů projektu",
    description: "Konverzace nad aktivním projektem a lokální knihovnou dokumentů: co se změnilo, co chybí, kde je co uvedeno – s odkazy na zdroje a rychlými akcemi do nástrojů.",
    category: "project",
    inputs: [],
    usesProject: true,
    worksWithoutAi: true,
    action: "Otevřít Copilot",
  },
  {
    slug: "katalog-nebezpeci",
    href: "/katalog-nebezpeci",
    n: "",
    title: "Katalog nebezpečí",
    flow: "Stavba → Katalog nebezpečí",
    description: "Řízený katalog nebezpečí s hodnocením P×Z, opatřeními a předpisy. Upozorní na chybějící kategorie a povinnosti dle zák. 309/2006 Sb.",
    category: "site",
    inputs: [],
    usesProject: true,
    worksWithoutAi: true,
    action: "Otevřít",
  },
  {
    slug: "extrakce-dat",
    n: "",
    title: "Extrakce dat projektu",
    flow: "PDF dokumentace → Data projektu",
    description: "Z dokumentace vytáhne identifikaci stavby, účastníky, objekty, rozměry, termíny a technologie. Uloží je jako aktivní projekt pro všechny ostatní nástroje.",
    category: "project",
    inputs: [
      { kind: "files", id: "docs", label: "Projektová dokumentace", hint: "TZ, souhrnná zpráva, ZOV, smlouva… (PDF, DOCX, TXT)", required: true, accept: DOC_ACCEPT, max: 20 },
      { kind: "text", id: "notes", label: "Doplňující informace", rows: 3, placeholder: "Např. informace z jednání, které v dokumentaci nejsou." },
    ],
    usesProject: false,
    worksWithoutAi: true,
    action: "Vytěžit data",
    sampleFiles: { docs: [{ name: "TZ_SO201.txt", text: SAMPLE_TZ }, { name: "ZOV.txt", text: SAMPLE_ZOV }] },
  },
  {
    slug: "technicka-zprava",
    n: "",
    title: "Technická zpráva",
    flow: "Data projektu → Technická zpráva",
    description: "Návrh technické zprávy objektu po sekcích. Každá sekce nese stav: nalezeno / odvozeno / chybí, a seznam údajů k doplnění.",
    category: "documents",
    inputs: [
      { kind: "line", id: "object", label: "Objekt", placeholder: "SO 201 Železniční most v km 23,418", required: true },
      { kind: "select", id: "stage", label: "Stupeň dokumentace", options: [
        { value: "DSP", label: "Dokumentace pro povolení stavby" },
        { value: "PDPS", label: "Dokumentace pro provádění stavby" },
        { value: "DUSP", label: "Dokumentace pro společné povolení / DUR" },
      ] },
      { kind: "files", id: "docs", label: "Podklady k objektu", hint: "Průzkumy, výkresy, zadání, výpočty", accept: DOC_ACCEPT, max: 15 },
      { kind: "files", id: "reference", label: "Předchozí podobný projekt (vzor)", hint: "Převezme se struktura a styl – fakta se berou jen z aktuálních podkladů.", accept: DOC_ACCEPT, max: 3 },
      { kind: "text", id: "notes", label: "Poznámky projektanta", rows: 4 },
    ],
    usesProject: true,
    worksWithoutAi: false,
    action: "Vygenerovat TZ",
    sample: { object: "SO 201 Železniční most v km 23,418", stage: "DSP", notes: "Kolej č. 2 zůstává v provozu. Požadavek SŽ: min. rychlost 50 km/h na sousední koleji během výstavby." },
    sampleFiles: { docs: [{ name: "Podklady_SO201.txt", text: SAMPLE_TZ }] },
  },
  {
    slug: "zov",
    n: "",
    title: "Zásady organizace výstavby",
    flow: "Data projektu → ZOV",
    description: "Návrh zásad organizace výstavby ve všech povinných okruzích – doprava, zábory, odpady, bilance zemin, DIO, BOZP, postup výstavby.",
    category: "documents",
    inputs: [
      { kind: "files", id: "docs", label: "Podklady", hint: "TZ, situace, harmonogram, vyjádření správců", accept: DOC_ACCEPT, max: 15 },
      { kind: "text", id: "site", label: "Staveniště a přístup", rows: 3, placeholder: "Plochy ZS, příjezdy, omezení tonáže…" },
      { kind: "text", id: "phases", label: "Etapizace a výluky / uzavírky", rows: 3 },
      { kind: "text", id: "notes", label: "Další požadavky", rows: 3 },
    ],
    usesProject: true,
    worksWithoutAi: false,
    action: "Vygenerovat ZOV",
    sample: {
      site: "ZS na p. č. 512/3 (1 800 m²). Příjezd po III/11518, omezení 40 t. Vjezd u km 23,300.",
      phases: "Etapa 1: výluka k. č. 1 (bourání, opěry). Etapa 2: noční výluka obou kolejí – osazení NK autojeřábem 250 t. Etapa 3: dokončovací práce.",
      notes: "Práce v blízkosti Berounky – povodňový plán. Odpady z bourání ocelové NK s olovnatými nátěry.",
    },
    sampleFiles: { docs: [{ name: "TZ_SO201.txt", text: SAMPLE_TZ }] },
  },
  {
    slug: "technologicky-postup",
    n: "",
    title: "Technologický postup",
    flow: "Činnost → Technologický postup",
    description: "První návrh technologického postupu – příprava, kroky, kontrolní body, stroje, kvalita. Bezpečnost je navázaná na řízenou knihovnu nebezpečí.",
    category: "site",
    inputs: [
      { kind: "line", id: "activity", label: "Činnost", placeholder: "Betonáž mostovky", required: true },
      { kind: "line", id: "object", label: "Objekt", placeholder: "SO 201" },
      { kind: "text", id: "conditions", label: "Podmínky a omezení", rows: 4 },
      { kind: "files", id: "docs", label: "Podklady", accept: DOC_ACCEPT, max: 10 },
    ],
    usesProject: true,
    worksWithoutAi: false,
    action: "Vygenerovat postup",
    sample: {
      activity: "Betonáž spřažené mostovky",
      object: "SO 201",
      conditions: "Beton C30/37 XF2, objem cca 180 m³, betonáž v jednom záběru čerpadlem. Noční výluka sousední koleje. Letní období – ošetřování betonu.",
    },
  },
  {
    slug: "postup-bourani",
    n: "",
    title: "Postup bourání",
    flow: "Bouraná konstrukce → Postup bourání",
    description: "Sled bourání, dočasné zajištění stability, mechanizace, ochrana okolí a třídění odpadů. Rizika navázaná na knihovnu nebezpečí.",
    category: "site",
    inputs: [
      { kind: "line", id: "activity", label: "Bouraná konstrukce", placeholder: "Ocelová nosná konstrukce mostu", required: true },
      { kind: "line", id: "object", label: "Objekt", placeholder: "SO 201" },
      { kind: "text", id: "conditions", label: "Stav konstrukce, okolí a omezení", rows: 5 },
      { kind: "files", id: "docs", label: "Průzkumy a výkresy", accept: DOC_ACCEPT, max: 10 },
    ],
    usesProject: true,
    worksWithoutAi: false,
    action: "Vygenerovat postup bourání",
    sample: {
      activity: "Bourání ocelové nýtované nosné konstrukce",
      object: "SO 201",
      conditions: "Sousední kolej v provozu, elektrizovaná trať 3 kV. Pod mostem Berounka. Nátěry pravděpodobně s olovem. Hmotnost NK cca 95 t, rozpětí 24 m. Demontáž autojeřábem 250 t v noční výluce.",
    },
  },
  {
    slug: "kontrola-konzistence",
    n: "",
    title: "Kontrola konzistence",
    flow: "Všechny dokumenty → Rozpory",
    description: "Porovná dokumenty mezi sebou: rozdílné plochy, objemy, termíny, objekty uvedené jen v části dokumentace, nesoulad materiálů.",
    category: "checks",
    inputs: [
      { kind: "files", id: "docs", label: "Dokumenty ke vzájemné kontrole", hint: "Min. 2 soubory – TZ, ZOV, výkaz, podklady BOZP…", required: true, accept: DOC_ACCEPT, max: 20 },
    ],
    usesProject: false,
    worksWithoutAi: true,
    action: "Zkontrolovat",
    sampleFiles: { docs: [{ name: "TZ_SO201.txt", text: SAMPLE_TZ }, { name: "ZOV.txt", text: SAMPLE_ZOV }, { name: "Podklady_BOZP.txt", text: SAMPLE_BOZP }] },
  },
  {
    slug: "chybejici-informace",
    n: "",
    title: "Detektor chybějících informací",
    flow: "Dokument → Chybějící údaje + otázky",
    description: "Před odevzdáním najde nevyplněná místa, chybějící povinné údaje a vágní formulace. Vygeneruje seznam otázek pro projektanta.",
    category: "checks",
    inputs: [
      { kind: "select", id: "docType", label: "Druh dokumentu", options: [
        { value: "Technická zpráva", label: "Technická zpráva" },
        { value: "Zásady organizace výstavby", label: "Zásady organizace výstavby" },
        { value: "Plán BOZP", label: "Plán BOZP" },
        { value: "Zadávací dokumentace", label: "Zadávací dokumentace" },
        { value: "Jiný dokument", label: "Jiný dokument" },
      ] },
      { kind: "files", id: "docs", label: "Kontrolovaný dokument", accept: DOC_ACCEPT, max: 5 },
      { kind: "text", id: "text", label: "…nebo vložte text", rows: 6 },
    ],
    usesProject: false,
    worksWithoutAi: true,
    action: "Najít chybějící údaje",
    sample: {
      docType: "Technická zpráva",
      text: "TECHNICKÁ ZPRÁVA – SO 102 Propustek v km 4,2\nInvestor: XXX\nZahájení stavby: xx.xx.2027\nZaložení propustku: doplnit dle IGP.\nMateriál: beton C25/30, izolace ???\nOdvodnění bude řešeno vhodným způsobem.\nPostup výstavby: bude upřesněno zhotovitelem.",
    },
  },
  {
    slug: "kontrola-struktury",
    n: "",
    title: "Kontrola požadované struktury",
    flow: "Dokumentace → Kontrola úplnosti dle osnovy",
    description: "Porovná dokumentaci s řízenou databází povinných částí (povolení stavby, TZ, ZOV) a ukáže, co chybí nebo je jen formálně.",
    category: "checks",
    inputs: [
      { kind: "select", id: "structure", label: "Druh dokumentace", options: [
        { value: "permit", label: "Dokumentace pro povolení stavby" },
        { value: "technical_report", label: "Technická zpráva objektu" },
        { value: "zov", label: "Zásady organizace výstavby" },
      ] },
      { kind: "files", id: "docs", label: "Dokumentace", accept: DOC_ACCEPT, max: 30 },
      { kind: "text", id: "text", label: "…nebo vložte obsah / seznam příloh", rows: 6 },
    ],
    usesProject: false,
    worksWithoutAi: true,
    action: "Zkontrolovat strukturu",
    sample: {
      structure: "permit",
      text: "A Průvodní list\nA.1 Identifikační údaje\nA.2 Seznam vstupních podkladů\nB Souhrnná technická zpráva\nB.1 Popis území stavby\nB.2 Celkový popis stavby\nB.3 Připojení na technickou infrastrukturu\nB.4 Dopravní řešení\nB.6 Popis vlivů stavby na životní prostředí\nB.8 Zásady organizace výstavby\nC Situační výkresy\nD Dokumentace objektů – SO 101, SO 201",
    },
  },
  {
    slug: "porovnani-revizi",
    n: "",
    title: "Porovnání revizí",
    flow: "Verze A + Verze B → Co se změnilo",
    description: "Porovná dvě verze dokumentu: přidané, odebrané a změněné pasáže, změny objektů a čísel. AI vyhodnotí technické dopady změn.",
    category: "checks",
    inputs: [
      { kind: "files", id: "before", label: "Původní verze", required: true, accept: DOC_ACCEPT, max: 1 },
      { kind: "files", id: "after", label: "Nová verze", required: true, accept: DOC_ACCEPT, max: 1 },
    ],
    usesProject: false,
    worksWithoutAi: true,
    action: "Porovnat verze",
    sampleFiles: { before: [{ name: "TZ_SO201_v12.txt", text: SAMPLE_TZ }], after: [{ name: "TZ_SO201_v13.txt", text: SAMPLE_TZ_V2 }] },
  },
  {
    slug: "pripominky",
    n: "",
    title: "Registr připomínek",
    flow: "Připomínky klienta → Registr + kontrola vypořádání",
    description: "Rozloží připomínky na jednotlivé požadavky s akcí, dokumentem a prioritou. S novou revizí ověří, které připomínky jsou skutečně vypořádané.",
    category: "office",
    inputs: [
      { kind: "files", id: "comments", label: "Připomínky", accept: DOC_ACCEPT, max: 5 },
      { kind: "text", id: "text", label: "…nebo vložte text připomínek", rows: 6 },
      { kind: "files", id: "revised", label: "Revidovaná dokumentace (volitelné)", hint: "Pro kontrolu, zda byly připomínky zapracovány.", accept: DOC_ACCEPT, max: 10 },
    ],
    usesProject: false,
    worksWithoutAi: false,
    action: "Vytvořit registr",
    sample: {
      text: "Připomínky SŽ k DSP, 12. 5. 2026:\n1. V TZ SO 201 doplnit způsob zajištění sousední koleje během bourání.\n2. Výkres příčného řezu – chybí kóta volného prostoru pod mostem.\n3. Doložit statický výpočet dočasného stavu opěr.\n4. Sjednotit dobu výstavby v TZ a ZOV.\n5. ZOV – doplnit trasy staveništní dopravy a jejich projednání s obcí.",
    },
    sampleFiles: { revised: [{ name: "TZ_SO201_v13.txt", text: SAMPLE_TZ_V2 }, { name: "ZOV.txt", text: SAMPLE_ZOV }] },
  },
  {
    slug: "zapis-z-jednani",
    n: "",
    title: "Zápis z jednání a úkoly",
    flow: "Poznámky / přepis → Zápis + úkoly",
    description: "Z přepisu nahrávky nebo poznámek sestaví oficiální zápis: účastníci, projednané body, rozhodnutí, úkoly s termíny a otevřené otázky.",
    category: "office",
    inputs: [
      { kind: "line", id: "title", label: "Jednání", placeholder: "Kontrolní den č. 5" },
      { kind: "date", id: "date", label: "Datum" },
      { kind: "line", id: "participants", label: "Účastníci (pokud nejsou v přepisu)" },
      { kind: "text", id: "transcript", label: "Přepis nahrávky nebo poznámky", rows: 10, required: true },
      { kind: "files", id: "docs", label: "Přepis jako soubor (volitelné)", accept: ".txt,.docx,.pdf,.md", max: 3 },
    ],
    usesProject: true,
    worksWithoutAi: false,
    action: "Vytvořit zápis",
    sample: {
      title: "Koordinační porada – SO 201",
      date: "2026-09-24",
      participants: "Novák (SŽ), Dvořáková (SAGASTA), Svoboda (zhotovitel), Král (TDS)",
      transcript: MEETING_TRANSCRIPT,
    },
  },
  {
    slug: "email-ukol",
    n: "",
    title: "E-mail → úkol",
    flow: "E-mail → Úkol s prioritou a termínem",
    description: "Z přeposlaného e-mailu pozná požadavky, určí projekt, prioritu, termín a navrhne úkoly i odpověď odesílateli.",
    category: "office",
    inputs: [
      { kind: "text", id: "email", label: "Text e-mailu (včetně hlavičky)", rows: 10, required: true },
      { kind: "line", id: "project", label: "Projekt (pokud není zřejmý)" },
    ],
    usesProject: false,
    worksWithoutAi: false,
    action: "Vytvořit úkoly",
    sample: {
      email:
        "Od: ing. Petr Novák <novak@spravazeleznic.cz>\nKomu: dvorakova@sagasta.cz\nDatum: 24. 9. 2026 14:12\nPředmět: SO 201 – zábradlí a odvodnění\n\nDobrý den,\npo jednání s majetkovou správou žádáme o změnu mostního zábradlí na typ se svislou výplní (dle vzorového listu). Prosím o posouzení dopadu na cenu a termín do 4. 10.\nZároveň nám chybí podrobnost odvodnění izolace – výkres D.2.1.5. Pokud to půjde, pošlete i ten.\nDěkuji\nPetr Novák\nPříloha: Vzorovy_list_zabradli.pdf",
    },
  },
  {
    slug: "rfi",
    n: "",
    title: "Technický dotaz (RFI)",
    flow: "Problém → Formální RFI",
    description: "Z krátkého popisu problému připraví formální dotaz: kontext, očíslované otázky, dopad při nevyřešení, odkazy a termín odpovědi.",
    category: "office",
    inputs: [
      { kind: "line", id: "recipient", label: "Adresát", placeholder: "Správa železnic, OŘ Praha – ing. Novák" },
      { kind: "line", id: "reference", label: "Značka / věc (volitelné)" },
      { kind: "date", id: "due", label: "Požadovaný termín odpovědi" },
      { kind: "text", id: "notes", label: "Vaše poznámky", rows: 6, required: true, placeholder: "Klidně stručně a neformálně – nástroj je převede do formálního textu." },
      { kind: "files", id: "docs", label: "Související dokumenty", accept: DOC_ACCEPT, max: 5 },
      { kind: "line", id: "signature", label: "Podpis", placeholder: "Ing. Jana Dvořáková, hlavní inženýr projektu" },
    ],
    usesProject: true,
    worksWithoutAi: false,
    action: "Připravit RFI",
    sample: {
      recipient: "Správa železnic, OŘ Praha – ing. Petr Novák",
      due: "2026-10-10",
      notes: "nevíme přesně kde vede kabel SŽ u opěry 2, v podkladech je na 2 místech jinak (situace vs. vyjádření správce). potřebujeme vytyčení nebo sondu, jinak nemůžeme navrhnout mikropiloty. bez toho posun termínu DSP.",
      signature: "Ing. Jana Dvořáková, hlavní inženýr projektu",
    },
  },
  {
    slug: "odpoved-uradu",
    n: "",
    title: "Odpověď úřadu",
    flow: "Výzva úřadu → Vyjádření bod po bodu",
    description: "K výzvě stavebního úřadu nebo dotčeného orgánu připraví strukturované vyjádření s odkazy na části dokumentace – v úředním stylu.",
    category: "office",
    inputs: [
      { kind: "line", id: "recipient", label: "Adresát", placeholder: "Městský úřad Beroun, odbor výstavby" },
      { kind: "line", id: "reference", label: "Značka / věc (volitelné)" },
      { kind: "date", id: "due", label: "Požadovaný termín odpovědi" },
      { kind: "text", id: "notes", label: "Vaše poznámky", rows: 6, required: true, placeholder: "Klidně stručně a neformálně – nástroj je převede do formálního textu." },
      { kind: "files", id: "docs", label: "Související dokumenty", accept: DOC_ACCEPT, max: 5 },
      { kind: "line", id: "signature", label: "Podpis", placeholder: "Ing. Jana Dvořáková, hlavní inženýr projektu" },
    ],
    usesProject: true,
    worksWithoutAi: false,
    action: "Připravit vyjádření",
    sample: {
      recipient: "Městský úřad Beroun, odbor výstavby a územního plánování",
      reference: "MBE/12345/2026",
      due: "2026-10-20",
      notes: "úřad chce: 1) doplnit vyjádření Povodí Vltavy – máme, pošleme v příloze (vyjádření z 2.9.2026), 2) upřesnit dočasný zábor p.č. 512/3 – je v ZOV kap. z6, 1800 m2 na 8 měsíců, 3) doložit souhlas vlastníka pozemku – jednáme, doložíme do 15.10.",
      signature: "Ing. Jana Dvořáková, zástupce stavebníka na základě plné moci",
    },
  },
  {
    slug: "korespondence",
    n: "",
    title: "Formální odpověď",
    flow: "Poznámky → Formální dopis",
    description: "Z hrubých poznámek („nejde to, protože…“) připraví formální odpověď klientovi nebo zhotoviteli: stanovisko, důvody a požadované rozhodnutí.",
    category: "office",
    inputs: [
      { kind: "line", id: "recipient", label: "Adresát", placeholder: "Stavby Alfa a.s. – ing. Svoboda" },
      { kind: "line", id: "reference", label: "Značka / věc (volitelné)" },
      { kind: "date", id: "due", label: "Požadovaný termín odpovědi" },
      { kind: "text", id: "notes", label: "Vaše poznámky", rows: 6, required: true, placeholder: "Klidně stručně a neformálně – nástroj je převede do formálního textu." },
      { kind: "files", id: "docs", label: "Související dokumenty", accept: DOC_ACCEPT, max: 5 },
      { kind: "line", id: "signature", label: "Podpis", placeholder: "Ing. Jana Dvořáková, hlavní inženýr projektu" },
    ],
    usesProject: true,
    worksWithoutAi: false,
    action: "Připravit dopis",
    sample: {
      recipient: "Stavby Alfa a.s. – ing. Martin Svoboda, stavbyvedoucí",
      notes: "posun opěry o 0,5 m jak chtějí nejde – kabel SŽ v cestě a změnila by se statika mikropilot. buď přeložka kabelu (správce musí souhlasit, cca 3 měsíce) nebo nechat podle PD. potřebujeme rozhodnutí investora do konce týdne.",
      signature: "Ing. Jana Dvořáková, hlavní inženýr projektu",
    },
  },
  {
    slug: "porovnani-nabidek",
    n: "",
    title: "Porovnání nabídek",
    flow: "Nabídky A, B, C → Srovnávací tabulka",
    description: "Z nabídek vytáhne cenu, termín, technické řešení, výluky z plnění, odchylky od zadání a chybějící údaje do jedné srovnatelné tabulky. Nevybírá vítěze.",
    category: "office",
    inputs: [
      { kind: "files", id: "bids", label: "Nabídky", hint: "Každý soubor = jedna nabídka", required: true, accept: DOC_ACCEPT, max: 8, labelEach: "Nabídka" },
      { kind: "text", id: "criteria", label: "Zadání a hodnoticí kritéria", rows: 4 },
    ],
    usesProject: false,
    worksWithoutAi: true,
    action: "Porovnat nabídky",
    sample: { criteria: "Nabídková cena bez DPH (70 %), doba realizace (30 %). Požadovaná doba max. 150 pracovních dní. Záruka min. 60 měsíců. Požadována NK z betonu C30/37." },
    sampleFiles: {
      bids: [
        { name: "Nabidka_Stavby_Alfa.txt", text: "Nabídka – Stavby Alfa a.s.\nNabídková cena: 48 750 000 Kč bez DPH\nDoba realizace: 140 pracovních dní\nZáruka: 60 měsíců\nTechnické řešení: NK z betonu C30/37 dle PD, osazení autojeřábem 250 t.\nCena nezahrnuje: přeložku kabelů PS 01." },
        { name: "Nabidka_Mosty_Beta.txt", text: "Nabídka – Mosty Beta s.r.o.\nCelková cena 45 200 000 Kč bez DPH.\nTermín dokončení 170 pracovních dní od předání staveniště.\nZáruční doba 72 měsíců.\nNavrhujeme alternativu: prefabrikovanou NK z předpjatých nosníků, beton C35/45.\nPředpoklad: výluka obou kolejí 5 dní." },
        { name: "Nabidka_Gama.txt", text: "Gama Construction a.s.\nCena: 51 900 000 Kč bez DPH, DPH 21 %.\nRealizace 135 pracovních dní.\nZáruka 60 měsíců.\nPlnění dle PD bez odchylek." },
      ],
    },
  },
  {
    slug: "kontrola-vykazu",
    n: "",
    title: "Kontrola výkazu výměr",
    flow: "Výkaz výměr + dokumentace → Nesrovnalosti",
    description: "Najde duplicitní položky, nulová množství, chybné součiny a jednotky. S dokumentací porovná množství a chybějící položky.",
    category: "checks",
    inputs: [
      { kind: "files", id: "boq", label: "Výkaz výměr / rozpočet", hint: "XLSX, CSV nebo PDF", accept: ".xlsx,.csv,.pdf,.txt", max: 1 },
      { kind: "text", id: "boqText", label: "…nebo vložte tabulku (z Excelu)", rows: 6 },
      { kind: "files", id: "docs", label: "Projektová dokumentace pro porovnání", accept: DOC_ACCEPT, max: 10 },
    ],
    usesProject: false,
    worksWithoutAi: true,
    action: "Zkontrolovat výkaz",
    sample: { boqText: SAMPLE_BOQ },
    sampleFiles: { docs: [{ name: "TZ_SO201.txt", text: SAMPLE_TZ }] },
  },
  {
    slug: "pdf-excel",
    n: "",
    title: "PDF → Excel",
    flow: "Tabulky v PDF → Strukturovaný Excel",
    description: "Najde tabulky v PDF (položky, množství, jednotky, ceny, ID), převede je do čistých sloupců a stáhne jako XLSX.",
    category: "project",
    inputs: [
      { kind: "files", id: "docs", label: "PDF s tabulkami", required: true, accept: ".pdf,.txt,.docx", max: 5 },
      { kind: "text", id: "instructions", label: "Co přesně vytáhnout (volitelné)", rows: 2, placeholder: "Např. jen soupis prací SO 201, sloupce kód/popis/MJ/množství." },
    ],
    usesProject: false,
    worksWithoutAi: false,
    action: "Převést do Excelu",
    sampleFiles: { docs: [{ name: "Soupis_praci.txt", text: SAMPLE_BOQ.replace(/\t/g, "    ") }] },
  },
  {
    slug: "stary-novy-projekt",
    n: "",
    title: "Starý projekt → nový projekt",
    flow: "Předchozí dokument + nová fakta → adaptovaný návrh",
    description: "Převezme strukturu a styl dokumentu z podobného projektu a nahradí místo, investora, objekty, rozměry, technologie a termíny. Ukáže, kolik lze převzít.",
    category: "documents",
    inputs: [
      { kind: "files", id: "old", label: "Dokument ze starého projektu", required: true, accept: DOC_ACCEPT, max: 3 },
      { kind: "text", id: "newFacts", label: "Údaje nového projektu", rows: 6, placeholder: "Název, místo, investor, objekty, rozměry, technologie, termíny… (doplňují aktivní projekt)" },
    ],
    usesProject: true,
    worksWithoutAi: true,
    action: "Adaptovat dokument",
    sample: {
      newFacts:
        "Nová stavba: Rekonstrukce mostu ev. č. 3-117 přes Litavku v Berouně. Investor: Krajská správa a údržba silnic Středočeského kraje. Silniční most, jedno pole, rozpětí 18,0 m, šířka 9,5 m. Založení plošné na skalním podloží. Objekty SO 101 Most, SO 102 Úprava komunikace. Doba výstavby 120 pracovních dní, zahájení 04/2028. Úplná uzavírka silnice II/116.",
    },
    sampleFiles: { old: [{ name: "TZ_SO201_Karlstejn.txt", text: SAMPLE_TZ }] },
  },
  {
    slug: "vyhledavani",
    n: "",
    title: "Vyhledávání v projektech",
    flow: "Dotaz → Pasáže z předchozích projektů",
    description: "Fulltextově prohledá dokumenty předchozích projektů (i z lokální knihovny) a vrátí nejrelevantnější pasáže. AI z nich sestaví odpověď s odkazy.",
    category: "project",
    inputs: [
      { kind: "line", id: "query", label: "Co hledáte", placeholder: "Založení na mikropilotách u podzemní vody", required: true },
      { kind: "files", id: "docs", label: "Prohledávané dokumenty", hint: "Nahrajte nebo vyberte z knihovny (⌘/Ctrl+L)", required: true, accept: DOC_ACCEPT, max: 30 },
    ],
    usesProject: false,
    worksWithoutAi: true,
    action: "Hledat",
    sample: { query: "založení mikropiloty podzemní voda" },
    sampleFiles: { docs: [{ name: "TZ_SO201_Karlstejn.txt", text: SAMPLE_TZ }, { name: "ZOV_Karlstejn.txt", text: SAMPLE_ZOV }, { name: "BOZP_Karlstejn.txt", text: SAMPLE_BOZP }, { name: "TZ_Lavka_Radotin.txt", text: SAMPLE_LAVKA }] },
  },
  {
    slug: "kontrolni-den",
    n: "",
    title: "Zápis z kontrolního dne",
    flow: "Fotky + hlasová poznámka → Zápis z KD",
    description: "Z fotografií a poznámek sestaví zápis z kontrolního dne: postup prací, BOZP, kvalita, zjištění s nápravnými opatřeními a popsaná fotodokumentace.",
    category: "site",
    inputs: [
      { kind: "files", id: "photos", label: "Fotografie ze stavby", hint: "Lze i vložit ze schránky (⌘/Ctrl+V). Fotky se před odesláním zmenší.", accept: PHOTO_ACCEPT, max: 20 },
      { kind: "text", id: "notes", label: "Poznámky / přepis hlasové poznámky", rows: 6 },
      { kind: "date", id: "date", label: "Datum" },
      { kind: "line", id: "object", label: "Objekt / úsek", placeholder: "SO 201" },
      { kind: "line", id: "weather", label: "Počasí", placeholder: "polojasno, 14 °C" },
      { kind: "line", id: "participants", label: "Účastníci" },
    ],
    usesProject: true,
    worksWithoutAi: false,
    action: "Sestavit zápis",
    sample: {
      date: "2026-09-24",
      object: "SO 201 Železniční most",
      weather: "zataženo, 12 °C",
      participants: "Král (TDS), Svoboda (zhotovitel), Dvořáková (AD)",
      notes:
        "Výkop pro opěru 2 hotový, pažení štětovnicemi, čerpání vody běží. U hrany výkopu chybí zábradlí v délce cca 6 m na straně ke koleji. Skládka výztuže blokuje příjezd k opěře 1. Mikropiloty opěry 1 dokončeny, zkoušky únosnosti čekají na protokol. Oplocení staveniště u vjezdu poškozené. Příští KD 1. 10.",
    },
  },
  {
    slug: "foto-problemy",
    n: "",
    title: "Fotografie → možné problémy",
    flow: "Fotky ze stavby → Možné nedostatky",
    description: "Projde fotografie a označí možné problémy BOZP, organizace, kvality a životního prostředí – vždy jako „možný problém k ověření“, navázané na knihovnu nebezpečí.",
    category: "site",
    inputs: [
      { kind: "files", id: "photos", label: "Fotografie", required: true, hint: "JPG, PNG, WEBP · lze vložit ze schránky", accept: PHOTO_ACCEPT, max: 30 },
      { kind: "line", id: "context", label: "Kontext (volitelné)", placeholder: "Výkop opěry 2, práce u koleje" },
    ],
    usesProject: false,
    worksWithoutAi: false,
    action: "Analyzovat fotky",
  },
  {
    slug: "soupis-vad",
    n: "",
    title: "Soupis vad a nedodělků",
    flow: "Fotky + poznámky → Punch list",
    description: "Z prohlídky sestaví soupis vad a nedodělků po objektech s místem, odstraněním, odpovědností, prioritou a termínem. Export do Excelu.",
    category: "site",
    inputs: [
      { kind: "text", id: "notes", label: "Poznámky z prohlídky", rows: 8, placeholder: "SO 201\n- dokončit zábradlí na levé římse\n- oprava nátěru…" },
      { kind: "files", id: "photos", label: "Fotografie", accept: PHOTO_ACCEPT, max: 30 },
      { kind: "line", id: "deadline", label: "Obecný termín odstranění", placeholder: "do 30 dnů od převzetí" },
    ],
    usesProject: true,
    worksWithoutAi: true,
    action: "Sestavit soupis",
    sample: {
      deadline: "do 15. 11. 2027",
      notes:
        "SO 201 Železniční most\n- dokončit zábradlí na levé římse v délce 8 m\n- oprava poškozeného nátěru zábradlí u opěry 1\n- odstranit zbytky bednění pod NK\n- doplnit označení mostu (evidenční číslo)\nSO 202 Opěrné zdi\n- vyspravit trhliny v římse OZ2\n- vyčistit odvodňovací žlab\nPS 01\n- doložit protokol o převzetí přeložky kabelů",
    },
  },
  {
    slug: "predavaci-dokumentace",
    n: "",
    title: "Předávací dokumentace",
    flow: "Doklady → Kontrola úplnosti k předání",
    description: "Porovná předávané doklady s kontrolním seznamem pro daný druh stavby (DSPS, zaměření, zkoušky, revize, odpady, prohlídka mostu…) a označí, co chybí.",
    category: "site",
    inputs: [
      { kind: "files", id: "docs", label: "Předávané doklady", accept: DOC_ACCEPT, max: 50 },
      { kind: "text", id: "list", label: "…nebo seznam dokladů", rows: 6 },
    ],
    usesProject: true,
    worksWithoutAi: true,
    action: "Zkontrolovat doklady",
    sample: {
      list: "Dokumentace skutečného provedení SO 201, SO 202\nGeodetické zaměření skutečného provedení\nStavební deník č. 1–3\nProtokoly o zkouškách betonu\nProhlášení o vlastnostech – výztuž, beton, izolace\nZápis o předání a převzetí díla (koncept)\nEvidence odpadů – vážní lístky",
    },
  },
  {
    slug: "technicka-specifikace",
    n: "",
    title: "Technická specifikace",
    flow: "Materiál + požadavky → Technická specifikace",
    description: "Výrobkově neutrální specifikace materiálu či výrobku: vlastnosti, zabudování, kontrola kvality, přejímka a doklady.",
    category: "documents",
    inputs: [
      { kind: "line", id: "product", label: "Materiál / výrobek", placeholder: "Hydroizolace mostovky z asfaltových pásů", required: true },
      { kind: "line", id: "element", label: "Konstrukce / objekt", placeholder: "SO 201 – mostovka" },
      { kind: "text", id: "requirements", label: "Požadované vlastnosti a podmínky", rows: 5 },
      { kind: "files", id: "docs", label: "Podklady", accept: DOC_ACCEPT, max: 10 },
    ],
    usesProject: true,
    worksWithoutAi: false,
    action: "Vygenerovat specifikaci",
    sample: {
      product: "Izolační systém mostovky z modifikovaných asfaltových pásů",
      element: "SO 201 – mostovka železničního mostu",
      requirements: "Plnoplošně natavovaný pás tl. min. 5 mm, odolnost proti prorážení, pod štěrkové lože. Ochranná vrstva z litého asfaltu. Provádění při teplotě podkladu min. +5 °C, vlhkost betonu max. 4 %. Přídržnost k podkladu min. 0,4 MPa.",
    },
  },
  {
    slug: "dotcene-organy",
    n: "",
    title: "Dotčené orgány a podklady",
    flow: "Druh stavby + místo → Kontrolní seznam",
    description: "Sestaví seznam dotčených orgánů, správců a podkladů pro povolení podle druhu stavby a podmínek (voda, dráha, komunikace, bourání, azbest, kácení…).",
    category: "project",
    inputs: [
      { kind: "select", id: "stage", label: "Fáze", options: [
        { value: "povolení stavby", label: "Povolení stavby" },
        { value: "provádění stavby", label: "Provádění stavby (uzavírky, výluky)" },
        { value: "kolaudace / užívání", label: "Kolaudace / užívání" },
      ] },
      { kind: "text", id: "notes", label: "Popis stavby a zvláštní podmínky", rows: 5, placeholder: "Kácení dřevin, památková zóna, zábor ZPF, blízkost lesa…" },
    ],
    usesProject: true,
    worksWithoutAi: true,
    action: "Sestavit seznam",
    sample: { stage: "povolení stavby", notes: "Rekonstrukce železničního mostu přes Berounku, výluka koleje, bourání ocelové NK s olovnatými nátěry, kácení 3 stromů na předmostí, dočasný zábor ZPF pro zařízení staveniště." },
  },
  {
    slug: "ukoly-z-jednani",
    n: "",
    title: "Úkoly z jednání",
    flow: "Přepis jednání → Úkoly po osobách",
    description: "Z přepisu vytáhne jen úkoly – i nevyslovené závazky („pošlu zítra“) – rozdělí je podle odpovědných osob, s termíny a závislostmi. Export do Excelu.",
    category: "office",
    inputs: [
      { kind: "date", id: "date", label: "Datum jednání" },
      { kind: "text", id: "transcript", label: "Přepis nebo poznámky", rows: 10, required: true },
      { kind: "files", id: "docs", label: "Přepis jako soubor (volitelné)", accept: ".txt,.docx,.pdf,.md", max: 3 },
    ],
    usesProject: true,
    worksWithoutAi: true,
    action: "Vytáhnout úkoly",
    sample: { date: "2026-09-24", transcript: MEETING_TRANSCRIPT },
  },
  {
    slug: "pojmenovani-souboru",
    n: "",
    title: "Pojmenování a třídění souborů",
    flow: "Hromada souborů → Jednotné názvy + ZIP",
    description: "Rozpozná typ dokumentu, objekt a revizi, navrhne názvy podle konvence, najde duplicity, starší revize a cizí soubory. Stáhne přejmenované soubory jako ZIP.",
    category: "project",
    inputs: [
      { kind: "files", id: "docs", label: "Soubory", required: true, accept: `${DOC_ACCEPT},${PHOTO_ACCEPT}`, max: 50 },
      { kind: "line", id: "project", label: "Zkratka projektu", placeholder: "MostKarlstejn" },
      { kind: "line", id: "pattern", label: "Konvence názvů", placeholder: "{rok}_{projekt}_{objekt}_{typ}_v{rev}", hint: "Proměnné: {rok} {projekt} {objekt} {typ} {rev}" },
    ],
    usesProject: true,
    worksWithoutAi: true,
    action: "Navrhnout názvy",
    sample: { project: "MostKarlstejn" },
    sampleFiles: {
      docs: [
        { name: "tz final FINAL.txt", text: SAMPLE_TZ },
        { name: "TZ_SO201_v12.txt", text: SAMPLE_TZ },
        { name: "TZ_SO201_v13.txt", text: SAMPLE_TZ_V2 },
        { name: "zov.txt", text: SAMPLE_ZOV },
        { name: "kopie zov.txt", text: SAMPLE_ZOV },
        { name: "rozpocet SO201.csv", text: SAMPLE_BOQ.replace(/\t/g, ";") },
      ],
    },
  },
];


/** Pořadí nástrojů podle kategorií; čísla se přidělují automaticky. */
const ORDER = [
  "extrakce-dat", "dotcene-organy", "vyhledavani", "pojmenovani-souboru", "pdf-excel",
  "technicka-zprava", "zov", "technicka-specifikace", "stary-novy-projekt",
  "kontrola-konzistence", "chybejici-informace", "kontrola-struktury", "porovnani-revizi", "kontrola-vykazu",
  "katalog-nebezpeci", "technologicky-postup", "postup-bourani", "kontrolni-den", "foto-problemy", "soupis-vad", "predavaci-dokumentace",
  "zapis-z-jednani", "ukoly-z-jednani", "email-ukol", "rfi", "korespondence", "odpoved-uradu", "pripominky", "porovnani-nabidek",
  "copilot",
];
TOOLS.sort((a, b) => ORDER.indexOf(a.slug) - ORDER.indexOf(b.slug));
TOOLS.forEach((t, i) => (t.n = String(i + 1).padStart(2, "0")));

export const TOOLS_BY_SLUG = new Map(TOOLS.map((t) => [t.slug, t]));
