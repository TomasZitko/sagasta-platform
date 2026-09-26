import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";
import { ProjectIntakeSchema, type ProjectIntake } from "@/lib/project/intake";
import type { Report } from "../report";
import type { ToolRequest } from "../types";
import { aiConfigured, describeAiError, runStructured } from "./claude";
import { processFiles, type ProcessedDoc } from "./files";

export interface AiCall<T extends z.ZodType> {
  system: string;
  prompt: string;
  docs?: ProcessedDoc[];
  schema: T;
  maxTokens?: number;
}

export class ToolContext {
  readonly values: Record<string, string>;
  readonly docs: Record<string, ProcessedDoc[]>;
  readonly project: ProjectIntake | null;
  readonly useAi: boolean;
  readonly notes: string[] = [];
  model: string | null = null;
  private client?: Anthropic;

  constructor(init: { values: Record<string, string>; docs: Record<string, ProcessedDoc[]>; project: ProjectIntake | null; useAi: boolean; client?: Anthropic }) {
    this.values = init.values;
    this.docs = init.docs;
    this.project = init.project;
    this.useAi = init.useAi;
    this.client = init.client;
    for (const d of Object.values(this.docs).flat()) if (d.warning) this.notes.push(d.warning);
  }

  static async fromRequest(req: ToolRequest, client?: Anthropic): Promise<ToolContext> {
    const parsed = req.project ? ProjectIntakeSchema.safeParse(req.project) : null;
    return new ToolContext({
      values: req.values,
      docs: await processFiles(req.files),
      project: parsed?.success ? parsed.data : null,
      useAi: req.useAi && (Boolean(client) || aiConfigured()),
      client,
    });
  }

  value(id: string): string {
    return (this.values[id] ?? "").trim();
  }

  files(id: string): ProcessedDoc[] {
    return this.docs[id] ?? [];
  }

  /** Všechny dokumenty i vložené texty jako jedna množina pojmenovaných textů. */
  textOf(fileId: string, textId?: string, textName = "Vložený text"): { name: string; text: string }[] {
    const out = this.files(fileId).map((d) => ({ name: d.name, text: d.text }));
    const t = textId ? this.value(textId) : "";
    if (t) out.push({ name: textName, text: t });
    return out;
  }

  /** Zavolá AI; při nedostupnosti vrátí null a zapíše důvod do poznámek. */
  async ai<T extends z.ZodType>(call: AiCall<T>): Promise<z.infer<T> | null> {
    if (!this.useAi) {
      this.notes.push(aiConfigured() ? "AI vypnuta – výsledek pouze z deterministických kontrol." : "AI není nakonfigurována (ANTHROPIC_API_KEY) – výsledek pouze z deterministických kontrol.");
      return null;
    }
    try {
      const { data, model } = await runStructured({ ...call, client: this.client });
      this.model = model;
      return data;
    } catch (err) {
      console.error("[tool ai]", err);
      this.notes.push(`${describeAiError(err)} Zobrazen výsledek bez AI.`);
      return null;
    }
  }

  finish(report: Report): Report {
    report.mode = this.model ? "ai" : "rules";
    report.model = this.model;
    report.notes = [...this.notes, ...report.notes];
    if (this.project && !report.meta.some((m) => m.label === "Projekt")) {
      report.meta.unshift({ label: "Projekt", value: this.project.projectName });
    }
    return report;
  }
}

export type ToolHandler = (ctx: ToolContext) => Promise<Report>;

export function projectForPrompt(p: ProjectIntake | null): string {
  if (!p) return "Aktivní projekt: není zadán.";
  const { documentText, ...rest } = p;
  return `Aktivní projekt (strukturovaná data z formuláře):\n${JSON.stringify(rest, null, 1)}${
    documentText ? `\n\nText dokumentace uložený u projektu:\n${documentText.slice(0, 60_000)}` : ""
  }`;
}

export class InputError extends Error {}
