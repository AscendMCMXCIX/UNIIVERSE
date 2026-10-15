import { deflateSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Session } from "@/server/auth/permissions";

/*
  Player Card Studio actions with real permission checks: a player edits their own card (team
  member or personal use), never anyone else's; the Owner may edit any card. Every card action
  (style, banner upload, banner removal) goes through the same check.
*/

const state = vi.hoisted(() => ({ db: null as unknown, session: null as unknown }));
vi.mock("@/server/bootstrap", () => ({ getAppDb: async () => state.db }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined }));
vi.mock("@/server/auth/session", async (orig) => ({
  ...(await orig<object>()),
  getSession: async () => state.session,
  requirePlayerEditor: async (playerId: string) => {
    const { canEditPlayer } = await import("@/server/auth/permissions");
    if (!canEditPlayer(state.session as Session, playerId)) {
      const err = new Error("You do not have permission to do that.");
      err.name = "NotAuthorizedError";
      throw err;
    }
    return state.session;
  },
}));

import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { createPlayer, getOrCreateTeam, getPlayer } from "@/server/repositories/team";
import { getCardBanner } from "@/server/repositories/card-banners";
import { removeCardBannerAction, setCardStyleAction, uploadCardBannerAction } from "@/server/actions/players";
import { cardLookFor } from "@/domain/card-style";
import { STANDARD_PLAYER } from "@/server/auth/permissions";

function png(width: number, height: number): Buffer {
  const table = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = table[(c ^ b) & 0xff]! ^ (c >>> 8);
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
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(Buffer.alloc((width * 3 + 1) * height))), chunk("IEND", Buffer.alloc(0))]);
}
const dataUrl = (buf: Buffer) => `data:image/png;base64,${buf.toString("base64")}`;

let handle: DbHandle;
let mine: string;
let theirs: string;
const base = { userId: "11111111-1111-4111-8111-111111111111", label: "Me", username: "me", hasPassword: true, mustChangePassword: false, setupComplete: true };
const asPlayer = (playerId: string, teamMember = true): Session => ({ ...base, role: "player", playerId, capabilities: STANDARD_PLAYER, teamMember });
const owner: Session = { ...base, role: "owner", playerId: null };

beforeAll(async () => {
  handle = await testDb();
  state.db = handle.db;
  await syncStaticData(handle.db, new FixtureStaticProvider(), { fingerprint: false });
  const teamId = (await getOrCreateTeam(handle.db)).id;
  mine = (await createPlayer(handle.db, teamId, { displayName: "Me", primaryRole: "MID", primaryPool: ["Ahri"] })).id;
  theirs = (await createPlayer(handle.db, teamId, { displayName: "Them", primaryRole: "TOP", primaryPool: ["Riven"] })).id;
}, 60_000);
afterAll(async () => {
  await handle.close();
});

const style = { frame: "double", colours: { primary: "#f05a6e" }, identity: { tagline: "Calm in the chaos", emblem: "flame" } };

describe("who may change a card", () => {
  it("a player saves their own card: champion, look and banner", async () => {
    state.session = asPlayer(mine);
    expect(await setCardStyleAction(mine, { featuredChampionId: "Ahri", featuredSkinNum: 0, style })).toEqual({ ok: true });
    const look = cardLookFor((await getPlayer(handle.db, mine))!);
    expect(look.style).toMatchObject({ frame: "double", colours: { primary: "#f05a6e" }, identity: { tagline: "Calm in the chaos", emblem: "flame" } });
    const up = await uploadCardBannerAction(mine, dataUrl(png(800, 400)));
    expect(up.ok).toBe(true);
    expect(await getCardBanner(handle.db, mine)).not.toBeNull();
  });

  it("a player can never change someone else's card, banner included", async () => {
    state.session = asPlayer(mine);
    const before = await getPlayer(handle.db, theirs);
    expect((await setCardStyleAction(theirs, { featuredChampionId: "Riven", featuredSkinNum: 0, style: { frame: "premium" } })).ok).toBe(false);
    expect((await uploadCardBannerAction(theirs, dataUrl(png(800, 400)))).ok).toBe(false);
    expect((await removeCardBannerAction(theirs)).ok).toBe(false);
    const after = await getPlayer(handle.db, theirs);
    expect(after?.cardStyle).toEqual(before?.cardStyle);
    expect(after?.cardBannerVersion).toBeNull();
  });

  it("a personal-use account customises its own card like a team member", async () => {
    state.session = asPlayer(mine, false);
    expect((await setCardStyleAction(mine, { featuredChampionId: "Ahri", featuredSkinNum: 0, style: { frame: "glow" } })).ok).toBe(true);
    expect(cardLookFor((await getPlayer(handle.db, mine))!).style.frame).toBe("glow");
    expect((await setCardStyleAction(theirs, { featuredChampionId: "Riven", featuredSkinNum: 0, style: { frame: "glow" } })).ok).toBe(false);
  });

  it("the Owner may manage any card", async () => {
    state.session = owner;
    expect((await setCardStyleAction(theirs, { featuredChampionId: "Riven", featuredSkinNum: 0, style: { frame: "angular" } })).ok).toBe(true);
    expect(cardLookFor((await getPlayer(handle.db, theirs))!).style.frame).toBe("angular");
    expect((await removeCardBannerAction(mine)).ok).toBe(true);
    expect(await getCardBanner(handle.db, mine)).toBeNull();
  });
});

describe("what a save accepts", () => {
  it("refuses a tagline that claims a rank or an official title, and changes nothing", async () => {
    state.session = asPlayer(mine);
    const before = cardLookFor((await getPlayer(handle.db, mine))!).style;
    const r = await setCardStyleAction(mine, { featuredChampionId: "Ahri", featuredSkinNum: 0, style: { identity: { tagline: "Challenger mid" } } });
    expect(r.ok).toBe(false);
    expect(r.ok ? "" : r.error).toMatch(/rank|competitive/);
    expect(cardLookFor((await getPlayer(handle.db, mine))!).style).toEqual(before);
  });

  it("stores only cleaned values: long taglines are cut, unknown options dropped", async () => {
    state.session = asPlayer(mine);
    const r = await setCardStyleAction(mine, { featuredChampionId: "Ahri", featuredSkinNum: 0, style: { identity: { tagline: "x".repeat(200) }, frame: "<img onerror>", hack: "yes" } });
    expect(r.ok).toBe(true);
    const p = (await getPlayer(handle.db, mine))!;
    expect("hack" in (p.cardStyle ?? {})).toBe(false);
    const look = cardLookFor(p);
    expect(look.style.identity.tagline).toHaveLength(40);
    // An unknown frame keeps the saved one.
    expect(look.style.frame).toBe("glow");
  });

  it("refuses a banner that is not an image", async () => {
    state.session = asPlayer(mine);
    const r = await uploadCardBannerAction(mine, `data:image/png;base64,${Buffer.from("<script>alert(1)</script>").toString("base64")}`);
    expect(r.ok).toBe(false);
  });
});
