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
});
