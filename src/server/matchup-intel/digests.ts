import { createHash } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { cachedFor, invalidateCache } from "@/server/observability/cache";
import { EVIDENCE_CACHE } from "./evidence-cache";
import { appSettings, staticDigests } from "@/server/db/schema";
import { comparePatches, patchFromVersion, publicPatchName } from "@/domain/patch";
import type { ChampionAbilitiesIndex } from "./abilities";
import { getCurrentPatch, listPatchesDesc } from "@/server/repositories/champions";

/*
  MATCHUP INTEL's per-version diff (docs/MATCHUP_INTEL.md, "Patches"): one hash per champion, item
  and rune for each patch Data Dragon was read at, kept in static_digests, so the evidence can tell
  whether Riot's data changed between the current patch and the one before:
  - a champion: its base stats (champion.json) and, for each ability, its base cooldowns, ranks,
    charges and the hash of Riot's text (which holds the costs and numbers), from the stored abilities;
  - an item: its whole Data Dragon entry (stats, gold, text);
  - a rune: its whole Data Dragon entry (text).
  Recorded once per patch by version-check (three Data Dragon files, nothing from Riot's API), and
  never replaced: the first copy of a patch is the one compared. Data Dragon cannot show a change
  Riot made without changing its data (a hidden number), which docs/MATCHUP_INTEL.md says.
*/

const BASE = (process.env.DDRAGON_BASE_URL ?? "https://ddragon.leagueoflegends.com").replace(/\/$/, "");
const VERSION = /^\d{1,4}(?:\.\d{1,4}){1,3}$/;

export type DigestKind = "champion" | "item" | "rune";

const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0, 24);

/** The digests of one patch's data, from Data Dragon's champion.json, item.json and runesReforged.json and the stored abilities. */
export function digestsOf(champions: unknown, items: unknown, runes: unknown, abilities: ChampionAbilitiesIndex | null, version: string): Array<{ kind: DigestKind; key: string; hash: string }> {
  const out: Array<{ kind: DigestKind; key: string; hash: string }> = [];
  const champs = ((champions as { data?: Record<string, { id?: string; stats?: unknown }> })?.data ?? {}) as Record<string, { id?: string; stats?: unknown }>;
  for (const c of Object.values(champs)) {
    if (!c?.id || !c.stats) continue;
    const kit = abilities?.champions[c.id];
    // Without its abilities read at this version, a champion's digest would hide a change: none is kept.
    if (!kit || kit.version !== version) continue;
    out.push({ kind: "champion", key: c.id, hash: hash([c.stats, kit.abilities.map((a) => [a.slot, a.cooldown, a.maxRank, a.charges, a.textHash ?? null])]) });
  }
  for (const [id, v] of Object.entries(((items as { data?: Record<string, unknown> })?.data ?? {}) as Record<string, unknown>)) {
    if (/^\d{1,4}$/.test(id)) out.push({ kind: "item", key: id, hash: hash(v) });
  }
  for (const style of (Array.isArray(runes) ? runes : []) as Array<{ slots?: Array<{ runes?: Array<{ id?: number }> }> }>) {
    for (const slot of style.slots ?? []) for (const r of slot.runes ?? []) if (typeof r.id === "number") out.push({ kind: "rune", key: String(r.id), hash: hash(r) });
  }
  return out;
}

/**
 * Whether this patch needs no attempt now: its digests are stored, or an attempt failed within the
 * last day (a "patch" row marks it), so a Data Dragon that fails is asked again at most once a day.
 */
export async function hasDigests(db: Db, patch: string): Promise<boolean> {
  const [row] = await db
    .select({ key: staticDigests.key })
    .from(staticDigests)
    .where(and(eq(staticDigests.patch, patch), sql`(${staticDigests.kind} <> 'patch' OR ${staticDigests.recordedAt} > now() - interval '1 day')`))
    .limit(1);
  return !!row;
}

/** Marks a failed attempt for a patch (see hasDigests); the next one replaces the mark. */
async function markFailed(db: Db, patch: string): Promise<void> {
  await db.insert(staticDigests).values({ patch, kind: "patch", key: "failed", hash: "" }).onConflictDoUpdate({ target: [staticDigests.patch, staticDigests.kind, staticDigests.key], set: { recordedAt: new Date() } });
}

/**
 * Records the current version's digests once (version-check, after the abilities are stored):
 * nothing when they are stored already. Insert only; the first copy of a patch stays.
 */
