import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Session } from "@/server/auth/permissions";

/*
  Potential matches for a scout's names (server/clash/candidates.ts) through the real action, on a
  real database: only accounts UNIIVERSE already holds (an earlier verified scout of the team, the
  team members' recorded games on the same server), each shown under the Riot ID Riot gives for it
  now (the in-memory stand-in for Riot answers by PUUID), never a renamed account under its old
  name, never the team's own accounts, another server's or another team's games, and never a PUUID.
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

import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { accountMatches, matchDetails, riotAccounts, teams, users, type MatchParticipantDetail } from "@/server/db/schema";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { findCandidatesAction } from "@/server/actions/clash";
import { createScout } from "@/server/clash/scouts";
import { STANDARD_PLAYER } from "@/server/auth/permissions";
import { emptyContent } from "@/domain/clash-scout/types";
import type { Evidence } from "@/domain/clash-scout/identity";

let handle: DbHandle;
let teamId: string;
let userId: string;
let clock = Date.now();
const later = () => vi.spyOn(Date, "now").mockReturnValue((clock += 5_000));
const member = (over: Partial<Session> = {}) => {
  state.session = { userId, username: "alice", label: "Alice", role: "player", hasPassword: true, mustChangePassword: false, setupComplete: true, playerId: null, teamMember: true, capabilities: STANDARD_PLAYER, ...over } as Session;
};

const jettos: Evidence = {
  rank: { tier: "PLATINUM", division: "IV", lp: null },
  totalMastery: 811,
  ranked: [{ championId: "Ornn", games: 2 }],
  mastery: [
    { championId: "Ornn", points: 175_400, level: 19 },
    { championId: "Thresh", points: 122_900, level: 11 },
    { championId: "Jhin", points: 112_400, level: 13 },
  ],
};
const part = (puuid: string, name: string, side: number, championId: string): MatchParticipantDetail => ({ puuid, name, teamId: side, championId, championKey: 0, champLevel: 15, position: null, win: side === 100, kills: 1, deaths: 1, assists: 1, cs: 100, gold: 1, damage: 1, damageTaken: 1, vision: 1, wardsPlaced: 1, items: null, spells: null, runes: null });

beforeAll(async () => {
  // The in-memory stand-in for Riot: its accounts are named in their PUUID ("browser-test-<name>-<tag>").
  // Its made-up mastery is left out here: these candidates are judged on the earlier scout only
  // (tests/db/clash-lab.test.ts covers live mastery with figures it controls).
  vi.stubEnv("UNIIVERSE_FAKE_RIOT_IDS", "1");
  vi.stubEnv("UNIIVERSE_CLASH_LIVE_MASTERY", "off");
  vi.stubEnv("UNIIVERSE_DB_MODE", "memory");
  vi.stubEnv("VERCEL", "");
  handle = await testDb();
  state.db = handle.db;
  teamId = (await getOrCreateTeam(handle.db)).id;
  userId = (await handle.db.insert(users).values({ username: "alice", displayName: "Alice", role: "player" }).returning())[0]!.id;

  // An earlier scout of the team in which a member verified Jettos#OCE (what the screenshots showed then).
  const earlier = emptyContent("oc1");
  earlier.opponentName = "WTF";
  earlier.players[0] = { ...earlier.players[0]!, name: "jettos", nameCertainty: "manual", verification: "verified", riotId: "jettos#OCE", puuid: "browser-test-jettos-oce", totalMastery: 790, rank: jettos.rank, mastery: jettos.mastery.map((c) => ({ ...c, points: c.points! - 4_000, certainty: "high" as const })) };
  await createScout(handle.db, teamId, userId, earlier);

  // The team's games on OCE: Jettos#AU1 played Ornn twice; "Kye#OCE" has since renamed (Riot now calls it NewName#OCE);
  // the team's own Kye account; a Jettos on EUW; and a game of another team.
  const ace = (await createPlayer(handle.db, teamId, { displayName: "Ace", primaryRole: "MID", primaryPool: [] })).id;
  const [acc] = await handle.db.insert(riotAccounts).values({ ownerType: "player", playerId: ace, gameName: "Kye", tagLine: "T", platform: "oc1", puuid: "p-own-kye", label: "Kye" }).returning({ id: riotAccounts.id });
  const games: Array<[string, string, MatchParticipantDetail[]]> = [
    ["OC1_1", "oc1", [part("p-own-kye", "Kye#T", 100, "Ahri"), part("browser-test-jettos-au1", "Jettos#AU1", 200, "Ornn"), part("browser-test-newname-oce", "Kye#OCE", 200, "Lux")]],
    ["OC1_2", "oc1", [part("p-own-kye", "Kye#T", 100, "Ahri"), part("browser-test-jettos-au1", "Jettos#AU1", 200, "Ornn")]],
    ["EUW1_3", "euw1", [part("p-own-kye", "Kye#T", 100, "Ahri"), part("browser-test-jettos-euw", "Jettos#EUW", 200, "Ornn")]],
  ];
  for (const [matchId, platform, participants] of games) {
    await handle.db.insert(accountMatches).values({ accountId: acc!.id, matchId, gameCreation: Date.UTC(2026, 9, 10), queueId: 700, championId: "Ahri", role: "MID", win: true, teamId: 100, patch: "16.18", gameDuration: 1800, kills: 1, deaths: 1, assists: 1, cs: 1, damage: 1, visionScore: 1 });
    await handle.db.insert(matchDetails).values({ matchId, platform, gameCreation: Date.UTC(2026, 9, 10), gameDuration: 1800, teams: [], participants });
  }
  // Another team's game (not in any of this team's accounts' games).
  await handle.db.insert(teams).values({ name: "Other team" });
  await handle.db.insert(matchDetails).values({ matchId: "OC1_9", platform: "oc1", gameCreation: Date.UTC(2026, 9, 11), gameDuration: 1800, teams: [], participants: [part("browser-test-jettos-xx", "Jettos#XX", 200, "Ornn")] });
}, 60_000);
afterAll(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await handle.close();
});

describe("potential matches", () => {
  it("offers accounts UNIIVERSE knows by that name on that server, best evidence first, each under its current Riot ID", async () => {
    member();
    later();
    const r = await findCandidatesAction({ platform: "oc1", players: [{ slot: 0, name: "Jettos", evidence: jettos }] });
    expect(r.ok).toBe(true);
    const found = r.ok ? r.data[0]! : [];
    expect(found.map((c) => c.riotId)).toEqual(["jettos#OCE", "jettos#AU1"]);
    // Three champions agree with the earlier scout (their points only grew): a partial match, as
    // a strong one needs four. The other Jettos has no figures to compare, only games.
    expect(found[0]).toMatchObject({ strength: "some" });
    expect(found[0]!.facts).toContain("3 of 3 champions agree");
    expect(found[0]!.facts.some((f) => /^Verified in your scout of WTF \(\d+ \w+\)$/.test(f))).toBe(true);
    expect(found[1]).toMatchObject({ strength: "name" });
    expect(found[1]!.facts[0]).toMatch(/^Played with or against your team in 2 recorded games \(last \d+ Oct\), on Ornn$/);
    // Not EUW's Jettos, not another team's game, and never a PUUID.
    expect(JSON.stringify(r)).not.toMatch(/browser-test|EUW|#XX/);
  });

  it("never offers a renamed account under its old name, nor the team's own accounts", async () => {
    member();
    later();
    const r = await findCandidatesAction({ platform: "oc1", players: [{ slot: 1, name: "Kye", evidence: { rank: null, totalMastery: null, ranked: [], mastery: [] } }, { slot: 2, name: "Nobody", evidence: { rank: null, totalMastery: null, ranked: [], mastery: [] } }] });
    expect(r).toEqual({ ok: true, data: {} });
  });

  it("is for team members only, bounded, and throttled", async () => {
    member({ teamMember: false });
    later();
    expect(await findCandidatesAction({ platform: "oc1", players: [] })).toMatchObject({ ok: false, error: /members of the team/ });
    member();
    later();
    expect(await findCandidatesAction({ platform: "oc1", players: [{ slot: 9, name: "x", evidence: { rank: null, totalMastery: null, ranked: [], mastery: [] } }] })).toMatchObject({ ok: false });
    expect(await findCandidatesAction({ platform: "OC 1; drop", players: [] })).toMatchObject({ ok: false });
    later();
    expect((await findCandidatesAction({ platform: "oc1", players: [] })).ok).toBe(true);
    // At once again: refused.
    expect(await findCandidatesAction({ platform: "oc1", players: [] })).toMatchObject({ ok: false, error: /Too many lookups/ });
  });
});
