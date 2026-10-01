import { describe, expect, it } from "vitest";
import { buildGamePlan } from "./index";
import { EMPTY_STATS } from "../engine/memory-stats";
import { buildChampionMap } from "../../../tests/fixtures/champions";
import { LINEUP } from "../../../tests/fixtures/players";

const champions = buildChampionMap();

describe("game plan", () => {
  it("produces every section for a complete draft", () => {
    const plan = buildGamePlan({
      ours: [
        { playerId: "player-a", role: "TOP", championId: "Gwen" },
        { playerId: "player-c", role: "JUNGLE", championId: "Sejuani" },
        { playerId: "player-b", role: "MID", championId: "Orianna" },
        { playerId: "player-d", role: "ADC", championId: "Jinx" },
        { playerId: "player-e", role: "SUPPORT", championId: "Lulu" },
      ],
      enemyChampionIds: ["Camille", "Hecarim", "Akali", "Kaisa", "Rakan"],
      players: LINEUP,
      champions,
      stats: EMPTY_STATS,
    });
    expect(plan.identity.ours).toBeTruthy();
    expect(plan.identity.theirs).toBe("Dive");
    expect(plan.winCondition.length).toBeGreaterThan(0);
    expect(plan.teamfight.initiator).toMatch(/Sejuani/);
    expect(plan.teamfight.protectors.join(" ")).toMatch(/Lulu/);
    expect(plan.sideLane.sider).toMatch(/Gwen/);
    expect(plan.sideLane.formation).toBe("1-3-1");
    expect(plan.threats.join(" ")).toMatch(/dive Jinx/);
    expect(plan.summaryLines.length).toBeGreaterThanOrEqual(6);
    expect(plan.summaryLines.join("\n").length).toBeLessThan(1200);
  });
});
