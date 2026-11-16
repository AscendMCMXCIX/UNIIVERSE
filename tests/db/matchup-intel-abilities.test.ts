import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { sql, type SQL } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import type { Db } from "@/server/db/types";
import type { DdragonChampionAbilities } from "@/domain/matchup-intel/types";
import { StaticDataError, type DdragonChampion, type DdragonChampionDetail, type StaticDataProvider } from "@/server/riot/static/provider";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { listChampions } from "@/server/repositories/champions";
import { invalidateCache } from "@/server/observability/cache";
import { loadChampionAbilities, seedChampionAbilitiesFromFixture, syncChampionAbilities } from "@/server/matchup-intel/abilities";
import { abilityFixture } from "@/server/matchup-intel/ability-fixture";
import { runJob } from "@/server/jobs";

/*
  Matchup Intel's champion abilities in the database (app_settings "champion_abilities"): stored
  by the version-check job once per game version, from the detail files the champion sync already
  read; read per champion by the page, only the champions it shows. What must hold: an unchanged
  version reads no file again, and its check reads the stored document once; a champion that
  cannot be read keeps its earlier record, also after a change of rules; more than 10% failing
  writes nothing (last known good) and stops the requests; offline, the committed fixture is
  stored; a malformed id never reaches a query, and an id off the roster is neither read nor cached.
*/

const rowsOf = <T,>(result: unknown): T[] => ((result as { rows?: T[] }).rows ?? (result as T[])) as T[];
const parsed = (value: unknown) => (typeof value === "string" ? JSON.parse(value) : value);

/** The database with every statement counted, and each raw statement and answer kept (to see what a read asked and sent back). */
function watched(db: Db) {
  const answers: unknown[] = [];
  const queries: SQL[] = [];
  let statements = 0;
  const proxy = new Proxy(db, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver) as unknown;
      if (typeof value !== "function" || !["execute", "select", "insert", "update", "delete", "transaction"].includes(String(prop))) return value;
      return (...args: unknown[]) => {
        statements += 1;
        const out = (value as (...a: unknown[]) => unknown).apply(target, args);
        if (prop !== "execute") return out;
        queries.push(args[0] as SQL);
        // Drizzle runs a query on every then(): settle it once, and hand the caller that promise.
        const once = Promise.resolve(out);
        once.then((r) => answers.push(r), () => undefined);
        return once;
      };
    },
  });
  return { db: proxy as Db, statements: () => statements, answers, queries };
}

/** The shared buffers (8 KB pages) PostgreSQL touched running a statement, from EXPLAIN (ANALYZE, BUFFERS). */
async function buffersOf(db: Db, query: SQL): Promise<number> {
  const [row] = rowsOf<Record<string, unknown>>(await db.execute(sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query}`));
  const [plan] = parsed(Object.values(row!)[0]) as Array<{ Plan: Record<string, unknown> }>;
  return Number(plan!.Plan["Shared Hit Blocks"] ?? 0) + Number(plan!.Plan["Shared Read Blocks"] ?? 0);
}

/** The cache entries of this process for a champion's abilities (src/server/observability/cache.ts). */
const cachedAbilityKeys = (id: string) => [...(globalThis.__uniiverseCache?.keys() ?? [])].filter((key) => key.endsWith(`champion_abilities:${id}`));

const ROSTER = ["Aatrox", "Ahri", "Akali", "Alistar", "Amumu", "Anivia", "Annie", "Ashe", "Azir", "Bard"];

function champ(id: string, key: number): DdragonChampion {
  return { id, key: String(key), name: id, title: "", tags: ["Fighter"], partype: "Mana", info: { attack: 5, defense: 5, magic: 5, difficulty: 5 }, stats: { attackrange: 125 }, image: { full: `${id}.png` } };
}

/** A detail file shaped like Data Dragon's; every basic ability's cooldown is the version's minor number, so a record shows which version it came from. */
function detailFile(id: string, version: string): DdragonChampionDetail {
  const minor = Number(version.split(".")[1]);
  return {
    id,
    passive: { name: `${id} Passive`, description: `${id}'s <keywordMajor>passive</keywordMajor> marks.<br>Then it fades.`, image: { full: `${id}_P.png` } },
    spells: ["Q", "W", "E", "R"].map((slot) => ({
      id: `${id}${slot}`,
      name: `${id} ${slot}`,
      description: `The ${slot} of ${id} deals damage.`,
      tooltip: "Deals {{ totaldamage }} damage over {{ duration }} seconds.",
      effect: [null, [10, 20, 30, 40, 50]],
      maxrank: slot === "R" ? 3 : 5,
      cooldown: slot === "R" ? [100, 90, 80] : [minor, minor, minor, minor, minor],
      maxammo: slot === "E" ? "2" : "-1",
      image: { full: `${id}${slot}.png` },
    })),
    stats: { hp: 600 },
    skins: [{ id: `${id}-0`, num: 0, name: "default" }],
  } as unknown as DdragonChampionDetail;
}

