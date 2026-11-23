import { eq } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { appSettings } from "@/server/db/schema";
import { cachedFor, invalidateCache } from "@/server/observability/cache";

/*
  Names and icons for what a match record refers to by number: items, summoner spells, runes.
  Read from Data Dragon once per game version by the static-sync job and kept in app_settings, so
  the match history never asks Riot while rendering. Unknown numbers (a brand-new item before the
  next sync) simply show without a name.
*/

const BASE = (process.env.DDRAGON_BASE_URL ?? "https://ddragon.leagueoflegends.com").replace(/\/$/, "");
const KEY = "riot_assets";
/**
 * Matchup Intel's build data, kept beside the names under a key of its own: every match history
 * and timeline read loads the names (about 33 KB), and none of them needs the build data (about 57
 * KB more), which only S7b's build evidence will read (R6 review SR6-SEC-5; docs/HOSTING_USAGE.md).
 */
const BUILD_KEY = "riot_build_data";

export interface RiotAssets {
  version: string;
  /** The rules' revision that made these maps; absent on maps stored before ASSET_RULES_FORMAT 2 (re-read on the next run, which also stores the build data). */
  format?: number;
  items: Record<string, string>;
  spells: Record<string, { id: string; name: string }>;
  runes: Record<string, { name: string; icon: string }>;
}

/** What Matchup Intel's build evidence rests on (docs/MATCHUP_INTEL.md, "Static data"), for one game version. */
export interface RiotBuildData {
  version: string;
  format: number;
  /**
   * Summoner's Rift's items (map 11, ids of up to four digits) beyond their names: gold, tags, what
   * they build from and into, their depth, and the ability haste their stats name (null when none).
   */
  itemInfo: Record<string, ItemInfo>;
  /**
   * Each summoner spell's base cooldown per rank, in seconds, by its key ("4" Flash). Not for a spell
   * with charges (Smite: maxammo 2), whose array is the wait between two casts, not its cooldown (the
   * ability tiles' rule): those are in `spellCharges` instead.
   */
  spellCooldowns: Record<string, number[]>;
  /** The spells Data Dragon gives charges (maxammo above 0), by key, with their count; absent on data stored before format 3. */
  spellCharges?: Record<string, number>;
  /** Each rune tree's slots as rune ids, keystones first, by the tree's id. */
  runeSlots: Record<string, number[][]>;
}

/** One Summoner's Rift item's shop facts, as Data Dragon gives them. */
export interface ItemInfo {
  gold: { base: number; total: number; sell: number; purchasable: boolean };
  tags: string[];
  from: string[];
  into: string[];
  depth: number;
  /** The ability haste its stats name (`<stats>` in its description); null when they name none. */
  haste: number | null;
}

/** The rules' revision: maps stored under another are read again on the next run (3: a summoner spell with charges keeps no cooldown, R11a). */
export const ASSET_RULES_FORMAT = 3;

/**
 * The ability haste an item's stats give, from the `<stats>` block of its Data Dragon description
 * ("<attention>20</attention> Ability Haste"); null when the stats name none, or the number cannot be read.
 */
export function itemHaste(description: unknown): number | null {
  if (typeof description !== "string") return null;
  const stats = /<stats>([\s\S]*?)<\/stats>/i.exec(description)?.[1];
  if (!stats) return null;
  const m = /(?:<attention>)?\s*(\d{1,3})\s*(?:<\/attention>)?\s*Ability Haste/i.exec(stats);
  return m ? Number(m[1]) : null;
}

