import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { createPlayer, getActiveLineupProfiles, getOrCreateTeam, setLineupSlot } from "@/server/repositories/team";
import { createDraft, getDraft, lastSeriesEnemyPlayers, setDraftEnemySlot, setDraftSide } from "@/server/repositories/drafts";
import { createSeries } from "@/server/series/repository";
import { applyDraftActionCore } from "@/server/live/apply";
import { createUser } from "@/server/repositories/users";
import { listEnemyScouting, scoutDraftEnemies, verifyEnemy } from "@/server/scouting/session";
import { RiotApiClient } from "@/server/riot/api/client";
import { RateLimiter } from "@/server/riot/api/rate-limiter";
import type { Session } from "@/server/auth/permissions";
import fixture from "@/server/riot/fixtures/champions.fixture.json";

/* The three-step draft start: setup → opponent scouting (fast verification, background evidence) → side → pick/ban. */

const keyOf = (id: string) => fixture.champions.find((c) => c.id === id)!.key;
let handle: DbHandle;
let teamId: string;
let coach: Session;

function fakeRiot(b: { unknownNames?: string[]; calls?: string[] } = {}) {
  const fetchImpl = async (input: string | URL | Request): Promise<Response> => {
    const url = String(input);
    b.calls?.push(url);
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    const acc = /\/by-riot-id\/([^/]+)\/([^/?]+)/.exec(url);
    if (acc) {
      const name = decodeURIComponent(acc[1]!);
      if (b.unknownNames?.includes(name)) return json({ status: { message: "not found" } }, 404);
      return json({ puuid: `puuid-${name}`, gameName: name, tagLine: decodeURIComponent(acc[2]!) });
    }
    if (url.includes("/region/by-game/")) return json({ puuid: "x", game: "lol", region: "OC1" });
    if (url.includes("/lol/league/v4/entries/by-puuid/")) return json([{ queueType: "RANKED_SOLO_5x5", tier: "EMERALD", rank: "II", leaguePoints: 40, wins: 90, losses: 80 }]);
    if (url.includes("/lol/champion-mastery/v4/")) return json([{ championId: keyOf("Darius"), championLevel: 10, championPoints: 300000 }]);
    const ids = /\/by-puuid\/([^/]+)\/ids/.exec(url);
    if (ids) return json(Array.from({ length: 6 }, (_, i) => `OC1_${decodeURIComponent(ids[1]!)}_${i}`));
    const m = /\/lol\/match\/v5\/matches\/([^/?]+)$/.exec(url);
    if (m) {
      const [, puuid, idx] = decodeURIComponent(m[1]!).split("_");
      const positions = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];
      const participants = Array.from({ length: 10 }, (_, k) => ({ puuid: k === 0 ? puuid : `other-${k}`, teamId: k < 5 ? 100 : 200, championId: k === 0 ? keyOf("Darius") : keyOf("Ahri") + k, teamPosition: positions[k % 5], win: k < 5, kills: 1, deaths: 1, assists: 1 }));
      return json({ metadata: { matchId: m[1] }, info: { gameCreation: Date.now() - Number(idx) * 86_400_000, gameDuration: 1800, gameVersion: "15.19.1.1", queueId: 420, teams: [], participants } });
    }
    return json({}, 404);
  };
  return new RiotApiClient({ apiKey: "RGAPI-test", fetchImpl, limiter: new RateLimiter([{ requests: 1000, seconds: 1 }]), sleep: async () => {}, maxRetries: 0 });
}

async function newDraft(opts: { sideConfirmed?: boolean; enemyPlayers?: Record<string, string>; seriesId?: string; gameNumber?: number } = {}) {
  const lineup = (await getActiveLineupProfiles(handle.db, teamId))!;
  return createDraft(handle.db, teamId, {
    opponentName: "",
    side: "blue",
    sideConfirmed: opts.sideConfirmed ?? false,
    patch: "15.19",
    players: lineup.players,
    assignment: lineup.assignment,
    mode: "ranked-flex",
    formatId: "ranked-flex",
    createdByUserId: coach.userId,
    enemyPlayers: opts.enemyPlayers ?? {},
    seriesId: opts.seriesId ?? null,
    gameNumber: opts.gameNumber ?? 1,
  });
}

beforeAll(async () => {
  handle = await testDb();
  await syncStaticData(handle.db, new FixtureStaticProvider(), { fingerprint: false });
  const u = await createUser(handle.db, { username: "Controller", password: null, role: "player" });
  coach = { userId: u.id, role: "player", label: "Controller", playerId: null, username: "Controller", hasPassword: false, mustChangePassword: false, setupComplete: true };
  teamId = (await getOrCreateTeam(handle.db)).id;
  const specs = [
    ["Top", "TOP", ["Gwen"]],
    ["Jg", "JUNGLE", ["Viego"]],
    ["Mid", "MID", ["Orianna"]],
    ["Adc", "ADC", ["Jinx"]],
    ["Sup", "SUPPORT", ["Nautilus"]],
  ] as const;
  for (const [name, role, pool] of specs) {
    const p = await createPlayer(handle.db, teamId, { displayName: name, primaryRole: role, primaryPool: [...pool] });
    await setLineupSlot(handle.db, teamId, role, p.id);
  }
}, 60_000);
afterAll(async () => {
  await handle.close();
});

