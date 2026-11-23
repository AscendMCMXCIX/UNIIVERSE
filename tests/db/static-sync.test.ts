import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { appSettings, championSkins, champions, patches } from "@/server/db/schema";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import type { DdragonChampion, DdragonChampionDetail, StaticDataProvider } from "@/server/riot/static/provider";
import { syncStaticData } from "@/server/riot/static/sync";
import { listChampions } from "@/server/repositories/champions";
import { loadRiotAssets, loadRiotBuildData, syncRiotAssets } from "@/server/riot/static/assets";
import { invalidateCache } from "@/server/observability/cache";

function champ(id: string, key: number, extra: Partial<DdragonChampion> = {}): DdragonChampion {
  return { id, key: String(key), name: id, title: "", tags: ["Fighter"], partype: "Mana", info: { attack: 5, defense: 5, magic: 5, difficulty: 5 }, stats: { attackrange: 125 }, image: { full: `${id}.png` }, ...extra };
}

class FakeProvider implements StaticDataProvider {
  name = "ddragon";
  versions: string[] = ["15.19.1"];
  champions: DdragonChampion[] = [champ("Aatrox", 266), champ("Ahri", 103), champ("Akali", 84)];
  details = new Map<string, DdragonChampionDetail>();
  skins = new Map<string, DdragonChampionDetail["skins"]>();
  failVersions = false;
  failList = false;
  async fetchVersions() {
    if (this.failVersions) throw new Error("network down");
    return this.versions;
  }
  async fetchChampionList(version: string) {
    if (this.failList) throw new Error("list down");
    return { version, champions: this.champions };
  }
  async fetchChampionDetail(_version: string, id: string) {
    return this.details.get(id) ?? { id, passive: { name: `${id} Passive` }, spells: [{ id: `${id}Q`, name: "Q" }, { id: `${id}W`, name: "W" }, { id: `${id}E`, name: "E" }, { id: `${id}R`, name: "R" }], stats: { hp: 600 }, skins: this.skins.get(id) ?? [{ id: `${id}-0`, num: 0, name: "default" }, { id: `${id}-1`, num: 1, name: `Arcade ${id}` }] };
  }
}

let handle: DbHandle;
beforeAll(async () => {
  handle = await testDb();
});
afterAll(async () => {
  await handle.close();
});

describe("static data sync", () => {
  const provider = new FakeProvider();

  it("populates champions and the current patch on first sync", async () => {
    const result = await syncStaticData(handle.db, provider);
    expect(result.ok).toBe(true);
    expect(result.newPatch).toBe(true);
    expect(result.patch).toBe("15.19");
    expect(result.newChampions.sort()).toEqual(["Aatrox", "Ahri", "Akali"]);
    const current = await handle.db.select().from(patches).where(eq(patches.isCurrent, true));
    expect(current[0]?.ddragonVersion).toBe("15.19.1");
  });

  it("is a no-op when the version has not changed", async () => {
    const result = await syncStaticData(handle.db, provider);
    expect(result.ok).toBe(true);
    expect(result.changed).toBe(false);
  });

  it("adds a newly released champion automatically and preserves patch history", async () => {
    provider.versions = ["15.20.1", "15.19.1"];
    provider.champions = [...provider.champions, champ("Brandnew", 950, { tags: ["Mage"] })];
    const result = await syncStaticData(handle.db, provider);
    expect(result.newChampions).toEqual(["Brandnew"]);
    const list = await listChampions(handle.db);
    const added = list.find((c) => c.id === "Brandnew");
    // No "NEW" marker exists any more: a new champion is simply selectable.
    expect(added && "isNew" in added).toBe(false);
    expect(added?.portraitUrl).toBe("https://ddragon.leagueoflegends.com/cdn/15.20.1/img/champion/Brandnew.png");
    const allPatches = await handle.db.select().from(patches);
    expect(allPatches.map((p) => p.id).sort()).toEqual(["15.19", "15.20"]);
    expect(allPatches.find((p) => p.isCurrent)?.id).toBe("15.20");
  });

  it("preserves last-known-good data when the provider fails", async () => {
    provider.failVersions = true;
    const result = await syncStaticData(handle.db, provider, { force: true });
    expect(result.ok).toBe(true);
    expect(result.degraded).toBe(true);
    expect(result.error).toMatch(/preserved/);
    const rows = await handle.db.select().from(champions);
    expect(rows).toHaveLength(4);
    provider.failVersions = false;
    provider.failList = true;
    const result2 = await syncStaticData(handle.db, provider, { force: true });
    expect(result2.degraded).toBe(true);
    expect((await handle.db.select().from(champions)).length).toBe(4);
    provider.failList = false;
  });

});

