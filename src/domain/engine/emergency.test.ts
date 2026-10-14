import { describe, expect, it } from "vitest";
import { applyAction, type DraftState } from "../draft";
import type { Role } from "../roles";
import { MemoryStatsProvider } from "./memory-stats";
import { recommend, type PickRecommendation, type PairRecommendation, type RecommendationResult } from "./index";
import type { ProficiencyEstimate, ProficiencyLookup } from "../proficiency";
import { poolFor } from "../roster/eligibility";
import { buildChampionMap } from "../../../tests/fixtures/champions";
import { DEFAULT_ASSIGNMENT, PLAYER_A, PLAYER_B, PLAYER_C, PLAYER_D, PLAYER_E } from "../../../tests/fixtures/players";

const champions = buildChampionMap();
// Top player with no secondary role and a Mid player who cannot swap to Top: nobody can rescue Top.
const TOP = { ...PLAYER_A, secondaryRole: null, secondaryPool: [] };
const MID = { ...PLAYER_B, secondaryRole: null, secondaryPool: [] };
const LINEUP = [TOP, MID, PLAYER_C, PLAYER_D, PLAYER_E];
const TOP_POOL = ["Riven", "Gwen", "Ambessa"];

const stats = new MemoryStatsProvider({
  patch: "16.20",
  sources: ["demo"],
  totalGames: 20_000,
  proGames: 0,
  roleStats: [
    { championId: "Ornn", role: "TOP", games: 3000, wins: 1530 },
    { championId: "Sion", role: "TOP", games: 3000, wins: 1500 },
    { championId: "Darius", role: "TOP", games: 3000, wins: 1560 },
    { championId: "Garen", role: "TOP", games: 3000, wins: 1520 },
    { championId: "Malphite", role: "TOP", games: 3000, wins: 1530 },
    { championId: "Mordekaiser", role: "TOP", games: 3000, wins: 1510 },
  ],
  bans: [],
  matchups: [],
  synergies: [],
  pro: [],
});

function draftAfter(side: "blue" | "red", actions: Array<{ championId: string | null; role?: Role; playerId?: string }>): DraftState {
  let state: DraftState = { side, actions: [], assignments: { ...DEFAULT_ASSIGNMENT } };
  for (const a of actions) {
    const r = applyAction(state, a);
    if (!r.ok) throw new Error(r.error);
    state = r.state;
  }
  return state;
}

function normalPicks(result: RecommendationResult): PickRecommendation[] {
  const out: PickRecommendation[] = [];
  const push = (r: PickRecommendation | PairRecommendation | { kind: "ban" } | null) => {
    if (!r) return;
    if (r.kind === "pick") out.push(r);
    if (r.kind === "pair") out.push(...r.picks);
  };
  push(result.primary as PickRecommendation | null);
  for (const a of result.alternatives) push(a as PickRecommendation);
  return out;
}

const est = (championId: string, score: number, games: number): ProficiencyEstimate => ({ championId, role: "TOP", score, confidence: 0.85, tier: "core", games, recentGames: 12, patchGames: 6, roleGames: games, rankedGames: games, normalGames: 0, roleShare: 1, mastery: { points: 300_000, level: 7 }, performance: 0.55, lastPlayedAt: new Date(), notes: [] });

// Ban phase 1 (tournament): every Top pool champion is banned.
const bannedOut = () => draftAfter("blue", ["Riven", "Gwen", "Ambessa", null, null, null].map((championId) => ({ championId })));

