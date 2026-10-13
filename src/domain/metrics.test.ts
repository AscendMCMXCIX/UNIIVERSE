import { describe, expect, it } from "vitest";
import { METRICS, metricTooltip, type MetricKey } from "./metrics";

describe("metric glossary", () => {
  it("defines title, unit, population, description and source for every metric", () => {
    for (const [key, m] of Object.entries(METRICS)) {
      expect(m.title.length, key).toBeGreaterThan(2);
      expect(m.unit.length, key).toBeGreaterThan(0);
      expect(m.population.length, key).toBeGreaterThan(10);
      expect(m.description.length, key).toBeGreaterThan(10);
      expect(m.source.length, key).toBeGreaterThan(3);
    }
  });

  it("covers the numbers the draft, trends, profile and coverage screens show", () => {
    const needed: MetricKey[] = ["decision-gap", "score-gap", "execution-demand", "team-fit", "enemy-interaction", "player-proficiency", "patch-strength", "pro-priority", "pick-rate", "ban-rate", "win-rate", "proficiency-tier", "recent-games", "patch-games", "mastery-points", "role-usage", "region-games"];
    for (const k of needed) expect(METRICS[k]).toBeDefined();
    expect(metricTooltip("decision-gap")).toMatch(/win-rate points/);
    expect(metricTooltip("decision-gap")).toMatch(/Population:/);
  });
});
