/**
 * Semikvantitativní hodnocení rizika R = P × Z (pravděpodobnost × závažnost),
 * obě stupnice 1–5.
 */

export type Level = 1 | 2 | 3 | 4 | 5;

export const PROBABILITY_LABELS: Record<Level, string> = {
  1: "Nepravděpodobná",
  2: "Málo pravděpodobná",
  3: "Pravděpodobná",
  4: "Velmi pravděpodobná",
  5: "Trvalá / téměř jistá",
};

export const SEVERITY_LABELS: Record<Level, string> = {
  1: "Bez pracovní neschopnosti",
  2: "Lehký úraz",
  3: "Úraz s delší PN",
  4: "Těžký úraz, trvalé následky",
  5: "Smrtelný úraz",
};

export type RiskBand = "low" | "moderate" | "high" | "critical";

export const RISK_BANDS: Record<RiskBand, { label: string; action: string }> = {
  low: { label: "Nízké", action: "Přijatelné, udržovat stávající opatření" },
  moderate: { label: "Mírné", action: "Opatření zavést v rámci přípravy prací" },
  high: { label: "Významné", action: "Práce zahájit až po zavedení opatření" },
  critical: { label: "Nepřijatelné", action: "Práce nezahajovat – změnit technologii / postup" },
};

export const clampLevel = (n: number): Level => Math.min(5, Math.max(1, Math.round(n))) as Level;

export function riskScore(p: number, s: number): number {
  return clampLevel(p) * clampLevel(s);
}

export function riskBand(score: number): RiskBand {
  if (score >= 15) return "critical";
  if (score >= 10) return "high";
  if (score >= 5) return "moderate";
  return "low";
}