describe("emergency champion suggestions", () => {
  it("activates when the assigned player has no legal pool champion left, with about three options outside the pool", () => {
    const result = recommend({ players: LINEUP, draft: bannedOut(), champions, stats });
    expect(result.kind === "pick" || result.kind === "pair").toBe(true);
    const alert = result.emergency.find((a) => a.role === "TOP");
    expect(alert).toBeDefined();
    expect(alert!.playerId).toBe(TOP.id);
    expect(alert!.message).toMatch(/no champion left/);
    expect(alert!.suggestions).toHaveLength(3);
    for (const s of alert!.suggestions) {
      expect(TOP_POOL).not.toContain(s.championId);
      expect(["Riven", "Gwen", "Ambessa"]).not.toContain(s.championId); // banned
      expect(s.role).toBe("TOP");
      expect(s.reason.length).toBeGreaterThan(10);
      // Nothing is known about the player on these champions, and nothing is invented.
      expect(s.familiarity).toBeNull();
      expect(s.reason).toMatch(/no recorded experience/);
    }
    // Never an unexplained blank: there is always either a normal pick or an emergency list.
    expect(normalPicks(result).length + alert!.suggestions.length).toBeGreaterThan(0);
  });

  it("keeps normal recommendations inside the configured pools and never edits a profile", () => {
    const result = recommend({ players: LINEUP, draft: bannedOut(), champions, stats });
    for (const p of normalPicks(result)) {
      const player = LINEUP.find((l) => l.id === p.playerId)!;
      expect(poolFor(player, p.role)).toContain(p.championId);
    }
    expect(result.bestFit.filter((m) => m.role !== "TOP").every((m) => poolFor(LINEUP.find((l) => l.id === m.playerId)!, m.role).includes(m.championId))).toBe(true);
    expect(TOP.primaryPool).toEqual(TOP_POOL);
  });

  it("does not trigger while a legal pool champion remains", () => {
    const draft = draftAfter("blue", ["Riven", "Gwen", null, null, null, null].map((championId) => ({ championId })));
    const result = recommend({ players: LINEUP, draft, champions, stats });
    expect(result.emergency).toEqual([]);
  });

  it("prefers a champion the player actually knows from their Riot history", () => {
    const plain = recommend({ players: LINEUP, draft: bannedOut(), champions, stats }).emergency[0]!.suggestions;
    const notFirst = plain.map((s) => s.championId).find((id) => id !== plain[0]!.championId) ?? "Sion";
    const knowsIt: ProficiencyLookup = (playerId, championId) => (playerId === TOP.id && championId === notFirst ? est(notFirst, 0.92, 140) : null);
    const familiar = recommend({ players: LINEUP, draft: bannedOut(), champions, stats, proficiency: knowsIt }).emergency[0]!.suggestions;
    expect(familiar[0]!.championId).toBe(notFirst);
    expect(familiar[0]!.familiarity).toMatchObject({ games: 140, label: "Main" });
    expect(familiar[0]!.reason).toMatch(/140 games on record/);
  });

  it("follows the draft: a champion banned or taken next disappears from the suggestions", () => {
    const first = recommend({ players: LINEUP, draft: bannedOut(), champions, stats }).emergency[0]!.suggestions;
    const top = first[0]!.championId;
    // The enemy takes our first suggestion (we pick another role first, then they pick it).
    let draft = bannedOut();
    const ours = applyAction(draft, { championId: "Orianna", role: "MID", playerId: MID.id });
    if (!ours.ok) throw new Error(ours.error);
    const theirs = applyAction(ours.state, { championId: top });
    if (!theirs.ok) throw new Error(theirs.error);
    draft = theirs.state;
    const next = recommend({ players: LINEUP, draft, champions, stats }).emergency.find((a) => a.role === "TOP")!.suggestions;
    expect(next.map((s) => s.championId)).not.toContain(top);
    expect(next).toHaveLength(3);
  });

  it("lets the controller lock an emergency champion deliberately (outside the pool) without changing the pool", () => {
    const pick = recommend({ players: LINEUP, draft: bannedOut(), champions, stats }).emergency[0]!.suggestions[0]!;
    const r = applyAction(bannedOut(), { championId: pick.championId, role: "TOP", playerId: TOP.id });
    expect(r.ok).toBe(true);
    expect(TOP.primaryPool).toEqual(TOP_POOL);
    if (r.ok) expect(recommend({ players: LINEUP, draft: r.state, champions, stats }).emergency).toEqual([]);
  });
});
