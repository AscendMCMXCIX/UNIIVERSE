import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Session } from "@/server/auth/permissions";

/*
  The Testing Lab and the identification engine it shares with Clash Scout, on a real database:

  - discovery finds accounts only by name, on the right server, from the team's recorded games
    and earlier scouts; never the team's own accounts, but an account of the retired opponent
    lists is a player like any other;
  - judging uses each candidate's mastery now (figures this test controls) and calls a statistical
    match only that, never a verified identity;
  - a renamed account is left out for a current screen and kept for an old one;
  - Riot failing is said as such, and answers are kept rather than asked twice;
  - blind tests: answers sealed, the two conditions apart, the right account found or not;
  - the Lab is for the Owner and administrators only, writes nothing and never shows a PUUID.
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
import { accountMatches, matchDetails, opponentPlayers, opponentTeams, riotAccounts, users, type MatchParticipantDetail } from "@/server/db/schema";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { STANDARD_PLAYER } from "@/server/auth/permissions";
import { discoverAccounts } from "@/server/clash/candidates";
import { identifyAgainstPool, identifyByName, type PoolAccount } from "@/server/clash/identify";
import { riotCandidateSource, type CandidateRiot } from "@/server/clash/candidate-riot";
import { generateBlindTestAction, runBlindTestAction, runManualTestAction, runVariantsAction } from "@/server/actions/clash-lab";
import { erasureFilter } from "@/server/privacy/ledger";
import { RiotApiClient, RiotApiError } from "@/server/riot/api/client";
import type { MasterySnapshot, ShownPlayer } from "@/domain/clash-scout/mastery-match";
import { emptyScenario, exampleScenario, type LabScenario } from "@/domain/clash-scout/lab";
import { invalidateAllCaches } from "@/server/observability/cache";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";

let handle: DbHandle;
let teamId: string;
let userId: string;
let clock = Date.now();
const later = () => vi.spyOn(Date, "now").mockReturnValue((clock += 5_000));
const as = (over: Partial<Session> = {}) => {
  state.session = { userId, username: "owner", label: "Owner", role: "owner", hasPassword: true, mustChangePassword: false, setupComplete: true, playerId: null, teamMember: true, capabilities: STANDARD_PLAYER, ...over } as Session;
};
const NOW = Date.now();
const DAY = 86_400_000;
const name = (id: string) => id;

const part = (puuid: string, riotId: string, side: number, championId: string): MatchParticipantDetail => ({ puuid, name: riotId, teamId: side, championId, championKey: 0, champLevel: 15, position: null, win: side === 100, kills: 1, deaths: 1, assists: 1, cs: 100, gold: 1, damage: 1, damageTaken: 1, vision: 1, wardsPlaced: 1, items: null, spells: null, runes: null });

/** The figures this test gives Riot's answers: Riot IDs now and full mastery lists now. */
const RIOT_IDS: Record<string, string | null> = {
  "p-riven-oce": "RivenMain#OCE",
  "p-riven-au1": "RivenMain#AU1",
  "p-renamed": "NewName#OCE",
  "p-cyr": "Пётр Пустота#RU1",
  "p-old-opponent": "Ex Opponent#OCE",
  "p-busy": "Busy Player#OCE",
};
const full = (points: Record<string, number>, totalScore: number | null = null): MasterySnapshot => ({ champions: Object.entries(points).map(([championId, p]) => ({ championId, points: p })).sort((a, b) => b.points - a.points), coverage: "full", totalScore, capturedAt: NOW, label: "Riot, now" });
const RIVEN_MAIN = { Riven: 450_000, Ambessa: 175_000, Gwen: 130_000, Camille: 87_000, Olaf: 42_000, Jax: 30_000, Fiora: 12_000 };
const MASTERY: Record<string, MasterySnapshot> = {
  "p-riven-oce": full(RIVEN_MAIN, 640),
  // Same name, different account: Riven too, but other figures (and Jinx far above the fifth shown).
  "p-riven-au1": full({ Riven: 300_000, Jinx: 280_000, Gwen: 150_000, Ambessa: 90_000, Camille: 60_000, Olaf: 50_000 }, 410),
  "p-renamed": full({ Ahri: 500_000, Syndra: 200_000, Orianna: 150_000, Viktor: 90_000, Akali: 50_000 }),
  "p-cyr": full({ Thresh: 700_000, Nautilus: 250_000, Lulu: 150_000, Senna: 90_000, Braum: 40_000 }),
  "p-old-opponent": full({ Jinx: 400_000, Kaisa: 270_000, Ezreal: 200_000, Caitlyn: 95_000, Jhin: 77_000 }),
};