/** Whether Data Dragon's item is one of Summoner's Rift's (map 11, an id of up to four digits; the longer ids are other modes' copies). */
export function isRiftItem(id: string, v: { maps?: Record<string, boolean> } | undefined): boolean {
  return /^\d{1,4}$/.test(id) && v?.maps?.["11"] === true;
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

type Json = Record<string, unknown>;

/** Builds the compact maps of names and icons from Data Dragon's item.json, summoner.json and runesReforged.json. */
export function compactAssets(version: string, items: Json, summoner: Json, runes: unknown): RiotAssets {
  const itemMap: Record<string, string> = {};
  for (const [id, v] of Object.entries((items.data ?? {}) as Record<string, { name?: string }>)) if (v?.name) itemMap[id] = v.name;
  const spellMap: Record<string, { id: string; name: string }> = {};
  for (const v of Object.values((summoner.data ?? {}) as Record<string, { id?: string; key?: string; name?: string }>)) if (v?.key && v.id) spellMap[v.key] = { id: v.id, name: v.name ?? v.id };
  const runeMap: Record<string, { name: string; icon: string }> = {};
  for (const style of (Array.isArray(runes) ? runes : []) as Array<{ id: number; name: string; icon: string; slots?: Array<{ runes?: Array<{ id: number; name: string; icon: string }> }> }>) {
    runeMap[String(style.id)] = { name: style.name, icon: style.icon };
    for (const slot of style.slots ?? []) for (const r of slot.runes ?? []) runeMap[String(r.id)] = { name: r.name, icon: r.icon };
  }
  return { version, format: ASSET_RULES_FORMAT, items: itemMap, spells: spellMap, runes: runeMap };
}

/** Builds Matchup Intel's build data from the same three files: items' shop facts and haste, summoner spells' cooldowns, the rune trees' slots. */
export function compactBuildData(version: string, items: Json, summoner: Json, runes: unknown): RiotBuildData {
  const itemInfo: Record<string, ItemInfo> = {};
  for (const [id, v] of Object.entries((items.data ?? {}) as Record<string, Json>)) {
    if (!isRiftItem(id, v as { maps?: Record<string, boolean> })) continue;
    const gold = (v.gold ?? {}) as Json;
    itemInfo[id] = {
      gold: { base: num(gold.base), total: num(gold.total), sell: num(gold.sell), purchasable: gold.purchasable === true },
      tags: strings(v.tags),
      from: strings(v.from),
      into: strings(v.into),
      depth: typeof v.depth === "number" ? v.depth : 1,
      haste: itemHaste(v.description),
    };
  }
  const spellCooldowns: Record<string, number[]> = {};
  const spellCharges: Record<string, number> = {};
  for (const v of Object.values((summoner.data ?? {}) as Record<string, { key?: string; cooldown?: unknown; maxammo?: unknown }>)) {
    if (!v?.key) continue;
    const ammo = Number(v.maxammo);
    if (Number.isFinite(ammo) && ammo > 0) {
      spellCharges[v.key] = ammo;
      continue;
    }
    const cd = Array.isArray(v.cooldown) ? v.cooldown.filter((x): x is number => typeof x === "number" && Number.isFinite(x) && x >= 0) : [];
    if (cd.length) spellCooldowns[v.key] = cd;
  }
  const runeSlots: Record<string, number[][]> = {};
  for (const style of (Array.isArray(runes) ? runes : []) as Array<{ id: number; slots?: Array<{ runes?: Array<{ id: number }> }> }>) {
    runeSlots[String(style.id)] = (style.slots ?? []).map((slot) => (slot.runes ?? []).map((r) => r.id).filter((x) => typeof x === "number"));
  }
  return { version, format: ASSET_RULES_FORMAT, itemInfo, spellCooldowns, spellCharges, runeSlots };
}

/** What a version's three files failed on (counts only): a file naming nothing, ids it refers to that it does not hold, haste figures that cannot be read. */
export interface StaticProblems {
  /** The files that name no item, summoner spell or rune. */
  empty: Array<"item" | "summoner" | "rune">;
  /** Ids an item builds from or into that are not in the version's item.json, and Rift items without a name. */
  missingIds: number;
  /** Summoner's Rift items whose stats name ability haste in a figure that cannot be read. */
  unparsedHaste: number;
}

/**
 * Validation before publishing (docs/MATCHUP_INTEL.md, "Pipeline"): a version's item.json,
 * summoner.json and runesReforged.json are kept only when each names something, every id an item
 * builds from or into is in that version's item.json, and every ability haste figure in a Rift
 * item's stats parses (72 of 72 at 16.22.1 and 16.23.1, 69 of 69 at 15.24.1; no dangling id in any
 * of them). Null when they pass.
 */
export function staticProblems(items: unknown, summoner: unknown, runes: unknown): StaticProblems | null {
  const data = ((items as Json)?.data ?? {}) as Record<string, Json>;
  const spells = Object.values(((summoner as Json)?.data ?? {}) as Record<string, Json>).filter((v) => typeof v?.key === "string" && typeof v.id === "string");
  const runeIds = (Array.isArray(runes) ? runes : []).flatMap((t: { slots?: Array<{ runes?: Array<{ id?: unknown }> }> }) => (t?.slots ?? []).flatMap((sl) => (sl?.runes ?? []).map((r) => r?.id))).filter((id) => typeof id === "number");
  const empty: StaticProblems["empty"] = [];
  if (!Object.keys(data).length) empty.push("item");
  if (!spells.length) empty.push("summoner");
  if (!runeIds.length) empty.push("rune");
  let missingIds = 0;
  let unparsedHaste = 0;
  for (const [id, v] of Object.entries(data)) {
    for (const ref of [...strings(v?.from), ...strings(v?.into)]) if (!(ref in data)) missingIds += 1;
    if (!isRiftItem(id, v as { maps?: Record<string, boolean> })) continue;
    if (typeof v.name !== "string" || !v.name) missingIds += 1;
    const stats = typeof v.description === "string" ? /<stats>([\s\S]*?)<\/stats>/i.exec(v.description)?.[1] : undefined;
    if (stats && /Ability Haste/i.test(stats) && itemHaste(v.description) === null) unparsedHaste += 1;
  }
  return empty.length || missingIds || unparsedHaste ? { empty, missingIds, unparsedHaste } : null;
}

/** A version's files that failed validation: the last good copy stays (syncRiotAssets). */
export class StaticValidationError extends Error {
  constructor(
    readonly version: string,
    readonly problems: StaticProblems,
  ) {
    super(`Data Dragon ${version}'s item, summoner and rune files failed validation (${[problems.empty.length ? `naming no ${problems.empty.join(", ")}` : null, problems.missingIds ? `${problems.missingIds} missing ids` : null, problems.unparsedHaste ? `${problems.unparsedHaste} unreadable haste figures` : null].filter(Boolean).join("; ")}); the last good copy stays.`);
    this.name = "StaticValidationError";
  }
}

/**
 * The last attempt that did not keep a version's files, kept under a key of its own until one is kept
 * (`/api/health` → `staticData`): which version, why (they failed validation, or could not be
 * downloaded), when the first and the latest such attempt were, and the problems' counts.
 */
export interface StaticAttempt {
  version: string;
  reason: "validation" | "download";
  firstAt: string;
  lastAt: string;
  problems: StaticProblems | null;
}

export const STATIC_ATTEMPT_KEY = "riot_assets_attempt";

async function recordAttempt(db: Db, version: string, reason: StaticAttempt["reason"], problems: StaticProblems | null): Promise<void> {
  const [row] = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, STATIC_ATTEMPT_KEY));
  const prev = row?.value as StaticAttempt | undefined;
  const now = new Date().toISOString();
  // The first failed attempt for this version is kept: how long it has failed is what health reads.
  const same = prev?.version === version;
  // A download that fails after the files failed validation never hides that failure (R11b review 4):
  // the validation's reason and counts stay until a copy is kept.
  const keep = same && prev.reason === "validation" && reason === "download";
  const value: StaticAttempt = { version, reason: keep ? "validation" : reason, firstAt: same ? prev.firstAt : now, lastAt: now, problems: keep ? prev.problems : problems };
  await db.insert(appSettings).values({ key: STATIC_ATTEMPT_KEY, value, updatedAt: new Date() }).onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });
}

