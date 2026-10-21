import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Session } from "@/server/auth/permissions";

/*
  Clash Scout's saved scouts with the real actions and permission checks: members save and read
  the team's scouts and edit or delete their own; lineup managers edit or delete any. Everything
  is scoped to the team (another team's scout is "not found"), a verification
  survives saving only when this server made it, earlier scouts are recognised by Riot's account
  id only, and games are linked to a scout only with two verified opponents in them.
*/

const state = vi.hoisted(() => ({ db: null as unknown, session: null as unknown }));
vi.mock("@/server/bootstrap", () => ({ getAppDb: async () => state.db }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined }));
vi.mock("@/server/auth/session", async (orig) => {
  const real = await orig<typeof import("@/server/auth/session")>();
  return {
    ...real,
    getSession: async () => state.session,
    requireSession: async () => {
      if (!state.session) throw new real.NotAuthorizedError("Please sign in.");
      return state.session;
    },
  };
});

import { sql } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { accountMatches, auditEvents, clashScoutAccounts, clashScouts, matchDetails, riotAccounts, teams, users, type MatchParticipantDetail } from "@/server/db/schema";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { deleteScoutAction, saveScoutAction, updateScoutAction, verifyOpponentAction } from "@/server/actions/clash";
import { createScout, getScout, listScouts, matchesForScout } from "@/server/clash/scouts";
import { STANDARD_PLAYER } from "@/server/auth/permissions";
import { emptyContent, type ScoutContent } from "@/domain/clash-scout/types";

let handle: DbHandle;
let teamId: string;
let otherTeamId: string;
const ids: Record<"alice" | "bob" | "manager" | "owner", string> = { alice: "", bob: "", manager: "", owner: "" };
const base = { label: "Me", hasPassword: true, mustChangePassword: false, setupComplete: true, playerId: null, teamMember: true };
const as = (who: keyof typeof ids, over: Partial<Session> = {}) => {
  state.session = { ...base, userId: ids[who], username: who, role: who === "owner" ? "owner" : "player", capabilities: who === "manager" ? [...STANDARD_PLAYER, "manage-lineup"] : STANDARD_PLAYER, ...over } as Session;
};
let clock = Date.now();
// Verification is throttled per member (one every 2 s): each check happens "later".
const later = () => vi.spyOn(Date, "now").mockReturnValue((clock += 5_000));

function scout(over: Partial<ScoutContent> = {}, names = ["Пётр Пустота", "오징어게임", "ドラゴンの心", "我是大魔王", "xX_Sn1per_Xx"]): ScoutContent {
  const c = emptyContent("oc1");
  return { ...c, opponentName: "Night Owls Gaming", tournament: { name: "Ionia Cup", day: "Day 2" }, players: c.players.map((p, i) => ({ ...p, name: names[i] ?? "", nameCertainty: "high", rank: { tier: "GOLD", division: "II", lp: 54 }, ranked: [{ championId: "Ahri", games: 41, winRate: 63, kda: 3.21, certainty: "high" }] })), ...over };
}

async function verify(slot: number, riotId: string, content: ScoutContent, scoutId: string | null = null): Promise<ScoutContent> {
  later();
  const r = await verifyOpponentAction({ riotId, platform: content.platform, scoutId });
  if (!r.ok) throw new Error(r.error);
  return { ...content, players: content.players.map((p) => (p.slot === slot ? { ...p, verification: "verified", riotId: r.data.riotId, puuid: r.data.puuid, proof: r.data.proof } : p)) };
}

beforeAll(async () => {
  vi.stubEnv("UNIIVERSE_FAKE_RIOT_IDS", "1");
  vi.stubEnv("UNIIVERSE_DB_MODE", "memory");
  vi.stubEnv("VERCEL", "");
  handle = await testDb();
  state.db = handle.db;
  teamId = (await getOrCreateTeam(handle.db)).id;
  otherTeamId = (await handle.db.insert(teams).values({ name: "Other team" }).returning())[0]!.id;
  for (const who of Object.keys(ids) as Array<keyof typeof ids>) {
    ids[who] = (await handle.db.insert(users).values({ username: who, displayName: who[0]!.toUpperCase() + who.slice(1), role: who === "owner" ? "owner" : "player" }).returning())[0]!.id;
  }
}, 60_000);
afterAll(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await handle.close();
});