function controlledRiot(): CandidateRiot & { asked: string[] } {
  const asked: string[] = [];
  let accounts = 0, mastery = 0;
  return {
    standIn: false,
    asked,
    async riotIdNow(_p, puuid) {
      accounts++;
      asked.push(`id:${puuid}`);
      return RIOT_IDS[puuid] ?? null;
    },
    async mastery(_p, puuid) {
      mastery++;
      asked.push(`mastery:${puuid}`);
      if (puuid === "p-busy") return { ok: false, reason: "busy" };
      const snap = MASTERY[puuid];
      return snap ? { ok: true, snapshot: snap } : { ok: false, reason: "not-found" };
    },
    counts: () => ({ accounts, mastery }),
  };
}

const screen = (champions: Array<[string, number | null]>, over: Partial<ShownPlayer> = {}): ShownPlayer => ({ champions: champions.map(([championId, points]) => ({ championId, points, precision: 0 })), totalScore: null, capturedAt: NOW, ...over });
const rivenScreen = screen([["Riven", 450_000], ["Ambessa", 175_000], ["Gwen", 130_000], ["Camille", 87_000], ["Olaf", 42_000]]);

beforeAll(async () => {
  vi.stubEnv("UNIIVERSE_FAKE_RIOT_IDS", "1");
  vi.stubEnv("UNIIVERSE_DB_MODE", "memory");
  vi.stubEnv("VERCEL", "");
  handle = await testDb();
  state.db = handle.db;
  await syncStaticData(handle.db, new FixtureStaticProvider(), { fingerprint: false });
  teamId = (await getOrCreateTeam(handle.db)).id;
  userId = (await handle.db.insert(users).values({ username: "owner", displayName: "Owner", role: "owner" }).returning())[0]!.id;

  const ace = (await createPlayer(handle.db, teamId, { displayName: "Ace", primaryRole: "MID", primaryPool: [] })).id;
  const [acc] = await handle.db.insert(riotAccounts).values({ ownerType: "player", playerId: ace, gameName: "Ace", tagLine: "OCE", platform: "oc1", puuid: "p-own", label: "Ace" }).returning({ id: riotAccounts.id });
  // A retired Draft opponent list's account: a player like any other for discovery.
  const [ot] = await handle.db.insert(opponentTeams).values({ teamId, name: "Old rivals" }).returning({ id: opponentTeams.id });
  const [op] = await handle.db.insert(opponentPlayers).values({ opponentTeamId: ot!.id, label: "Ex Opponent" }).returning({ id: opponentPlayers.id });
  await handle.db.insert(riotAccounts).values({ ownerType: "opponent", opponentPlayerId: op!.id, gameName: "Ex Opponent", tagLine: "OCE", platform: "oc1", puuid: "p-old-opponent", label: "main" });

  const games: Array<[string, string, MatchParticipantDetail[]]> = [
    ["OC1_1", "oc1", [part("p-own", "Ace#OCE", 100, "Ahri"), part("p-riven-oce", "RivenMain#OCE", 200, "Riven"), part("p-renamed", "OldName#OCE", 200, "Ahri"), part("p-cyr", "Пётр Пустота#RU1", 200, "Thresh")]],
    ["OC1_2", "oc1", [part("p-own", "Ace#OCE", 100, "Ahri"), part("p-riven-oce", "RivenMain#OCE", 200, "Gwen"), part("p-riven-au1", "RivenMain#AU1", 100, "Riven"), part("p-old-opponent", "Ex Opponent#OCE", 200, "Jinx")]],
    ["OC1_3", "oc1", [part("p-own", "Ace#OCE", 100, "Ahri"), part("p-busy", "Busy Player#OCE", 200, "Riven")]],
    ["EUW1_1", "euw1", [part("p-own", "Ace#OCE", 100, "Ahri"), part("p-riven-euw", "RivenMain#EUW", 200, "Riven")]],
  ];
  for (const [matchId, platform, participants] of games) {
    await handle.db.insert(accountMatches).values({ accountId: acc!.id, matchId, gameCreation: NOW - 5 * DAY, queueId: 420, championId: "Ahri", role: "MID", win: true, teamId: 100, patch: "16.20", gameDuration: 1800, kills: 1, deaths: 1, assists: 1, cs: 1, damage: 1, visionScore: 1 });
    await handle.db.insert(matchDetails).values({ matchId, platform, gameCreation: NOW - 5 * DAY, gameDuration: 1800, teams: [], participants });
  }
}, 60_000);
afterAll(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await handle.close();
});

