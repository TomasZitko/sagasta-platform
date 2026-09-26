import { describe, expect, it } from "vitest";
import { ProjectIntakeSchema, sampleIntake } from "@/lib/project/intake";
import { AiOutputSchema, mergeAiOutput, type AiOutput } from "./ai";
import { catalogueToDocx } from "./docx";
import { buildRuleCatalogue, checkCoverage, evaluateObligations, matchRules } from "./engine";
import { HAZARD_LIBRARY } from "./library";
import { riskBand, riskScore } from "./risk";

const intake = (over: Record<string, unknown> = {}) => ProjectIntakeSchema.parse({ projectName: "Test", ...over });
const ids = (list: { hazardId: string }[]) => list.map((e) => e.hazardId);

describe("knihovna", () => {
  it("má unikátní ID a platné výchozí hodnoty", () => {
    const set = new Set(HAZARD_LIBRARY.map((h) => h.id));
    expect(set.size).toBe(HAZARD_LIBRARY.length);
    for (const h of HAZARD_LIBRARY) {
      expect(h.measures.length).toBeGreaterThan(0);
      expect(h.regulations.length).toBeGreaterThan(0);
    }
  });
});

describe("hodnocení rizika", () => {
  it("počítá R = P × Z a pásma", () => {
    expect(riskScore(3, 5)).toBe(15);
    expect(riskBand(15)).toBe("critical");
    expect(riskBand(10)).toBe("high");
    expect(riskBand(5)).toBe("moderate");
    expect(riskBand(4)).toBe("low");
    expect(riskScore(9, -1)).toBe(5); // ořez na 1–5
  });
});

