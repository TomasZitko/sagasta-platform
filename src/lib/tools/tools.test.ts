import { describe, expect, it } from "vitest";
import { z } from "zod";
import { sampleIntake } from "@/lib/project/intake";
import { checkBoq, parseBoq, textToRows } from "./analyzers/boq";
import { compareRevisions } from "./analyzers/revision";
import { compareLabelledValues, compareObjectCodes, extractQuantities, findPlaceholders, parseCzNumber } from "./analyzers/text";
import { TOOLS } from "./registry";
import type { Report } from "./report";
import { ToolContext } from "./server/context";
import { reportToDocx, reportToXlsx } from "./server/export";
import { processFiles } from "./server/files";
import { HANDLERS } from "./server/handlers";
import { detectDays, detectPrice, splitComments } from "./server/handlers/office";
import type { UploadedFile } from "./types";

/* ——— pomocné ——— */

const toUpload = (name: string, text: string): UploadedFile => ({ name, data: Buffer.from(text, "utf8").toString("base64"), size: text.length });

function sampleRequest(slug: string) {
  const tool = TOOLS.find((t) => t.slug === slug)!;
  const files: Record<string, UploadedFile[]> = {};
  for (const [k, list] of Object.entries(tool.sampleFiles ?? {})) files[k] = list.map((f) => toUpload(f.name, f.text));
  return { values: { ...(tool.sample ?? {}) }, files, project: tool.usesProject ? sampleIntake() : null };
}

/** Vyrobí platná data podle JSON schématu (pro stub AI). */
function fake(schema: any, root: any = schema): any {
  if (schema.$ref) return fake(root.$defs?.[schema.$ref.split("/").pop()] ?? {}, root);
  if (schema.enum) return schema.enum[0];
  if (schema.anyOf) return fake(schema.anyOf[0], root);
  switch (schema.type) {
    case "object":
      return Object.fromEntries(Object.entries(schema.properties ?? {}).map(([k, v]) => [k, fake(v, root)]));
    case "array":
      return [fake(schema.items, root), fake(schema.items, root)];
    case "string":
      return "Ukázkový text 1 250 m²";
    case "integer":
      return 3;
    case "number":
      return 12.5;
    case "boolean":
      return true;
    default:
      return null;
  }
}

function stubClient() {
  const calls: any[] = [];
  const client = {
    beta: {
      messages: {
        stream: (params: any) => {
          calls.push(params);
          const data = fake(params.output_config.format.schema);
          return { finalMessage: async () => ({ stop_reason: "end_turn", model: "claude-opus-5", content: [{ type: "text", text: JSON.stringify(data) }] }) };
        },
      },
    },
  };
  return { client: client as any, calls };
}

async function run(slug: string, ai: boolean): Promise<{ report: Report; calls: any[] }> {
  const req = sampleRequest(slug);
  const { client, calls } = stubClient();
  const ctx = new ToolContext({ values: req.values, docs: await processFiles(req.files), project: req.project, useAi: ai, client: ai ? client : undefined });
  return { report: await HANDLERS[slug](ctx), calls };
}

/* ——— analyzátory ——— */

describe("analyzátory textu", () => {
  it("čte česká čísla", () => {
    expect(parseCzNumber("1 250,5")).toBe(1250.5);
    expect(parseCzNumber("1.250,5")).toBe(1250.5);
    expect(parseCzNumber("480")).toBe(480);
  });

  it("najde veličiny s popiskem", () => {
    const q = extractQuantities("Zastavěná plocha mostu 1 250 m². Objem betonu 480 m³.");
    expect(q.map((x) => [x.value, x.unit])).toEqual([[1250, "m²"], [480, "m³"]]);
    expect(q[0].label).toContain("plocha");
  });

  it("najde rozpor hodnot mezi dokumenty", () => {
    const c = compareLabelledValues([
      { name: "TZ", text: "Zastavěná plocha mostu 1 250 m²." },
      { name: "ZOV", text: "Zastavěná plocha mostu 1 320 m²." },
    ]);
    expect(c).toHaveLength(1);
    expect(c[0].values.map((v) => v.value)).toEqual([1250, 1320]);
  });

  it("porovná objekty SO/PS", () => {
    const c = compareObjectCodes([
      { name: "A", text: "SO 201, SO-202, PS 01" },
      { name: "B", text: "SO 201" },
    ]);
    expect(c.find((x) => x.code === "SO 202")?.missingIn).toEqual(["B"]);
  });

  it("najde zástupné texty", () => {
    const p = findPlaceholders("Investor: XXX\nZahájení xx.xx.2027, izolace ??? – doplnit");
    expect(p.map((x) => x.kind)).toEqual(expect.arrayContaining(["Zástupný text „XXX“", "Otazníky „???“", "Poznámka „doplnit“", "Nevyplněné datum"]));
  });
});

