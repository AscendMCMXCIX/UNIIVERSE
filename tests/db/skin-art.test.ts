import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { championSkins, players } from "@/server/db/schema";
import type { DdragonChampion, DdragonChampionDetail, StaticDataProvider } from "@/server/riot/static/provider";
import { syncStaticData } from "@/server/riot/static/sync";
import { checkSkinSplashes, countCardsOnChromas, remapSkinSelections } from "@/server/riot/static/skin-art";
import { listSkins, uniqueArtwork } from "@/server/repositories/skins";
import { createPlayer, getOrCreateTeam, getPlayer, setCardStyle } from "@/server/repositories/team";
import { invalidateCache } from "@/server/observability/cache";
import { EMBEDDED_MIGRATIONS } from "@/server/db/migrations.generated";

/*
  Card artwork. Production evidence (skin-audit, 14 Oct 2026): Data Dragon lists every chroma as a
  skin entry with a `parentSkin` marker and no splash image (403), which is what flooded the
  selector with blank and duplicate-looking cards; a few entries are the same illustration twice.
*/

const champ = (id: string, key: number): DdragonChampion => ({ id, key: String(key), name: id, title: "", tags: ["Assassin"], partype: "Energy", info: { attack: 5, defense: 5, magic: 5, difficulty: 5 }, stats: { attackrange: 125 }, image: { full: `${id}.png` } });
const AKALI_SKINS = [
  { id: "84000", num: 0, name: "default", chromas: false },
  { id: "84004", num: 4, name: "Nurse Akali", chromas: true },
  { id: "84013", num: 13, name: "Prestige K/DA Akali", chromas: false },
  { id: "84033", num: 33, name: "Nurse Akali (Citrine)", chromas: false, parentSkin: 4 },
  { id: "84060", num: 60, name: "Prestige K/DA Akali (2022)", chromas: false },
  { id: "84070", num: 70, name: "Brand New Akali", chromas: false },
] as unknown as DdragonChampionDetail["skins"];

class Provider implements StaticDataProvider {
  name = "ddragon";
  async fetchVersions() {
    return ["16.20.1"];
  }
  async fetchChampionList(version: string) {
    return { version, champions: [champ("Akali", 84)] };
  }
  async fetchChampionDetail(_v: string, id: string) {
    return { id, passive: { name: "P" }, spells: [{ id: "Q", name: "Q" }], stats: { hp: 600 }, skins: AKALI_SKINS } as DdragonChampionDetail;
  }
}

/** Splash HEAD answers: 13 and 60 are byte-identical; 70's art is not published yet. */
function splashFetch(missing = new Set([70])) {
  return (async (input: string | URL | Request) => {
    const num = Number(/_(\d+)\.jpg$/.exec(String(input))![1]);
    if (missing.has(num) || num === 33) return new Response(null, { status: 403 });
    const same = num === 60 ? 13 : num;
    return new Response(null, { status: 200, headers: { etag: `"art-${same}"`, "content-length": String(100_000 + same) } });
  }) as typeof fetch;
}

let handle: DbHandle;
let teamId: string;
beforeAll(async () => {
  handle = await testDb();
  await syncStaticData(handle.db, new Provider());
  teamId = (await getOrCreateTeam(handle.db)).id;
}, 60_000);
afterAll(async () => {
  await handle.close();
});
const rowOf = async (num: number) => (await handle.db.select().from(championSkins).where(and(eq(championSkins.championId, "Akali"), eq(championSkins.num, num))))[0]!;

describe("skin classification", () => {
  it("marks chromas with their parent skin from Riot's own marker; skins stay skins", async () => {
    expect(await rowOf(33)).toMatchObject({ kind: "chroma", parentNum: 4 });
    for (const n of [0, 4, 13, 60, 70]) expect((await rowOf(n)).kind).toBe("skin");
  });

  it("checks each real skin's splash once, never the chromas", async () => {
    const result = await checkSkinSplashes(handle.db, { fetchImpl: splashFetch() });
    expect(result).toEqual({ checked: 5, ok: 4, missing: 1 });
    expect(await rowOf(70)).toMatchObject({ splashStatus: "missing" });
    expect((await rowOf(33)).splashStatus).toBe("unknown");
    expect((await rowOf(13)).splashSignature).toBe((await rowOf(60)).splashSignature);
    // Nothing is due any more.
    expect((await checkSkinSplashes(handle.db, { fetchImpl: splashFetch() })).checked).toBe(0);
  });

  it("offers one entry per distinct illustration: no chromas, no missing art, no repeated image", async () => {
    invalidateCache("champions:skins");
    expect(await listSkins(handle.db, "Akali")).toEqual([
      { num: 0, name: "Default" },
      { num: 4, name: "Nurse Akali" },
      { num: 13, name: "Prestige K/DA Akali" },
    ]);
    expect(uniqueArtwork([{ num: 2, name: "B", signature: null }])).toEqual([{ num: 0, name: "Default" }, { num: 2, name: "B" }]);
  });

  it("rechecks missing art after a week, so late-published splashes appear", async () => {
    const later = new Date(Date.now() + 8 * 86_400_000);
    const result = await checkSkinSplashes(handle.db, { fetchImpl: splashFetch(new Set()), now: later });
    expect(result).toEqual({ checked: 1, ok: 1, missing: 0 });
    expect((await rowOf(70)).splashStatus).toBe("ok");
    await handle.db.update(championSkins).set({ splashStatus: "missing" }).where(and(eq(championSkins.championId, "Akali"), eq(championSkins.num, 70)));
  });
});

