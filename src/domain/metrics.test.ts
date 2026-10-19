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

  it("covers the numbers the trends, profile and coverage screens show", () => {
    const needed: MetricKey[] = ["pick-rate", "ban-rate", "win-rate", "proficiency-tier", "recent-games", "patch-games", "mastery-points", "role-usage", "region-games", "journal-games", "journal-win-rate", "journal-mistake", "journal-focus"];
    for (const k of needed) expect(METRICS[k]).toBeDefined();
    expect(metricTooltip("win-rate")).toMatch(/Population:/);
  });
});