class FakeDdragon implements StaticDataProvider {
  name = "ddragon";
  versions = ["16.21.1"];
  /** Champion ids whose detail file was requested, in order. */
  requests: string[] = [];
  failing = new Set<string>();
  async fetchVersions() {
    return this.versions;
  }
  async fetchChampionList(version: string) {
    return { version, champions: ROSTER.map((id, i) => champ(id, i + 1)) };
  }
  async fetchChampionDetail(version: string, id: string) {
    this.requests.push(id);
    if (this.failing.has(id)) throw new StaticDataError(`Data Dragon responded 500 for /cdn/${version}/data/en_US/champion/${id}.json`, "http");
    return detailFile(id, version);
  }
}

async function storedIndex(db: Db) {
  const [row] = rowsOf<{ value: unknown }>(await db.execute(sql`SELECT value FROM app_settings WHERE key = 'champion_abilities'`));
  return (row ? parsed(row.value) : null) as { format: number; version: string; updatedAt: string; source?: string; champions: Record<string, { version: string; format?: number; abilities: Array<{ slot: string; cooldown: number[] }> }> } | null;
}

/** A Data Dragon-shaped detail file made back from a record: its names, descriptions, icons and numbers, so a sync stores records of Data Dragon's own size. */
function detailFromRecord(record: DdragonChampionAbilities): unknown {
  const [passive, ...spells] = record.abilities;
  return {
    id: record.championId,
    passive: { name: passive!.name, description: passive!.description, image: { full: passive!.icon } },
    spells: spells.map((a) => ({ id: a.id, name: a.name, description: a.description, maxrank: a.maxRank, cooldown: a.cooldown, maxammo: a.charges === null ? "-1" : String(a.charges), image: { full: a.icon } })),
  };
}

const qCooldown = (record: { abilities: Array<{ slot: string; cooldown: number[] }> } | null | undefined) => record?.abilities.find((a) => a.slot === "Q")?.cooldown;

let handle: DbHandle;
const provider = new FakeDdragon();

beforeAll(async () => {
  handle = await testDb();
}, 60_000);
afterAll(async () => {
  await handle.close();
});

