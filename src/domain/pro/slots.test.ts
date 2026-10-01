import { describe, expect, it } from "vitest";
import { banSlotFor, describeSlotProfile, draftSlotFor, summariseSlots, type ProSlotRecord } from "./slots";
import { MemoryStatsProvider } from "../engine/memory-stats";
import { recommend } from "../engine";
import { buildChampionMap } from "../../../tests/fixtures/champions";
import { DEFAULT_ASSIGNMENT, LINEUP } from "../../../tests/fixtures/players";

describe("professional draft slots", () => {
  it("maps side and pick order to the tournament slot", () => {
    expect(draftSlotFor("blue", 1)).toBe("B1");
    expect(draftSlotFor("red", 1)).toBe("R1R2");
    expect(draftSlotFor("red", 2)).toBe("R1R2");
    expect(draftSlotFor("blue", 2)).toBe("B2B3");
    expect(draftSlotFor("blue", 3)).toBe("B2B3");
    expect(draftSlotFor("red", 3)).toBe("R3");
    expect(draftSlotFor("red", 4)).toBe("R4");
    expect(draftSlotFor("blue", 4)).toBe("B4B5");
    expect(draftSlotFor("blue", 5)).toBe("B4B5");
    expect(draftSlotFor("red", 5)).toBe("R5");
    expect(draftSlotFor("blue", 0)).toBeNull();
    expect(banSlotFor(3)).toBe("BAN1");
    expect(banSlotFor(4)).toBe("BAN2");
    expect(banSlotFor(6)).toBeNull();
  });

  it("summarises slot counts into shares and describes them honestly", () => {
    const records: ProSlotRecord[] = [
      { championId: "Rumble", slot: "B1", role: "TOP", games: 12, wins: 7 },
      { championId: "Rumble", slot: "R1R2", role: "TOP", games: 6, wins: 3 },
      { championId: "Rumble", slot: "B4B5", role: "TOP", games: 2, wins: 1 },
      { championId: "Rumble", slot: "BAN2", role: null, games: 5, wins: 3 },
      { championId: "Jax", slot: "R5", role: "TOP", games: 9, wins: 5 },
      { championId: "Jax", slot: "B4B5", role: "TOP", games: 3, wins: 1 },
    ];
    const rumble = summariseSlots("Rumble", records)!;
    expect(rumble.picks).toBe(20);
    expect(rumble.firstRotation).toBeCloseTo(0.9);
    expect(rumble.bans).toBe(5);
    expect(describeSlotProfile(rumble)).toMatch(/first rotation \(90%/);
    const jax = summariseSlots("Jax", records)!;
    expect(jax.counterpick).toBeCloseTo(0.75);
    expect(describeSlotProfile(jax)).toMatch(/last-pick counter/);
    expect(summariseSlots("Nobody", records)).toBeNull();
    expect(describeSlotProfile({ ...jax, picks: 3 })).toBeNull();
  });

  it("raises the denial risk of first-rotation champions in the engine's timing", () => {
    const champions = buildChampionMap();
    const base = { patch: "15.19", sources: ["pro" as const], totalGames: 20_000, proGames: 200, roleStats: [{ championId: "Riven", role: "TOP" as const, games: 1200, wins: 650 }], bans: [], matchups: [], synergies: [], pro: [{ championId: "Riven", picks: 60, bans: 20 }] };
    const draft = { side: "blue" as const, actions: [0, 1, 2, 3, 4, 5].map((index) => ({ index, championId: ["Darius", "Fiora", "Camille", "Zed", "Yone", "Yasuo"][index]! })), assignments: { ...DEFAULT_ASSIGNMENT } };
    const without = new MemoryStatsProvider(base);
    const withSlots = new MemoryStatsProvider({ ...base, proSlots: [{ championId: "Riven", slot: "B1", role: "TOP", games: 40, wins: 22 }, { championId: "Riven", slot: "R1R2", role: "TOP", games: 15, wins: 8 }, { championId: "Riven", slot: "R5", role: "TOP", games: 5, wins: 2 }] });
    expect(withSlots.proSlots("Riven")?.firstRotation).toBeCloseTo(55 / 60);
    const a = recommend({ players: LINEUP, draft, champions, stats: without }).candidates.find((c) => c.championId === "Riven");
    const b = recommend({ players: LINEUP, draft, champions, stats: withSlots }).candidates.find((c) => c.championId === "Riven");
    expect(a && b).toBeTruthy();
    const timingA = recommend({ players: LINEUP, draft, champions, stats: without });
    const timingB = recommend({ players: LINEUP, draft, champions, stats: withSlots });
    const candA = timingA.primary?.kind === "pick" ? timingA.primary.candidate : null;
    const candB = timingB.primary?.kind === "pick" ? timingB.primary.candidate : null;
    if (candA?.championId === "Riven" && candB?.championId === "Riven") expect(candB.timing.denialProbability).toBeGreaterThan(candA.timing.denialProbability);
    expect(b!.pickNowScore - b!.fitScore).toBeGreaterThanOrEqual(a!.pickNowScore - a!.fitScore);
  });
});
