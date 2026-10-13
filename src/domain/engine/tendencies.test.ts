import { describe, expect, it } from "vitest";
import { applyAction, type DraftState } from "../draft";
import type { Role } from "../roles";
import { MemoryStatsProvider } from "./memory-stats";
import { mergeEngineConfig, recommend, type PickRecommendation } from "./index";
import { recommendBans } from "./bans";
import { enemyTeamProfile } from "./evaluate";
import { deriveDraft } from "../draft";
import type { SearchContext } from "./search";
import { buildEnemyTendencies, buildEnemyTendency, knownPickProbability, type EnemyEvidenceInput, type EnemyTendencies } from "./tendencies";
import { buildChampionMap } from "../../../tests/fixtures/champions";
import { LINEUP } from "../../../tests/fixtures/players";

const champions = buildChampionMap();
const now = new Date("2026-10-13T12:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);

function draftAfter(side: "blue" | "red", actions: Array<{ championId: string | null; role?: Role }>): DraftState {
  let state: DraftState = { side, actions: [], assignments: { TOP: "player-a", JUNGLE: "player-c", MID: "player-b", ADC: "player-d", SUPPORT: "player-e" } };
  for (const a of actions) {
    const res = applyAction(state, a);
    if (!res.ok) throw new Error(res.error);
    state = res.state;
  }
  return state;
}

/** Enemy top who plays Darius in most recent games, Jax sometimes, Gwen rarely. */
function enemyTop(games: number): EnemyEvidenceInput {
  const scale = games / 25;
  return {
    role: "TOP",
    label: "EnemyTop#KR1",
    history: [
      { championId: "Darius", role: "TOP", games: Math.round(18 * scale), wins: Math.round(11 * scale), lastPlayedAt: daysAgo(1), patchDistance: 0 },
      { championId: "Jax", role: "TOP", games: Math.round(5 * scale), wins: Math.round(2 * scale), lastPlayedAt: daysAgo(6), patchDistance: 0 },
      { championId: "Gwen", role: "TOP", games: Math.round(2 * scale), wins: Math.round(1 * scale), lastPlayedAt: daysAgo(40), patchDistance: 1 },
    ],
    mastery: [{ championId: "Darius", points: 400_000, level: 10, lastPlayedAt: daysAgo(1) }, { championId: "Jax", points: 90_000, level: 7, lastPlayedAt: daysAgo(6) }],
    rank: "DIAMOND II",
    gamesAnalysed: games,
  };
}

/**
 * Global evidence: Camille is the meta priority (high pick and ban rate); Darius is a niche pick
 * globally (3% pick rate) that beats our whole top pool equally, unless `gwenAnswers` makes
 * Gwen a winning answer into him.
 */
const stats = (options: { gwenAnswers?: boolean } = {}) =>
  new MemoryStatsProvider({
    patch: "15.19",
    sources: ["demo"],
    totalGames: 10_000,
    proGames: 0,
    roleStats: [
      { championId: "Darius", role: "TOP", games: 300, wins: 165 },
      { championId: "Jax", role: "TOP", games: 1500, wins: 765 },
      { championId: "Gwen", role: "TOP", games: 1500, wins: 750 },
      { championId: "Riven", role: "TOP", games: 1500, wins: 750 },
      { championId: "Ambessa", role: "TOP", games: 1500, wins: 750 },
      { championId: "Camille", role: "TOP", games: 2500, wins: 1300 },
    ],
    bans: [{ championId: "Camille", bans: 3000 }, { championId: "Jax", bans: 900 }],
    matchups: [
      { championId: "Riven", role: "TOP", enemyChampionId: "Darius", enemyRole: "TOP", games: 600, wins: 250 },
      { championId: "Ambessa", role: "TOP", enemyChampionId: "Darius", enemyRole: "TOP", games: 600, wins: 250 },
      { championId: "Gwen", role: "TOP", enemyChampionId: "Darius", enemyRole: "TOP", games: 600, wins: options.gwenAnswers ? 340 : 250 },
    ],
    synergies: [],
    pro: [],
  });

function banContext(draft: DraftState, tendencies?: EnemyTendencies | null, provider = stats()): { ctx: SearchContext; derived: ReturnType<typeof deriveDraft> } {
  const ctx: SearchContext = {
    players: new Map(LINEUP.map((p) => [p.id, p])),
    champions,
    stats: provider,
    config: mergeEngineConfig({}),
    enemy: [],
    enemyProfile: enemyTeamProfile([], champions),
    memo: new Map(),
    proficiency: null,
    unavailable: new Set(),
    tendencies: tendencies ?? null,
  };
  return { ctx, derived: deriveDraft(draft) };
}
const banScore = (draft: DraftState, id: string, tendencies?: EnemyTendencies | null) => {
  const { ctx, derived } = banContext(draft, tendencies);
  return recommendBans(LINEUP, draft.assignments, derived, ctx, 40).find((b) => b.championId === id);
};

describe("enemy tendencies — likelihood model", () => {
  it("turns recent frequency, familiarity and meta into likelihood shares with a confidence", () => {
    const t = buildEnemyTendency(enemyTop(25), stats(), champions, { now });
    expect(t.picks[0]?.championId).toBe("Darius");
    expect(t.picks[0]?.likelihood).toBe("high");
    expect(t.picks.find((p) => p.championId === "Gwen")?.likelihood).toBe("low");
    const total = t.picks.reduce((s, p) => s + p.probability, 0);
    expect(total).toBeLessThanOrEqual(1.0001);
    expect(t.confidenceLabel).toBe("high");
    expect(t.factors).toEqual([]);
  });

  it("gives a small sample low confidence and says so", () => {
    const t = buildEnemyTendency(enemyTop(4), stats(), champions, { now });
    expect(t.confidence).toBeLessThan(0.55);
    expect(t.factors.join(" ")).toMatch(/Small sample/);
    const empty = buildEnemyTendency({ ...enemyTop(0), history: [], mastery: [] }, stats(), champions, { now });
    expect(empty.picks).toEqual([]);
    expect(empty.confidenceLabel).toBe("low");
  });

  it("knownPickProbability discounts by confidence and ignores unknown roles", () => {
    const tendencies: EnemyTendencies = buildEnemyTendencies([enemyTop(25)], stats(), champions, { now });
    const known = knownPickProbability(tendencies, "Darius")!;
    expect(known.role).toBe("TOP");
    expect(known.probability).toBeGreaterThan(0.25);
    expect(known.probability).toBeLessThanOrEqual(known.pick.probability);
    expect(knownPickProbability(tendencies, "Orianna")).toBeNull();
    expect(knownPickProbability(null, "Darius")).toBeNull();
  });
});

describe("enemy tendencies — bans and picks", () => {
  const bans = (ids: Array<string | null>) => ids.map((championId) => ({ championId }));

  it("a known player's comfort pick that hurts our pool outranks a generic meta ban once scouted", () => {
    const draft = draftAfter("blue", []);
    const tendencies = buildEnemyTendencies([enemyTop(25)], stats(), champions, { now });
    const before = banScore(draft, "Darius");
    const after = banScore(draft, "Darius", tendencies)!;
    const camilleBefore = banScore(draft, "Camille")!;
    const camilleAfter = banScore(draft, "Camille", tendencies)!;
    expect(after.score).toBeGreaterThan(before?.score ?? 0);
    // Globally Camille is the priority ban; against this player Darius is the real threat.
    expect(camilleBefore.score).toBeGreaterThan(before?.score ?? 0);
    expect(after.score).toBeGreaterThan(camilleAfter.score);
    expect(after.why.join(" ")).toMatch(/Enemy Top \(EnemyTop#KR1\) plays Darius often/);
    // A champion the known top never plays (Camille) loses ban value in that role.
    expect(camilleAfter.score).toBeLessThan(camilleBefore.score);
  });

  it("low-confidence scouting moves the ban value much less than confident scouting", () => {
    const draft = draftAfter("blue", []);
    const base = banScore(draft, "Darius")?.score ?? 0;
    const weak = banScore(draft, "Darius", buildEnemyTendencies([enemyTop(2)], stats(), champions, { now }))!.score;
    const strong = banScore(draft, "Darius", buildEnemyTendencies([enemyTop(25)], stats(), champions, { now }))!.score;
    expect(strong - base).toBeGreaterThan(0);
    expect(weak - base).toBeGreaterThanOrEqual(0);
    expect(weak - base).toBeLessThan((strong - base) * 0.6);
  });

  it("a likely enemy pick shifts a close pick decision towards the answer and explains it", () => {
    // Our last pick is Top with the enemy top still unrevealed. Riven and Gwen are equally strong;
    // the enemy top is a Darius main, whom Gwen beats and Riven loses to.
    const draft = draftAfter("blue", [
      ...bans([null, null, null, null, null, null]),
      { championId: "Viego", role: "JUNGLE" },
      { championId: "Ahri" },
      { championId: "Kaisa" },
      { championId: "Orianna", role: "MID" },
      { championId: "Jinx", role: "ADC" },
      { championId: "LeeSin" },
      ...bans([null, null, null, null]),
      { championId: "Lulu" },
      { championId: "Nautilus", role: "SUPPORT" },
    ]);
    const provider = stats({ gwenAnswers: true });
    const tendencies = buildEnemyTendencies([enemyTop(25)], provider, champions, { now });
    const without = recommend({ players: LINEUP, draft, champions, stats: provider });
    const withTop = recommend({ players: LINEUP, draft, champions, stats: provider, tendencies });
    const topCandidate = (r: typeof without, id: string) => r.candidates.find((c) => c.championId === id && c.role === "TOP");
    const gwenBefore = topCandidate(without, "Gwen")!;
    const rivenBefore = topCandidate(without, "Riven")!;
    const gwenAfter = topCandidate(withTop, "Gwen")!;
    const rivenAfter = topCandidate(withTop, "Riven")!;
    expect(gwenAfter.fitScore - rivenAfter.fitScore).toBeGreaterThan(gwenBefore.fitScore - rivenBefore.fitScore);
    expect(withTop.tendencies?.TOP?.picks[0]?.championId).toBe("Darius");
    const explained = [withTop.primary, ...withTop.alternatives].find((p) => (p as PickRecommendation).championId === "Gwen") as PickRecommendation | undefined;
    if (explained) expect(explained.breakdown.items.find((i) => i.key === "enemy-interaction")?.text).toMatch(/known player most often picks Darius/);
  });

  it("works with a partial roster and with nobody scouted", () => {
    const draft = draftAfter("blue", bans([null, null, null, null, null, null]));
    const partial = recommend({ players: LINEUP, draft, champions, stats: stats(), tendencies: buildEnemyTendencies([enemyTop(25)], stats(), champions, { now }) });
    expect(partial.primary).not.toBeNull();
    expect(partial.tendencies?.MID).toBeUndefined();
    const none = recommend({ players: LINEUP, draft, champions, stats: stats(), tendencies: {} });
    expect(none.primary).not.toBeNull();
    expect(none.tendencies).toEqual({});
  });
});
