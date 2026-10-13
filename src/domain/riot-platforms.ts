/**
 * The single source of truth for Riot League of Legends platforms (game servers) and the
 * regional routing hosts that serve them. Every other module (API client, ingestion jobs,
 * region selectors, coverage views) reads this list; nothing else hard-codes a platform.
 *
 * Only platforms Riot's public API serves are listed. Chinese servers are not part of the public
 * API and are deliberately absent.
 */
export type RiotRegion = "americas" | "europe" | "asia" | "sea";

export interface RiotPlatform {
  /** Platform routing value, lower-case, as used in API hosts (e.g. "oc1"). */
  id: string;
  /** Short label players know (e.g. "OCE"). */
  label: string;
  /** Full name for tooltips and tables. */
  name: string;
  /** Regional routing value for account-v1 and match-v5. */
  region: RiotRegion;
}

export const RIOT_PLATFORMS: readonly RiotPlatform[] = [
  { id: "oc1", label: "OCE", name: "Oceania", region: "sea" },
  { id: "euw1", label: "EUW", name: "Europe West", region: "europe" },
  { id: "eun1", label: "EUNE", name: "Europe Nordic & East", region: "europe" },
  { id: "na1", label: "NA", name: "North America", region: "americas" },
  { id: "kr", label: "KR", name: "Korea", region: "asia" },
  { id: "br1", label: "BR", name: "Brazil", region: "americas" },
  { id: "la1", label: "LAN", name: "Latin America North", region: "americas" },
  { id: "la2", label: "LAS", name: "Latin America South", region: "americas" },
  { id: "jp1", label: "JP", name: "Japan", region: "asia" },
  { id: "tr1", label: "TR", name: "Türkiye", region: "europe" },
  { id: "ru", label: "RU", name: "Russia", region: "europe" },
  { id: "me1", label: "ME", name: "Middle East", region: "europe" },
  { id: "sg2", label: "SEA", name: "Southeast Asia (Singapore, Malaysia, Indonesia)", region: "sea" },
  { id: "ph2", label: "PH", name: "Philippines", region: "sea" },
  { id: "th2", label: "TH", name: "Thailand", region: "sea" },
  { id: "tw2", label: "TW", name: "Taiwan, Hong Kong, Macao", region: "sea" },
  { id: "vn2", label: "VN", name: "Vietnam", region: "sea" },
] as const;

const BY_ID: ReadonlyMap<string, RiotPlatform> = new Map(RIOT_PLATFORMS.map((p) => [p.id, p]));

export const RIOT_PLATFORM_IDS: readonly string[] = RIOT_PLATFORMS.map((p) => p.id);
export const RIOT_REGIONS: readonly RiotRegion[] = ["americas", "europe", "asia", "sea"];

/** Players new to the app most often come from this server; the signup region selector starts here. */
export const DEFAULT_RIOT_PLATFORM = "oc1";

export function isRiotPlatform(id: string | null | undefined): boolean {
  return !!id && BY_ID.has(id.toLowerCase());
}

export function getRiotPlatform(id: string): RiotPlatform | null {
  return BY_ID.get(id.toLowerCase()) ?? null;
}

export function regionFor(platform: string): RiotRegion {
  const p = BY_ID.get(platform.toLowerCase());
  if (!p) throw new Error(`Unknown Riot platform "${platform}"`);
  return p.region;
}

/**
 * Routing host for ACCOUNT-V1 (Riot IDs, PUUIDs, active region). Riot serves that API from the
 * americas, asia and europe routing values only: the sea host that serves OCE and South-East
 * Asian match data answers account lookups with 403, which looks exactly like a rejected key.
 */
export function accountRegionFor(platform: string): Exclude<RiotRegion, "sea"> {
  const region = regionFor(platform);
  return region === "sea" ? "asia" : region;
}

export function platformLabel(id: string): string {
  return BY_ID.get(id.toLowerCase())?.label ?? id.toUpperCase();
}

export function platformName(id: string): string {
  return BY_ID.get(id.toLowerCase())?.name ?? id.toUpperCase();
}

/** Platforms served by a regional host, in list order. */
export function platformsInRegion(region: RiotRegion): string[] {
  return RIOT_PLATFORMS.filter((p) => p.region === region).map((p) => p.id);
}

/**
 * Parses RIOT_PLATFORMS. Accepts a comma-separated list of platform ids (any case, spaces
 * ignored), the word "all" for every platform, or a regional routing value ("sea", "europe"…)
 * standing for all of its platforms. Unknown entries are dropped and reported through
 * `parsePlatformSpec` so Settings can show them. The fallback applies when nothing valid remains.
 */
export function parsePlatforms(spec: string | undefined | null, fallback: string[] = [DEFAULT_RIOT_PLATFORM]): string[] {
  return parsePlatformSpec(spec, fallback).platforms;
}

export function parsePlatformSpec(spec: string | undefined | null, fallback: string[] = [DEFAULT_RIOT_PLATFORM]): { platforms: string[]; unknown: string[]; usedFallback: boolean; all: boolean } {
  const tokens = (spec ?? "")
    .split(/[,\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const out: string[] = [];
  const unknown: string[] = [];
  let all = false;
  const push = (id: string) => {
    if (!out.includes(id)) out.push(id);
  };
  for (const t of tokens) {
    if (t === "all" || t === "*") {
      all = true;
      for (const p of RIOT_PLATFORM_IDS) push(p);
    } else if ((RIOT_REGIONS as readonly string[]).includes(t)) {
      for (const p of platformsInRegion(t as RiotRegion)) push(p);
    } else if (BY_ID.has(t)) push(t);
    else unknown.push(t);
  }
  if (out.length === 0) return { platforms: [...fallback], unknown, usedFallback: true, all: false };
  return { platforms: out, unknown, usedFallback: false, all };
}

/**
 * Normalises the `region` field of Riot's active-shard / active-region responses ("NA1", "oc1",
 * "SG2"…) to a known platform id, or null when Riot answered with something this list does not
 * know (then the player's own selection stays in force).
 */
export function normaliseRiotRegionAnswer(value: string | null | undefined): string | null {
  if (!value) return null;
  const id = value.trim().toLowerCase();
  return BY_ID.has(id) ? id : null;
}
