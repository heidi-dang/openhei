export const DENSITY_VALUES = ["comfortable", "compact", "spacious"] as const
export type Density = (typeof DENSITY_VALUES)[number]

export function normalizeDensity(value: unknown): Density {
  if (value === "compact" || value === "spacious") return value
  return "comfortable"
}
