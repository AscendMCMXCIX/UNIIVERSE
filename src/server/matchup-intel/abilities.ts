import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/server/db/types";
import { SLOTS, type DdragonAbility, type DdragonChampionAbilities } from "@/domain/matchup-intel/types";
import { cachedFor, invalidateCache } from "@/server/observability/cache";
import { StaticDataError, type StaticDataProvider } from "@/server/riot/static/provider";
import { mapWithConcurrency } from "@/server/riot/static/sync";

/*
  MATCHUP INTEL, Layer 1's roster-wide source: each champion's abilities from Riot's Data Dragon,
  stored by the version-check job once per game version (app_settings "champion_abilities") and
  read per champion by the page, so rendering never asks Riot (docs/DATA_PIPELINES.md, "Champion
  abilities (Matchup Intel)"). Static data Riot publishes before any game; nothing live.

  What is read from a champion's Data Dragon file (champion/<id>.json, or its entry in
  championFull.json), and how:
  - the passive → P, spells[0..3] → Q, W, E, R, in that order;
  - name, icon (image.full), ranks (maxrank; the passive has 1), and the base cooldown array as
    Riot gives it (the passive has none: Data Dragon has no passive cooldown field, so [] means
    "not in Riot's data", never "no cooldown");
  - maxammo, a string such as "-1": above 0 the ability holds that many charges, and its cooldown
    array is then the time between casts, not the recharge (src/domain/matchup-intel/cooldown.ts);
  - the short description, its markup removed (cleanDescription): Riot's words, never a source of
    numbers.
  Never read: tooltip, leveltip, effect/effectBurn, vars, datavalues, range/rangeBurn,
  costType/resource (their numbers are templates and placeholders, or wrong for many champions),
  and maxammo is never taken for a recharge time.

  scripts/matchup-intel/build-ability-fixture.mjs applies the same rules under plain Node to write
  the offline fixture (src/server/riot/fixtures/champion-abilities.fixture.json); abilities.test.ts
  holds the two to the same results.
*/

const KEY = "champion_abilities";
/**
 * The rules' revision. A stored index made under another one is made again from Data Dragon on
 * the next run (and the fixture must be rebuilt: abilities.test.ts fails until it is).
 */
export const ABILITY_RULES_FORMAT = 1;
/** The Data Dragon version the committed fixture was built from. */
export const ABILITY_FIXTURE_VERSION = "16.22.1";
/** Data Dragon champion ids ("Riven", "MonkeyKing"): checked before any id reaches a query or a URL. */
export const CHAMPION_ID = /^[A-Za-z0-9]{1,40}$/;
const VERSION = /^\d{1,4}(?:\.\d{1,4}){1,3}$/;
const CACHE_MS = 10 * 60_000;
/** More than this share of the roster failing writes nothing: the stored abilities stay (last known good). */
const MAX_FAILED_SHARE = 0.1;
/** The longest description kept, in characters; a longer one is cut at a word and ends in "…". */
export const DESCRIPTION_MAX = 400;

/** What app_settings "champion_abilities" holds. */
export interface ChampionAbilitiesIndex {
  format: number;
  /** The game version the index was last synced for. Each champion carries its own (an earlier one when that champion could not be read since). */
  version: string;
  /** ISO time of the last write. */
  updatedAt: string;
  /** "fixture": the committed offline copy, seeded when the champions came from the offline fixture. */
  source?: "fixture";
  champions: Record<string, DdragonChampionAbilities>;
}

/* ---------- The rules (mirrored in scripts/matchup-intel/build-ability-fixture.mjs) ---------- */

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", middot: "·", times: "×", deg: "°" };
/** Riot fills these in from data the rules never read ("{{ totaldamage }}", "@Effect1Amount@"). */
const PLACEHOLDER = /\{\{[^{}]*\}\}|@[A-Za-z][A-Za-z0-9_.*]*@/g;
const HAS_PLACEHOLDER = /\{\{|\}\}|@[A-Za-z][A-Za-z0-9_.*]*@/;
/** A placeholder that was a quantity: without its number, "% slow" or "for seconds" says nothing. */
const QUANTITY = /(?:\{\{[^{}]*\}\}|@[A-Za-z][A-Za-z0-9_.*]*@)\s*(?:%|(?:seconds?|secs?|s|units?|times|stacks?|charges?|levels?|ranks?|gold|meters?)\b)/i;
/** A word left needing what followed it: "heals for." */
const DANGLING = /\b(?:by|to|of|for|from|with|at|per|every|than|over|under|plus)\s*(?:[.,;:!?)]|$)/i;