describe("champion abilities: sync and read", () => {
  it("stores every champion from the files the champion sync read, and a load reads back only the champions asked for", async () => {
    const db = handle.db;
    const champions = await syncStaticData(db, provider);
    expect(champions.version).toBe("16.21.1");
    expect(champions.championDetails?.size).toBe(ROSTER.length);
    expect(provider.requests).toHaveLength(ROSTER.length);

    const result = await syncChampionAbilities(db, "16.21.1", { provider, details: champions.championDetails });
    expect(result).toMatchObject({ version: "16.21.1", changed: true, degraded: false, roster: 10, stored: 10, refreshed: 10, kept: 0, failed: 0, deferred: 0, fetched: 0 });
    // No file was read twice: the champion sync's copies were used.
    expect(provider.requests).toHaveLength(ROSTER.length);
    const index = await storedIndex(db);
    expect(index).toMatchObject({ format: 1, version: "16.21.1" });
    expect(index).not.toHaveProperty("source");
    expect(Object.keys(index!.champions).sort()).toEqual([...ROSTER].sort());
    expect(Number.isNaN(Date.parse(index!.updatedAt))).toBe(false);

    const w = watched(db);
    // The roster is the cached champion list the page shows anyway; read it first, then count.
    await listChampions(w.db);
    const before = w.statements();
    const loaded = await loadChampionAbilities(w.db, ["Ahri", "Akali", "Zed"]);
    expect(loaded.version).toBe("16.21.1");
    // Read from Data Dragon by a sync: not the offline copy, and every record readable.
    expect(loaded).toMatchObject({ offline: [], unreadable: [] });
    expect(Object.keys(loaded.champions)).toEqual(["Ahri", "Akali", "Zed"]);
    // Zed is not on this roster: null, and never read.
    expect(loaded.champions.Zed).toBeNull();
    const ahri = loaded.champions.Ahri!;
    expect(ahri).toMatchObject({ championId: "Ahri", version: "16.21.1" });
    // The contract's fields only: the rules' revision stays in the store.
    expect(Object.keys(ahri)).toEqual(["championId", "version", "abilities"]);
    expect(index!.champions.Ahri).toMatchObject({ version: "16.21.1", format: 1 });
    expect(ahri.abilities.map((a) => a.slot)).toEqual(["P", "Q", "W", "E", "R"]);
    expect(ahri.abilities[0]).toEqual({ slot: "P", id: null, name: "Ahri Passive", icon: "Ahri_P.png", maxRank: 1, cooldown: [], charges: null, description: "Ahri's passive marks. Then it fades." });
    expect(ahri.abilities[1]).toMatchObject({ slot: "Q", id: "AhriQ", maxRank: 5, cooldown: [21, 21, 21, 21, 21], charges: null, description: "The Q of Ahri deals damage." });
    expect(ahri.abilities[3]).toMatchObject({ slot: "E", charges: 2 });
    expect(ahri.abilities[4]).toMatchObject({ slot: "R", maxRank: 3, cooldown: [100, 90, 80] });
    // One statement, and the database sent back only the two champions asked for.
    expect(w.statements() - before).toBe(1);
    const [answer] = rowsOf<{ champions: unknown }>(w.answers[0]);
    expect(Object.keys(parsed(answer!.champions) as object).sort()).toEqual(["Ahri", "Akali"]);
    expect(JSON.stringify(answer).length).toBeLessThan(3_000);

    // Cached per champion: the same champions again cost nothing; a new one is read alone.
    loaded.champions.Ahri!.abilities.length = 0; // a caller changing its copy changes nothing stored
    expect((await loadChampionAbilities(w.db, ["Akali", "Ahri"])).champions.Ahri!.abilities).toHaveLength(5);
    expect(w.statements() - before).toBe(1);
    await loadChampionAbilities(w.db, ["Ahri", "Bard"]);
    expect(w.statements() - before).toBe(2);
  });

  it("does nothing more while the version stays: no file is read, one small read", async () => {
    const w = watched(handle.db);
    const before = provider.requests.length;
    const result = await syncChampionAbilities(w.db, "16.21.1", { provider });
    expect(result).toMatchObject({ changed: false, degraded: false, stored: 10, refreshed: 0, kept: 0, failed: 0, fetched: 0 });
    expect(provider.requests.length).toBe(before);
    expect(w.statements()).toBe(1);
    expect(JSON.stringify(rowsOf(w.answers[0])).length).toBeLessThan(300);
  });

  it("keeps a champion's earlier record when its file cannot be read, and reads only that one next time", async () => {
    const db = handle.db;
    provider.failing = new Set(["Akali"]);
    const before = provider.requests.length;
    const result = await syncChampionAbilities(db, "16.22.1", { provider });
    expect(result).toMatchObject({ version: "16.22.1", changed: true, degraded: false, stored: 10, refreshed: 9, kept: 1, failed: 1, fetched: 10 });
    expect(provider.requests.length - before).toBe(10);

    const loaded = await loadChampionAbilities(db, ["Akali", "Ahri"]);
    // Each record carries its own version (the one for its labels, icons and freshness). Akali's
    // is still 16.21.1, so no version is shared and none is given for the two together.
    expect(loaded.champions.Akali).toMatchObject({ version: "16.21.1" });
    expect(qCooldown(loaded.champions.Akali)).toEqual([21, 21, 21, 21, 21]);
    expect(loaded.champions.Ahri).toMatchObject({ version: "16.22.1" });
    expect(qCooldown(loaded.champions.Ahri)).toEqual([22, 22, 22, 22, 22]);
    expect(loaded.version).toBeNull();
    expect((await loadChampionAbilities(db, ["Ahri", "Annie"])).version).toBe("16.22.1");
    expect((await loadChampionAbilities(db, ["Akali"])).version).toBe("16.21.1");

    provider.failing = new Set();
    const next = provider.requests.length;
    expect(await syncChampionAbilities(db, "16.22.1", { provider })).toMatchObject({ changed: true, refreshed: 1, kept: 0, failed: 0, fetched: 1, stored: 10 });
    expect(provider.requests.slice(next)).toEqual(["Akali"]);
    expect((await loadChampionAbilities(db, ["Akali"])).champions.Akali).toMatchObject({ version: "16.22.1" });
  });

  it("writes nothing when more than 10% of the roster cannot be read (last known good)", async () => {
    const db = handle.db;
    const before = await storedIndex(db);
    provider.failing = new Set(["Aatrox", "Ahri"]);
    const result = await syncChampionAbilities(db, "16.23.1", { provider });
    provider.failing = new Set();
    expect(result).toMatchObject({ version: "16.23.1", changed: false, degraded: true, failed: 2, refreshed: 0, kept: 10, stored: 10 });
    expect(result.error).toBe("Champion abilities not refreshed: 2 of 10 champions could not be read for 16.23.1; the stored abilities are kept.");
    expect(await storedIndex(db)).toEqual(before);
    const loaded = await loadChampionAbilities(db, ["Annie", "Ahri"]);
    expect(loaded.version).toBe("16.22.1");
    expect(loaded.champions.Annie).toMatchObject({ version: "16.22.1" });
  });

  it("stops requesting files at the deadline; the champions not tried wait for the next run", async () => {
    const db = handle.db;
    const before = provider.requests.length;
    const stopped = await syncChampionAbilities(db, "16.23.1", { provider, deadline: Date.now() - 1 });
    expect(stopped).toMatchObject({ changed: false, degraded: false, deferred: 10, failed: 0, fetched: 0, kept: 10 });
    expect(provider.requests.length).toBe(before);
    expect((await storedIndex(db))!.version).toBe("16.22.1");
    expect(await syncChampionAbilities(db, "16.23.1", { provider })).toMatchObject({ changed: true, refreshed: 10, deferred: 0, stored: 10 });
  });

  it("never uses a malformed champion id in a query", async () => {
    const w = watched(handle.db);
    const bad = ["Riven'; DROP TABLE app_settings; --", "../etc/passwd", "", "A".repeat(41), "Riv en", "Ахри", "Riven\u0000"];
    const loaded = await loadChampionAbilities(w.db, bad);
    expect(loaded).toEqual({ version: null, champions: Object.fromEntries(bad.map((id) => [id, null])), offline: [], unreadable: [] });
    expect(w.statements()).toBe(0);
    // Mixed with valid ones: those are read, the malformed ones stay null and never reach the statement.
    await listChampions(w.db);
    const before = w.statements();
    const mixed = await loadChampionAbilities(w.db, ["Riv en", "Annie"]);
    expect(mixed.champions["Riv en"]).toBeNull();
    expect(mixed.champions.Annie).toMatchObject({ championId: "Annie", version: "16.23.1" });
    expect(w.statements() - before).toBe(1);
  });

  it("reads and caches only champions on the roster: an id that names none costs no query and leaves nothing cached", async () => {
    const w = watched(handle.db);
    await listChampions(w.db);
    const before = w.statements();
    // Well-formed ids, as a page could take them from its URL, none of them a champion.
    const strangers = Array.from({ length: 50 }, (_, i) => `NotAChampion${i}`);
    expect(await loadChampionAbilities(w.db, strangers)).toEqual({ version: null, champions: Object.fromEntries(strangers.map((id) => [id, null])), offline: [], unreadable: [] });
    expect(w.statements()).toBe(before);
    expect(strangers.flatMap(cachedAbilityKeys)).toEqual([]);
    // Beside a champion: only the champion is read and cached.
    const mixed = await loadChampionAbilities(w.db, ["NotAChampion7", "Bard"]);
    expect(mixed.champions.NotAChampion7).toBeNull();
    expect(mixed.champions.Bard).toMatchObject({ championId: "Bard", version: "16.23.1" });
    expect(w.statements() - before).toBe(1);
    expect(cachedAbilityKeys("NotAChampion7")).toEqual([]);
    expect(cachedAbilityKeys("Bard").length).toBeGreaterThan(0);
  });

  it("after a change of rules, a champion that cannot be read keeps its record, and only it is read on the next run", async () => {
    const db = handle.db;
    // The stored index as an earlier revision of the rules wrote it: it, and each record, say format 0.
    await db.execute(sql`UPDATE app_settings SET value = value || jsonb_build_object('format', 0, 'champions', (SELECT jsonb_object_agg(e.key, e.value || '{"format": 0}'::jsonb) FROM jsonb_each(value->'champions') AS e)) WHERE key = 'champion_abilities'`);
    provider.failing = new Set(["Akali"]);
    const before = provider.requests.length;
    const result = await syncChampionAbilities(db, "16.23.1", { provider });
    provider.failing = new Set();
    // The version did not change, so every file is requested; Akali's failure takes nothing away.
    expect(result).toMatchObject({ version: "16.23.1", changed: true, degraded: false, refreshed: 9, kept: 1, failed: 1, fetched: 10, stored: 10 });
    expect(provider.requests.length - before).toBe(10);
    const index = await storedIndex(db);
    expect(index!.format).toBe(1);
    expect(index!.champions.Akali).toMatchObject({ version: "16.23.1", format: 0 });
    expect(Object.values(index!.champions).filter((c) => c.format === 1)).toHaveLength(9);
    expect((await loadChampionAbilities(db, ["Akali"])).champions.Akali).toMatchObject({ championId: "Akali", version: "16.23.1" });

    const next = provider.requests.length;
    expect(await syncChampionAbilities(db, "16.23.1", { provider })).toMatchObject({ changed: true, refreshed: 1, kept: 0, failed: 0, fetched: 1, stored: 10 });
    expect(provider.requests.slice(next)).toEqual(["Akali"]);
    expect((await storedIndex(db))!.champions.Akali).toMatchObject({ format: 1 });
    expect(await syncChampionAbilities(db, "16.23.1", { provider })).toMatchObject({ changed: false, fetched: 0 });
  });

  it("tells a record stored in a shape the page cannot read from one not stored: the first is named, never called missing", async () => {
    const db = handle.db;
    const before = await storedIndex(db);
    try {
      // A hand edit or a sync bug: Annie's record loses its abilities' shape.
      await db.execute(sql`UPDATE app_settings SET value = jsonb_set(value, '{champions,Annie,abilities}', '"broken"'::jsonb) WHERE key = 'champion_abilities'`);
      invalidateCache("champion_abilities");
      const loaded = await loadChampionAbilities(db, ["Annie", "Ahri"]);
      expect(loaded.champions.Annie).toBeNull();
      expect(loaded.unreadable).toEqual(["Annie"]);
      expect(loaded.champions.Ahri).not.toBeNull();
      expect(loaded.offline).toEqual([]);
    } finally {
      await db.execute(sql`UPDATE app_settings SET value = ${JSON.stringify(before)}::jsonb WHERE key = 'champion_abilities'`);
      invalidateCache("champion_abilities");
    }
  });

  it("stops requesting files once more than 10% have failed: the run writes nothing, so the rest would be wasted", async () => {
    const db = handle.db;
    const before = await storedIndex(db);
    provider.failing = new Set(ROSTER);
    try {
      // One at a time: the second failure is more than 10% of 10, and the other 8 are never requested.
      let start = provider.requests.length;
      expect(await syncChampionAbilities(db, "16.24.1", { provider, concurrency: 1 })).toMatchObject({ changed: false, degraded: true, failed: 2, deferred: 8, fetched: 2, kept: 10, stored: 10 });
      expect(provider.requests.length - start).toBe(2);
      // Six at a time (the job's): only the six already asked for.
      start = provider.requests.length;
      expect(await syncChampionAbilities(db, "16.24.1", { provider })).toMatchObject({ degraded: true, failed: 6, deferred: 4, fetched: 6 });
      expect(provider.requests.length - start).toBe(6);
    } finally {
      provider.failing = new Set();
    }
    expect(await storedIndex(db)).toEqual(before);
  });
});