describe("pravidla", () => {
  it("prázdná stavba obsahuje jen obecná nebezpečí staveniště", () => {
    expect(ids(matchRules(intake())).sort()).toEqual(["NB-100", "NB-101", "NB-104"]);
  });

  it("výška 1,5 m zakládá pád z výšky, 1,4 m ne", () => {
    expect(ids(matchRules(intake({ maxWorkHeightM: 1.5 })))).toContain("NB-001");
    expect(ids(matchRules(intake({ maxWorkHeightM: 1.4 })))).not.toContain("NB-001");
  });

  it("zemní práce bez hloubky jsou označeny k ověření", () => {
    const m = matchRules(intake({ activities: ["earthworks"] })).find((r) => r.hazardId === "NB-010");
    expect(m?.uncertain).toBe(true);
    const cat = buildRuleCatalogue(intake({ activities: ["earthworks"] }));
    expect(cat.entries.find((e) => e.hazardId === "NB-010")?.confidence).toBe("missing_info");
  });

  it("elektrizovaná trať v kolejišti přidá střet s vozidlem i trakci", () => {
    const r = ids(matchRules(intake({ railwayProximity: "on_track", railwayElectrified: true })));
    expect(r).toEqual(expect.arrayContaining(["NB-040", "NB-041"]));
  });

  it("příloha 5 u výšky platí až nad 10 m", () => {
    const low = buildRuleCatalogue(intake({ maxWorkHeightM: 8 })).entries.find((e) => e.hazardId === "NB-001");
    const high = buildRuleCatalogue(intake({ maxWorkHeightM: 12 })).entries.find((e) => e.hazardId === "NB-001");
    expect(low?.annex5).toBeNull();
    expect(high?.annex5).toMatch(/10 m/);
  });

  it("katalog je seřazen podle rizika sestupně", () => {
    const scores = buildRuleCatalogue(sampleIntake()).entries.map((e) => e.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });
});

describe("kontrola pokrytí", () => {
  it("upozorní na železnici v textu, když chybí ve formuláři i katalogu", () => {
    const p = intake({ description: "Oprava propustku pod tratí, práce ve výluce koleje." });
    const cat = buildRuleCatalogue(p);
    const f = cat.coverage.find((c) => c.title.includes("železniční"));
    expect(f?.severity).toBe("error");
    expect(f?.detail).toContain("výluce"); // úryvek zachovává diakritiku
  });

  it("hlásí nesoulad, když katalog nebezpečí má, ale formulář údaj ne", () => {
    const p = intake({ constructionTypes: ["railway"], description: "Práce v koleji za provozu." });
    const f = checkCoverage(p, buildRuleCatalogue(p).entries);
    expect(f.find((x) => x.title.startsWith("Nesoulad vstupů"))).toBeTruthy();
  });
});

describe("povinnosti 309/2006 Sb.", () => {
  it("ukázkový projekt vyžaduje koordinátora, oznámení i plán", () => {
    const p = sampleIntake();
    const o = evaluateObligations(p, buildRuleCatalogue(p).entries);
    expect(o.coordinatorRequired).toBe(true);
    expect(o.notificationRequired).toBe(true);
    expect(o.planRequired).toBe(true);
  });

  it("bez údajů vrací neznámý stav místo NE", () => {
    const o = evaluateObligations(intake(), []);
    expect(o.coordinatorRequired).toBeNull();
    expect(o.notificationRequired).toBeNull();
  });
});

describe("sloučení výstupu AI", () => {
  const p = sampleIntake();
  const base: AiOutput = { selected: [], rejected: [], missingCategories: [], questions: [], librarySuggestions: [] };

  it("schéma odmítne nebezpečí mimo knihovnu", () => {
    const bad = { ...base, selected: [{ hazardId: "NB-999", confidence: "confirmed", evidence: "", projectCause: "", projectRisk: "", measures: [], probability: 3, severity: 3 }] };
    expect(AiOutputSchema.safeParse(bad).success).toBe(false);
  });

  it("pravidlový kandidát, kterého AI vyřadí, v katalogu zůstává k ověření", () => {
    const cat = mergeAiOutput(p, { ...base, rejected: [{ hazardId: "NB-040", reason: "nesouvisí" }] }, { model: "test" });
    const e = cat.entries.find((x) => x.hazardId === "NB-040");
    expect(e?.source).toBe("rule");
    expect(e?.rationale.join(" ")).toContain("AI navrhuje vyřadit");
    expect(cat.notes.length).toBe(1);
  });

  it("AI výběr s citací je potvrzený a přebírá projektové texty", () => {
    const cat = mergeAiOutput(
      p,
      {
        ...base,
        selected: [
          {
            hazardId: "NB-090",
            confidence: "confirmed",
            evidence: "Pod mostem vodoteč Berounka",
            projectCause: "Práce z pomocné lávky nad Berounkou.",
            projectRisk: "Pád do řeky.",
            measures: ["Záchranný člun pod lávkou."],
            probability: 7,
            severity: 5,
          },
        ],
      },
      { model: "test" },
    );
    const e = cat.entries.find((x) => x.hazardId === "NB-090")!;
    expect(e.confidence).toBe("confirmed");
    expect(e.source).toBe("rule+ai");
    expect(e.cause).toContain("Berounkou");
    expect(e.probability).toBe(5); // ořez
    expect(cat.mode).toBe("ai");
  });
});

describe("export DOCX", () => {
  it("vytvoří platný .docx (ZIP)", async () => {
    const buf = await catalogueToDocx(buildRuleCatalogue(sampleIntake()));
    expect(buf.subarray(0, 2).toString()).toBe("PK");
    expect(buf.length).toBeGreaterThan(5000);
  });
});

describe("volání Claude (stub klienta)", () => {
  const stub = (response: Record<string, unknown>) => {
    const calls: Record<string, unknown>[] = [];
    const client = { beta: { messages: { create: async (params: Record<string, unknown>) => (calls.push(params), response) } } };
    return { client: client as unknown as import("@anthropic-ai/sdk").default, calls };
  };

  it("posílá strukturovaný výstup, fallbacky a PDF jako dokument", async () => {
    const { generateWithAi } = await import("./ai");
    const parsed: AiOutput = { selected: [], rejected: [], missingCategories: [], questions: ["Q?"], librarySuggestions: [] };
    const withInvalid = { ...parsed, selected: [{ hazardId: "NB-999", confidence: "confirmed", evidence: "", projectCause: "", projectRisk: "", measures: [], probability: 3, severity: 3 }] };
    const { client, calls } = stub({ stop_reason: "end_turn", model: "claude-opus-5", content: [{ type: "text", text: JSON.stringify(withInvalid) }] });
    const cat = await generateWithAi(sampleIntake(), [{ name: "TZ.pdf", base64: "JVBERi0=" }], { client });
    const p = calls[0] as any;
    expect(p.model).toBe("claude-opus-5");
    expect(p.fallbacks).toBe("default");
    expect(p.betas).toContain("server-side-fallback-2026-07-01");
    expect(p.output_config.format.type).toBe("json_schema");
    expect(p.messages[0].content[0]).toMatchObject({ type: "document", title: "TZ.pdf" });
    expect(cat.questions[0]).toBe("Q?");
    expect(cat.entries.length).toBeGreaterThan(10); // pravidla zůstávají jako záchranná síť
    expect(cat.entries.some((e) => e.hazardId === "NB-999")).toBe(false); // ID mimo knihovnu vyřazeno
  });

  it("odmítnutí modelu vyhodí AiUnavailableError", async () => {
    const { generateWithAi, AiUnavailableError } = await import("./ai");
    const { client } = stub({ stop_reason: "refusal", model: "claude-opus-5", content: [] });
    await expect(generateWithAi(sampleIntake(), [], { client })).rejects.toBeInstanceOf(AiUnavailableError);
  });
});