function decodeEntities(text: string): string {
  return text.replace(/&(#[xX][0-9A-Fa-f]{1,6}|#[0-9]{1,7}|[A-Za-z]{2,8});/g, (whole: string, ref: string) => {
    if (ref[0] !== "#") return Object.hasOwn(ENTITIES, ref) ? ENTITIES[ref]! : whole;
    const code = ref[1] === "x" || ref[1] === "X" ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
    if (code === 9 || code === 10 || code === 13) return " ";
    if (code < 0x20 || (code >= 0x7f && code < 0xa0) || (code >= 0xd800 && code <= 0xdfff) || code > 0x10ffff) return "";
    return String.fromCodePoint(code);
  });
}

function capDescription(text: string): string {
  if (text.length <= DESCRIPTION_MAX) return text;
  const room = DESCRIPTION_MAX - 1;
  const slice = text.slice(0, room + 1);
  const at = slice.lastIndexOf(" ");
  const head = at >= room / 2 ? slice.slice(0, at) : slice.slice(0, room);
  return `${head.replace(/[\uD800-\uDBFF]$/, "").replace(/[\s.,;:(–—-]+$/, "")}…`;
}

/**
 * Riot's short description as plain text: every markup tag removed with its inner text kept (a
 * line break becomes a space), Riot's inline icons (%i:OnHit%) removed, entities decoded,
 * whitespace collapsed, at most DESCRIPTION_MAX characters. A placeholder Riot fills in elsewhere
 * is removed and the words around it kept when they still read; when it stood for a quantity, or
 * removing it leaves a dangling phrase, the description is dropped (""), never shown half-filled.
 */
export function cleanDescription(raw: string): string {
  let text = raw
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/?[A-Za-z][^<>]*>/g, "")
    .replace(/%i:[A-Za-z0-9_]+%/g, "");
  text = decodeEntities(text);
  if (HAS_PLACEHOLDER.test(text)) {
    if (QUANTITY.test(text)) return "";
    text = text
      .replace(PLACEHOLDER, " ")
      .replace(/[([]\s*[^A-Za-z0-9()[\]]*\s*[)\]]/g, " ")
      .replace(/\s+/g, " ")
      .replace(/\s+([.,;:!?])/g, "$1")
      .replace(/([.,;:!?])(?:\s*[,;:])+/g, "$1")
      .trim();
    if (HAS_PLACEHOLDER.test(text) || DANGLING.test(text) || (text.match(/[A-Za-z]+/g)?.length ?? 0) < 4) return "";
  }
  return capDescription(text.replace(/\s+/g, " ").trim());
}

const name = z.string().trim().min(1).max(120);
const icon = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,119}$/).refine((s) => !s.includes(".."));
const description = z.string().max(20_000).optional();
const passiveSchema = z.object({ name, description, image: z.object({ full: icon }) });
const spellSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_]{1,80}$/),
  name,
  description,
  maxrank: z.number().int().min(1).max(10),
  cooldown: z.array(z.number().min(0).max(100_000)).max(10),
  maxammo: z.union([z.string().max(20), z.number()]).optional(),
  image: z.object({ full: icon }),
});
const detailSchema = z.object({ id: z.string().regex(CHAMPION_ID), passive: passiveSchema, spells: z.array(spellSchema).min(4) });

const SPELL_SLOTS = ["Q", "W", "E", "R"] as const;

/** Data Dragon's maxammo ("-1", "3"): a positive whole number of charges, or null. */
function chargesOf(maxammo: string | number | undefined): number | null {
  const n = Number(maxammo);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * One champion's abilities from its Data Dragon detail object (`data[<id>]` of champion/<id>.json
 * or championFull.json) at `version`, or null when the input is not that shape. Never throws.
 */