/*
  The hourly check's cost with Data Dragon's whole roster stored: 173 champions whose records have
  Data Dragon's own size (the committed copy's, made back into detail files and stored by a sync),
  as production holds them: about 117 KB compressed, kept out of line in TOAST.
*/
describe("champion abilities: the hourly check with the whole roster stored", () => {
  let full: DbHandle;
  beforeAll(async () => {
    full = await testDb();
  }, 60_000);
  afterAll(async () => {
    await full.close();
  });

  it("reads the stored document once, not again for each champion", async () => {
    const db = full.db;
    await syncStaticData(db, new FixtureStaticProvider());
    const { champions } = abilityFixture();
    const details = new Map(Object.values(champions).map((record) => [record.championId, detailFromRecord(record)]));
    expect(await syncChampionAbilities(db, "16.22.1", { details })).toMatchObject({ changed: true, roster: 173, refreshed: 173, stored: 173, fetched: 0 });

    const w = watched(db);
    expect(await syncChampionAbilities(w.db, "16.22.1", {})).toMatchObject({ changed: false, degraded: false, roster: 173, stored: 173, refreshed: 0, fetched: 0 });
    expect(w.statements()).toBe(1);
    expect(JSON.stringify(rowsOf(w.answers[0])).length).toBeLessThan(300);
    // Read once, the statement touches about a hundred 8 KB pages. Read again in the check of
    // each champion, it touched about 11,000 (half a second of database time every hour).
    expect(await buffersOf(db, w.queries[0]!)).toBeLessThan(1_000);

    // The page's read: one statement, the document read once too, only the two records sent back.
    await listChampions(w.db);
    const before = w.statements();
    const loaded = await loadChampionAbilities(w.db, ["Riven", "Renekton"]);
    expect(loaded).toMatchObject({ version: "16.22.1", champions: { Riven: { championId: "Riven" }, Renekton: { championId: "Renekton" } } });
    expect(w.statements() - before).toBe(1);
    expect(JSON.stringify(rowsOf(w.answers.at(-1))).length).toBeLessThan(5_000);
    expect(await buffersOf(db, w.queries.at(-1)!)).toBeLessThan(300);
  });
});