export async function ensureStaticDigests(db: Db, version: string, options: { fetchImpl?: typeof fetch; timeoutMs?: number; locale?: string } = {}): Promise<{ recorded: number } | null> {
  const patch = VERSION.test(version) ? patchFromVersion(version) : null;
  if (!patch || (await hasDigests(db, patch))) return null;
  // The stored abilities (about 290 KB, read once a patch).
  const [stored] = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, "champion_abilities"));
  const abilities = (stored?.value as ChampionAbilitiesIndex | undefined) ?? null;
  if (!abilities || abilities.source === "fixture") return null;
  const fetchImpl = options.fetchImpl ?? fetch;
  const get = async (file: string) => {
    const res = await fetchImpl(`${BASE}/cdn/${version}/data/${options.locale ?? "en_US"}/${file}`, { signal: AbortSignal.timeout(options.timeoutMs ?? 15_000) });
    if (!res.ok) throw new Error(`Data Dragon ${file}: HTTP ${res.status}`);
    return res.json();
  };
  let rows: Array<{ kind: DigestKind; key: string; hash: string }>;
  try {
    const [champions, items, runes] = await Promise.all([get("champion.json"), get("item.json"), get("runesReforged.json")]);
    rows = digestsOf(champions, items, runes, abilities, version);
    // Validation before keeping (docs/MATCHUP_INTEL.md, "Pipeline"): a patch whose files name no champion, item or rune is not kept.
    if (!rows.some((r) => r.kind === "champion") || !rows.some((r) => r.kind === "item") || !rows.some((r) => r.kind === "rune")) throw new Error("Data Dragon's files for this version are incomplete; no digests kept.");
  } catch (err) {
    await markFailed(db, patch);
    throw err;
  }
  for (let i = 0; i < rows.length; i += 500) await db.insert(staticDigests).values(rows.slice(i, i + 500).map((r) => ({ patch, ...r }))).onConflictDoNothing();
  // The evidence caches the diff with its counts: a patch's new digests can change what is pooled.
  invalidateCache(EVIDENCE_CACHE);
  return { recorded: rows.length };
}

/**
 * Of the things named, those whose Riot data shows no change between two patches: each has a digest
 * at both patches and they are equal. Anything not recorded at either patch is left out (unknown is
 * never "unchanged"). One query.
 */
export async function unchangedKeys(db: Db, current: string, previous: string, named: ReadonlyArray<{ kind: DigestKind; key: string }>): Promise<Set<string>> {
  const keys = [...new Set(named.map((n) => `${n.kind}:${n.key}`))];
  if (!keys.length) return new Set();
  const rows = await db
    .select({ patch: staticDigests.patch, kind: staticDigests.kind, key: staticDigests.key, hash: staticDigests.hash })
    .from(staticDigests)
    .where(and(inArray(staticDigests.patch, [current, previous]), inArray(sql`${staticDigests.kind} || ':' || ${staticDigests.key}`, keys)));
  const at = (patch: string, k: string) => rows.find((r) => r.patch === patch && `${r.kind}:${r.key}` === k)?.hash;
  return new Set(keys.filter((k) => {
    const a = at(current, k);
    return !!a && a === at(previous, k);
  }));
}

/** Whether everything named is unchanged between the two patches (unchangedKeys); false for an empty list. */
export async function unchangedBetween(db: Db, current: string, previous: string, named: ReadonlyArray<{ kind: DigestKind; key: string }>): Promise<boolean> {
  if (!named.length) return false;
  const same = await unchangedKeys(db, current, previous, named);
  return named.every((n) => same.has(`${n.kind}:${n.key}`));
}

/**
 * The champions, items and runes whose Data Dragon entries changed between two patches, counted
 * (`/api/health`, Admin's data health): only what both patches recorded and whose digests differ; a
 * key new in the current patch, or missing from it, is not a change.
 */
export async function changedCounts(db: Db, current: string, previous: string): Promise<Record<DigestKind, number> | null> {
  const rows = (await db.execute(sql`
    SELECT c.kind, count(*) FILTER (WHERE p.hash IS NOT NULL AND p.hash <> c.hash) AS changed, count(p.hash) AS compared
    FROM static_digests c LEFT JOIN static_digests p ON p.patch = ${previous} AND p.kind = c.kind AND p.key = c.key
    WHERE c.patch = ${current} GROUP BY c.kind`)) as unknown as { rows?: Array<{ kind: string; changed: string | number; compared: string | number }> };
  const list = rows.rows ?? (rows as unknown as Array<{ kind: string; changed: string | number; compared: string | number }>);
  if (!list.length || list.every((r) => Number(r.compared) === 0)) return null;
  const out: Record<DigestKind, number> = { champion: 0, item: 0, rune: 0 };
  for (const r of list) if (r.kind in out) out[r.kind as DigestKind] = Number(r.changed);
  return out;
}

/**
 * The per-version diff for `/api/health` (public: counts and patches only). The newest patch with
 * digests, how many champions, items and runes it recorded, and how many of each changed since the
 * patch before it that has digests (null when there is none to compare with). Two small queries
 * over `static_digests`; a failed attempt's "patch" mark is not a digest.
 */
