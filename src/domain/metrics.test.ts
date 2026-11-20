import { describe, expect, it } from "vitest";
import { METRICS, metricTooltip, type MetricKey } from "./metrics";

describe("metric glossary", () => {
  it("defines title, unit, population, description and source for every metric", () => {
    for (const [key, m] of Object.entries(METRICS)) {
      expect(m.title.length, key).toBeGreaterThan(2);
      expect(m.tip.split(/\s+/).length, key).toBeLessThanOrEqual(25);
      expect(m.unit.length, key).toBeGreaterThan(0);
      expect(m.population.length, key).toBeGreaterThan(10);
      expect(m.description.length, key).toBeGreaterThan(10);
      expect(m.source.length, key).toBeGreaterThan(3);
    }
  });

  it("covers the numbers the profile screens show", () => {
    const needed: MetricKey[] = ["proficiency-tier", "recent-games", "patch-games", "mastery-points", "role-usage"];
    for (const k of needed) expect(METRICS[k]).toBeDefined();
    // One plain sentence, not the glossary's scaffolding (the tooltip inventory's G02, D01, D02, D06).
    expect(metricTooltip("proficiency-tier")).not.toMatch(/Population:|Source:|\(label\)/);
    expect(metricTooltip("games-on-record")).not.toMatch(/PUUID|on the champion/);
  });
});