export function compactChampionAbilities(detail: unknown, version: string): DdragonChampionAbilities | null {
  try {
    if (typeof version !== "string" || !VERSION.test(version)) return null;
    const parsed = detailSchema.safeParse(detail);
    if (!parsed.success) return null;
    const { id, passive, spells } = parsed.data;
    const abilities: DdragonAbility[] = [
      { slot: "P", id: null, name: passive.name, icon: passive.image.full, maxRank: 1, cooldown: [], charges: null, description: cleanDescription(passive.description ?? "") },
      ...SPELL_SLOTS.map((slot, i): DdragonAbility => {
        const s = spells[i]!;
        return { slot, id: s.id, name: s.name, icon: s.image.full, maxRank: s.maxrank, cooldown: [...s.cooldown], charges: chargesOf(s.maxammo), description: cleanDescription(s.description ?? "") };
      }),
    ];
    return { championId: id, version, abilities };
  } catch {
    return null;
  }
}

/* ---------- The store ---------- */

const rowsOf = <T,>(result: unknown): T[] => ((result as { rows?: T[] }).rows ?? (result as T[])) as T[];
const parsedJson = (value: unknown): unknown => (typeof value === "string" ? JSON.parse(value) : value);

/** What is stored, read in one small statement: never the abilities themselves. */
interface StoredState {
  exists: boolean;
  version: string | null;
  source: string | null;
  format: number | null;
  /** Champions in the stored index. */
  stored: number;
  /** Active champions (the roster). */
  roster: number;
  /** Active champions whose abilities this run should (re)read, and whether each has a record now. */
  due: Array<{ id: string; has: boolean }>;
}

async function readState(db: Db, version: string, mode: "due" | "all" | "none"): Promise<StoredState> {
  const dueRule =
    mode === "none"
      ? sql`FALSE`
      : mode === "all"
        ? sql`TRUE`
        : sql`(s.value IS NULL OR s.value->>'version' IS DISTINCT FROM ${version} OR s.value->>'source' IS NOT NULL OR s.value->>'format' IS DISTINCT FROM ${String(ABILITY_RULES_FORMAT)} OR (s.value->'champions'->c.id->>'version') IS DISTINCT FROM ${version})`;
  const result = await db.execute(sql`
    SELECT s.key IS NOT NULL AS present,
      s.value->>'version' AS version, s.value->>'source' AS source, s.value->>'format' AS format,
      CASE WHEN jsonb_typeof(s.value->'champions') = 'object' THEN (SELECT count(*) FROM jsonb_object_keys(s.value->'champions'))::int ELSE 0 END AS stored,
      (SELECT count(*)::int FROM champions c WHERE c.is_active) AS roster,
      (SELECT coalesce(json_agg(json_build_array(c.id, (s.value->'champions'->c.id) IS NOT NULL) ORDER BY c.id), '[]'::json)
         FROM champions c WHERE c.is_active AND ${dueRule}) AS due
    FROM (SELECT 1) AS one LEFT JOIN app_settings s ON s.key = ${KEY}`);
  const row = rowsOf<{ present: boolean; version: string | null; source: string | null; format: string | null; stored: number | string; roster: number | string; due: unknown }>(result)[0];
  const due = (parsedJson(row?.due) ?? []) as Array<[string, boolean]>;
  return {
    exists: Boolean(row?.present),
    version: row?.version ?? null,
    source: row?.source ?? null,
    format: row?.format == null ? null : Number(row.format),
    stored: Number(row?.stored ?? 0),
    roster: Number(row?.roster ?? 0),
    due: due.map(([id, has]) => ({ id, has: Boolean(has) })),
  };
}

/**
 * Writes the index: "replace" stores exactly `value`; "merge" adds `value`'s champions to the
 * stored ones (each refreshed champion replaces its earlier record, the others keep theirs).
 * A fixture write never replaces data read from Data Dragon. Returns the champions stored after
 * it, or null when nothing was written.
 */
