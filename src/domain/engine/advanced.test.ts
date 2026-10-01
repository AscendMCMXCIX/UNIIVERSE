import { describe, expect, it } from "vitest";
import { recommend, whyNot, DEFAULT_ENGINE_CONFIG } from "./index";
import { applyOverrides, hasActiveOverrides, overrideWarning, parseOverrides } from "./overrides";
import { recommendationConfidence } from "./confidence";
import { MemoryStatsProvider, type MemoryStatsData } from "./memory-stats";
import { executionProfile, powerProfile, resourceNeed } from "../champion-model/derived";
import { threatMap } from "../composition/threats";
import { emptyTraits } from "../champion-model/traits";
import type { DraftState } from "../draft";
import { buildChampionMap } from "../../../tests/fixtures/champions";
import { DEFAULT_ASSIGNMENT, LINEUP } from "../../../tests/fixtures/players";

const champions = buildChampionMap();

function stats(data: Partial<MemoryStatsData> = {}): MemoryStatsProvider {
  return new MemoryStatsProvider({ patch: "15.19", sources: ["demo"], totalGames: 20_000, proGames: 0, roleStats: [], bans: [], matchups: [], synergies: [], pro: [], ...data });
}

function draft(actions: DraftState["actions"], side: "blue" | "red" = "blue"): DraftState {
  return { side, actions, assignments: { ...DEFAULT_ASSIGNMENT } };
}

/** Blue has banned 3, red has banned 3, blue first pick: a plain pick phase with enemy bans still to come. */
const FIRST_PICK = draft([
  { index: 0, championId: "Darius" },
  { index: 1, championId: "Fiora" },
  { index: 2, championId: "Camille" },
  { index: 3, championId: "Zed" },
  { index: 4, championId: "Yone" },
  { index: 5, championId: "Yasuo" },
]);

describe("decision confidence", () => {
  const desc = { patch: "15.19", sources: ["ranked" as const], totalGames: 20_000, isDemo: false };
  it("labels a clear gap as strong and a tiny gap as close", () => {
    expect(recommendationConfidence([0.10, 0.05], desc, 0.8).level).toBe("strong");
    expect(recommendationConfidence([0.10, 0.098], desc, 0.8).level).toBe("close");
    expect(recommendationConfidence([0.10, 0.085], desc, 0.8).level).toBe("moderate");
  });
  it("never claims strength without evidence", () => {
    const r = recommendationConfidence([0.10, 0.02], { ...desc, totalGames: 0 }, 0);
    expect(r.level).toBe("low");
    expect(r.reason).toMatch(/No gameplay statistics/);
    expect(recommendationConfidence([0.1, 0.02], desc, 0.1).level).toBe("low");
  });
  it("is attached to every pick recommendation", () => {
    const r = recommend({ players: LINEUP, draft: FIRST_PICK, champions, stats: stats() });
    expect(r.kind).toBe("pick");
    expect(r.decision).not.toBeNull();
    expect(["strong", "moderate", "close", "low"]).toContain(r.decision!.level);
    expect(r.decision!.label.length).toBeGreaterThan(0);
  });
});

describe("why not X?", () => {
  it("compares the recommendation with a legal alternative on the engine's own dimensions", () => {
    const input = { players: LINEUP, draft: FIRST_PICK, champions, stats: stats() };
    const r = recommend(input);
    expect(r.candidates.length).toBeGreaterThan(1);
    const alt = r.candidates.find((c) => c.championId !== r.candidates[0]!.championId)!;
    const c = whyNot(input, { championId: alt.championId, role: alt.role })!;
    expect(c).not.toBeNull();
    expect(c.recommended.championId).toBe(r.candidates[0]!.championId);
    expect(c.alternative.championId).toBe(alt.championId);
    expect(c.points.map((p) => p.topic)).toEqual(expect.arrayContaining(["Team synergy", "Into their draft", "Current patch", "Pick timing"]));
    expect(c.verdict.length).toBeGreaterThan(10);
    // The gap is honest: it matches the candidate scores the engine actually ranked by.
    expect(c.totalGap).toBeCloseTo(r.candidates[0]!.pickNowScore - alt.pickNowScore, 6);
  });
  it("refuses champions outside the assigned players' pools (the constraint stays hard)", () => {
    const input = { players: LINEUP, draft: FIRST_PICK, champions, stats: stats() };
    expect(whyNot(input, { championId: "Teemo" })).toBeNull();
    expect(whyNot(input, { championId: "Jinx", role: "TOP" })).toBeNull();
  });
  it("returns nothing on the enemy's turn", () => {
    const enemyTurn = draft(FIRST_PICK.actions.concat([{ index: 6, championId: "Orianna", playerId: "player-b", role: "MID" }]));
    expect(whyNot({ players: LINEUP, draft: enemyTurn, champions, stats: stats() }, { championId: "Riven" })).toBeNull();
  });
});