describe("výkaz výměr", () => {
  const rows = textToRows(TOOLS.find((t) => t.slug === "kontrola-vykazu")!.sample!.boqText);
  const { items } = parseBoq(rows);

  it("rozpozná položky", () => expect(items).toHaveLength(8));

  it("najde duplicitu, nulu, chybějící cenu a chybný součin", () => {
    const titles = checkBoq(items).map((i) => i.title);
    expect(titles).toContain("Duplicitní položka");
    expect(titles).toContain("Nulové množství");
    // 95 × 2 900 = 275 500, uvedeno 255 000
    expect(titles).toContain("Nesouhlasí součin množství × jednotková cena");
  });
});

describe("revize", () => {
  it("najde změněné pasáže, nový objekt a změnu čísla", () => {
    const d = compareRevisions("Šířka mostu 5,2 m.\n\nObjekty: SO 201.", "Šířka mostu 5,6 m.\n\nObjekty: SO 201, SO 203.");
    expect(d.objectsAdded).toEqual(["SO 203"]);
    expect(d.numberChanges[0]).toMatchObject({ before: "5,2 m", after: "5,6 m" });
    expect(d.modified.length + d.added.length).toBeGreaterThan(0);
  });
});

describe("kancelář – deterministické části", () => {
  it("rozdělí připomínky na body", () => expect(splitComments("Úvod\n1. První\n2. Druhá\npokračování\n3. Třetí")).toEqual(["První", "Druhá pokračování", "Třetí"]));
  it("najde cenu a dobu v nabídce", () => {
    expect(detectPrice("Nabídková cena: 48 750 000 Kč bez DPH")).toBe(48_750_000);
    expect(detectDays("Doba realizace: 140 pracovních dní")).toBe(140);
  });
});

/* ——— všechny nástroje ——— */

const slugs = Object.keys(HANDLERS);

describe("registr", () => {
  it("každý nástroj v registru (kromě vlastních stránek) má handler a naopak", () => {
    const generic = TOOLS.filter((t) => !t.href).map((t) => t.slug).sort();
    expect(generic).toEqual([...slugs].sort());
    expect(TOOLS).toHaveLength(16);
  });
});

describe.each(slugs)("nástroj %s", (slug) => {
  const tool = TOOLS.find((t) => t.slug === slug)!;

  it("běží bez AI na ukázkových datech", async () => {
    const { report } = await run(slug, false);
    expect(report.tool).toBe(slug);
    expect(report.mode).toBe("rules");
    expect(report.sections.length).toBeGreaterThan(0);
    if (!tool.worksWithoutAi) expect(report.notes.join(" ")).toMatch(/AI/);
  });

  it("běží s AI (stub) a výstup mapuje do reportu", async () => {
    const { report, calls } = await run(slug, true);
    expect(calls).toHaveLength(1);
    expect(calls[0].model).toBe("claude-opus-5");
    expect(calls[0].fallbacks).toBe("default");
    expect(calls[0].output_config.format.type).toBe("json_schema");
    expect(calls[0].system[1].cache_control).toEqual({ type: "ephemeral" });
    expect(report.mode).toBe("ai");
    expect(report.sections.length).toBeGreaterThan(0);
  });

  it("exportuje DOCX a XLSX", async () => {
    const { report } = await run(slug, true);
    const docx = await reportToDocx(report);
    const xlsx = await reportToXlsx(report);
    expect(docx.subarray(0, 2).toString()).toBe("PK");
    expect(xlsx.subarray(0, 2).toString()).toBe("PK");
  });
});

describe("konkrétní výsledky bez AI", () => {
  it("kontrola konzistence najde rozdílnou plochu a SO 203", async () => {
    const { report } = await run("kontrola-konzistence", false);
    const titles = report.sections[0].findings!.map((f) => f.title).join(" | ");
    expect(titles).toMatch(/plocha/i);
    expect(titles).toContain("SO 203");
    expect(titles).toContain("Dokončení stavby: různé termíny");
  });

  it("detektor chybějících informací najde XXX a datum", async () => {
    const { report } = await run("chybejici-informace", false);
    const f = report.sections[0].findings!;
    expect(f.filter((x) => x.severity === "error").length).toBeGreaterThanOrEqual(3);
  });

  it("kontrola struktury najde chybějící dokladovou část a vegetaci", async () => {
    const { report } = await run("kontrola-struktury", false);
    const rows = report.sections[0].table!.rows;
    expect(rows.find((r) => r[1].startsWith("Dokladová"))?.[2]).toContain("Chybí");
    expect(rows.find((r) => r[1].startsWith("Řešení vegetace"))?.[2]).toContain("Chybí");
    expect(rows.find((r) => r[1].startsWith("Dopravní řešení"))?.[2]).toContain("Obsaženo");
  });

  it("porovnání nabídek určí nejnižší cenu a překročení doby", async () => {
    const { report } = await run("porovnani-nabidek", false);
    expect(String(report.stats[1].value)).toContain("45");
    expect(report.sections[1].findings!.some((f) => f.title.includes("170"))).toBe(true);
  });

  it("extrakce dat vrátí projekt s investorem a dobou výstavby", async () => {
    const { report } = await run("extrakce-dat", false);
    const p = report.project as any;
    expect(p.investor).toContain("Správa železnic");
    expect(p.durationWorkingDays).toBe(140);
  });

  it("technologický postup naváže nebezpečí z knihovny", async () => {
    const { report } = await run("technologicky-postup", false);
    expect(report.sections.find((s) => s.id === "hazards")?.bullets?.join(" ")).toMatch(/NB-060/);
  });
});

