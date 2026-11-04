import { describe, expect, it } from "vitest";
import { FALSE_DISCOVERY_RATE, MIN_GAMES_EACH_SIDE, memberGamesOf, pairedFindings, teamInsights, type InsightGame, type InsightPresence } from "./team-insights";

const SEASON = 16;
const NOW = Date.UTC(2026, 10, 4);
const DAY = 86_400_000;

/** A seeded random source (mulberry32): the same games on every run. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Builds stored games and the record's presences for a list of matches. Each match names the
 * members on each side and their roles; `win` is blue's result.
 */
interface MatchSpec {
  id: string;
  daysAgo: number;
  queueId?: number;
  blue: Record<string, string>;
  red?: Record<string, string>;
  blueWins: boolean;
  durationS?: number;
  patch?: string;
  /** Members whose own history does not have this game (it is still in the record). */
  notInHistory?: string[];
  /** No stored record for this match. */
  noRecord?: boolean;
}

function build(matches: MatchSpec[]): { games: InsightGame[]; presences: InsightPresence[] } {
  const games: InsightGame[] = [];
  const presences: InsightPresence[] = [];
  for (const m of matches) {
    const sides: Array<[Record<string, string>, number, boolean]> = [
      [m.blue, 100, m.blueWins],
      [m.red ?? {}, 200, !m.blueWins],
    ];
    for (const [members, teamId, win] of sides) {
      for (const [playerId, role] of Object.entries(members)) {
        if (!m.noRecord) presences.push({ matchId: m.id, playerId, teamId });
        if (m.notInHistory?.includes(playerId)) continue;
        games.push({ matchId: m.id, playerId, queueId: m.queueId ?? 400, role, win, gameCreation: NOW - m.daysAgo * DAY, durationS: m.durationS ?? 1800, patch: m.patch ?? "16.20" });
      }
    }
  }
  return { games, presences };
}

const run = (matches: MatchSpec[], memberIds: string[]) => teamInsights({ ...build(matches), memberIds, season: SEASON, now: NOW });

describe("memberGamesOf: who was in each game", () => {
  it("counts a person once when two of their accounts are on the same side", () => {
    const { games, presences } = build([{ id: "M1", daysAgo: 1, blue: { a: "MID", b: "TOP" }, blueWins: true }]);
    // a's second account in the same game, same side.
    games.push({ ...games[0]!, durationS: 1800 });
    presences.push({ matchId: "M1", playerId: "a", teamId: 100 });
    const r = memberGamesOf(games, presences, SEASON);
    expect(r.games.filter((g) => g.playerId === "a")).toHaveLength(1);
    expect(r.games.find((g) => g.playerId === "b")!.teammates).toEqual(new Set(["a"]));
  });

  it("leaves out a game where one person's accounts played against each other", () => {
    const { games, presences } = build([{ id: "M1", daysAgo: 1, blue: { a: "MID", b: "TOP" }, red: { c: "TOP" }, blueWins: true }]);
    presences.push({ matchId: "M1", playerId: "a", teamId: 200 });
    const r = memberGamesOf(games, presences, SEASON);
    expect(r.excluded.bothSides).toBe(1);
    expect(r.games.some((g) => g.playerId === "a")).toBe(false);
    // …and nobody counts them as a teammate in it.
    expect(r.games.find((g) => g.playerId === "b")!.teammates.size).toBe(0);
    expect(r.games.find((g) => g.playerId === "c")!.opponents).toEqual(new Set(["a", "b"]));
  });

  it("finds a teammate from the stored record even when the game is missing from their own history", () => {
    const { games, presences } = build([{ id: "M1", daysAgo: 1, blue: { a: "MID", b: "TOP" }, blueWins: true, notInHistory: ["b"] }]);
    const r = memberGamesOf(games, presences, SEASON);
    expect(r.games).toHaveLength(1);
    expect(r.games[0]!.teammates).toEqual(new Set(["b"]));
  });

  it("leaves out games without a stored record, and counts them", () => {
    const { games, presences } = build([{ id: "M1", daysAgo: 1, blue: { a: "MID" }, blueWins: true, noRecord: true }]);
    const r = memberGamesOf(games, presences, SEASON);
    expect(r.games).toHaveLength(0);
    expect(r.excluded.noRecord).toBe(1);
  });

  it("leaves out remakes, other seasons, unsupported queues and games without a result", () => {
    const { games, presences } = build([
      { id: "R", daysAgo: 1, blue: { a: "MID" }, blueWins: true, durationS: 200 },
      { id: "S", daysAgo: 1, blue: { a: "MID" }, blueWins: true, patch: "15.24" },
      { id: "Q", daysAgo: 1, blue: { a: "MID" }, blueWins: true, queueId: 450 },
      { id: "OK", daysAgo: 1, blue: { a: "MID" }, blueWins: true },
    ]);
    const extra = (matchId: string, over: Partial<InsightGame>) => {
      games.push({ matchId, playerId: "a", queueId: 400, role: "MID", win: true, gameCreation: NOW, durationS: 1800, patch: "16.20", ...over });
      presences.push({ matchId, playerId: "a", teamId: 100 });
    };
    extra("U", { win: null });
    // An unknown duration is not a remake, as on Leaderboards: it counts.
    extra("N", { durationS: null });
    const r = memberGamesOf(games, presences, SEASON);
    expect(r.games.map((g) => g.matchId).sort()).toEqual(["N", "OK"]);
    expect(r.excluded.ineligible).toBe(4);
  });

  it("keeps an unknown role as its own stratum rather than guessing one", () => {
    const { games, presences } = build([{ id: "M1", daysAgo: 1, blue: { a: "UNKNOWN", b: "" }, blueWins: true }]);
    const r = memberGamesOf(games, presences, SEASON);
    expect(r.games.map((g) => g.role)).toEqual(["UNKNOWN", "UNKNOWN"]);
  });
});

