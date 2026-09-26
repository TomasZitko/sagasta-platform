import type { z } from "zod";

/**
 * Tolerantní oprava výstupu modelu před validací zod schématem.
 *
 * SDK převádí `enum` do popisu pole (API ho nevynucuje), takže model může
 * vrátit hodnotu mimo číselník. Místo pádu celé odpovědi:
 *  - hodnotu zkusíme spárovat (velikost písmen, diakritika, popisek),
 *  - neplatnou položku POLE vyřadíme (tím zůstává řízená knihovna řízená),
 *  - jinde použijeme bezpečnou výchozí hodnotu („neuvedeno“, „inferred“ …),
 *  - chybějící pole doplníme prázdnou hodnotou, čísla převedeme z textu.
 */

const DROP = Symbol("drop");

const SAFE_DEFAULTS = ["unknown", "neuvedeno", "unclear", "inferred", "missing", "open", "medium", "střední", "warning", "none"];

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

type AnyDef = { type: string; [k: string]: unknown };
const defOf = (s: unknown): AnyDef => (s as { _zod: { def: AnyDef } })._zod.def;

/**
 * @param inArray hodnota je přímou položkou pole (neplatná → vyřadit)
 * @param idField pole je identifikátor položky pole (např. hazardId) – neplatná
 *                hodnota vyřadí celou položku místo náhrady výchozí hodnotou
 */
export function repair(schema: z.ZodType, value: unknown, inArray = false, idField = false): unknown {
  const def = defOf(schema);
  switch (def.type) {
    case "optional":
    case "nullable":
    case "default":
    case "prefault":
      return value === undefined || value === null ? value : repair(def.innerType as z.ZodType, value, inArray, idField);
    case "object": {
      const shape = def.shape as Record<string, z.ZodType>;
      const src = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
      const out: Record<string, unknown> = {};
      for (const [k, s] of Object.entries(shape)) {
        const r = repair(s, src[k] === undefined ? empty(s) : src[k], false, inArray && /(^id$|Id$)/.test(k));
        if (r === DROP) {
          if (inArray) return DROP;
          out[k] = empty(s);
        } else out[k] = r;
      }
      return out;
    }
    case "array": {
      const list = Array.isArray(value) ? value : value === undefined || value === null || value === "" ? [] : [value];
      return list.map((v) => repair(def.element as z.ZodType, v, true)).filter((v) => v !== DROP);
    }
    case "enum": {
      const options = Object.values(def.entries as Record<string, string>);
      const s = typeof value === "string" ? value : String(value ?? "");
      if (options.includes(s)) return s;
      const f = fold(s);
      const hit = options.find((o) => fold(o) === f) ?? options.find((o) => f.length >= 2 && (f.startsWith(fold(o)) || (fold(o).startsWith(f) && f.length >= 3)));
      if (hit) return hit;
      if (inArray || idField) return DROP;
      return SAFE_DEFAULTS.find((d) => options.includes(d)) ?? options[0];
    }
    case "string":
      return value === null || value === undefined ? "" : typeof value === "string" ? value : typeof value === "object" ? JSON.stringify(value) : String(value);
    case "number": {
      const n = typeof value === "number" ? value : Number(String(value ?? "").replace(/[\s ]/g, "").replace(",", "."));
      const isInt = Boolean((schema as { isInt?: boolean }).isInt) || String((schema as { format?: string }).format ?? "").includes("int");
      const safe = Number.isFinite(n) ? n : -1;
      return isInt ? Math.round(safe) : safe;
    }
    case "boolean":
      return typeof value === "boolean" ? value : /^(true|ano|yes|1)$/i.test(String(value ?? ""));
    default:
      return value;
  }
}

function empty(s: z.ZodType): unknown {
  const t = defOf(s).type;
  if (t === "array") return [];
  if (t === "object") return {};
  if (t === "number") return -1;
  if (t === "boolean") return false;
  return "";
}

/** JSON.parse + oprava + validace. */
export function parseLenient<T extends z.ZodType>(schema: T, text: string): z.infer<T> {
  const raw = JSON.parse(text);
  return schema.parse(repair(schema, raw)) as z.infer<T>;
}
