import { describe, expect, it } from "vitest";
import { estimateProficiency, type ChampionHistoryEvidence } from "./index";

const now = new Date("2026-10-01T00:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);
const row = (championId: string, games: number, wins: number, last: Date, role: ChampionHistoryEvidence["role"] = "TOP"): ChampionHistoryEvidence => ({ championId, role, games, wins, lastPlayedAt: last, patchDistance: 0 });

describe("proficiency", () => {
  it("is neutral with no evidence", () => {
    const p = estimateProficiency("Gwen", "TOP", [], null, { now });
    expect(p.score).toBe(0.5);
    expect(p.tier).toBe("unknown");
    expect(p.confidence).toBe(0);
  });

  it("rates a recently played, high-volume champion as core comfort", () => {
    const p = estimateProficiency("Gwen", "TOP", [row("Gwen", 80, 44, daysAgo(2))], { championId: "Gwen", points: 250_000, level: 7, lastPlayedAt: daysAgo(2) }, { now });
    expect(p.tier).toBe("core");
    expect(p.score).toBeGreaterThan(0.75);
    expect(p.confidence).toBeGreaterThan(0.8);
  });

  it("keeps a familiarity baseline for champions not played recently (rusty, not removed)", () => {
    const p = estimateProficiency("Riven", "TOP", [row("Riven", 120, 65, daysAgo(200))], null, { now });
    expect(p.tier).toBe("rusty");
    expect(p.score).toBeGreaterThan(0.55);
    expect(p.notes.join(" ")).toMatch(/rusty/);
  });

  it("does not let a tiny sample dominate", () => {
    const tiny = estimateProficiency("Jax", "TOP", [row("Jax", 2, 2, daysAgo(1))], null, { now });
    const solid = estimateProficiency("Gwen", "TOP", [row("Gwen", 40, 21, daysAgo(10))], null, { now });
    expect(tiny.score).toBeLessThan(solid.score);
    expect(tiny.confidence).toBeLessThan(0.3);
    expect(tiny.notes.join(" ")).toMatch(/small sample/);
  });

  it("recognises off-role experience", () => {
    const p = estimateProficiency("Sylas", "TOP", [row("Sylas", 30, 16, daysAgo(5), "MID"), row("Sylas", 2, 1, daysAgo(5), "TOP")], null, { now });
    expect(p.roleShare).toBeLessThan(0.1);
    expect(p.notes.join(" ")).toMatch(/outside TOP/);
  });

  it("counts Normal games as real practice at reduced weight, never ignores them", () => {
    const ranked = estimateProficiency("Riven", "TOP", [row("Riven", 20, 11, daysAgo(3))], null, { now });
    const normals = estimateProficiency("Riven", "TOP", [{ ...row("Riven", 20, 11, daysAgo(3)), queueGroup: "normal" }], null, { now });
    const none = estimateProficiency("Riven", "TOP", [], null, { now });
    expect(normals.tier).not.toBe("unknown");
    expect(normals.score).toBeGreaterThan(none.score);
    expect(normals.score).toBeLessThan(ranked.score);
    expect(normals.confidence).toBeLessThan(ranked.confidence);
    expect(normals).toMatchObject({ games: 20, normalGames: 20, rankedGames: 0 });
    expect(normals.notes.join(" ")).toMatch(/Normal games/);
    // Mixed history: both queues contribute.
    const mixed = estimateProficiency("Riven", "TOP", [row("Riven", 20, 11, daysAgo(3)), { ...row("Riven", 20, 11, daysAgo(3)), queueGroup: "normal" }], null, { now });
    expect(mixed.score).toBeGreaterThan(ranked.score);
  });

  it("uses combined mastery but never rates a champion on mastery alone", () => {
    const single = estimateProficiency("Riven", "TOP", [], { championId: "Riven", points: 400_000, level: 7, lastPlayedAt: daysAgo(400), accounts: 1 }, { now });
    const combined = estimateProficiency("Riven", "TOP", [], { championId: "Riven", points: 650_000, level: 7, lastPlayedAt: daysAgo(400), accounts: 2 }, { now });
    expect(combined.score).toBeGreaterThanOrEqual(single.score);
    expect(combined.mastery).toMatchObject({ points: 650_000, accounts: 2 });
    // Huge mastery, no games for over a year: familiar but rusty, never "very strong".
    expect(combined.tier).toBe("rusty");
    expect(combined.confidence).toBeLessThan(0.35);
  });
});