describe("champion abilities offline: the committed fixture", () => {
  let fresh: DbHandle;
  beforeAll(async () => {
    fresh = await testDb();
  }, 60_000);
  afterAll(async () => {
    vi.unstubAllGlobals();
    await fresh.close();
  });

  it("is stored by the version-check job when the champions come from the offline fixture", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );
    const run = await runJob(fresh.db, "version-check", "test");
    vi.unstubAllGlobals();
    expect(run.ok).toBe(true);
    expect(run.summary).toMatchObject({ usedFixture: true, abilities: { version: "16.22.1", source: "fixture", stored: 173, refreshed: 173, failed: 0, fetched: 0, degraded: false } });
    const index = await storedIndex(fresh.db);
    expect(index).toMatchObject({ format: 1, version: "16.22.1", source: "fixture" });
    expect(Object.keys(index!.champions)).toHaveLength(173);

    const loaded = await loadChampionAbilities(fresh.db, ["Riven", "Renekton"]);
    expect(loaded.version).toBe("16.22.1");
    // The page is told these are the offline copy, so it says so.
    expect(loaded.offline.sort()).toEqual(["Renekton", "Riven"]);
    expect(loaded.champions.Riven).toMatchObject({ championId: "Riven", version: "16.22.1" });
    expect(loaded.champions.Riven!.abilities.find((a) => a.slot === "Q")).toMatchObject({ name: "Broken Wings", maxRank: 5, cooldown: [13, 13, 13, 13, 13], charges: null });
    expect(loaded.champions.Renekton).not.toBeNull();

    // Stored once: the demo's bootstrap asking again writes nothing.
    expect(await seedChampionAbilitiesFromFixture(fresh.db)).toMatchObject({ changed: false, source: "fixture", stored: 173 });
  });

  it("never replaces abilities read from Data Dragon", async () => {
    const before = await storedIndex(handle.db);
    expect(before?.source).toBeUndefined();
    expect(await seedChampionAbilitiesFromFixture(handle.db)).toMatchObject({ changed: false, source: "ddragon" });
    expect(await storedIndex(handle.db)).toEqual(before);
  });

  it("is replaced whole by the first real sync: a champion that cannot be read is left out, never mixed in", async () => {
    const real = new FakeDdragon();
    real.failing = new Set(["Riven"]);
    const result = await syncChampionAbilities(fresh.db, "16.23.1", { provider: real });
    expect(result).toMatchObject({ changed: true, source: "ddragon", roster: 173, refreshed: 172, failed: 1, kept: 0, stored: 172 });
    const index = await storedIndex(fresh.db);
    expect(index).not.toHaveProperty("source");
    expect(index!.version).toBe("16.23.1");
    expect(Object.values(index!.champions).every((c) => c.version === "16.23.1")).toBe(true);
    expect((await loadChampionAbilities(fresh.db, ["Riven"])).champions.Riven).toBeNull();
    // Replaced whole: no record is the offline copy any more.
    expect((await loadChampionAbilities(fresh.db, ["Renekton"])).offline).toEqual([]);
    real.failing = new Set();
    expect(await syncChampionAbilities(fresh.db, "16.23.1", { provider: real })).toMatchObject({ refreshed: 1, stored: 173 });
  });
});

