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
    expect(pb.summaryLines.some((l) => l.startsWith("STRATEGY:"))).toBe(true);
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

  it("gives each player a short Quick Playbook job that follows their champion", () => {
    for (const j of pb.playerJobs) {
      expect(j.short).toBeDefined();
      expect(j.short!.split(" ").length).toBeLessThanOrEqual(5);
    }
    expect(pb.playerJobs.find((j) => j.championId === "Lulu")!.short).toBe("Protect Jinx");
    expect(pb.playerJobs.find((j) => j.championId === "Jinx")!.short).toBe("Stay alive, deal damage");
  });

  it("produces materially different quick guidance for a materially different draft", () => {
    // A poke/siege composition with no hard engage versus the engage/teamfight draft above.
    const poke = buildPlaybook({
      ours: [
        { playerId: "player-a", role: "TOP", championId: "Jayce" },
        { playerId: "player-c", role: "JUNGLE", championId: "Nidalee" },
        { playerId: "player-b", role: "MID", championId: "Xerath" },
        { playerId: "player-d", role: "ADC", championId: "Ezreal" },
        { playerId: "player-e", role: "SUPPORT", championId: "Karma" },
      ],
      enemyChampionIds: ["Malphite", "Sejuani", "Galio", "Jinx", "Leona"],
      players: LINEUP,
      champions,
      stats: EMPTY_STATS,
    });
    const quick = (p: typeof pb) => [p.quick.winCondition, p.quick.earlyPlan, p.quick.fights, p.quick.objectives, p.quick.watchFor];
    const differing = quick(poke).filter((line, i) => line !== quick(pb)[i]).length;
    expect(differing).toBeGreaterThanOrEqual(3);
    expect(poke.playerJobs.map((j) => j.short)).not.toEqual(pb.playerJobs.map((j) => j.short));
    // Guidance names only champions that are in that draft (ours or theirs), never others.
    const inPoke = new Set(["Jayce", "Nidalee", "Xerath", "Ezreal", "Karma", "Malphite", "Sejuani", "Galio", "Jinx", "Leona"].map((id) => champions.get(id)!.name));
    const onlyInFirst = [...ours.map((o) => o.championId), ...theirs].map((id) => champions.get(id)!.name).filter((n) => !inPoke.has(n));
    for (const line of [...quick(poke), ...poke.playerJobs.map((j) => j.short!)]) {
      for (const name of onlyInFirst) expect(line).not.toContain(name);
    }
  });
});