describe("zod schémata jsou kompatibilní se strukturovaným výstupem", () => {
  it("žádné schéma nepoužívá záznamy s volnými klíči", async () => {
    const { calls } = await Promise.all(slugs.map((s) => run(s, true))).then((r) => ({ calls: r.flatMap((x) => x.calls) }));
    for (const c of calls) {
      const json = JSON.stringify(c.output_config.format.schema);
      expect(json).not.toMatch(/"additionalProperties":\{/);
    }
    expect(z).toBeDefined();
  });
});

describe("tolerantní oprava výstupu AI", async () => {
  const { repair, parseLenient } = await import("./lenient");
  const S = z.object({
    items: z.array(z.object({ hazardId: z.enum(["NB-001", "NB-002"]), priority: z.enum(["vysoká", "střední", "nízká"]), n: z.number().int() })),
    tags: z.array(z.enum(["a", "b"])),
    status: z.enum(["ok", "inferred", "missing"]),
    note: z.string(),
  });

  it("vyřadí položku s ID mimo číselník, opraví diakritiku, doplní chybějící pole", () => {
    const out = parseLenient(
      S,
      JSON.stringify({
        items: [
          { hazardId: "NB-999", priority: "vysoká", n: 1 },
          { hazardId: "NB-002", priority: "Vysoka", n: "3,6" },
        ],
        tags: ["a", "zzz"],
        status: "unknown-value",
      }),
    );
    expect(out.items).toEqual([{ hazardId: "NB-002", priority: "vysoká", n: 4 }]);
    expect(out.tags).toEqual(["a"]);
    expect(out.status).toBe("inferred");
    expect(out.note).toBe("");
  });

  it("neplatná priorita v položce nevyřadí položku, jen použije výchozí", () => {
    const r = repair(S, { items: [{ hazardId: "NB-001", priority: "urgentní", n: 1 }], tags: [], status: "ok", note: "" }) as any;
    expect(r.items[0].priority).toBe("střední");
  });
});

describe("režim bez AI – kvalita", () => {
  it("porovnání revizí rozliší jednotlivé změněné řádky", async () => {
    const { report } = await run("porovnani-revizi", false);
    expect(Number(report.stats[0].value)).toBeGreaterThanOrEqual(3);
    expect(report.sections.find((s) => s.id === "objects")?.bullets).toContain("Přidán SO 203");
  });

  it("generátor TZ předvyplní sekce z podkladů", async () => {
    const { report } = await run("technicka-zprava", false);
    const zakladani = report.sections.find((s) => s.id === "tz6")!;
    expect(zakladani.status).toBe("inferred");
    expect(zakladani.body).toContain("mikropilotách");
    expect(report.sections.find((s) => s.id === "tz1")!.body).toContain("Správa železnic");
  });

  it("porovnání nabídek najde výluku z plnění a alternativu", async () => {
    const { report } = await run("porovnani-nabidek", false);
    const titles = report.sections[1].findings!.map((f) => `${f.title} ${f.detail ?? ""}`).join(" | ");
    expect(titles).toMatch(/Stavby Alfa a\.s\.: výluka z plnění přeložku kabelů/);
    expect(titles).toMatch(/Mosty Beta s\.r\.o\.: odchylka/);
  });
});

describe("PDF rozložení", async () => {
  const { layoutRows } = await import("./server/files");
  const { tableBlocks } = await import("./server/handlers/project");
  const item = (str: string, x: number, y: number) => ({ str, transform: [10, 0, 0, 10, x, y], width: str.length * 5, height: 10 });

  it("složí buňky do řádků a sloupců a najde tabulku", () => {
    const rows = layoutRows([
      item("Kód", 50, 700), item("Popis", 150, 700), item("MJ", 350, 700),
      item("131201101", 50, 685), item("Hloubení", 150, 685), item("jam", 195, 685), item("m3", 350, 685),
      item("421321128", 50, 670), item("Mostní NK", 150, 670), item("m3", 350, 670),
    ]);
    expect(rows[1]).toEqual(["131201101", "Hloubení jam", "m3"]);
    const t = tableBlocks([["Nadpis"], ...rows]);
    expect(t).toHaveLength(1);
    expect(t[0].columns).toEqual(["Kód", "Popis", "MJ"]);
    expect(t[0].rows).toHaveLength(2);
  });
});

describe("PDF rozložení – mezery jako hranice sloupců", async () => {
  const { layoutRows } = await import("./server/files");
  it("široká prázdná položka odděluje buňky", () => {
    const it = (str: string, x: number, w: number) => ({ str, transform: [12, 0, 0, 12, x, 700], width: w, height: 12 });
    expect(layoutRows([it("Kód", 26, 22), it(" ", 48, 99), it("Popis", 122, 28), it(" ", 150, 78), it("MJ", 209, 12)])[0]).toEqual(["Kód", "Popis", "MJ"]);
  });
});