describe("saving and reading scouts", () => {
  let id = "";

  it("saves a member's scout to the team's history, without proofs and without anything unverified posing as verified", async () => {
    as("alice");
    const forged = scout();
    forged.players[0] = { ...forged.players[0]!, verification: "verified", riotId: "Пётр Пустота#RU1", puuid: "forged-puuid", proof: "not-a-real-signature" };
    const r = await saveScoutAction(forged);
    expect(r.ok).toBe(true);
    id = r.ok ? r.data.id : "";
    const saved = (await getScout(handle.db, teamId, id))!;
    expect(saved).toMatchObject({ opponentName: "Night Owls Gaming", platform: "oc1", tournamentName: "Ionia Cup", playersCaptured: 5, playersVerified: 0, createdByName: "Alice" });
    expect(saved.content.players[0]).toMatchObject({ name: "Пётр Пустота", verification: "unverified", riotId: null, puuid: null });
    expect(JSON.stringify(saved.content)).not.toContain("proof");
    expect(await handle.db.select().from(clashScoutAccounts)).toEqual([]);
  });

  it("refuses data a browser should not send", async () => {
    as("alice");
    expect(await saveScoutAction({ ...scout(), players: [] })).toEqual({ ok: false, error: "This scout could not be read. Reload the page and try again." });
    expect(await saveScoutAction("nonsense")).toMatchObject({ ok: false });
  });

  it("lists and searches the team's scouts by opponent or player name, in any script", async () => {
    expect((await listScouts(handle.db, teamId)).map((s) => s.id)).toEqual([id]);
    expect((await listScouts(handle.db, teamId, { query: "night owls" })).length).toBe(1);
    expect((await listScouts(handle.db, teamId, { query: "пётр" })).length).toBe(1);
    expect((await listScouts(handle.db, teamId, { query: "大魔王" })).length).toBe(1);
    expect((await listScouts(handle.db, teamId, { query: "nobody" })).length).toBe(0);
  });

  it("keeps a verification this server made, and recognises the account in a later scout by its Riot account id only", async () => {
    as("alice");
    const first = await verify(0, "Пётр Пустота#RU1", scout());
    const a = await saveScoutAction(first);
    expect(a.ok).toBe(true);
    const savedA = (await getScout(handle.db, teamId, a.ok ? a.data.id : ""))!;
    expect(savedA.playersVerified).toBe(1);
    expect(savedA.content.players[0]).toMatchObject({ verification: "verified", riotId: "Пётр Пустота#RU1", puuid: "browser-test-пётр пустота-ru1" });

    // The same account checked again for a new scout: Riot's id names the earlier scout.
    later();
    const again = await verifyOpponentAction({ riotId: "Пётр Пустота#RU1", platform: "oc1", scoutId: null });
    expect(again.ok && again.data.earlier.map((e) => e.scoutId)).toEqual([savedA.id]);
    // A look-alike name is a different account: nothing earlier.
    later();
    const lookalike = await verifyOpponentAction({ riotId: "Петр Пустота#RU1", platform: "oc1", scoutId: null });
    expect(lookalike.ok && lookalike.data.earlier).toEqual([]);
  });

  it("does not keep a proof made for another server or another team", async () => {
    as("alice");
    const proven = await verify(1, "오징어게임#KR1", scout());
    const elsewhere = await saveScoutAction({ ...proven, platform: "euw1" });
    const saved = (await getScout(handle.db, teamId, elsewhere.ok ? elsewhere.data.id : ""))!;
    expect(saved.content.players[1]!.verification).toBe("unverified");
  });

  it("checks only a full Riot ID, and never more than one every two seconds", async () => {
    as("bob");
    later();
    expect(await verifyOpponentAction({ riotId: "오징어게임", platform: "oc1" })).toMatchObject({ ok: false, error: expect.stringContaining("full Riot ID") });
    later();
    expect((await verifyOpponentAction({ riotId: "오징어게임#KR1", platform: "oc1" })).ok).toBe(true);
    expect(await verifyOpponentAction({ riotId: "오징어게임#KR1", platform: "oc1" })).toMatchObject({ ok: false, error: expect.stringContaining("Too many checks") });
  });
});