describe("teamInsights: what is tested", () => {
  it("tests nothing for a member with very few games, and says so", () => {
    const r = run(
      [
        { id: "1", daysAgo: 3, blue: { a: "MID", b: "TOP" }, blueWins: true },
        { id: "2", daysAgo: 2, blue: { a: "MID" }, blueWins: false },
      ],
      ["a", "b"],
    );
    expect(r.tested).toBe(0);
    expect(r.findings).toEqual([]);
    expect(r.typicalMargin).toBeNull();
    expect(r.comparisons.length).toBeGreaterThan(0);
    expect(r.comparisons.every((c) => !c.tested && c.qValue === null && !c.finding)).toBe(true);
  });

  it("ignores anyone who is not a current member", () => {
    const r = run([{ id: "1", daysAgo: 3, blue: { a: "MID", former: "TOP" }, blueWins: true }], ["a"]);
    expect(r.members).toBe(1);
    expect(r.teamGames).toBe(0);
    // The former member's presence does not make the game a team game.
    expect(r.comparisons.find((c) => c.id === "with-team:a")!.result.other.games).toBe(1);
  });

  it("does not count a game with members only on the other side as either with teammates or alone", () => {
    const r = run([{ id: "1", daysAgo: 3, blue: { a: "MID" }, red: { b: "MID" }, blueWins: true }], ["a", "b"]);
    const c = r.comparisons.find((x) => x.id === "with-team:a")!;
    expect(c.result.exposed.games + c.result.other.games).toBe(0);
  });

  it("counts each side of a match once in the team's record, however many members it had", () => {
    const r = run([{ id: "1", daysAgo: 3, blue: { a: "TOP", b: "JUNGLE", c: "MID", d: "ADC", e: "SUPPORT" }, blueWins: true }], ["a", "b", "c", "d", "e"]);
    expect(r.teamGames).toBe(1);
    expect(r.memberGames).toBe(5);
  });

  it("only compares pairs who played together", () => {
    const r = run(
      [
        { id: "1", daysAgo: 3, blue: { a: "MID", b: "TOP" }, blueWins: true },
        { id: "2", daysAgo: 3, blue: { c: "MID" }, blueWins: true },
      ],
      ["a", "b", "c"],
    );
    expect(r.comparisons.map((c) => c.id).filter((id) => id.startsWith("with-teammate"))).toEqual(expect.arrayContaining(["with-teammate:a:b", "with-teammate:b:a"]));
    expect(r.comparisons.some((c) => c.id.includes(":c") && c.kind === "with-teammate")).toBe(false);
  });

  it("gives the same answer whatever order the games arrive in", () => {
    const random = rng(11);
    const matches: MatchSpec[] = Array.from({ length: 200 }, (_, i): MatchSpec => ({ id: `M${i}`, daysAgo: i % 90, blue: random() < 0.5 ? { a: "MID", b: "TOP" } : { a: "MID" }, blueWins: random() < 0.5 }));
    const { games, presences } = build(matches);
    const a = teamInsights({ games, presences, memberIds: ["a", "b"], season: SEASON, now: NOW });
    const b = teamInsights({ games: [...games].reverse(), presences: [...presences].reverse(), memberIds: ["b", "a"], season: SEASON, now: NOW });
    expect(b).toEqual(a);
  });
});