describe("side selection before pick/ban", () => {
  it("refuses the first ban or pick until a side is chosen", async () => {
    const draft = await newDraft();
    expect(draft.sideConfirmed).toBe(false);
    const r = await applyDraftActionCore(handle.db, draft.id, { championId: "Darius" }, { session: coach });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toMatch(/Choose Blue or Red side/);
    expect((await getDraft(handle.db, draft.id))!.actions).toHaveLength(0);
  });

  it("lets the side be chosen and corrected before the first action, never after", async () => {
    const draft = await newDraft();
    await setDraftSide(handle.db, draft.id, "red");
    let now = (await getDraft(handle.db, draft.id))!;
    expect(now).toMatchObject({ side: "red", sideConfirmed: true });
    expect(now.version).toBeGreaterThan(draft.version);
    await setDraftSide(handle.db, draft.id, "blue");
    now = (await getDraft(handle.db, draft.id))!;
    expect(now.side).toBe("blue");
    expect((await applyDraftActionCore(handle.db, draft.id, { championId: "Darius" }, { session: coach })).ok).toBe(true);
    await expect(setDraftSide(handle.db, draft.id, "red")).rejects.toThrow(/before the first ban or pick/);
    expect((await getDraft(handle.db, draft.id))!.side).toBe("blue");
  });

  it("keeps drafts created before this change (side already known) usable at once", async () => {
    const draft = await newDraft({ sideConfirmed: true });
    expect((await applyDraftActionCore(handle.db, draft.id, { championId: "Darius" }, { session: coach })).ok).toBe(true);
  });
});

describe("opponent scouting: fast verification with honest fallbacks", () => {
  it("treats an empty entry as nothing to check and a malformed one as invalid, without calling Riot", async () => {
    const calls: string[] = [];
    const draft = await newDraft();
    await setDraftEnemySlot(handle.db, draft.id, "TOP", "");
    expect(await verifyEnemy(handle.db, draft.id, "TOP", fakeRiot({ calls }))).toEqual({ status: "empty" });
    await setDraftEnemySlot(handle.db, draft.id, "TOP", "NoTagHere");
    expect((await verifyEnemy(handle.db, draft.id, "TOP", fakeRiot({ calls }))).status).toBe("invalid");
    expect(calls).toHaveLength(0);
    expect(await listEnemyScouting(handle.db, draft.id)).toHaveLength(0);
  });

  it("keeps the entry as pending (never blocking) when Riot data is unavailable", async () => {
    const draft = await newDraft();
    await setDraftEnemySlot(handle.db, draft.id, "MID", "Offline#OCE");
    const check = await verifyEnemy(handle.db, draft.id, "MID", null);
    expect(check.status).toBe("pending");
    const [row] = await listEnemyScouting(handle.db, draft.id);
    expect(row).toMatchObject({ riotId: "Offline#OCE", status: "pending", gamesAnalysed: 0 });
  });

  it("reports an unknown Riot ID as unable to verify", async () => {
    const draft = await newDraft();
    await setDraftEnemySlot(handle.db, draft.id, "ADC", "Ghost#OCE");
    const check = await verifyEnemy(handle.db, draft.id, "ADC", fakeRiot({ unknownNames: ["Ghost"] }));
    expect(check.status).toBe("unresolved");
    expect((await listEnemyScouting(handle.db, draft.id))[0]!.status).toBe("unresolved");
  });

  it("verifies the identity first, gathers evidence for that entry only, then reuses it for the same player", async () => {
    const draft = await newDraft();
    await setDraftEnemySlot(handle.db, draft.id, "TOP", "Bruiser#OCE");
    await setDraftEnemySlot(handle.db, draft.id, "JUNGLE", "Other#OCE");
    const calls: string[] = [];
    expect(await verifyEnemy(handle.db, draft.id, "TOP", fakeRiot({ calls }))).toEqual({ status: "verified" });
    // Only the identity lookups so far: no match history yet, and nothing claims to be complete.
    expect(calls.some((u) => u.includes("/lol/match/"))).toBe(false);
    let rows = await listEnemyScouting(handle.db, draft.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ riotId: "Bruiser#OCE", status: "verified", gamesAnalysed: 0 });
    // Background evidence for this slot alone; the other entry is left for its own check.
    await scoutDraftEnemies(handle.db, draft.id, { client: fakeRiot(), onlyRoles: ["TOP"], maxMatchesPerEnemy: 12 });
    rows = await listEnemyScouting(handle.db, draft.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("ok");
    expect(rows[0]!.gamesAnalysed).toBeGreaterThan(0);
    // Re-verifying the same entry is instant; a new draft with the same player reuses the evidence.
    expect(await verifyEnemy(handle.db, draft.id, "TOP", null)).toEqual({ status: "ready", reused: true });
    const next = await newDraft();
    await setDraftEnemySlot(handle.db, next.id, "MID", "bruiser#oce");
    const versionBefore = (await getDraft(handle.db, next.id))!.version;
    expect(await verifyEnemy(handle.db, next.id, "MID", null)).toEqual({ status: "ready", reused: true });
    expect((await getDraft(handle.db, next.id))!.version).toBeGreaterThan(versionBefore);
    expect((await listEnemyScouting(handle.db, next.id))[0]).toMatchObject({ status: "ok" });
  });
});

describe("series", () => {
  it("offers the previous game's enemy roster to the next game", async () => {
    const series = await createSeries(handle.db, teamId, { mode: "scrim", bestOf: 3, eventName: "", opponentName: "Rivals", createdByUserId: coach.userId });
    await newDraft({ seriesId: series.id, gameNumber: 1, enemyPlayers: { TOP: "One#OCE", MID: "Two#OCE" } });
    expect(await lastSeriesEnemyPlayers(handle.db, series.id)).toMatchObject({ TOP: "One#OCE", MID: "Two#OCE" });
  });
});
