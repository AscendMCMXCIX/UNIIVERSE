import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import type { DdragonChampion, DdragonChampionDetail } from "@/server/riot/static/provider";
import { getCurrentPatchRow } from "@/server/riot/static/sync";
import { loadRiotAssets } from "@/server/riot/static/assets";
import { listChampions } from "@/server/repositories/champions";
import { loadChampionAbilities } from "@/server/matchup-intel/abilities";
import { runJob } from "@/server/jobs";

/*
  The version-check job with Data Dragon pinned (DDRAGON_VERSION), as the browser tests' server runs
  it (playwright.config.ts; docs/MATCHUP_INTEL.md, "What the browser tests pin"). Against a Data
  Dragon whose newest version is 16.23.1, a pin of 16.22.1 must store that version and nothing newer:
  the champions, the current patch, the abilities (Matchup Intel) and the item names all come from
  16.22.1, and every versioned file read is 16.22.1's. Unset, the same Data Dragon gives 16.23.1, as
  production reads it. A pin Data Dragon does not list fails the way an unreachable Data Dragon does:
  on a first start the offline fixture, labelled as such; later, the stored data kept and the run
  degraded, with the reason; never another version instead.
*/

const NEWEST_FIRST = ["16.23.1", "16.22.1", "16.21.1"];
const ROSTER = ["Ahri", "Riven", "Zed"];

function champ(id: string, key: number): DdragonChampion {
  return { id, key: String(key), name: id, title: "", tags: ["Fighter"], partype: "Mana", info: { attack: 5, defense: 5, magic: 5, difficulty: 5 }, stats: { attackrange: 125 }, image: { full: `${id}.png` } };
}

/** A detail file shaped like Data Dragon's; each basic ability's cooldown is the version's minor number, so a stored record shows which version it came from. */
function detailFile(id: string, version: string): DdragonChampionDetail {
  const minor = Number(version.split(".")[1]);
  return {
    id,
    passive: { name: `${id} Passive`, description: `${id}'s passive.`, image: { full: `${id}_P.png` } },
    spells: ["Q", "W", "E", "R"].map((slot) => ({ id: `${id}${slot}`, name: `${id} ${slot}`, description: `The ${slot} of ${id}.`, maxrank: slot === "R" ? 3 : 5, cooldown: slot === "R" ? [100, 90, 80] : [minor, minor, minor, minor, minor], maxammo: "-1", image: { full: `${id}${slot}.png` } })),
    stats: { hp: 600 },
    skins: [{ id: `${id}-0`, num: 0, name: "default" }],
  } as unknown as DdragonChampionDetail;
}

/** Every path asked of the fake Data Dragon, in order. */
const requested: string[] = [];
const answer = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
const ddragon = vi.fn<typeof fetch>(async (input, init) => {
  const url = new URL(String(input instanceof Request ? input.url : input));
  requested.push(url.pathname);
  if (init?.method === "HEAD") return new Response(null, { status: 200, headers: { etag: `"${url.pathname}"`, "content-length": "1000" } });
  if (url.pathname === "/api/versions.json") return answer(NEWEST_FIRST);
  const versioned = /^\/cdn\/(\d+\.\d+\.\d+)\/data\/en_US\/(.+)$/.exec(url.pathname);
  // Data Dragon answers 403 for a version it does not have.
  if (!versioned || !NEWEST_FIRST.includes(versioned[1]!)) return new Response("AccessDenied", { status: 403 });
  const [, version, file] = versioned as unknown as [string, string, string];
  if (file === "champion.json") return answer({ version, data: Object.fromEntries(ROSTER.map((id, i) => [id, champ(id, 100 + i)])) });
  const detail = /^champion\/([A-Za-z0-9]+)\.json$/.exec(file);
  if (detail) return answer({ version, data: { [detail[1]!]: detailFile(detail[1]!, version) } });
  // The smallest files that pass validation before keeping (assets.ts, staticProblems): empty ones are refused.
  if (file === "runesReforged.json") return answer([{ id: 8000, name: "Precision", icon: "p.png", slots: [{ runes: [{ id: 8005, name: "Press the Attack", icon: "a.png" }] }] }]);
  if (file === "item.json") return answer({ data: { "1001": { name: "Boots", maps: { "11": true } } } });
  if (file === "summoner.json") return answer({ data: { SummonerFlash: { id: "SummonerFlash", key: "4", name: "Flash", cooldown: [300] } } });
  return new Response("not found", { status: 404 });
});

