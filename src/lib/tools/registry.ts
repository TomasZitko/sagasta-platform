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

export const TOOLS: ToolWithSample[] = [
  {
    slug: "katalog-nebezpeci",
    href: "/katalog-nebezpeci",
    n: "01",
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
    n: "02",
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
    n: "03",
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
    n: "04",
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
    n: "05",
    title: "Technologický postup / postup bourání",
    flow: "Činnost → Technologický postup",
    description: "První návrh technologického postupu nebo postupu bourání – kroky, kontrolní body, stroje, odpady. Bezpečnost je navázaná na řízenou knihovnu nebezpečí.",
    category: "site",
    inputs: [
      { kind: "select", id: "mode", label: "Typ dokumentu", options: [
        { value: "tech", label: "Technologický postup" },
        { value: "demolition", label: "Postup bourání" },
      ] },
      { kind: "line", id: "activity", label: "Činnost", placeholder: "Betonáž mostovky / Bourání ocelové NK", required: true },
      { kind: "line", id: "object", label: "Objekt", placeholder: "SO 201" },
      { kind: "text", id: "conditions", label: "Podmínky a omezení", rows: 4 },
      { kind: "files", id: "docs", label: "Podklady", accept: DOC_ACCEPT, max: 10 },
    ],
    usesProject: true,
    worksWithoutAi: false,
    action: "Vygenerovat postup",
    sample: {
      mode: "demolition",
      activity: "Bourání ocelové nýtované nosné konstrukce",
      object: "SO 201",
      conditions: "Sousední kolej v provozu, elektrizovaná trať 3 kV. Pod mostem Berounka. Nátěry pravděpodobně s olovem. Hmotnost NK cca 95 t, rozpětí 24 m. Demontáž autojeřábem 250 t v noční výluce.",
    },
  },
  {
    slug: "kontrola-konzistence",
    n: "06",
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
    n: "07",
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
    n: "08",
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
    n: "09",
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
    n: "10",
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
    n: "11",
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
      transcript:
        "Novák: potřebujeme mít do konce října upravený výkres volného prostoru pod mostem, Povodí chce doložit průtočný profil.\nDvořáková: to zvládneme do 20. října, pošleme i hydrotechnické posouzení.\nSvoboda: my bychom potřebovali vědět, jestli výluka v listopadu platí. Jinak nestihneme objednat jeřáb.\nNovák: výluka 14.–16. listopadu je potvrzená, písemně pošlu zítra.\nKrál: pozor, na stavbě pořád chybí aktualizovaný plán BOZP, koordinátor to minule vytýkal.\nSvoboda: plán dodáme do pátku.\nDvořáková: otevřená otázka je přeložka kabelů PS 01 – správce se zatím nevyjádřil.\nPříští porada 8. října v 9:00 na stavbě.",
    },
  },
  {
    slug: "email-ukol",
    n: "12",
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
    slug: "korespondence",
    n: "13",
    title: "Korespondence a RFI",
    flow: "Poznámky → Formální dopis / RFI",
    description: "Z hrubých poznámek připraví dotaz na upřesnění (RFI), formální odpověď klientovi nebo vyjádření pro úřad – ve firemním stylu, s odkazy a termínem.",
    category: "office",
    inputs: [
      { kind: "select", id: "mode", label: "Typ", options: [
        { value: "rfi", label: "Technický dotaz (RFI)" },
        { value: "reply", label: "Odpověď klientovi / zhotoviteli" },
        { value: "authority", label: "Odpověď úřadu / dotčenému orgánu" },
      ] },
      { kind: "line", id: "recipient", label: "Adresát", placeholder: "Správa železnic, OŘ Praha – ing. Novák" },
      { kind: "line", id: "reference", label: "Značka / věc (volitelné)" },
      { kind: "date", id: "due", label: "Požadovaný termín odpovědi" },
      { kind: "text", id: "notes", label: "Vaše poznámky", rows: 6, required: true, placeholder: "Klidně stručně a neformálně – nástroj je převede do formálního textu." },
      { kind: "files", id: "docs", label: "Související dokumenty (např. výzva úřadu)", accept: DOC_ACCEPT, max: 5 },
      { kind: "line", id: "signature", label: "Podpis", placeholder: "Ing. Jana Dvořáková, hlavní inženýr projektu" },
    ],
    usesProject: true,
    worksWithoutAi: false,
    action: "Připravit text",
    sample: {
      mode: "rfi",
      recipient: "Správa železnic, OŘ Praha – ing. Petr Novák",
      due: "2026-10-10",
      notes: "nevíme přesně kde vede kabel SŽ u opěry 2, v podkladech je na 2 místech jinak (situace vs. vyjádření správce). potřebujeme vytyčení nebo sondu, jinak nemůžeme navrhnout mikropiloty. bez toho posun termínu DSP.",
      signature: "Ing. Jana Dvořáková, hlavní inženýr projektu",
    },
  },
  {
    slug: "porovnani-nabidek",
    n: "14",
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
    n: "15",
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
    n: "16",
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
];

export const TOOLS_BY_SLUG = new Map(TOOLS.map((t) => [t.slug, t]));