describe("who may change a scout", () => {
  let id = "";
  let updatedAt = "";
  beforeAll(async () => {
    as("alice");
    const r = await saveScoutAction(scout({ opponentName: "Permissions FC" }));
    id = r.ok ? r.data.id : "";
    updatedAt = (await getScout(handle.db, teamId, id))!.updatedAt.toISOString();
  });

  it("lets the member who saved it edit it, and refuses another member", async () => {
    as("alice");
    const r = await updateScoutAction(id, scout({ opponentName: "Permissions FC (edited)" }), updatedAt);
    expect(r.ok).toBe(true);
    updatedAt = r.ok ? r.data.updatedAt : "";
    as("bob");
    expect(await updateScoutAction(id, scout({ opponentName: "Bob was here" }), updatedAt)).toEqual({ ok: false, error: "Only the member who saved this scout, or a lineup manager, can change it." });
    expect((await getScout(handle.db, teamId, id))!.opponentName).toBe("Permissions FC (edited)");
  });

  it("does not overwrite a newer edit", async () => {
    as("manager");
    const stale = new Date(Date.parse(updatedAt) - 60_000).toISOString();
    expect(await updateScoutAction(id, scout(), stale)).toEqual({ ok: false, error: "Someone else changed this scout meanwhile. Reload it to see their changes." });
  });

  it("lets a lineup manager edit any scout", async () => {
    as("manager");
    expect((await updateScoutAction(id, scout({ opponentName: "Managed" }), updatedAt)).ok).toBe(true);
  });

  it("deletes a scout for the member who saved it or a lineup manager, with its verified accounts only, and records who did", async () => {
    as("alice");
    const verified = await verify(0, "Пётр Пустота#OCE", scout({ opponentName: "Delete Me FC" }));
    const mine = (await saveScoutAction(verified)) as { ok: true; data: { id: string } };
    const kept = (await saveScoutAction(await verify(0, "Пётр Пустота#OCE", scout({ opponentName: "Keep Me FC" })))) as { ok: true; data: { id: string } };
    const managed = (await saveScoutAction(scout({ opponentName: "Managed Away" }))) as { ok: true; data: { id: string } };
    const accountsOf = async (scoutId: string) => (await handle.db.select().from(clashScoutAccounts).where(sql`${clashScoutAccounts.scoutId} = ${scoutId}`)).length;
    expect(await accountsOf(mine.data.id)).toBe(1);

    // Another member may read it, never delete it.
    as("bob");
    expect(await deleteScoutAction(mine.data.id)).toEqual({ ok: false, error: "Only the member who saved this scout, or a lineup manager, can delete it." });
    expect(await getScout(handle.db, teamId, mine.data.id)).not.toBeNull();

    as("alice");
    expect(await deleteScoutAction(mine.data.id)).toEqual({ ok: true, data: undefined });
    expect(await getScout(handle.db, teamId, mine.data.id)).toBeNull();
    expect(await accountsOf(mine.data.id)).toBe(0);
    // The other scout with the same verified account, and its index row, stay.
    expect(await accountsOf(kept.data.id)).toBe(1);
    expect(await deleteScoutAction(mine.data.id)).toEqual({ ok: false, error: "This scout no longer exists." });

    as("manager");
    expect((await deleteScoutAction(managed.data.id)).ok).toBe(true);
    as("owner");
    expect((await deleteScoutAction(kept.data.id)).ok).toBe(true);

    const recorded = await handle.db.select().from(auditEvents).where(sql`${auditEvents.action} = 'clash.scout-delete'`).orderBy(auditEvents.id);
    expect(recorded.map((r) => [r.actorName, r.targetType, r.targetName])).toEqual([
      ["alice", "scout", "Delete Me FC"],
      ["manager", "scout", "Managed Away"],
      ["owner", "scout", "Keep Me FC"],
    ]);
    expect(recorded[0]!.details).toEqual({ scouted: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), verified: 1 });
  });

  it("lists scouts archived before deleting replaced archiving, so they can be kept or deleted", async () => {
    as("alice");
    const old = (await saveScoutAction(scout({ opponentName: "Archived Long Ago" }))) as { ok: true; data: { id: string } };
    await handle.db.update(clashScouts).set({ archivedAt: new Date() }).where(sql`${clashScouts.id} = ${old.data.id}`);
    expect((await listScouts(handle.db, teamId)).map((s) => s.id)).toContain(old.data.id);
    expect((await listScouts(handle.db, teamId, { query: "archived long" })).map((s) => s.id)).toEqual([old.data.id]);
    expect((await deleteScoutAction(old.data.id)).ok).toBe(true);
  });

  it("refuses every action while Clash Scout is switched off, and keeps the saved scouts", async () => {
    as("owner");
    const saved = (await listScouts(handle.db, teamId)).length;
    vi.stubEnv("UNIIVERSE_CLASH_SCOUT", "off");
    try {
      expect(await saveScoutAction(scout())).toEqual({ ok: false, error: "Clash Scout is switched off." });
      later();
      expect(await verifyOpponentAction({ riotId: "Name#TAG", platform: "oc1" })).toEqual({ ok: false, error: "Clash Scout is switched off." });
    } finally {
      vi.unstubAllEnvs();
    }
    expect((await listScouts(handle.db, teamId)).length).toBe(saved);
    expect((await saveScoutAction(scout({ opponentName: "Switched back on" }))).ok).toBe(true);
  });

  it("refuses everyone outside the team workspace", async () => {
    for (const session of [null, { ...base, userId: ids.bob, username: "bob", role: "player", capabilities: STANDARD_PLAYER, teamMember: false }]) {
      state.session = session;
      expect((await saveScoutAction(scout())).ok).toBe(false);
      later();
      expect((await verifyOpponentAction({ riotId: "Name#TAG", platform: "oc1" })).ok).toBe(false);
    }
  });
});

