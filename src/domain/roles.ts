/**
 * Roles are the five tournament positions. They are the backbone of player configuration,
 * champion eligibility and the recommendation search space.
 */
export const ROLES = ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  TOP: "Top",
  JUNGLE: "Jungle",
  MID: "Mid",
  ADC: "ADC",
  SUPPORT: "Support",
};

export const ROLE_SHORT: Record<Role, string> = {
  TOP: "TOP",
  JUNGLE: "JG",
  MID: "MID",
  ADC: "ADC",
  SUPPORT: "SUP",
};

/** Riot match-v5 `teamPosition` values mapped onto UNIIVERSE roles. */
export const RIOT_POSITION_TO_ROLE: Record<string, Role> = {
  TOP: "TOP",
  JUNGLE: "JUNGLE",
  MIDDLE: "MID",
  BOTTOM: "ADC",
  UTILITY: "SUPPORT",
};

export const ROLE_TO_RIOT_POSITION: Record<Role, string> = {
  TOP: "TOP",
  JUNGLE: "JUNGLE",
  MID: "MIDDLE",
  ADC: "BOTTOM",
  SUPPORT: "UTILITY",
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function parseRole(value: unknown): Role | null {
  if (typeof value !== "string") return null;
  const upper = value.trim().toUpperCase();
  if (isRole(upper)) return upper;
  const aliases: Record<string, Role> = {
    TOPLANE: "TOP",
    JG: "JUNGLE",
    JNG: "JUNGLE",
    JUNGLER: "JUNGLE",
    MIDDLE: "MID",
    MIDLANE: "MID",
    BOT: "ADC",
    BOTTOM: "ADC",
    MARKSMAN: "ADC",
    AD: "ADC",
    SUP: "SUPPORT",
    SUPP: "SUPPORT",
    UTILITY: "SUPPORT",
  };
  return aliases[upper] ?? null;
}
