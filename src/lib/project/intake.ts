import { z } from "zod";

/**
 * Jednotný vstupní formulář projektu (Project Intake).
 *
 * Jeden záznam → mnoho dokumentů. Katalog nebezpečí je první nástroj, který
 * z něj čte; Technická zpráva, ZOV a další generátory budou číst stejná data.
 */

export const CONSTRUCTION_TYPES = [
  { id: "railway", label: "Železniční stavba" },
  { id: "road", label: "Pozemní komunikace" },
  { id: "bridge", label: "Most / lávka" },
  { id: "building", label: "Pozemní stavba" },
  { id: "water", label: "Vodohospodářská stavba" },
  { id: "underground", label: "Podzemní stavba / tunel" },
  { id: "utilities", label: "Inženýrské sítě" },
] as const;

export const WORK_ACTIVITIES = [
  { id: "earthworks", label: "Zemní práce" },
  { id: "concrete", label: "Betonáž, bednění" },
  { id: "steel", label: "Montáž ocelových konstrukcí" },
  { id: "precast", label: "Montáž prefabrikátů" },
  { id: "prestressing", label: "Předpínání" },
  { id: "welding", label: "Svařování, práce s ohněm" },
  { id: "asphalt", label: "Pokládka živičných vrstev" },
  { id: "piling", label: "Pilotáž, štětovnice" },
  { id: "drilling", label: "Vrtání, kotvení" },
  { id: "blasting", label: "Trhací práce" },
  { id: "tunneling", label: "Ražba" },
  { id: "coatings", label: "Nátěry, chemické látky" },
  { id: "rail_track", label: "Práce na železničním svršku" },
  { id: "electrical", label: "Elektromontáže" },
] as const;

export const MACHINERY = [
  { id: "excavator", label: "Rypadla, nakladače" },
  { id: "crane", label: "Jeřáby (autojeřáb, věžový)" },
  { id: "mewp", label: "Pracovní plošiny" },
  { id: "trucks", label: "Nákladní doprava" },
  { id: "pile_rig", label: "Vrtná / beranicí souprava" },
  { id: "rail_machines", label: "Železniční mechanizace" },
  { id: "compactors", label: "Hutnicí technika, válce" },
  { id: "concrete_pump", label: "Čerpadlo betonu" },
  { id: "demolition_tools", label: "Bourací kladiva, nůžky" },
] as const;

export const MATERIALS = [
  { id: "concrete", label: "Beton, cement" },
  { id: "steel", label: "Ocel, výztuž" },
  { id: "asphalt", label: "Asfalt, živice" },
  { id: "timber", label: "Dřevo" },
  { id: "asbestos", label: "Azbest (podezření)" },
  { id: "contaminated_soil", label: "Kontaminovaná zemina" },
  { id: "chemicals", label: "Chemické přípravky" },
] as const;

type Ids<T extends readonly { id: string }[]> = T[number]["id"];
const idEnum = <T extends readonly { id: string }[]>(list: T) =>
  z.enum(list.map((i) => i.id) as [Ids<T>, ...Ids<T>[]]);

export const ProjectIntakeSchema = z.object({
  projectName: z.string().trim().min(1, "Zadejte název stavby"),
  location: z.string().trim().default(""),
  investor: z.string().trim().default(""),
  constructionTypes: z.array(idEnum(CONSTRUCTION_TYPES)).default([]),
  activities: z.array(idEnum(WORK_ACTIVITIES)).default([]),
  machinery: z.array(idEnum(MACHINERY)).default([]),
  materials: z.array(idEnum(MATERIALS)).default([]),

  /** Maximální výška práce nad terénem / nad volnou hloubkou [m]. */
  maxWorkHeightM: z.number().min(0).max(500).nullable().default(null),
  /** Maximální hloubka výkopu [m]. */
  maxExcavationDepthM: z.number().min(0).max(200).nullable().default(null),
  groundwater: z.boolean().default(false),

  demolition: z.boolean().default(false),
  /** Stavba za provozu – veřejnost, uživatelé objektu. */
  publicPresence: z.boolean().default(false),

  railwayProximity: z.enum(["none", "adjacent", "on_track"]).default("none"),
  railwayElectrified: z.boolean().default(false),
  roadTraffic: z.enum(["none", "adjacent", "partial_closure", "full_closure"]).default("none"),
  overheadPowerLines: z.boolean().default(false),
  undergroundUtilities: z.boolean().default(false),
  waterProximity: z.boolean().default(false),
  confinedSpaces: z.boolean().default(false),
  nightWork: z.boolean().default(false),
  neighbouringBuildings: z.boolean().default(false),

  /** Plánovaná doba výstavby [pracovní dny]. */
  durationWorkingDays: z.number().int().min(0).max(5000).nullable().default(null),
  /** Nejvyšší počet osob současně na staveništi. */
  peakWorkers: z.number().int().min(0).max(5000).nullable().default(null),
  contractorsCount: z.number().int().min(0).max(200).nullable().default(null),

  /** Volný popis stavby a technologie. */
  description: z.string().default(""),
  /** Text vložený z projektové dokumentace (TZ, ZOV, výkresy). */
  documentText: z.string().max(400_000).default(""),
});

export type ProjectIntake = z.infer<typeof ProjectIntakeSchema>;

export const emptyIntake = (): ProjectIntake => ProjectIntakeSchema.parse({ projectName: "—" });

/** Ukázkový projekt pro prezentaci nástroje. */
export const sampleIntake = (): ProjectIntake =>
  ProjectIntakeSchema.parse({
    projectName: "Rekonstrukce železničního mostu v km 23,418 trati Praha – Beroun",
    location: "Karlštejn, Středočeský kraj",
    investor: "Správa železnic, státní organizace",
    constructionTypes: ["railway", "bridge", "water"],
    activities: ["earthworks", "concrete", "precast", "welding", "rail_track", "piling"],
    machinery: ["excavator", "crane", "trucks", "pile_rig", "rail_machines", "concrete_pump", "demolition_tools"],
    materials: ["concrete", "steel", "asphalt"],
    maxWorkHeightM: 8.5,
    maxExcavationDepthM: 4.2,
    groundwater: true,
    demolition: true,
    publicPresence: false,
    railwayProximity: "on_track",
    railwayElectrified: true,
    roadTraffic: "adjacent",
    overheadPowerLines: false,
    undergroundUtilities: true,
    waterProximity: true,
    confinedSpaces: false,
    nightWork: true,
    neighbouringBuildings: false,
    durationWorkingDays: 140,
    peakWorkers: 28,
    contractorsCount: 4,
    description:
      "Náhrada stávající ocelové nosné konstrukce (plnostěnné nýtované, pravděpodobně s nátěry obsahujícími olovo) " +
      "novou ŽB spřaženou konstrukcí se zapuštěnou mostovkou. Bourání opěr po úroveň základové spáry, nové opěry na " +
      "mikropilotách. Výluka jedné koleje, druhá kolej v provozu. Pod mostem vodoteč Berounka – dočasné zúžení " +
      "průtočného profilu pomocnou lávkou. Osazení nosné konstrukce autojeřábem 250 t v noční výluce.",
  });