describe("champion skins", () => {
  const provider = new FakeProvider();
  provider.versions = ["16.1.1"];

  it("stores every champion's skins on sync, the default one named Default", async () => {
    const h = await testDb();
    try {
      await syncStaticData(h.db, provider);
      const rows = await h.db.select().from(championSkins).where(eq(championSkins.championId, "Ahri"));
      expect(rows.map((r) => [r.num, r.name, r.isActive]).sort()).toEqual([
        [0, "Default", true],
        [1, "Arcade Ahri", true],
      ]);
      // A new version brings a new skin and drops one: the new one is added, the old one kept but inactive.
      provider.versions = ["16.2.1", "16.1.1"];
      provider.skins.set("Ahri", [{ id: "Ahri-0", num: 0, name: "default" }, { id: "Ahri-7", num: 7, name: "Spirit Blossom Ahri" }]);
      await syncStaticData(h.db, provider);
      const after = await h.db.select().from(championSkins).where(eq(championSkins.championId, "Ahri"));
      expect(after.find((r) => r.num === 7)).toMatchObject({ name: "Spirit Blossom Ahri", isActive: true, firstSeenVersion: "16.2.1" });
      expect(after.find((r) => r.num === 1)?.isActive).toBe(false);
    } finally {
      await h.close();
    }
  });

  it("fills in missing skins without a new version (first run after the skins table appeared)", async () => {
    const h = await testDb();
    try {
      const fresh = new FakeProvider();
      await syncStaticData(h.db, fresh);
      await h.db.delete(championSkins);
      const result = await syncStaticData(h.db, fresh);
      expect(result.changed).toBe(false);
      expect(result.skinsUpserted).toBe(6);
      expect(await h.db.select().from(championSkins)).toHaveLength(6);
      // Nothing missing: no further detail fetches.
      expect((await syncStaticData(h.db, fresh)).skinsUpserted).toBe(0);
    } finally {
      await h.close();
    }
  });
});

describe("fixture fallback", () => {
  it("seeds from the offline fixture only when the database is empty and the provider is down", async () => {
    const fresh = await testDb();
    const provider = new FakeProvider();
    provider.failVersions = true;
    const result = await syncStaticData(fresh.db, provider, { fixture: new FixtureStaticProvider() });
    expect(result.usedFixture).toBe(true);
    expect(result.degraded).toBe(true);
    const list = await listChampions(fresh.db);
    expect(list.length).toBeGreaterThan(150);
    expect(list.every((c) => c.source === "fixture")).toBe(true);
    // Real data later replaces the fixture and drops the placeholder patch.
    provider.failVersions = false;
    const real = await syncStaticData(fresh.db, provider);
    expect(real.usedFixture).toBe(false);
    const allPatches = await fresh.db.select().from(patches);
    expect(allPatches.map((p) => p.id)).toEqual(["15.19"]);
    await fresh.close();
  });
});

/*
  Data Dragon downloads made by the version-check job carry a timeout: a request that never
  answers is given up, so the job (the first of every scheduler tick) cannot hold the tick past the
  function limit. Item, spell and rune names keep their stored version until the next run.
*/
describe("Data Dragon timeouts", () => {
  /** A Data Dragon that accepts the connection and then never answers (until the request is aborted). */
  const hanging = ((_input: string | URL | Request, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));
    })) as typeof fetch;

  it("gives up an item, spell and rune download that does not answer in time, keeping what is stored", async () => {
    const started = Date.now();
    await expect(syncRiotAssets(handle.db, "16.21.1", hanging, "en_US", 50)).rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(5_000);
    invalidateCache("riot_assets");
    expect((await loadRiotAssets(handle.db))?.version).not.toBe("16.21.1");
  }, 10_000);
});

/*
  Matchup Intel's build data (items' shop facts and haste, spells' cooldowns, rune slots) is kept
  under its own key: the names and icons every match history and timeline read loads stay as small
  as they were (R6 review SR6-SEC-5: about 33 KB, not 90 KB, at 16.22.1).
*/
describe("Matchup Intel's build data", () => {
  it("is stored beside the names, not in them, from the same three downloads", async () => {
    const item = { name: "Kindlegem", description: "<mainText><stats><attention>10</attention> Ability Haste</stats></mainText>", gold: { base: 400, total: 800, sell: 560, purchasable: true }, tags: ["Health"], from: ["1028"], into: ["3067x"], depth: 2, maps: { "11": true } };
    const files: Record<string, unknown> = {
      // Every id an item builds from or into is in the file (validation before keeping, assets.ts).
      "item.json": { data: { "3067": item, "1028": { name: "Ruby Crystal", into: ["3067"], maps: { "11": true } }, "3067x": { name: "Kindlegem (another mode)", from: ["3067"], maps: { "11": false } } } },
      "summoner.json": { data: { SummonerFlash: { id: "SummonerFlash", key: "4", name: "Flash", cooldown: [300] } } },
      "runesReforged.json": [{ id: 8000, name: "Precision", icon: "p.png", slots: [{ runes: [{ id: 8005, name: "Press the Attack", icon: "a.png" }] }] }],
    };
    const ddragon = (async (input: string | URL | Request) => {
      const name = String(input).split("/").pop()!;
      return new Response(JSON.stringify(files[name]), { status: files[name] ? 200 : 404, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    expect(await syncRiotAssets(handle.db, "16.22.1", ddragon)).toBe(true);
    const [stored] = await handle.db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, "riot_assets"));
    // The names, and since Release 16 the build path's item kinds (about 1 KB: ids only), never the build data.
    expect(Object.keys(stored!.value as object).sort()).toEqual(["format", "itemKinds", "items", "runes", "spells", "version"]);
    invalidateCache("riot_assets");
    expect((await loadRiotAssets(handle.db))?.items).toEqual({ "3067": "Kindlegem", "1028": "Ruby Crystal", "3067x": "Kindlegem (another mode)" });
    const build = await loadRiotBuildData(handle.db);
    expect(build).toMatchObject({ version: "16.22.1", spellCooldowns: { "4": [300] }, runeSlots: { "8000": [[8005]] } });
    expect(build?.itemInfo["3067"]).toMatchObject({ haste: 10, depth: 2 });
    // Read once per version: the next check of the same version downloads nothing.
    expect(await syncRiotAssets(handle.db, "16.22.1", ddragon)).toBe(false);
  });
});