describe("no scout crosses teams", () => {
  it("reads another team's scout as not found, everywhere", async () => {
    const foreign = await createScout(handle.db, otherTeamId, null, scout({ opponentName: "Foreign" }));
    expect(await getScout(handle.db, teamId, foreign)).toBeNull();
    expect((await listScouts(handle.db, teamId, { query: "foreign" })).length).toBe(0);
    as("owner");
    expect(await updateScoutAction(foreign, scout(), null)).toEqual({ ok: false, error: "This scout no longer exists." });
    expect(await deleteScoutAction(foreign)).toEqual({ ok: false, error: "This scout no longer exists." });
    expect(await getScout(handle.db, otherTeamId, foreign)).not.toBeNull();
    expect(await getScout(handle.db, teamId, "not-a-uuid")).toBeNull();
  });

  it("keeps Row Level Security on for the scout tables", async () => {
    const rows = await handle.db.execute<{ relname: string; relrowsecurity: boolean }>(sql`select relname, relrowsecurity from pg_class where relname in ('clash_scouts', 'clash_scout_accounts') order by relname`);
    const list = (Array.isArray(rows) ? rows : (rows as { rows: Array<{ relname: string; relrowsecurity: boolean }> }).rows).map((r) => [r.relname, r.relrowsecurity]);
    expect(list).toEqual([
      ["clash_scout_accounts", true],
      ["clash_scouts", true],
    ]);
  });
});