/*
  The whole job against a small Data Dragon (a fetch that answers like it): the abilities come
  from the detail files the champion sync read, and a second run with the same version requests no
  detail file at all.
*/
describe("version-check job and the champion abilities", () => {
  const champions = ["Ahri", "Riven", "Zed"];
  const requested: string[] = [];
  const answer = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  const ddragon = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    requested.push(url.pathname);
    if (init?.method === "HEAD") return new Response(null, { status: 200, headers: { etag: `"${url.pathname}"`, "content-length": "1000" } });
    if (url.pathname === "/api/versions.json") return answer(["16.22.1", "16.21.1"]);
    if (url.pathname.endsWith("/data/en_US/champion.json")) return answer({ version: "16.22.1", data: Object.fromEntries(champions.map((id, i) => [id, champ(id, 100 + i)])) });
    const detail = /\/data\/en_US\/champion\/([A-Za-z0-9]+)\.json$/.exec(url.pathname);
    if (detail) return answer({ version: "16.22.1", data: { [detail[1]!]: detailFile(detail[1]!, "16.22.1") } });
    if (url.pathname.endsWith("/runesReforged.json")) return answer([]);
    if (/\/(item|summoner)\.json$/.test(url.pathname)) return answer({ data: {} });
    return new Response("not found", { status: 404 });
  });
  let job: DbHandle;
  beforeAll(async () => {
    job = await testDb();
    vi.stubGlobal("fetch", ddragon);
  }, 60_000);
  afterAll(async () => {
    vi.unstubAllGlobals();
    await job.close();
  });
  const detailRequests = () => requested.filter((p) => /\/champion\/[A-Za-z0-9]+\.json$/.test(p)).length;

  it("stores them from the champion sync's files on a new version, then needs one small read", async () => {
    const first = await runJob(job.db, "version-check", "test");
    expect(first).toMatchObject({ ok: true, degraded: false });
    expect(first.summary).toMatchObject({ version: "16.22.1", changed: true, abilities: { version: "16.22.1", source: "ddragon", stored: 3, refreshed: 3, kept: 0, failed: 0, fetched: 0, degraded: false } });
    // Each detail file was read once, by the champion sync; none by the abilities.
    expect(detailRequests()).toBe(3);
    // Counts only: no champion is named in the abilities' entry of the summary or in their log line.
    const summary = first.summary as { abilities: unknown; logs: string[] };
    expect(JSON.stringify(summary.abilities)).not.toMatch(/Ahri|Riven|Zed/);
    const lines = summary.logs.filter((l) => l.startsWith("Champion abilities"));
    expect(lines).toEqual(["Champion abilities 16.22.1: 3 refreshed, 0 kept from earlier, 0 failed, 0 files requested, 3 stored."]);
    expect((await loadChampionAbilities(job.db, ["Riven"])).champions.Riven).toMatchObject({ version: "16.22.1" });

    requested.length = 0;
    const second = await runJob(job.db, "version-check", "test");
    expect(second.summary).toMatchObject({ changed: false, abilities: { stored: 3, refreshed: 0, fetched: 0, failed: 0 } });
    expect(detailRequests()).toBe(0);
    expect(requested).toEqual(["/api/versions.json"]);
  });
});