/** The Data Dragon versions whose files were read (the versions list and splash art have none). */
const versionsRead = () => [...new Set(requested.flatMap((p) => /^\/cdn\/(\d+\.\d+\.\d+)\//.exec(p)?.[1] ?? []))];

const handles: DbHandle[] = [];
async function freshDb(): Promise<DbHandle> {
  const handle = await testDb();
  handles.push(handle);
  return handle;
}

beforeAll(() => {
  vi.stubGlobal("fetch", ddragon);
});
afterEach(() => {
  vi.unstubAllEnvs();
  requested.length = 0;
});
afterAll(async () => {
  vi.unstubAllGlobals();
  for (const handle of handles) await handle.close();
});

describe("version-check with Data Dragon pinned", () => {
  let pinned: DbHandle;

  it("stores the pinned version's champions, patch, abilities and item names, never the newest", async () => {
    vi.stubEnv("DDRAGON_VERSION", "16.22.1");
    pinned = await freshDb();
    const db = pinned.db;
    const run = await runJob(db, "version-check", "test");
    expect(run).toMatchObject({ ok: true, degraded: false });
    expect(run.summary).toMatchObject({ version: "16.22.1", patch: "16.22", changed: true, usedFixture: false, championsUpserted: 3, assetsUpdated: true, abilities: { version: "16.22.1", source: "ddragon", stored: 3, failed: 0 } });
    expect((run.summary as { logs: string[] }).logs).toContain("Data Dragon pinned to 16.22.1 (DDRAGON_VERSION): no newer version is read.");
    // Every versioned file came from the pinned version.
    expect(versionsRead()).toEqual(["16.22.1"]);
    expect(await getCurrentPatchRow(db)).toMatchObject({ id: "16.22", ddragonVersion: "16.22.1", isCurrent: true });
    expect((await listChampions(db)).find((c) => c.id === "Riven")?.portraitUrl).toBe("https://ddragon.leagueoflegends.com/cdn/16.22.1/img/champion/Riven.png");
    const abilities = await loadChampionAbilities(db, ["Riven"]);
    expect(abilities.version).toBe("16.22.1");
    expect(abilities.champions.Riven?.abilities.find((a) => a.slot === "Q")?.cooldown).toEqual([22, 22, 22, 22, 22]);
    expect(abilities.offline).toEqual([]);
    expect((await loadRiotAssets(db))?.version).toBe("16.22.1");

    // Unchanged on the next run: the versions list alone.
    requested.length = 0;
    const again = await runJob(db, "version-check", "test");
    expect(again.summary).toMatchObject({ version: "16.22.1", changed: false });
    expect(requested).toEqual(["/api/versions.json"]);
  });

  it("unpinned, the same Data Dragon gives its newest version, as production reads it", async () => {
    vi.stubEnv("DDRAGON_VERSION", "");
    const db = (await freshDb()).db;
    const run = await runJob(db, "version-check", "test");
    expect(run).toMatchObject({ ok: true, degraded: false });
    expect(run.summary).toMatchObject({ version: "16.23.1", patch: "16.23", changed: true, abilities: { version: "16.23.1", stored: 3 } });
    expect((run.summary as { logs: string[] }).logs.filter((l) => l.startsWith("Data Dragon pinned"))).toEqual([]);
    expect(versionsRead()).toEqual(["16.23.1"]);
    expect(await getCurrentPatchRow(db)).toMatchObject({ id: "16.23", ddragonVersion: "16.23.1" });
  });

  it("a pin Data Dragon does not list, on a first start: the offline fixture, as when Data Dragon cannot be reached", async () => {
    vi.stubEnv("DDRAGON_VERSION", "16.99.1");
    const db = (await freshDb()).db;
    const run = await runJob(db, "version-check", "test");
    expect(run).toMatchObject({ ok: true, degraded: true });
    expect(run.error).toBe("Provider unavailable: Data Dragon does not list the pinned version 16.99.1 (DDRAGON_VERSION). Using offline fixture until the next successful sync.");
    expect(run.summary).toMatchObject({ usedFixture: true, abilities: { source: "fixture" } });
    // No other version was read instead.
    expect(versionsRead()).toEqual([]);
    expect((await getCurrentPatchRow(db))?.ddragonVersion).toBe("0.0.0-fixture");
    expect((await loadChampionAbilities(db, ["Riven"])).offline).toEqual(["Riven"]);
  });

  it("a pin Data Dragon does not list, or one that is not a version, later: the stored data kept and the run degraded", async () => {
    const db = pinned.db;
    const before = await getCurrentPatchRow(db);
    for (const [pin, reason] of [
      ["16.99.1", "Data Dragon does not list the pinned version 16.99.1 (DDRAGON_VERSION)"],
      ["16.23", 'DDRAGON_VERSION "16.23" is not a Data Dragon version (three numbers, such as 16.22.1)'],
    ] as const) {
      vi.stubEnv("DDRAGON_VERSION", pin);
      requested.length = 0;
      const run = await runJob(db, "version-check", "test");
      expect(run, pin).toMatchObject({ ok: true, degraded: true, error: `Provider unavailable: ${reason}. Existing data preserved.` });
      expect(run.summary, pin).toMatchObject({ changed: false, version: null });
      expect(versionsRead(), pin).toEqual([]);
      expect(await getCurrentPatchRow(db), pin).toEqual(before);
      expect((await loadChampionAbilities(db, ["Riven"])).version, pin).toBe("16.22.1");
    }
  });
});