describe("discovery: accounts known by a name, on one server", () => {
  it("finds every account of a name, most games first, whatever the case or spacing typed", async () => {
    const found = await discoverAccounts(handle.db, teamId, "oc1", [{ slot: 0, name: "riven main" }]);
    expect(found.get(0)!.accounts.map((a) => a.puuid)).toEqual(["p-riven-oce", "p-riven-au1"]);
    expect(found.get(0)!.accounts[0]!.games).toMatchObject({ games: 2, champions: expect.arrayContaining(["Riven", "Gwen"]) });
  });

  it("never the team's own accounts, nor another server's; an old opponent list's account is found", async () => {
    const found = await discoverAccounts(handle.db, teamId, "oc1", [{ slot: 0, name: "Ace" }, { slot: 1, name: "Ex Opponent" }]);
    expect(found.get(0)!.accounts).toEqual([]);
    expect(found.get(1)!.accounts.map((a) => a.puuid)).toEqual(["p-old-opponent"]);
    expect((await discoverAccounts(handle.db, teamId, "oc1", [{ slot: 0, name: "RivenMain" }])).get(0)!.accounts.map((a) => a.puuid)).not.toContain("p-riven-euw");
  });

  it("finds names in other scripts as written", async () => {
    const found = await discoverAccounts(handle.db, teamId, "oc1", [{ slot: 0, name: "Пётр Пустота" }]);
    expect(found.get(0)!.accounts.map((a) => a.puuid)).toEqual(["p-cyr"]);
  });

  it("says when more accounts had the name than were looked at", async () => {
    const found = await discoverAccounts(handle.db, teamId, "oc1", [{ slot: 0, name: "RivenMain" }], 1);
    expect(found.get(0)).toMatchObject({ capped: true });
    expect(found.get(0)!.accounts).toHaveLength(1);
  });
});

describe("identification with each candidate's mastery now", () => {
  const erasedNone = async () => erasureFilter(handle.db);

  it("the account whose mastery agrees is a strong statistical match; the namesake whose mastery contradicts it is not", async () => {
    const riot = controlledRiot();
    const [r] = await identifyByName(handle.db, teamId, "oc1", [{ slot: 0, name: "RivenMain", shown: rivenScreen }], riot, { championName: name, erased: await erasedNone(), now: NOW });
    expect(r!.outcome).toBe("strong");
    expect(r!.candidates.map((c) => [c.riotId, c.judgement.strength])).toEqual([["RivenMain#OCE", "strong"], ["RivenMain#AU1", "differs"]]);
    expect(r!.candidates[1]!.judgement.contradictions).toContain("Jinx has 280,000 now: it would have been among the five shown");
    expect(r!.candidates.every((c) => !c.verified)).toBe(true);
    // Two Riot questions an account: its Riot ID and its mastery.
    expect(riot.counts()).toEqual({ accounts: 2, mastery: 2 });
  });

  it("a renamed account is left out for a current screen, and kept, named as now, for a screen two months old", async () => {
    const now = await identifyByName(handle.db, teamId, "oc1", [{ slot: 0, name: "OldName", shown: screen([["Ahri", 400_000], ["Syndra", 150_000]]) }], controlledRiot(), { championName: name, now: NOW });
    expect(now[0]).toMatchObject({ outcome: "not-discovered", discovery: { found: 1, renamed: 1 } });
    const old = await identifyByName(handle.db, teamId, "oc1", [{ slot: 0, name: "OldName", shown: screen([["Ahri", 400_000], ["Syndra", 150_000], ["Orianna", 120_000], ["Viktor", 70_000], ["Akali", 40_000]], { capturedAt: NOW - 60 * DAY }) }], controlledRiot(), { championName: name, now: NOW });
    expect(old[0]!.outcome).toBe("strong");
    expect(old[0]!.candidates[0]!.sources).toContain("Named NewName#OCE now: another name than the one shown");
  });

  it("says when Riot could not give an account's mastery, and calls nothing on it", async () => {
    const [r] = await identifyByName(handle.db, teamId, "oc1", [{ slot: 0, name: "Busy Player", shown: rivenScreen }], controlledRiot(), { championName: name, now: NOW });
    expect(r).toMatchObject({ outcome: "unscored", discovery: { masteryUnavailable: "Riot asked the app to slow down: mastery not fetched" } });
  });

  it("names nobody it cannot find, and needs at least two figures to judge", async () => {
    const [none] = await identifyByName(handle.db, teamId, "oc1", [{ slot: 0, name: "Nobody Known", shown: rivenScreen }], controlledRiot(), { championName: name, now: NOW });
    expect(none!.outcome).toBe("not-discovered");
    const [thin] = await identifyByName(handle.db, teamId, "oc1", [{ slot: 0, name: "RivenMain", shown: screen([["Riven", 450_000]]) }], controlledRiot(), { championName: name, now: NOW });
    expect(thin!.outcome).toBe("not-enough");
  });

  it("the controlled pool compares mastery alone: the right account wins whatever its name", () => {
    const pool: PoolAccount[] = Object.entries(MASTERY).map(([puuid, snapshot]) => ({ ref: puuid, label: RIOT_IDS[puuid] ?? puuid, riotId: RIOT_IDS[puuid] ?? null, snapshot }));
    const [r] = identifyAgainstPool([{ slot: 0, name: "Anything", shown: rivenScreen }], pool, name);
    expect(r!.outcome).toBe("strong");
    expect(r!.candidates[0]!.ref).toBe("p-riven-oce");
  });
});

