import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { championChangePoints, champions, patches } from "@/server/db/schema";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import type { DdragonChampion, DdragonChampionDetail, StaticDataProvider } from "@/server/riot/static/provider";
import { syncStaticData } from "@/server/riot/static/sync";
import { listChampions } from "@/server/repositories/champions";

function champ(id: string, key: number, extra: Partial<DdragonChampion> = {}): DdragonChampion {
  return { id, key: String(key), name: id, title: "", tags: ["Fighter"], partype: "Mana", info: { attack: 5, defense: 5, magic: 5, difficulty: 5 }, stats: { attackrange: 125 }, image: { full: `${id}.png` }, ...extra };
}

class FakeProvider implements StaticDataProvider {
  name = "ddragon";
  versions: string[] = ["15.19.1"];
  champions: DdragonChampion[] = [champ("Aatrox", 266), champ("Ahri", 103), champ("Akali", 84)];
  details = new Map<string, DdragonChampionDetail>();
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
    return this.details.get(id) ?? { id, passive: { name: `${id} Passive` }, spells: [{ id: `${id}Q`, name: "Q" }, { id: `${id}W`, name: "W" }, { id: `${id}E`, name: "E" }, { id: `${id}R`, name: "R" }], stats: { hp: 600 } };
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
    expect(added?.isNew).toBe(true);
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

  it("flags a suspected rework when the kit fingerprint changes substantially", async () => {
    provider.versions = ["15.21.1", "15.20.1", "15.19.1"];
    provider.details.set("Akali", { id: "Akali", passive: { name: "Totally New Passive" }, spells: [{ id: "AkaliQ2", name: "New Q" }, { id: "AkaliW2", name: "New W" }, { id: "AkaliE", name: "E" }, { id: "AkaliR", name: "R" }], stats: { hp: 600 } });
    const result = await syncStaticData(handle.db, provider);
    expect(result.suspectedReworks).toEqual(["Akali"]);
    const cps = await handle.db.select().from(championChangePoints);
    expect(cps).toHaveLength(1);
    expect(cps[0]?.confirmed).toBe(false);
    expect(cps[0]?.patch).toBe("15.21");
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
