import { describe, expect, it } from "vitest";
import { eventsBetween, goldSwings, mergeGrubs, objectiveLabel, objectiveLegend, SWING_MIN, type TimelineEventsView, type TimelineObjective } from "./match-events";

const objective = (minute: number, kind: TimelineObjective["kind"], own = true, detail: string | null = null): TimelineObjective => ({ minute, kind, own, detail });

describe("objective names", () => {
  it("names dragons by element, buildings by lane and tier, and voidgrubs by how many", () => {
    expect(objectiveLabel(objective(6, "dragon", true, "FIRE"))).toBe("Dragon (Infernal)");
    expect(objectiveLabel(objective(6, "dragon"))).toBe("Dragon");
    expect(objectiveLabel(objective(36, "elder"))).toBe("Elder Dragon");
    expect(objectiveLabel(objective(14, "tower", false, "TOP OUTER"))).toBe("Tower (top, outer)");
    expect(objectiveLabel(objective(30, "inhibitor", true, "MID"))).toBe("Inhibitor (mid)");
    expect(objectiveLabel({ kind: "grubs", detail: null, count: 3 })).toBe("Voidgrubs ×3");
    expect(objectiveLabel({ kind: "grubs", detail: null, count: 1 })).toBe("Voidgrub");
  });

  it("the chart's legend names only the kinds the game has, in a fixed order", () => {
    expect(objectiveLegend([objective(20, "tower"), objective(6, "dragon"), objective(8, "dragon"), objective(7, "grubs")])).toBe("D dragon · G voidgrubs · T tower");
    expect(objectiveLegend([])).toBe("");
  });
});

describe("voidgrubs taken together", () => {
  it("count as one entry per team and camp, at the first one's time; a later camp is its own entry", () => {
    const merged = mergeGrubs([objective(6.2, "grubs"), objective(6.5, "grubs", false), objective(6.4, "grubs"), objective(5, "dragon"), objective(10, "grubs"), objective(10.3, "grubs")]);
    expect(merged.map((o) => [o.minute, o.kind, o.own, o.count ?? null])).toEqual([
      [5, "dragon", true, null],
      [6.2, "grubs", true, 2],
      [6.5, "grubs", false, 1],
      [10, "grubs", true, 2],
    ]);
  });
});

describe("the largest swings of the gold difference", () => {
  const curve = (diffs: number[]) => diffs.map((diff, minute) => ({ minute, diff }));

  it("finds the largest moves over about three minutes, not overlapping, largest first", () => {
    // Flat, then −3,000 between 10:00 and 13:00, then +2,000 between 20:00 and 23:00.
    const diffs = Array.from({ length: 26 }, (_, m) => (m <= 10 ? 0 : m <= 13 ? -1000 * (m - 10) : m <= 20 ? -3000 : m <= 23 ? -3000 + 667 * (m - 20) : -1000));
    const swings = goldSwings(curve(diffs));
    expect(swings[0]).toMatchObject({ from: 10, to: 13, start: 0, end: -3000 });
    expect(swings[1]).toMatchObject({ from: 20, to: 23, start: -3000 });
    expect(swings.every((s, i) => swings.every((o, j) => i === j || s.to <= o.from || o.to <= s.from))).toBe(true);
  });

  it("lists nothing when the difference never moves by the threshold", () => {
    expect(goldSwings(curve(Array.from({ length: 30 }, (_, m) => m * 40)))).toEqual([]);
    expect(SWING_MIN).toBe(1500);
  });
});

describe("what happened in a window", () => {
  const events: TimelineEventsView = {
    objectives: [objective(12, "baron", false), objective(11.5, "tower", false, "MID OUTER"), objective(9, "dragon", true, "AIR")],
    kills: { own: [10.2, 12.5], enemy: [10.4, 11.1, 11.9] },
    you: { kills: [12.5], deaths: [11.1], assists: [] },
  };

  it("counts each team's kills and lists the objectives after the start, up to the end", () => {
    const w = eventsBetween(events, 10, 12);
    expect(w.kills).toEqual({ own: 1, enemy: 3 });
    expect(w.objectives.map((o) => o.kind)).toEqual(["tower", "baron"]);
    expect(w.you).toEqual({ kills: 0, deaths: 1, assists: 0 });
  });

  it("says nothing of team kills when they are not all kept", () => {
    expect(eventsBetween({ ...events, kills: null }, 0, 20).kills).toBeNull();
  });
});
