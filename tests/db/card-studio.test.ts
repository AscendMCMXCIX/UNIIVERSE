import { deflateSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { playerCardBanners, players } from "@/server/db/schema";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { createPlayer, deletePlayer, getOrCreateTeam, getPlayer, setCardStyle, setLineupSlot } from "@/server/repositories/team";
import { bannerUrlsByPlayer, getCardBanner, removeCardBanner, setCardBanner } from "@/server/repositories/card-banners";
import { getTeamRoster } from "@/server/team/roster";
import { applyPreset, cardLookFor, legacyCardStyle, normaliseCardStyle } from "@/domain/card-style";

/*
  Player Card Studio storage: cards from before the Studio keep their look, a saved style reaches
  every card view, and banners are checked (real type, size, shape) before they are stored.
*/

/** A minimal valid RGB PNG of the given size (real header and data, so it sniffs as a PNG). */
function png(width: number, height: number): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const rows = Buffer.alloc((width * 3 + 1) * height);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]);
}

let handle: DbHandle;
let teamId: string;
let top: string;
let jungle: string;

beforeAll(async () => {
  handle = await testDb();
  await syncStaticData(handle.db, new FixtureStaticProvider(), { fingerprint: false });
  teamId = (await getOrCreateTeam(handle.db)).id;
  top = (await createPlayer(handle.db, teamId, { displayName: "Styled", primaryRole: "TOP", primaryPool: ["Riven", "Gwen"] })).id;
  jungle = (await createPlayer(handle.db, teamId, { displayName: "Classic", primaryRole: "JUNGLE", primaryPool: ["Viego"] })).id;
  await setLineupSlot(handle.db, teamId, "TOP", top);
  await setLineupSlot(handle.db, teamId, "JUNGLE", jungle);
});
afterAll(async () => {
  await handle.close();
});

describe("card looks", () => {
  it("a card never customised in the Studio keeps its saved accent and the original look", async () => {
    await setCardStyle(handle.db, jungle, { featuredChampionId: "Viego", featuredSkinNum: 0, cardAccent: "violet" });
    const p = (await getPlayer(handle.db, jungle))!;
    expect(p.cardStyle).toBeNull();
    const slot = (await getTeamRoster(handle.db, teamId)).slots.find((s) => s.role === "JUNGLE")!;
    expect(slot.player!.look.style).toEqual(legacyCardStyle("violet"));
    expect(slot.player!.look.bannerUrl).toBeNull();
    // The old accent-only save path still works unchanged.
    expect(slot.player!.cardAccent).toBe("violet");
  });

  it("a saved style reaches the Team card and the profile with the same values", async () => {
    const style = normaliseCardStyle({ ...applyPreset(legacyCardStyle(null), "crimson"), identity: { tagline: "Calm in the chaos", emblem: "flame", nameStyle: "bold", theme: "tinted" } });
    await setCardStyle(handle.db, top, { featuredChampionId: "Gwen", featuredSkinNum: 0, cardAccent: null, cardStyle: style as unknown as Record<string, unknown> });
    const record = (await getPlayer(handle.db, top))!;
    const team = (await getTeamRoster(handle.db, teamId)).slots.find((s) => s.role === "TOP")!.player!;
    expect(team.look.style).toEqual(style);
    expect(cardLookFor(record).style).toEqual(style);
    expect(team.art).toEqual({ championId: "Gwen", skinNum: 0 });
    // Saving the champion again without a style leaves the style alone.
    await setCardStyle(handle.db, top, { featuredChampionId: "Riven", featuredSkinNum: 0, cardAccent: null });
    expect(cardLookFor((await getPlayer(handle.db, top))!).style).toEqual(style);
  });

  it("a stored style that was tampered with is read back as valid values only", async () => {
    await handle.db.update(players).set({ cardStyle: { frame: "<script>", colours: { primary: "url(javascript:x)" }, identity: { tagline: "a\u202eb" } } }).where(eq(players.id, jungle));
    const look = cardLookFor((await getPlayer(handle.db, jungle))!);
    expect(look.style.frame).toBe("none");
    expect(look.style.colours.primary).toBe(legacyCardStyle("violet").colours.primary);
    expect(look.style.identity.tagline).toBe("ab");
  });
});

describe("card banners", () => {
  it("stores a landscape picture, versions its URL and serves it back", async () => {
    const data = png(800, 400);
    const version = await setCardBanner(handle.db, top, data);
    expect(version).toBeGreaterThan(0);
    expect((await getPlayer(handle.db, top))!.cardBannerVersion).toBe(version);
    expect((await bannerUrlsByPlayer(handle.db))[top]).toBe(`/api/card-banners/${top}?v=${version}`);
    const stored = await getCardBanner(handle.db, top);
    expect(stored?.contentType).toBe("image/png");
    expect(stored?.data.equals(data)).toBe(true);
    const slot = (await getTeamRoster(handle.db, teamId)).slots.find((s) => s.role === "TOP")!.player!;
    expect(slot.look.bannerUrl).toBe(`/api/card-banners/${top}?v=${version}`);
  });

  it("refuses anything that is not a reasonable landscape image", async () => {
    // The type comes from the bytes: a script named like an image is refused.
    await expect(setCardBanner(handle.db, top, Buffer.from("<svg onload=alert(1)>"))).rejects.toThrow(/PNG, JPEG or WebP/);
    await expect(setCardBanner(handle.db, top, png(300, 200))).rejects.toThrow(/320 pixels/);
    await expect(setCardBanner(handle.db, top, png(400, 900))).rejects.toThrow(/landscape/);
    await expect(setCardBanner(handle.db, top, png(2400, 600))).rejects.toThrow(/2000/);
    await expect(setCardBanner(handle.db, top, Buffer.alloc(500 * 1024, 1))).rejects.toThrow(/too large/);
    // The banner from the previous test is still there.
    expect(await getCardBanner(handle.db, top)).not.toBeNull();
  });

  it("removing a banner clears it everywhere, and deleting a player deletes their banner", async () => {
    await removeCardBanner(handle.db, top);
    expect((await getPlayer(handle.db, top))!.cardBannerVersion).toBeNull();
    expect(await getCardBanner(handle.db, top)).toBeNull();
    const temp = (await createPlayer(handle.db, teamId, { displayName: "Temporary", primaryRole: "MID", primaryPool: ["Ahri"] })).id;
    await setCardBanner(handle.db, temp, png(640, 320));
    await deletePlayer(handle.db, temp);
    expect(await handle.db.select().from(playerCardBanners).where(eq(playerCardBanners.playerId, temp))).toHaveLength(0);
  });
});
