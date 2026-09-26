/** Definice vstupů nástroje – čistá metadata, bezpečná pro klienta. */

export type InputSpec =
  | { kind: "text"; id: string; label: string; placeholder?: string; rows?: number; required?: boolean; hint?: string }
  | { kind: "line"; id: string; label: string; placeholder?: string; required?: boolean; hint?: string }
  | { kind: "date"; id: string; label: string; hint?: string }
  | { kind: "select"; id: string; label: string; options: { value: string; label: string }[]; hint?: string }
  | {
      kind: "files";
      id: string;
      label: string;
      hint?: string;
      required?: boolean;
      /** Max. počet souborů v poli. */
      max?: number;
      /** Každý soubor je samostatná „položka“ (např. nabídka A, B, C). */
      labelEach?: string;
      accept?: string;
    };

export type ToolCategory = "project" | "documents" | "checks" | "office" | "site";

export const CATEGORY_LABEL: Record<ToolCategory, string> = {
  project: "Data projektu",
  documents: "Generování dokumentace",
  checks: "Kontroly dokumentace",
  office: "Kancelář a komunikace",
  site: "Stavba a BOZP",
};

export interface ToolMeta {
  slug: string;
  n: string;
  title: string;
  /** Krátký slogan „vstup → výstup“. */
  flow: string;
  description: string;
  category: ToolCategory;
  inputs: InputSpec[];
  /** Nástroj čte aktivní projekt (Project Intake). */
  usesProject: boolean;
  /** Funguje i bez AI (deterministické kontroly). */
  worksWithoutAi: boolean;
  /** Text tlačítka spuštění. */
  action: string;
  /** Ukázková data pro předvedení. */
  sample?: Record<string, string>;
  /** Vlastní stránka mimo generický běh (např. katalog nebezpečí). */
  href?: string;
}

/** Soubor tak, jak ho posílá klient. */
export interface UploadedFile {
  name: string;
  /** base64 bez prefixu data: */
  data: string;
  size: number;
}

export interface ToolRequest {
  values: Record<string, string>;
  files: Record<string, UploadedFile[]>;
  project: unknown | null;
  useAi: boolean;
}