describe("coach overrides", () => {
  it("parses stored JSON loosely and detects activity", () => {
    expect(hasActiveOverrides(null)).toBe(false);
    expect(hasActiveOverrides({ note: "just a note" })).toBe(false);
    expect(hasActiveOverrides({ prioritiseEngage: true })).toBe(true);
    const parsed = parseOverrides({ strongside: "BOT", weakside: "TOP", riskPreference: "nonsense", noRoleFlex: "yes", note: "x" })!;
    expect(parsed.strongside).toBe("BOT");
    expect(parsed.weakside).toBe("TOP");
    expect(parsed.riskPreference).toBe("balanced");
    expect(parsed.noRoleFlex).toBe(false);
  });
  it("translates preferences into config tilts without touching eligibility", () => {
    const a = applyOverrides(DEFAULT_ENGINE_CONFIG, { noRoleFlex: true, prioritiseEngage: true, preserveCounterpick: "MID", riskPreference: "reliable", preferLowerExecution: true });
    expect(a.config.swapThreshold).toBeGreaterThan(1);
    expect(a.traitBonus.engage).toBeGreaterThan(0);
    expect(a.holdRoles).toEqual(["MID"]);
    expect(a.config.riskPreference).toBe("reliable");
    expect(a.config.weights?.execution).toBeGreaterThan(DEFAULT_ENGINE_CONFIG.weights.execution);
  });
  it("tilts the recommendation towards engage and reports what the tilt costs", () => {
    const base = { players: LINEUP, draft: FIRST_PICK, champions, stats: stats() };
    const plain = recommend(base);
    const tilted = recommend({ ...base, overrides: { prioritiseEngage: true, strongside: "BOT", riskPreference: "reliable" } });
    expect(tilted.overrides.active).not.toBeNull();
    // Every candidate is still from the assigned player's pool for that role.
    for (const c of tilted.candidates) {
      const player = LINEUP.find((p) => p.id === c.playerId)!;
      const pool = c.role === player.primaryRole ? player.primaryPool : player.secondaryPool;
      expect(pool).toContain(c.championId);
    }
    // The engage-weighted projected team has at least as much engage as the plain one.
    const engage = (team: typeof plain.bestFit) => team.reduce((s, m) => s + (champions.get(m.championId)?.profile.traits.engage ?? 0), 0);
    expect(engage(tilted.bestFit)).toBeGreaterThanOrEqual(engage(plain.bestFit));
    expect(tilted.overrides.unconstrainedScore).not.toBeNull();
    expect(typeof tilted.overrides.warning === "string" || tilted.overrides.warning === null).toBe(true);
  });
  it("warns only when the override costs real draft quality", () => {
    expect(overrideWarning(0.10, 0.11)).toBeNull();
    expect(overrideWarning(0.10, 0.12)).toMatch(/cost roughly/);
    expect(overrideWarning(0.10, 0.15)).toMatch(/clearly stronger/);
  });
  it("preserve-counterpick holds the role while the enemy counterpart is hidden", () => {
    const base = { players: LINEUP, draft: FIRST_PICK, champions, stats: stats() };
    const held = recommend({ ...base, overrides: { preserveCounterpick: "MID" } });
    const midTop = held.candidates.find((c) => c.role === "MID");
    const plainMid = recommend(base).candidates.find((c) => c.role === "MID");
    if (midTop && plainMid) expect(midTop.pickNowScore).toBeLessThan(plainMid.pickNowScore);
    const primary = held.primary;
    if (primary?.kind === "pick") expect(primary.role).not.toBe("MID");
  });
});

describe("execution, resources and power curves", () => {
  it("derives sensible profiles from curated traits", () => {
    const assassin = { ...emptyTraits(), mobility: 3, burst: 3, dive: 3, scaling: 1, earlyGame: 2 };
    const tank = { ...emptyTraits(), frontline: 3, engage: 3, reliableCC: 3, peel: 2, mobility: 0 };
    const hyper = { ...emptyTraits(), sustainedDps: 3, scaling: 3, range: 3, sideLane: 1 };
    expect(executionProfile(assassin).mechanics).toBeGreaterThan(executionProfile(tank).mechanics);
    expect(executionProfile(tank).punish).toBeGreaterThan(0);
    expect(resourceNeed(hyper).need).toBe("strongside");
    expect(resourceNeed(tank).need).toBe("weakside");
    expect(powerProfile(hyper).curve).toBe("late");
    expect(powerProfile({ ...emptyTraits(), earlyGame: 3, scaling: 0 }).curve).toBe("early");
    expect(powerProfile(hyper).spikes.join(" ")).toMatch(/three items/);
  });
  it("penalises a team of three resource-hungry carries and reports it", () => {
    const r = recommend({ players: LINEUP, draft: FIRST_PICK, champions, stats: stats() });
    expect(r.bestFitEvaluation?.realism).toBeDefined();
    expect(["low", "moderate", "high", "very high"]).toContain(r.bestFitEvaluation!.realism.executionLabel);
    expect(r.bestFitEvaluation!.components.execution).toBeLessThanOrEqual(0);
  });
  it("reliable risk preference penalises demanding compositions more than ceiling", () => {
    const base = { players: LINEUP, draft: FIRST_PICK, champions, stats: stats() };
    const reliable = recommend({ ...base, config: { riskPreference: "reliable" } });
    const ceiling = recommend({ ...base, config: { riskPreference: "ceiling" } });
    expect(reliable.bestFitEvaluation!.components.execution).toBeLessThanOrEqual(ceiling.bestFitEvaluation!.components.execution);
  });
});