/**
 * Refreshes the stored maps when the game version changed (or they were never stored). Each
 * download is given up after `timeoutMs` (the Data Dragon provider's 15 s), so a Data Dragon that
 * stops answering cannot hold the version-check job; the stored maps then stay until the next run.
 * Validated before keeping (staticProblems): files that fail leave the last good copy in place, are
 * recorded as the attempt (STATIC_ATTEMPT_KEY), and throw StaticValidationError, which the job
 * reports as degraded. A kept version clears the attempt.
 */
export async function syncRiotAssets(db: Db, version: string, fetchImpl: typeof fetch = fetch, locale = "en_US", timeoutMs = 15_000): Promise<boolean> {
  const current = await loadRiotAssets(db);
  if (current?.version === version && current.format === ASSET_RULES_FORMAT) return false;
  const get = async (path: string) => {
    const res = await fetchImpl(`${BASE}/cdn/${version}/data/${locale}/${path}`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) throw new Error(`Data Dragon ${path}: HTTP ${res.status}`);
    return res.json();
  };
  let files: [unknown, unknown, unknown];
  try {
    files = await Promise.all([get("item.json"), get("summoner.json"), get("runesReforged.json")]);
  } catch (err) {
    await recordAttempt(db, version, "download", null);
    throw err;
  }
  const [items, summoner, runes] = files;
  const problems = staticProblems(items, summoner, runes);
  if (problems) {
    await recordAttempt(db, version, "validation", problems);
    throw new StaticValidationError(version, problems);
  }
  const value = compactAssets(version, items as Json, summoner as Json, runes);
  const build = compactBuildData(version, items as Json, summoner as Json, runes);
  // The build data first: the names' version is what says this version has been read.
  await db.insert(appSettings).values({ key: BUILD_KEY, value: build, updatedAt: new Date() }).onConflictDoUpdate({ target: appSettings.key, set: { value: build, updatedAt: new Date() } });
  await db.insert(appSettings).values({ key: KEY, value, updatedAt: new Date() }).onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });
  await db.delete(appSettings).where(eq(appSettings.key, STATIC_ATTEMPT_KEY));
  invalidateCache(KEY);
  invalidateCache(BUILD_KEY);
  return true;
}

export async function loadRiotAssets(db: Db): Promise<RiotAssets | null> {
  return cachedFor(KEY, 10 * 60_000, async () => {
    const [row] = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, KEY));
    return (row?.value as RiotAssets | undefined) ?? null;
  }, db);
}

/** Matchup Intel's build data (S7b's build evidence reads it; nothing else does). */
export async function loadRiotBuildData(db: Db): Promise<RiotBuildData | null> {
  return cachedFor(BUILD_KEY, 10 * 60_000, async () => {
    const [row] = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, BUILD_KEY));
    return (row?.value as RiotBuildData | undefined) ?? null;
  }, db);
}

/** The Data Dragon version for a match's game version ("16.20.715.1234" → "16.20.1"). */
export function ddragonVersionOf(gameVersion: string | null | undefined, fallback: string | null): string | null {
  const m = /^(\d+)\.(\d+)/.exec(gameVersion ?? "");
  return m ? `${m[1]}.${m[2]}.1` : fallback;
}

export const assetUrl = {
  item: (version: string, id: number) => `${BASE}/cdn/${version}/img/item/${id}.png`,
  spell: (version: string, spellId: string) => `${BASE}/cdn/${version}/img/spell/${spellId}.png`,
  rune: (icon: string) => `${BASE}/cdn/img/${icon}`,
};