async function writeIndex(db: Db, value: ChampionAbilitiesIndex, mode: "replace" | "merge" | "fixture"): Promise<number | null> {
  const merged =
    mode === "merge"
      ? sql`EXCLUDED.value || jsonb_build_object('champions', (CASE WHEN jsonb_typeof(app_settings.value->'champions') = 'object' THEN app_settings.value->'champions' ELSE '{}'::jsonb END) || (EXCLUDED.value->'champions'))`
      : sql`EXCLUDED.value`;
  const onlyOverFixture = mode === "fixture" ? sql`WHERE app_settings.value->>'source' = 'fixture'` : sql``;
  const result = await db.execute(sql`
    INSERT INTO app_settings (key, value, updated_at) VALUES (${KEY}, ${JSON.stringify(value)}::jsonb, ${value.updatedAt}::timestamptz)
    ON CONFLICT (key) DO UPDATE SET value = ${merged}, updated_at = EXCLUDED.updated_at ${onlyOverFixture}
    RETURNING (SELECT count(*) FROM jsonb_object_keys(app_settings.value->'champions'))::int AS stored`);
  const row = rowsOf<{ stored: number | string }>(result)[0];
  invalidateCache(KEY);
  return row ? Number(row.stored) : null;
}

export interface AbilitySyncOptions {
  /** Detail files the champion sync already read at this version, by champion id (StaticSyncResult.championDetails). */
  details?: ReadonlyMap<string, unknown>;
  /** Reads the files still missing (the Data Dragon provider, with its own timeout). */
  provider?: Pick<StaticDataProvider, "fetchChampionDetail">;
  /** Files read at once (default 6). */
  concurrency?: number;
  /** No file is requested after this time (ms since the epoch); the rest wait for the next run. */
  deadline?: number;
  /** Read every champion again, even when the stored version matches. */
  force?: boolean;
  now?: () => Date;
  log?: (message: string) => void;
}

/** What a sync did, in counts only (it goes into the job's summary). */
export interface AbilitySyncResult {
  version: string;
  source: "ddragon" | "fixture";
  /** The stored index was written. */
  changed: boolean;
  /** Too many champions could not be read: nothing was written, the stored abilities stay. */
  degraded: boolean;
  error?: string;
  /** Active champions. */
  roster: number;
  /** Champions in the stored index after the run. */
  stored: number;
  /** Champions written at this version by this run. */
  refreshed: number;
  /** Champions due this run that keep their earlier record. */
  kept: number;
  /** Champions whose file could not be read or was not in the expected shape. */
  failed: number;
  /** Champions not tried: the deadline came first (the next run tries them). */
  deferred: number;
  /** Files this sync requested itself (the rest came from the champion sync). */
  fetched: number;
}

/**
 * Brings the stored abilities to `version`. Cheap when nothing changed: one small read. It reads
 * a champion again when the stored index is for another version, was made under other rules or is
 * the offline fixture, or that champion's own record is missing or older. Files the champion sync
 * already read are used as they are; the rest are requested from the provider (6 at a time, none
 * after the deadline). A champion that cannot be read keeps its earlier record; when more than
 * 10% of the roster cannot be read, nothing is written and the run is degraded (last known good).
 */
