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
  items: Record<string, string>;
  spells: Record<string, { id: string; name: string }>;
  runes: Record<string, { name: string; icon: string }>;
}

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
  return { version, items: itemMap, spells: spellMap, runes: runeMap };
}

/** Refreshes the stored maps when the game version changed (or they were never stored). */
export async function syncRiotAssets(db: Db, version: string, fetchImpl: typeof fetch = fetch, locale = "en_US"): Promise<boolean> {
  const current = await loadRiotAssets(db);
  if (current?.version === version) return false;
  const get = async (path: string) => {
    const res = await fetchImpl(`${BASE}/cdn/${version}/data/${locale}/${path}`, { signal: AbortSignal.timeout(15_000) });
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
