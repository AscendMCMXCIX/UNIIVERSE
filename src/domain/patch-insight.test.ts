import { describe, expect, it } from "vitest";
import { patchInsightText, statisticalShift } from "./patch-insight";

describe("statisticalShift", () => {
  it("says nothing below the sample on either patch", () => {
    expect(statisticalShift({ games: 900, wins: 500 }, { games: 5000, wins: 2400 })).toBeNull();
    expect(statisticalShift({ games: 5000, wins: 2800 }, { games: 999, wins: 450 })).toBeNull();
  });

  it("says nothing for a small shift, however many games", () => {
    expect(statisticalShift({ games: 50_000, wins: 25_750 }, { games: 50_000, wins: 25_000 })).toBeNull(); // +1.5 pts
  });

  it("says nothing when a large shift could be chance", () => {
    // +2.5 points on 1,000 games each: |z| ≈ 1.1.
    expect(statisticalShift({ games: 1000, wins: 525 }, { games: 1000, wins: 500 })).toBeNull();
  });

  it("reports a large, unlikely-by-chance shift in points", () => {
    const s = statisticalShift({ games: 8000, wins: 3800 }, { games: 9000, wins: 4590 })!;
    expect(s.points).toBe(-3.5);
    expect(Math.abs(s.z)).toBeGreaterThan(1.96);
  });
});

describe("patchInsightText", () => {
  it("keeps a recorded balance change apart from a statistical one", () => {
    const shift = statisticalShift({ games: 8000, wins: 3800 }, { games: 9000, wins: 4590 });
    const both = patchInsightText({ verified: { kind: "verified", patch: "16.20", reason: "Q damage reduced" }, shift }, "16.19")!;
    expect(both.label).toBe("↓ 3.5 pts since 16.19 · changed");
    expect(both.detail).toMatch(/recorded balance change: Q damage reduced/);
    expect(both.detail).toMatch(/not a confirmed balance change/);
    expect(patchInsightText({ verified: { kind: "verified", patch: "16.20", reason: "" }, shift: null }, "16.19")).toMatchObject({ label: "Changed in 16.20", tone: "neutral" });
  });

  it("is null without reliable evidence", () => {
    expect(patchInsightText({ verified: null, shift: null }, "16.19")).toBeNull();
  });
});
