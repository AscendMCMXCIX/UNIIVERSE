import { describe, expect, it } from "vitest";
import { buildPlaybook } from "./index";
import { EMPTY_STATS } from "../engine/memory-stats";
import { buildChampionMap } from "../../../tests/fixtures/champions";
import { LINEUP } from "../../../tests/fixtures/players";

const champions = buildChampionMap();
const ours = [
  { playerId: "player-a", role: "TOP" as const, championId: "Gwen" },
  { playerId: "player-c", role: "JUNGLE" as const, championId: "Sejuani" },
  { playerId: "player-b", role: "MID" as const, championId: "Orianna" },
  { playerId: "player-d", role: "ADC" as const, championId: "Jinx" },
  { playerId: "player-e", role: "SUPPORT" as const, championId: "Lulu" },
];
const theirs = ["Camille", "Nocturne", "Zed", "Kaisa", "Nautilus"];

describe("match playbook v2", () => {
  const pb = buildPlaybook({ ours, enemyChampionIds: theirs, players: LINEUP, champions, stats: EMPTY_STATS, coachNote: "Keep it simple" });

  it("produces the eight quick lines, each a single sentence", () => {
    for (const key of ["winCondition", "earlyPlan", "playFor", "fights", "sideLane", "objectives", "watchFor", "avoid"] as const) {
      expect(pb.quick[key].length).toBeGreaterThan(8);
      expect(pb.quick[key]).not.toMatch(/\n/);
    }
    expect(pb.coachNote).toBe("Keep it simple");
    expect(pb.summaryLines[0]).toMatch(/^WIN CONDITION:/);
    expect(pb.summaryLines.some((l) => l.startsWith("COACH:"))).toBe(true);
  });

  it("gives every player a job, a lane note and a fight role", () => {
    expect(pb.playerJobs).toHaveLength(5);
    for (const j of pb.playerJobs) {
      expect(j.job.length).toBeGreaterThan(10);
      expect(j.laning.length).toBeGreaterThan(5);
      expect(j.fights.length).toBeGreaterThan(5);
      expect(LINEUP.some((p) => p.id === j.playerId)).toBe(true);
    }
    const jinx = pb.playerJobs.find((j) => j.championId === "Jinx")!;
    expect(jinx.job).toMatch(/damage/i);
    const lulu = pb.playerJobs.find((j) => j.championId === "Lulu")!;
    expect(lulu.job).toMatch(/Protect Jinx/);
  });

  it("writes IF→THEN rules that react to the enemy's kits", () => {
    expect(pb.rules.length).toBeGreaterThan(0);
    const texts = pb.rules.map((r) => `${r.if} -> ${r.then}`).join("\n");
    expect(texts).toMatch(/Zed|Nocturne/);
    expect(new Set(pb.rules.map((r) => r.if)).size).toBe(pb.rules.length);
  });

  it("covers ahead / even / behind, a denial plan and an honest self-critique", () => {
    expect(pb.scenarios.ahead.length).toBeGreaterThan(0);
    expect(pb.scenarios.even.length).toBeGreaterThan(0);
    expect(pb.scenarios.behind.length).toBeGreaterThan(0);
    expect(pb.denial.theirWinCondition.length).toBeGreaterThan(5);
    expect(pb.denial.deny.length).toBeGreaterThan(0);
    expect(pb.critique.length).toBeGreaterThan(0);
    expect(pb.threats.some((t) => t.kind === "dive")).toBe(true);
  });

  it("is deterministic and works without any enemy picks or statistics", () => {
    const again = buildPlaybook({ ours, enemyChampionIds: theirs, players: LINEUP, champions, stats: EMPTY_STATS, coachNote: "Keep it simple" });
    expect(again).toEqual(pb);
    const blind = buildPlaybook({ ours, enemyChampionIds: [], players: LINEUP, champions, stats: EMPTY_STATS });
    expect(blind.quick.winCondition.length).toBeGreaterThan(5);
    expect(blind.playerJobs).toHaveLength(5);
    expect(blind.denial.theirWinCondition).toMatch(/Unknown/);
    expect(blind.coachNote).toBeNull();
  });
});