export async function syncChampionAbilities(db: Db, version: string, options: AbilitySyncOptions = {}): Promise<AbilitySyncResult> {
  const blank: AbilitySyncResult = { version, source: "ddragon", changed: false, degraded: false, roster: 0, stored: 0, refreshed: 0, kept: 0, failed: 0, deferred: 0, fetched: 0 };
  if (!VERSION.test(version)) return { ...blank, degraded: true, error: `Champion abilities not refreshed: unrecognised version "${version}".` };
  const state = await readState(db, version, options.force ? "all" : "due");
  const base: AbilitySyncResult = { ...blank, roster: state.roster, stored: state.stored };
  if (state.due.length === 0) return base;

  const records: Record<string, DdragonChampionAbilities> = {};
  const failures = new Map<string, number>();
  let failed = 0;
  let deferred = 0;
  let fetched = 0;
  const fail = (kind: string) => {
    failed += 1;
    failures.set(kind, (failures.get(kind) ?? 0) + 1);
  };
  const take = (id: string, detail: unknown) => {
    const record = detail == null ? null : compactChampionAbilities(detail, version);
    if (record && record.championId === id) records[id] = record;
    else fail(detail == null ? "missing" : "unreadable");
  };

  const toFetch: string[] = [];
  for (const { id } of state.due) {
    const given = options.details?.get(id);
    if (given === undefined) toFetch.push(id);
    else take(id, given);
  }
  const provider = options.provider;
  if (toFetch.length && !provider?.fetchChampionDetail) deferred += toFetch.length;
  else if (toFetch.length) {
    await mapWithConcurrency(toFetch, options.concurrency ?? 6, async (id) => {
      if (options.deadline !== undefined && Date.now() >= options.deadline) {
        deferred += 1;
        return;
      }
      fetched += 1;
      let detail: unknown;
      try {
        detail = await provider!.fetchChampionDetail!(version, id);
      } catch (err) {
        fail(err instanceof StaticDataError ? err.kind : "network");
        return;
      }
      take(id, detail);
    });
  }

  const refreshed = Object.keys(records).length;
  const withRecord = (d: { id: string; has: boolean }) => d.has;
  const why = [...failures].map(([kind, n]) => `${kind} ${n}`).join(", ");
  const counts = `${failed} failed${why ? ` (${why})` : ""}${deferred ? `, ${deferred} left for the next run` : ""}`;
  if (failed > state.roster * MAX_FAILED_SHARE) {
    const error = `Champion abilities not refreshed: ${failed} of ${state.roster} champions could not be read for ${version}; the stored abilities are kept.`;
    options.log?.(`${error} (${counts}, ${fetched} files requested)`);
    return { ...base, degraded: true, error, kept: state.due.filter(withRecord).length, failed, deferred, fetched };
  }
  if (refreshed === 0) {
    options.log?.(`Champion abilities ${version}: nothing new (${counts}, ${fetched} files requested).`);
    return { ...base, kept: state.due.filter(withRecord).length, failed, deferred, fetched };
  }
  // An index from the fixture or from other rules is replaced whole: what could not be read again is left out, never mixed in.
  const replace = !state.exists || state.source !== null || state.format !== ABILITY_RULES_FORMAT;
  const now = (options.now ?? (() => new Date()))();
  const stored = (await writeIndex(db, { format: ABILITY_RULES_FORMAT, version, updatedAt: now.toISOString(), champions: records }, replace ? "replace" : "merge")) ?? state.stored;
  const kept = replace ? 0 : state.due.filter((d) => d.has && !(d.id in records)).length;
  options.log?.(`Champion abilities ${version}: ${refreshed} refreshed, ${kept} kept from earlier, ${counts}, ${fetched} files requested, ${stored} stored.`);
  return { ...base, changed: true, stored, refreshed, kept, failed, deferred, fetched };
}

/**
 * Stores the committed offline copy (Data Dragon 16.22.1, labelled source "fixture") when the
 * champions came from the offline fixture, or a demo has none stored. Never replaces abilities
 * read from Data Dragon; the first real sync replaces it.
 */
export async function seedChampionAbilitiesFromFixture(db: Db, options: { now?: () => Date; log?: (message: string) => void } = {}): Promise<AbilitySyncResult> {
  const state = await readState(db, ABILITY_FIXTURE_VERSION, "none");
  const base: AbilitySyncResult = { version: ABILITY_FIXTURE_VERSION, source: "fixture", changed: false, degraded: false, roster: state.roster, stored: state.stored, refreshed: 0, kept: 0, failed: 0, deferred: 0, fetched: 0 };
  if (state.exists && state.source !== "fixture") return { ...base, version: state.version ?? ABILITY_FIXTURE_VERSION, source: "ddragon" };
  if (state.exists && state.version === ABILITY_FIXTURE_VERSION && state.format === ABILITY_RULES_FORMAT && state.stored > 0) return base;
  const { abilityFixture } = await import("./ability-fixture");
  const fixture = abilityFixture();
  const now = (options.now ?? (() => new Date()))();
  const stored = await writeIndex(db, { format: fixture.format, version: fixture.version, updatedAt: now.toISOString(), source: "fixture", champions: fixture.champions }, "fixture");
  if (stored === null) return { ...base, source: "ddragon" };
  options.log?.(`Champion abilities: the offline fixture (Data Dragon ${fixture.version}) stored for ${stored} champions.`);
  return { ...base, changed: true, stored, refreshed: stored };
}