describe("skins asked for by id", () => {
  it("keeps an entry for a champion in the game and none for a made-up id, and answers both as before", async () => {
    // Card Studio asks for any id that passes the action's pattern (listChampionSkinsAction).
    invalidateCache("champions:skins");
    const entries = () => [...(globalThis.__uniiverseCache?.keys() ?? [])].filter((k) => k.includes("champions:skins:"));
    for (let i = 0; i < 50; i++) expect(await listSkins(handle.db, `MadeUp${i}`)).toEqual([{ num: 0, name: "Default" }]);
    expect(entries()).toEqual([]);
    const akali = await listSkins(handle.db, "Akali");
    expect(akali.map((s) => s.num)).toEqual([0, 4, 13]);
    expect(await listSkins(handle.db, "Akali")).toBe(akali); // the same array: read once, then kept
    expect(entries()).toHaveLength(1);
  });
});

describe("saved card choices", () => {
  it("move to the same illustration where one exists, and nothing else about the player changes", async () => {
    const mk = async (name: string, num: number) => {
      const p = await createPlayer(handle.db, teamId, { displayName: name, primaryRole: "MID", primaryPool: ["Akali"] });
      await setCardStyle(handle.db, p.id, { featuredChampionId: "Akali", featuredSkinNum: num, cardAccent: null });
      return (await getPlayer(handle.db, p.id))!;
    };
    const onChroma = await mk("Chroma", 33);
    const onDuplicate = await mk("Duplicate", 60);
    const onMissing = await mk("Missing", 70);
    const onSkin = await mk("Skin", 4);
    expect(await countCardsOnChromas(handle.db)).toBe(1);
    expect(await remapSkinSelections(handle.db)).toBe(3);
    const skinOf = async (id: string) => (await getPlayer(handle.db, id))!.featuredSkinNum;
    expect(await skinOf(onChroma.id)).toBe(4);
    expect(await skinOf(onDuplicate.id)).toBe(13);
    expect(await skinOf(onMissing.id)).toBe(0);
    expect(await skinOf(onSkin.id)).toBe(4);
    // The profile version (autosave) and pools are untouched.
    const after = (await getPlayer(handle.db, onChroma.id))!;
    expect(after.updatedAt.getTime()).toBe(onChroma.updatedAt.getTime());
    expect(after.primaryPool).toEqual(["Akali"]);
    expect(await remapSkinSelections(handle.db)).toBe(0);
  });

  it("a new sync does not bring the chromas back", async () => {
    await syncStaticData(handle.db, new Provider(), { force: true });
    invalidateCache("champions:skins");
    expect((await listSkins(handle.db, "Akali")).map((s) => s.num)).toEqual([0, 4, 13]);
  });
});

describe("migration 0025", () => {
  it("classifies already-stored chromas by name and moves cards off them", async () => {
    const db = handle.db;
    await db.update(championSkins).set({ kind: "unknown", parentNum: null });
    const [p] = await db.select({ id: players.id }).from(players).limit(1);
    await db.update(players).set({ featuredChampionId: "Akali", featuredSkinNum: 33 }).where(eq(players.id, p!.id));
    const migration = EMBEDDED_MIGRATIONS.find((m) => m.tag === "0025_p7_skin_kinds")!;
    await db.transaction(async (tx) => {
      // Only the data statements (the columns already exist here).
      for (const statement of migration.statements.filter((s) => !/ADD COLUMN/i.test(s))) await tx.execute(sql.raw(statement));
    });
    expect(await rowOf(33)).toMatchObject({ kind: "chroma", parentNum: 4 });
    // "Prestige K/DA Akali (2022)" is the same art as the original: grouped under it too.
    expect(await rowOf(60)).toMatchObject({ kind: "chroma", parentNum: 13 });
    expect((await rowOf(70)).kind).toBe("skin");
    const [after] = await db.select({ n: players.featuredSkinNum }).from(players).where(eq(players.id, p!.id));
    expect(after!.n).toBe(4);
  });
});