describe("Riot's answers are kept and failures said", () => {
  it("asks Riot once for an account's Riot ID and mastery, then answers from the cache", async () => {
    invalidateAllCaches();
    const calls: string[] = [];
    const client = {
      requestCount: 0,
      async accountByPuuid(_p: string, puuid: string) {
        calls.push(`id:${puuid}`);
        return { puuid, gameName: "RivenMain", tagLine: "OCE" };
      },
      async championMasteries(_p: string, puuid: string) {
        calls.push(`mastery:${puuid}`);
        if (puuid === "p-limited") throw new RiotApiError("Rate limited", 429, true);
        return [{ championId: 92, championPoints: 450_000, championLevel: 40 }, { championId: 266, championPoints: 1_000, championLevel: 1 }];
      },
    } as unknown as RiotApiClient;
    const riot = riotCandidateSource(client, new Map([[92, "Riven"], [266, "Aatrox"]]));
    expect(await riot.riotIdNow("oc1", "p-x")).toBe("RivenMain#OCE");
    expect(await riot.riotIdNow("oc1", "p-x")).toBe("RivenMain#OCE");
    const m = await riot.mastery("oc1", "p-x");
    expect(m.ok && m.snapshot).toMatchObject({ coverage: "full", totalScore: 41, champions: [{ championId: "Riven", points: 450_000 }, { championId: "Aatrox", points: 1_000 }] });
    await riot.mastery("oc1", "p-x");
    expect(calls).toEqual(["id:p-x", "mastery:p-x"]);
    expect(await riot.mastery("oc1", "p-limited")).toEqual({ ok: false, reason: "busy" });
    vi.stubEnv("UNIIVERSE_CLASH_LIVE_MASTERY", "off");
    expect(await riot.mastery("oc1", "p-y")).toEqual({ ok: false, reason: "off" });
    vi.stubEnv("UNIIVERSE_CLASH_LIVE_MASTERY", "");
  });
});