/**
 * A season of games for a team: in each game one member plays, and each other member joins their
 * side with probability `join`. The side wins with probability `pSide(side)`, where `side` maps
 * each member on it to the role they played; every member on the side shares the result.
 */
function season(seed: number, opts: { members: string[]; games: number; pSide: (side: Record<string, string>) => number; roleOf?: (playerId: string, mates: string[], random: () => number) => string; join?: number }) {
  const random = rng(seed);
  const roles = ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"];
  const matches: MatchSpec[] = [];
  for (let i = 0; i < opts.games; i += 1) {
    const lead = opts.members[Math.floor(random() * opts.members.length)]!;
    const side = [lead, ...opts.members.filter((m) => m !== lead && random() < (opts.join ?? 0.3))];
    const blue: Record<string, string> = {};
    for (const m of side) blue[m] = opts.roleOf ? opts.roleOf(m, side.filter((x) => x !== m), random) : roles[opts.members.indexOf(m) % 5]!;
    matches.push({ id: `S${seed}-${i}`, daysAgo: Math.floor(random() * 120), blue, blueWins: random() < opts.pSide(blue), queueId: random() < 0.7 ? 400 : 420 });
  }
  return run(matches, opts.members);
}
const mates = (side: Record<string, string>) => Object.keys(side).length - 1;