/* ---------- Reading, per champion ---------- */

const storedAbility = z.object({
  slot: z.enum(SLOTS),
  id: z.string().nullable(),
  name: z.string(),
  icon: z.string(),
  maxRank: z.number().int().min(1),
  cooldown: z.array(z.number()),
  charges: z.number().int().positive().nullable(),
  description: z.string(),
});
const storedChampion = z.object({ championId: z.string(), version: z.string(), abilities: z.array(storedAbility).length(SLOTS.length) });

/** A stored record as the contract types it, or null when it is not one (or not this champion's). */
function storedRecord(value: unknown, id: string): DdragonChampionAbilities | null {
  const parsed = storedChampion.safeParse(value);
  if (!parsed.success || parsed.data.championId !== id || parsed.data.abilities.some((a, i) => a.slot !== SLOTS[i])) return null;
  return parsed.data;
}

interface Entry {
  /** The stored index's version when this champion was read; null when nothing is stored. */
  version: string | null;
  champion: DdragonChampionAbilities | null;
}

/** One statement for the champions given: the index's version and only their records (a few KB, not the whole index). */
async function readChampions(db: Db, ids: readonly string[]): Promise<Map<string, Entry>> {
  const result = await db.execute(sql`
    SELECT s.value->>'version' AS version,
      (SELECT coalesce(jsonb_object_agg(k.id, s.value->'champions'->k.id), '{}'::jsonb)
         FROM jsonb_array_elements_text(${JSON.stringify(ids)}::jsonb) AS k(id)
        WHERE (s.value->'champions'->k.id) IS NOT NULL) AS champions
    FROM app_settings s WHERE s.key = ${KEY}`);
  const row = rowsOf<{ version: string | null; champions: unknown }>(result)[0];
  const found = (parsedJson(row?.champions) ?? {}) as Record<string, unknown>;
  const version = typeof row?.version === "string" ? row.version : null;
  return new Map(ids.map((id) => [id, { version, champion: storedRecord(found[id], id) }]));
}

function compareVersions(a: string, b: string): number {
  const x = a.split(".").map(Number);
  const y = b.split(".").map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/**
 * The stored abilities of the given champions; a champion with none stored yet maps to null, as
 * does an id that is not a Data Dragon champion id (never used in a query). Each champion is kept
 * in this instance's cache for 10 minutes (cleared by a sync that writes); the ones not cached are
 * read together in one statement. `version` is the stored index's game version (the newest seen
 * among the champions asked for), or null when nothing is stored or no valid id was given. Reads
 * the database only: never Riot.
 */
export async function loadChampionAbilities(db: Db, championIds: readonly string[]): Promise<{ version: string | null; champions: Record<string, DdragonChampionAbilities | null> }> {
  const champions: Record<string, DdragonChampionAbilities | null> = Object.fromEntries(championIds.map((id) => [id, null]));
  const ids = [...new Set(championIds.filter((id) => typeof id === "string" && CHAMPION_ID.test(id)))];
  if (ids.length === 0) return { version: null, champions };
  // Every champion not in the cache joins one statement: cachedFor calls its loader at once, so
  // the loaders of this call have all asked before the statement starts.
  const wanted: string[] = [];
  let batch: Promise<Map<string, Entry>> | null = null;
  const read = (id: string): Promise<Entry> => {
    wanted.push(id);
    batch ??= Promise.resolve().then(() => readChampions(db, wanted));
    return batch.then((found) => found.get(id) ?? { version: null, champion: null });
  };
  const entries = await Promise.all(ids.map((id) => cachedFor(`${KEY}:${id}`, CACHE_MS, () => read(id), db)));
  let version: string | null = null;
  ids.forEach((id, i) => {
    const entry = entries[i]!;
    champions[id] = entry.champion ? structuredClone(entry.champion) : null;
    if (entry.version && (version === null || compareVersions(entry.version, version) > 0)) version = entry.version;
  });
  return { version, champions };
}