export async function digestHealth(db: Db): Promise<{ patch: string; recorded: Record<DigestKind, number>; previous: string | null; changed: Record<DigestKind, number> | null } | null> {
  const res = (await db.execute(sql`SELECT patch, kind, count(*) AS n FROM static_digests WHERE kind <> 'patch' GROUP BY patch, kind`)) as unknown as { rows?: Array<{ patch: string; kind: string; n: string | number }> };
  const list = res.rows ?? (res as unknown as Array<{ patch: string; kind: string; n: string | number }>);
  const patches = [...new Set(list.map((r) => r.patch))].sort((a, b) => comparePatches(b, a));
  const [patch, previous = null] = patches;
  if (!patch) return null;
  const recorded: Record<DigestKind, number> = { champion: 0, item: 0, rune: 0 };
  for (const r of list) if (r.patch === patch && r.kind in recorded) recorded[r.kind as DigestKind] = Number(r.n);
  return { patch, recorded, previous, changed: previous ? await changedCounts(db, patch, previous) : null };
}

/**
 * Admin's data health (Data & Integrations): digestHealth's figures, and the newest patch whose
 * attempt failed and that has no digests yet (a "patch" mark newer than the newest digests), or
 * null. Counts and patch names only, as on `/api/health`.
 */
export async function staticDiffHealth(db: Db): Promise<{ digests: Awaited<ReturnType<typeof digestHealth>>; failedPatch: string | null }> {
  const [digests, marks] = await Promise.all([digestHealth(db), db.execute(sql`SELECT DISTINCT patch FROM static_digests WHERE kind = 'patch'`)]);
  const list = ((marks as unknown as { rows?: Array<{ patch: string }> }).rows ?? (marks as unknown as Array<{ patch: string }>)).map((r) => r.patch);
  const newer = list.filter((p) => !digests || comparePatches(p, digests.patch) > 0).sort((a, b) => comparePatches(b, a));
  return { digests, failedPatch: newer[0] ?? null };
}


/** What Riot changed on the newest recorded patch, for the page's labels: that patch's public name and the keys ("champion:Ahri", "item:3020", "rune:8112") whose digests differ from the patch before. */
export interface RiotChanges {
  /** The newest recorded patch's public name ("26.24"), as the label says it. */
  patch: string;
  changed: ReadonlySet<string>;
}

/**
 * Of the things named, those whose digest changed between the two newest patches recorded in
 * static_digests ("Riot changed this on 26.24", docs/MATCHUP_INTEL.md, "Patches"): each has a digest
 * at both and they differ. A key recorded at one patch only is not a change (unknown is never
 * "changed"), and with fewer than two patches recorded, or when the two newest recorded are not the
 * game's current patch and the one before it, there is nothing to say (null). The patches recorded
 * and the app's patches are cached; the named keys are one query.
 */
export async function riotChangesOf(db: Db, named: ReadonlyArray<{ kind: DigestKind; key: string }>): Promise<RiotChanges | null> {
  const keys = [...new Set(named.map((n) => `${n.kind}:${n.key}`))];
  if (!keys.length) return null;
  // The patches recorded, cached with the evidence (cleared when a patch's digests are recorded).
  const patches = await cachedFor(`${EVIDENCE_CACHE}:digest-patches`, 10 * 60_000, async () => {
    const res = await db.execute(sql`SELECT DISTINCT patch FROM static_digests WHERE kind <> 'patch'`);
    return ((res as unknown as { rows?: Array<{ patch: string }> }).rows ?? (res as unknown as Array<{ patch: string }>)).map((r) => r.patch).sort((a, b) => comparePatches(b, a));
  }, db);
  const [current, previous] = patches;
  if (!current || !previous) return null;
  // Only the pair the page and the evidence read (R11b review 1): the game's current patch and the one
  // before it among those the app has seen. Digests missed for the current patch, or for the one before
  // it, would date a change to the wrong patch: then nothing is said.
  const game = await getCurrentPatch(db);
  const known = await cachedFor("patch:known", 60_000, () => listPatchesDesc(db), db);
  const before = game ? known.filter((p) => comparePatches(p, game.patch) < 0).sort((a, b) => comparePatches(b, a))[0] : undefined;
  if (!game || current !== game.patch || previous !== before) return null;
  const rows = await db
    .select({ patch: staticDigests.patch, kind: staticDigests.kind, key: staticDigests.key, hash: staticDigests.hash })
    .from(staticDigests)
    .where(and(inArray(staticDigests.patch, [current, previous]), inArray(sql`${staticDigests.kind} || ':' || ${staticDigests.key}`, keys)));
  return { patch: publicPatchName(current), changed: changedOf(rows, current, previous, keys) };
}

/** The keys whose digests differ between two patches, of rows read at both; a key missing at either is left out. */
export function changedOf(rows: ReadonlyArray<{ patch: string; kind: string; key: string; hash: string }>, current: string, previous: string, keys: readonly string[]): Set<string> {
  const at = (patch: string, k: string) => rows.find((r) => r.patch === patch && `${r.kind}:${r.key}` === k)?.hash;
  return new Set(keys.filter((k) => {
    const a = at(current, k);
    const b = at(previous, k);
    return !!a && !!b && a !== b;
  }));
}
