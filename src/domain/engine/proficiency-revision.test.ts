import { describe, expect, it } from "vitest";
import { applyAction, type DraftState } from "../draft";
import { recommend, type PickRecommendation } from "./index";
import { MemoryStatsProvider } from "./memory-stats";
import { estimateProficiency, type ChampionHistoryEvidence, type MasteryEvidence, type ProficiencyLookup } from "../proficiency";
import { legalRolesFor, poolFor } from "../roster";
import type { Role } from "../roles";
import { buildChampionMap } from "../../../tests/fixtures/champions";
import { DEFAULT_ASSIGNMENT, LINEUP, PLAYER_A } from "../../../tests/fixtures/players";

/*
  Proficiency revision 2 (October 2026) against revision 1, on the same drafts: for players who
  play their pool in their own roles the recommendations must not change; where revision 1
  leaked another role's experience into a role, revision 2 must prefer what the player actually
  plays in that role. Recommendations must stay legal either way.
*/

const champions = buildChampionMap();
const now = new Date("2026-10-14T00:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);

const stats = new MemoryStatsProvider({
  patch: "16.20",
  sources: ["demo"],
  totalGames: 10_000,
  proGames: 0,
  roleStats: [
    { championId: "Riven", role: "TOP", games: 2000, wins: 1030 },
    { championId: "Gwen", role: "TOP", games: 2000, wins: 1030 },
    { championId: "Ambessa", role: "TOP", games: 2000, wins: 1030 },
  ],
  bans: [],
  matchups: [],
  synergies: [],
  pro: [],
});

type History = Map<string, { rows: ChampionHistoryEvidence[]; mastery: Map<string, MasteryEvidence> }>;

/** Every lineup player has played their pools, in the role each pool is for, more on earlier champions. */
function mainsHistory(): History {
  const h: History = new Map();
  for (const p of LINEUP) {
    const rows: ChampionHistoryEvidence[] = [];
    const mastery = new Map<string, MasteryEvidence>();
    for (const role of legalRolesFor(p)) {
      poolFor(p, role).forEach((championId, i) => {
        const games = Math.max(4, 60 - i * 12);
        rows.push({ championId, role: role as Role, games, wins: Math.round(games * 0.52), lastPlayedAt: daysAgo(2 + i * 8), patchDistance: 0, queueGroup: "solo" });
        mastery.set(championId, { championId, points: games * 4000, level: 7, lastPlayedAt: daysAgo(2) });
      });
    }
    h.set(p.id, { rows, mastery });
  }
  return h;
}

function lookupFrom(history: History, revision: 1 | 2): ProficiencyLookup {
  return (playerId, championId, role) => {
    const e = history.get(playerId);
    if (!e) return null;
    return estimateProficiency(championId, role, e.rows, e.mastery.get(championId) ?? null, { now, playerBaselineWinRate: 0.52, config: { revision } });
  };
}

function draftAfter(side: "blue" | "red", picks: Array<string | null>): DraftState {
  let state: DraftState = { side, actions: [], assignments: { ...DEFAULT_ASSIGNMENT } };
  for (const c of picks) {
    const r = applyAction(state, { championId: c });
    if (!r.ok) throw new Error(r.error);
    state = r.state;
  }
  return state;
}

const DRAFTS: Array<[string, DraftState]> = [
  ["blue first pick, no bans", draftAfter("blue", [null, null, null, null, null, null])],
  ["red side after bans", draftAfter("red", ["Zed", "Yasuo", "Kaisa", "Thresh", "Ahri", "Viego"])],
  ["blue after bans and first picks", draftAfter("blue", ["Zed", "Yasuo", "LeeSin", "Thresh", "Ahri", "Jinx", "Riven", "Orianna", "Syndra"])],
];

describe("proficiency revision 2 in the draft engine", () => {
  it("leaves recommendations unchanged for players who play their pools in their own roles", () => {
    const history = mainsHistory();
    for (const [name, draft] of DRAFTS) {
      const v1 = recommend({ players: LINEUP, draft, champions, stats, proficiency: lookupFrom(history, 1) });
      const v2 = recommend({ players: LINEUP, draft, champions, stats, proficiency: lookupFrom(history, 2) });
      const pick = (r: typeof v1) => (r.primary && "championId" in r.primary ? `${r.primary.championId}` : "none");
      expect(pick(v2), name).toBe(pick(v1));
      expect(v2.bestFit.map((m) => `${m.role}:${m.championId}`), name).toEqual(v1.bestFit.map((m) => `${m.role}:${m.championId}`));
    }
  });

  it("stops crediting another role's games and mastery to the drafted role", () => {
    // Player A's Gwen experience is all in the Jungle (100 games, 300k mastery); in Top they
    // actually play Riven. Revision 1 still rated Gwen top a main, above Riven; revision 2 prefers Riven.
    const history = mainsHistory();
    const a = history.get(PLAYER_A.id)!;
    a.rows = [
      { championId: "Gwen", role: "JUNGLE", games: 100, wins: 54, lastPlayedAt: daysAgo(2), patchDistance: 0, queueGroup: "solo" },
      { championId: "Riven", role: "TOP", games: 22, wins: 12, lastPlayedAt: daysAgo(3), patchDistance: 0, queueGroup: "solo" },
      { championId: "Ambessa", role: "TOP", games: 3, wins: 1, lastPlayedAt: daysAgo(40), patchDistance: 1, queueGroup: "solo" },
    ];
    a.mastery = new Map([
      ["Gwen", { championId: "Gwen", points: 300_000, level: 7, lastPlayedAt: daysAgo(2) }],
      ["Riven", { championId: "Riven", points: 60_000, level: 6, lastPlayedAt: daysAgo(3) }],
    ]);
    const v1 = lookupFrom(history, 1);
    const v2 = lookupFrom(history, 2);
    expect(v1(PLAYER_A.id, "Gwen", "TOP")!.tier).toBe("core");
    expect(v2(PLAYER_A.id, "Gwen", "TOP")!.tier).toBe("comfortable");
    expect(v2(PLAYER_A.id, "Riven", "TOP")!.score).toBeGreaterThan(v2(PLAYER_A.id, "Gwen", "TOP")!.score);
    const draft = DRAFTS[0]![1];
    const topOf = (proficiency: ProficiencyLookup) => recommend({ players: LINEUP, draft, champions, stats, proficiency }).bestFit.find((m) => m.role === "TOP")?.championId;
    // Revision 1 rated Gwen top above the champion actually played there; revision 2 does not.
    expect(v1(PLAYER_A.id, "Gwen", "TOP")!.score).toBeGreaterThan(v1(PLAYER_A.id, "Riven", "TOP")!.score);
    expect(topOf(v2)).toBe("Riven");
    // Whatever is recommended stays in the player's pool.
    const r = recommend({ players: LINEUP, draft, champions, stats, proficiency: v2 });
    for (const m of r.bestFit) expect(LINEUP.some((p) => legalRolesFor(p).some((role) => poolFor(p, role).includes(m.championId)))).toBe(true);
    expect((r.primary as PickRecommendation | null)?.championId).toBeTruthy();
  });
});
