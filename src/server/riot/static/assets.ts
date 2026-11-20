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

export interface RiotAssets {
  version: string;
  /** The rules' revision that made these maps; absent on maps stored before ASSET_RULES_FORMAT 2 (re-read on the next run). */
  format?: number;
  items: Record<string, string>;
  spells: Record<string, { id: string; name: string }>;
  runes: Record<string, { name: string; icon: string }>;
  /**
   * Summoner's Rift's items (map 11, ids of up to four digits) beyond their names: gold, tags, what
   * they build from and into, their depth, and the ability haste their stats name (null when none),
   * for Matchup Intel's build evidence (docs/MATCHUP_INTEL.md, "Static data"). Absent before format 2.
   */
  itemInfo?: Record<string, ItemInfo>;
  /** Each summoner spell's base cooldown per rank, in seconds, by its key ("4" Flash); absent before format 2. */
  spellCooldowns?: Record<string, number[]>;
  /** Each rune tree's slots as rune ids, keystones first, by the tree's id; absent before format 2. */
  runeSlots?: Record<string, number[][]>;
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

/** The rules' revision: maps stored under another are read again on the next run. */
export const ASSET_RULES_FORMAT = 2;

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

/** Builds the compact maps from Data Dragon's item.json, summoner.json and runesReforged.json. */
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
  for (const v of Object.values((summoner.data ?? {}) as Record<string, { key?: string; cooldown?: unknown }>)) {
    const cd = Array.isArray(v?.cooldown) ? v.cooldown.filter((x): x is number => typeof x === "number" && Number.isFinite(x) && x >= 0) : [];
    if (v?.key && cd.length) spellCooldowns[v.key] = cd;
  }
  const runeSlots: Record<string, number[][]> = {};
  for (const style of (Array.isArray(runes) ? runes : []) as Array<{ id: number; slots?: Array<{ runes?: Array<{ id: number }> }> }>) {
    runeSlots[String(style.id)] = (style.slots ?? []).map((slot) => (slot.runes ?? []).map((r) => r.id).filter((x) => typeof x === "number"));
  }
  return { version, format: ASSET_RULES_FORMAT, items: itemMap, spells: spellMap, runes: runeMap, itemInfo, spellCooldowns, runeSlots };
}

/**
 * Refreshes the stored maps when the game version changed (or they were never stored). Each
 * download is given up after `timeoutMs` (the Data Dragon provider's 15 s), so a Data Dragon that
 * stops answering cannot hold the version-check job; the stored maps then stay until the next run.
 */
export async function syncRiotAssets(db: Db, version: string, fetchImpl: typeof fetch = fetch, locale = "en_US", timeoutMs = 15_000): Promise<boolean> {
  const current = await loadRiotAssets(db);
  if (current?.version === version && current.format === ASSET_RULES_FORMAT) return false;
  const get = async (path: string) => {
    const res = await fetchImpl(`${BASE}/cdn/${version}/data/${locale}/${path}`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) throw new Error(`Data Dragon ${path}: HTTP ${res.status}`);
    return res.json();
  };
  const [items, summoner, runes] = await Promise.all([get("item.json"), get("summoner.json"), get("runesReforged.json")]);
  const value = compactAssets(version, items as Json, summoner as Json, runes);
  await db.insert(appSettings).values({ key: KEY, value, updatedAt: new Date() }).onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });
  invalidateCache(KEY);
  return true;
}

export async function loadRiotAssets(db: Db): Promise<RiotAssets | null> {
  return cachedFor(KEY, 10 * 60_000, async () => {
    const [row] = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, KEY));
    return (row?.value as RiotAssets | undefined) ?? null;
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