describe("games against a scouted team", () => {
  const part = (puuid: string, teamSide: number, win: boolean): MatchParticipantDetail => ({ puuid, name: puuid, teamId: teamSide, championId: "Ahri", championKey: 0, champLevel: 15, position: null, win, kills: 1, deaths: 1, assists: 1, cs: 100, gold: 1, damage: 1, damageTaken: 1, vision: 1, wardsPlaced: 1, items: null, spells: null, runes: null });

  it("links a game only when two of the scout's verified accounts played against the team in it", async () => {
    const member = (await createPlayer(handle.db, teamId, { displayName: "Ace", primaryRole: "MID", primaryPool: [] })).id;
    const [acc] = await handle.db.insert(riotAccounts).values({ ownerType: "player", playerId: member, gameName: "ace", tagLine: "T", platform: "oc1", puuid: "p-ace", label: "ace" }).returning({ id: riotAccounts.id });
    const scoutedAt = new Date();
    const at = scoutedAt.getTime() + 3_600_000;
    const games: Array<[string, string[]]> = [
      ["OC1_100", ["opp-1", "opp-2"]],
      ["OC1_101", ["opp-1", "someone"]],
    ];
    for (const [matchId, opponents] of games) {
      await handle.db.insert(accountMatches).values({ accountId: acc!.id, matchId, gameCreation: at, queueId: 700, championId: "Ahri", role: "MID", win: true, teamId: 100, patch: "16.1", gameDuration: 1800, kills: 1, deaths: 1, assists: 1, cs: 1, damage: 1, visionScore: 1 });
      await handle.db.insert(matchDetails).values({ matchId, gameCreation: at, gameDuration: 1800, teams: [], participants: [part("p-ace", 100, true), ...opponents.map((p) => part(p, 200, false))] });
    }
    const content = scout();
    content.players[0] = { ...content.players[0]!, verification: "verified", riotId: "A#1", puuid: "opp-1" };
    content.players[1] = { ...content.players[1]!, verification: "verified", riotId: "B#1", puuid: "opp-2" };
    expect(await matchesForScout(handle.db, teamId, { scoutedAt, content })).toEqual([{ matchId: "OC1_100", gameCreation: at, opponentsFound: 2, win: true }]);
    // Names alone link nothing.
    expect(await matchesForScout(handle.db, teamId, { scoutedAt, content: scout() })).toEqual([]);
    // Another team's games are never read.
    expect(await matchesForScout(handle.db, otherTeamId, { scoutedAt, content })).toEqual([]);
  });
});

describe("what a saved scout keeps", () => {
  it("keeps what both screenshots read (each name's readings, the rank's certainty, the total mastery), and nothing else a browser adds", async () => {
    as("alice");
    const full = scout();
    full.opponentReads = { ranked: { text: "Night Owls Gaming", confidence: 92 }, mastery: { text: "Night Owls Gaming", confidence: 88 } };
    full.players = full.players.map((p, i) => ({
      ...p,
      nameCertainty: i === 4 ? "manual" : "high",
      name: i === 4 ? "xX_Sn1per_Xx" : p.name,
      nameReads: { ranked: { text: i === 4 ? "xX_Snlper_Xx" : p.name, confidence: 88 }, mastery: { text: p.name, confidence: 91 } },
      rankCertainty: i === 2 ? "low" : "high",
      totalMastery: 400 + i,
      ranked: Array.from({ length: 5 }, (_, j) => ({ championId: "Ahri", games: 40 + j, winRate: 50 + j, kda: 3.21, certainty: j === 3 ? "low" : "high" })),
      mastery: Array.from({ length: 5 }, (_, j) => ({ championId: "Ahri", level: 105 - j, points: 1_204_400 - j * 1000, certainty: "high" })),
    }));
    const r = await saveScoutAction({ ...full, screenshot: "data:image/png;base64,AAAA", players: full.players.map((p) => ({ ...p, crop: "data:image/webp;base64,AAAA" })) });
    expect(r.ok).toBe(true);
    const saved = (await getScout(handle.db, teamId, r.ok ? r.data.id : ""))!;
    expect(saved.content.opponentReads).toEqual(full.opponentReads);
    expect(saved.content.players[4]).toMatchObject({ name: "xX_Sn1per_Xx", nameCertainty: "manual", nameReads: { ranked: { text: "xX_Snlper_Xx", confidence: 88 } }, totalMastery: 404 });
    expect(saved.content.players[2]).toMatchObject({ rankCertainty: "low" });
    expect(saved.content.players[0]!.mastery[0]!.level).toBe(105);
    // No image of any kind is stored, whatever a browser sends.
    expect(JSON.stringify(saved.content)).not.toContain("data:image");
  });
});

describe("storage stays small", () => {
  it("stores a scout in a few kilobytes", async () => {
    const rows = await handle.db.select({ content: clashScouts.content }).from(clashScouts);
    // A full scout (five players, five ranked and five mastery rows each, both screenshots' readings of each name) is about 6 kB.
    for (const r of rows) expect(JSON.stringify(r.content).length).toBeLessThan(8_000);
  });
});