describe("threat map, responses, what-if and pinch", () => {
  const member = (championId: string, role: "TOP" | "JUNGLE" | "MID" | "ADC" | "SUPPORT") => ({ championId, role, traits: champions.get(championId)!.profile.traits, name: champions.get(championId)!.name });
  it("maps a dive threat onto our carry and our access onto theirs", () => {
    const ours = [member("Jinx", "ADC"), member("Lulu", "SUPPORT"), member("Orianna", "MID")];
    const theirs = [member("Zed", "MID"), member("Nocturne", "JUNGLE")];
    const map = threatMap(ours, theirs);
    const dive = map.find((t) => t.kind === "dive" && t.to?.championId === "Jinx");
    expect(dive).toBeDefined();
    expect(dive!.text).toMatch(/threatens Jinx/);
    expect(map.every((t) => typeof t.text === "string" && t.text.length > 0)).toBe(true);
  });
  it("attaches threats to the recommendation once enemies are revealed", () => {
    const revealed = draft(FIRST_PICK.actions.concat([{ index: 6, championId: "Orianna", playerId: "player-b", role: "MID" }, { index: 7, championId: "Zed" }, { index: 8, championId: "Nocturne" }]));
    const r = recommend({ players: LINEUP, draft: revealed, champions, stats: stats() });
    expect(r.threats.length).toBeGreaterThan(0);
  });
  it("simulates enemy responses for the primary pick and lists what would change the call", () => {
    const data: Partial<MemoryStatsData> = {
      roleStats: [
        { championId: "Riven", role: "TOP", games: 3000, wins: 1560 },
        { championId: "Renekton", role: "TOP", games: 3000, wins: 1530 },
        { championId: "Malphite", role: "TOP", games: 2000, wins: 1020 },
      ],
      matchups: [{ championId: "Riven", role: "TOP", enemyChampionId: "Renekton", enemyRole: "TOP", games: 500, wins: 200 }],
    };
    const r = recommend({ players: LINEUP, draft: FIRST_PICK, champions, stats: stats(data) });
    expect(Array.isArray(r.responses)).toBe(true);
    expect(Array.isArray(r.whatIf)).toBe(true);
    for (const w of r.whatIf) expect(w.text).toMatch(/If they reveal|would make/);
    if (r.primary?.kind === "pick" && r.primary.championId === "Riven") {
      expect(r.responses.some((x) => x.championId === "Renekton" && x.role === "TOP")).toBe(true);
    }
  });
  it("warns about pool pinches only while enemy bans remain", () => {
    const r = recommend({ players: LINEUP, draft: FIRST_PICK, champions, stats: stats({ bans: [{ championId: "Viego", bans: 9000 }, { championId: "LeeSin", bans: 8000 }] }) });
    expect(r.pinch.length).toBeGreaterThan(0);
    const jungle = r.pinch.find((p) => p.role === "JUNGLE");
    expect(jungle).toBeDefined();
    expect(jungle!.message).toMatch(/Jungle/);
    // After the second ban phase there is nothing left to pinch us with.
    const late = draft([
      ...FIRST_PICK.actions,
      { index: 6, championId: "Orianna", playerId: "player-b", role: "MID" },
      { index: 7, championId: "Zed" },
      { index: 8, championId: "Nocturne" },
      { index: 9, championId: "Riven", playerId: "player-a", role: "TOP" },
      { index: 10, championId: "Viego", playerId: "player-c", role: "JUNGLE" },
      { index: 11, championId: "Jhin" },
      { index: 12, championId: "Thresh" },
      { index: 13, championId: "Ahri" },
      { index: 14, championId: "Kalista" },
      { index: 15, championId: "Nautilus" },
    ]);
    const r2 = recommend({ players: LINEUP, draft: late, champions, stats: stats() });
    expect(r2.pinch).toEqual([]);
  });
});
