import { describe, expect, it } from "vitest";
import { METRICS, metricTooltip, type MetricKey } from "./metrics";

describe("metric glossary", () => {
  it("gives every metric a title, a unit and one plain sentence", () => {
    for (const [key, m] of Object.entries(METRICS)) {
      expect(m.title.length, key).toBeGreaterThan(2);
      expect(m.unit.length, key).toBeGreaterThan(0);
      expect(m.tip.split(/\s+/).length, key).toBeLessThanOrEqual(25);
      // One sentence (the tooltip inventory's G02): no unit in brackets, no "Population:" or "Source:" scaffolding.
      expect(m.tip, key).not.toMatch(/Population:|Source:|\((games|label|points)\)|PUUID|sync window/);
      expect(m.tip.replace(/\.$/, ""), key).not.toMatch(/\.\s/);
    }
  });

  it("holds only the figures a page shows (G03)", () => {
    const shown: MetricKey[] = ["proficiency-tier", "recent-games", "patch-games", "games-on-record", "mastery-points", "role-usage", "proficiency-confidence", "last-played", "last-sync"];
    expect(Object.keys(METRICS).sort()).toEqual([...shown].sort());
    expect(metricTooltip("games-on-record")).not.toMatch(/on the champion/);
  });

  it("says the recent count can hold older games: whole patch, queue and role groups last played in the 30 days (R7 review C3)", () => {
    const tip = metricTooltip("recent-games");
    expect(tip).toMatch(/during the last 30 days/);
    expect(tip).toMatch(/some can be older/);
    // Plain words: not "counted by each …" (read as a split the page never shows) nor "counted whole" (jargon).
    expect(tip).not.toMatch(/counted (by|whole)/);
  });
});