describe("teamInsights: telling findings from chance", () => {
  it("reports a real difference between playing with teammates and alone", () => {
    const r = season(1, { members: ["a", "b", "c"], games: 1500, pSide: (side) => (mates(side) ? 0.62 : 0.48) });
    const ids = r.findings.map((f) => f.id);
    expect(ids).toEqual(expect.arrayContaining(["with-team:a", "with-team:b", "with-team:c"]));
    for (const f of r.findings.filter((x) => x.kind === "with-team")) {
      expect(f.method).toBe("mantel-haenszel");
      expect(f.result.difference!).toBeGreaterThan(0.05);
      expect(f.result.low!).toBeGreaterThan(0);
      expect(f.qValue!).toBeLessThanOrEqual(FALSE_DISCOVERY_RATE);
    }
  });

  it("keeps the effect of one teammate apart from the effect of playing with the team", () => {
    // Having any teammate helps (+15 points); nobody in particular matters: no teammate finding.
    const r = season(2, { members: ["a", "b", "c", "d"], games: 6000, pSide: (side) => (mates(side) ? 0.6 : 0.45) });
    expect(r.findings.some((f) => f.kind === "with-team")).toBe(true);
    expect(r.findings.filter((f) => f.kind === "with-teammate")).toEqual([]);
  });

  it("finds the one teammate who makes a difference, and nobody else", () => {
    const r = season(3, { members: ["a", "b", "c", "d"], games: 3000, pSide: (side) => ("b" in side ? 0.62 : 0.48) });
    const pair = r.findings.filter((f) => f.kind === "with-teammate");
    expect(pair.length).toBeGreaterThanOrEqual(2);
    expect(pair.every((f) => f.teammateId === "b" && f.result.difference! > 0)).toBe(true);
    // The others are not made to look weak by b's absence (the flaw of comparing with "other teammates").
    for (const c of r.comparisons.filter((x) => x.kind === "with-teammate" && x.teammateId !== "b" && x.tested)) {
      expect(c.finding).toBe(false);
      expect(Math.abs(c.result.difference!)).toBeLessThan(0.06);
    }
  });

  it("does not mistake a role difference for a teammate effect", () => {
    // a wins 70% as Jungle and 40% as Mid, whoever is with them, and plays Jungle when b is there.
    const r = season(4, {
      members: ["a", "b", "c"],
      games: 3000,
      join: 0.5,
      pSide: (side) => (side.a === "JUNGLE" ? 0.7 : side.a === "MID" ? 0.4 : 0.5),
      roleOf: (p, others, random) => (p === "a" ? (others.includes("b") ? (random() < 0.9 ? "JUNGLE" : "MID") : random() < 0.1 ? "JUNGLE" : "MID") : p === "b" ? "TOP" : "SUPPORT"),
    });
    const ab = r.comparisons.find((c) => c.id === "with-teammate:a:b")!;
    expect(ab.tested).toBe(true);
    // The raw records differ by more than 15 points…
    expect(ab.result.exposed.wins / ab.result.exposed.games - ab.result.other.wins / ab.result.other.games).toBeGreaterThan(0.15);
    // …but within the same role there is nothing to find.
    expect(ab.finding).toBe(false);
    expect(Math.abs(ab.result.difference!)).toBeLessThan(0.06);
    // And a's own record with teammates is no finding either: same role, same chance.
    expect(r.findings.find((f) => f.id === "with-team:a")).toBeUndefined();
  });

  it("finds nothing in pure noise (false findings stay rare across many seasons)", () => {
    let seasonsWithAFinding = 0;
    const seasons = 40;
    for (let seed = 100; seed < 100 + seasons; seed += 1) {
      const r = season(seed, { members: ["a", "b", "c", "d", "e", "f", "g"], games: 1200, pSide: () => 0.5 });
      expect(r.tested).toBeGreaterThan(5);
      if (r.findings.length) seasonsWithAFinding += 1;
    }
    // Benjamini–Hochberg at 5% keeps the chance of any false finding near 5% when nothing is real.
    expect(seasonsWithAFinding).toBeLessThanOrEqual(5);
  });

  it("does not test, and never reports, a comparison below the minimum games", () => {
    const r = season(5, { members: ["a", "b", "c", "d", "e", "f", "g"], games: 300, pSide: (side) => (mates(side) ? 0.8 : 0.3) });
    for (const c of r.comparisons) {
      if (c.result.comparedGames.exposed < MIN_GAMES_EACH_SIDE || c.result.comparedGames.other < MIN_GAMES_EACH_SIDE) {
        expect(c.tested).toBe(false);
        expect(c.finding).toBe(false);
        expect(c.untestedReason).toBe("too-few-games");
      }
    }
  });

  it("does not test teammates who always play together (their effects cannot be told apart)", () => {
    // b and c are always together: with one, always the other.
    const random = rng(9);
    const matches: MatchSpec[] = Array.from({ length: 400 }, (_, i): MatchSpec => {
      const pair = random() < 0.5;
      const d = random() < 0.5;
      const blue: Record<string, string> = { a: "MID", ...(pair ? { b: "TOP", c: "ADC" } : {}), ...(d || !pair ? { d: "SUPPORT" } : {}) };
      return { id: `C${i}`, daysAgo: i % 100, blue, blueWins: random() < (pair ? 0.65 : 0.45) };
    });
    const r = run(matches, ["a", "b", "c", "d"]);
    const ab = r.comparisons.find((c) => c.id === "with-teammate:a:b")!;
    const ac = r.comparisons.find((c) => c.id === "with-teammate:a:c")!;
    expect([ab.untestedReason, ac.untestedReason]).toEqual(["inseparable", "inseparable"]);
    expect(ab.finding || ac.finding).toBe(false);
  });

  it("notices the team's recent record when it really changed", () => {
    const random = rng(6);
    const matches: MatchSpec[] = Array.from({ length: 600 }, (_, i): MatchSpec => {
      const daysAgo = Math.floor(random() * 150);
      return { id: `T${i}`, daysAgo, blue: { a: "MID", b: "TOP", c: "ADC" }, blueWins: random() < (daysAgo < 30 ? 0.7 : 0.48) };
    });
    const r = run(matches, ["a", "b", "c"]);
    const recent = r.comparisons.find((c) => c.id === "team-recent")!;
    expect(recent.tested).toBe(true);
    expect(recent.finding).toBe(true);
    expect(recent.result.difference!).toBeGreaterThan(0.1);
    // Each match counted once, not once per member.
    expect(recent.result.exposed.games + recent.result.other.games).toBe(r.teamGames);
  });

  it("stays fast with thousands of games per member", () => {
    const started = performance.now();
    const r = season(7, { members: ["a", "b", "c", "d", "e", "f", "g"], games: 12_000, pSide: () => 0.5 });
    expect(r.memberGames).toBeGreaterThan(12_000);
    expect(performance.now() - started).toBeLessThan(3000);
  });

  it("reports a typical margin that shrinks as games accumulate", () => {
    const small = season(8, { members: ["a", "b", "c"], games: 300, pSide: () => 0.5 });
    const large = season(8, { members: ["a", "b", "c"], games: 3000, pSide: () => 0.5 });
    expect(small.typicalMargin).not.toBeNull();
    expect(large.typicalMargin!).toBeLessThan(small.typicalMargin!);
  });
});

describe("pairedFindings", () => {
  it("shows a pair once when both members' comparisons are findings", () => {
    const r = season(3, { members: ["a", "b", "c", "d"], games: 3000, pSide: (side) => ("b" in side ? 0.62 : 0.48) });
    const items = pairedFindings(r.findings);
    const keys = items.filter((i) => i.lead.kind === "with-teammate").map((i) => [i.lead.playerId, i.lead.teammateId].sort().join("+"));
    expect(keys.length).toBeGreaterThan(0);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