describe("the Testing Lab's actions", () => {
  const scenario = (over: Partial<LabScenario> = {}): LabScenario => ({ ...emptyScenario("oc1"), ...over });

  it("are for the Owner and administrators only, checked on the server", async () => {
    state.session = null;
    expect(await runManualTestAction(exampleScenario("oc1"))).toMatchObject({ ok: false, error: "Please sign in." });
    as({ role: "player", admin: false });
    later();
    for (const r of [await runManualTestAction(exampleScenario("oc1")), await generateBlindTestAction({ platform: "oc1", players: 5, rounding: "client", includeTotal: true }), await runBlindTestAction({ scenario: exampleScenario("oc1"), key: "s1.x" }), await runVariantsAction({ scenario: exampleScenario("oc1"), key: null, variants: [{ kind: "baseline" }] })])
      expect(r).toMatchObject({ ok: false, error: "The Testing Lab is for the Owner and administrators." });
  });

  it("refuses entries it cannot read, saying where: a duplicate champion, points that are not points", async () => {
    as();
    later();
    const s = exampleScenario("oc1");
    s.players[0]!.champions[1] = { championId: "Riven", points: "175,000" };
    s.players[1]!.champions[0] = { championId: "LeeSin", points: "lots" };
    const r = await runManualTestAction(s);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.issues?.map((i) => i.path)).toEqual(["players.0.champions.1.championId", "players.1.champions.0.points"]);
  });

  it("a manual test runs the real pipeline and shows no PUUID; nothing is written", async () => {
    as();
    later();
    const s = scenario();
    s.players[0] = { name: "RivenMain", champions: [{ championId: "Riven", points: "450k" }, { championId: "Ambessa", points: "175k" }, { championId: "Gwen", points: "130k" }, { championId: "Camille", points: "87k" }, { championId: "Olaf", points: "42k" }], totalScore: "", rank: null };
    const rows = async () => (await handle.db.select().from(riotAccounts)).length + (await handle.db.select().from(matchDetails)).length;
    const before = await rows();
    const r = await runManualTestAction(s);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.run.condition).toBe("discovery");
    expect(r.data.run.standIn).toBe(true);
    // The stand-in's made-up mastery decides nothing here; both namesakes are discovered and judged.
    expect(r.data.run.players[0]!.candidates.map((c) => c.riotId).sort()).toEqual(["RivenMain#AU1", "RivenMain#OCE"]);
    expect(r.data.run.players[0]!.discovery).toMatchObject({ found: 2, fromGames: 2 });
    expect(JSON.stringify(r)).not.toMatch(/p-riven|p-own|browser-test/);
    expect(await rows()).toBe(before);
  });

  it("a blind test: answers sealed, both conditions graded apart, the controlled pool finds every account", async () => {
    as();
    later();
    const gen = await generateBlindTestAction({ platform: "oc1", players: 5, rounding: "client", includeTotal: true });
    expect(gen.ok).toBe(true);
    if (!gen.ok) return;
    // Only what a screen shows: names without tags, rounded figures; the answers are opaque.
    expect(gen.data.scenario.players.filter((p) => p.name).every((p) => !p.name.includes("#"))).toBe(true);
    expect(gen.data.key).toMatch(/^s1\./);
    expect(JSON.stringify(gen)).not.toMatch(/p-riven|p-renamed|p-cyr|p-old|p-busy/);
    later();
    const run = await runBlindTestAction({ scenario: gen.data.scenario, key: gen.data.key });
    expect(run.ok).toBe(true);
    if (!run.ok) return;
    expect(run.data.discovery.condition).toBe("discovery");
    expect(run.data.controlled.condition).toBe("controlled");
    const b = run.data.controlled.summary.graded!;
    expect(b.correct).toBe(gen.data.players);
    expect(b.incorrect).toBe(0);
    // A: the stand-in has no renames here, so every account is found by its name.
    const a = run.data.discovery.summary.graded!;
    expect(a.truthDiscovered).toBe(gen.data.players);
    expect(a.incorrect).toBe(0);
    expect(JSON.stringify(run)).not.toMatch(/p-riven|p-renamed|p-cyr|p-old|p-busy/);
  });

  it("a blind test's answers cannot be changed or moved to another server", async () => {
    as();
    later();
    const gen = await generateBlindTestAction({ platform: "oc1", players: 2, rounding: "exact", includeTotal: false });
    if (!gen.ok) throw new Error(gen.error);
    later();
    const tampered = gen.data.key.slice(0, -4) + (gen.data.key.endsWith("AAAA") ? "BBBB" : "AAAA");
    expect(await runBlindTestAction({ scenario: gen.data.scenario, key: tampered })).toMatchObject({ ok: false, error: /expired|does not belong/ });
    later();
    expect(await runBlindTestAction({ scenario: { ...gen.data.scenario, platform: "euw1" }, key: gen.data.key })).toMatchObject({ ok: false, error: /expired|does not belong/ });
  });

  it("outdated-data variants: a renamed player defeats discovery but not the controlled pool", async () => {
    as();
    later();
    const gen = await generateBlindTestAction({ platform: "oc1", players: 3, rounding: "client", includeTotal: false });
    if (!gen.ok) throw new Error(gen.error);
    later();
    const r = await runVariantsAction({ scenario: gen.data.scenario, key: gen.data.key, variants: [{ kind: "baseline" }, { kind: "renamed" }, { kind: "aged", days: 60, growth: 20 }] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [base, renamedRun, aged] = r.data;
    expect(base!.controlled!.summary.graded!.correct).toBe(gen.data.players);
    expect(renamedRun!.discovery.summary.graded!.truthDiscovered).toBe(0);
    expect(renamedRun!.controlled!.summary.graded!.correct).toBe(gen.data.players);
    // Older screens with lower figures still agree: points only grew.
    expect(aged!.controlled!.summary.graded!.incorrect).toBe(0);
  });
});
