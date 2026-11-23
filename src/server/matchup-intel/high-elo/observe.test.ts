import { describe, expect, it } from "vitest";
import championFixture from "@/server/riot/fixtures/champions.fixture.json";
import { matchSchema, matchTimelineSchema } from "@/server/riot/api/schemas";
import { riotGame, type ScriptPlayer } from "../../../../tests/fixtures/riot-game";
import { withCaptureFields } from "../../../../tests/fixtures/riot-game-capture";
import { countDeltas } from "@/domain/matchup-intel/high-elo/counts";
import { observeGame } from "./observe";

const CHAMPIONS = ["Riven", "LeeSin", "Ahri", "Jinx", "Thresh", "Darius", "Vi", "Zed", "Caitlyn", "Lulu"];
const players: ScriptPlayer[] = CHAMPIONS.map((champion, i) => ({ puuid: `puuid-${i}`, gameName: `Player${i}`, tagLine: "X1", champion }));
const keyToId = new Map(championFixture.champions.map((c) => [Number(c.key), c.id]));

function game(over: { queueId?: number; durationS?: number } = {}) {
  const g = withCaptureFields(riotGame({ matchId: "EUW1_1", players, winner: 100, durationS: over.durationS ?? 1_800, created: Date.UTC(2026, 10, 22), queueId: over.queueId ?? 420 }));
  return { match: matchSchema.parse(g.match), timeline: matchTimelineSchema.parse(g.timeline) };
}

describe("observeGame", () => {
  it("observes the Master+ players only, with the game's weight, by the team evidence's rules", () => {
    const { match, timeline } = game();
    const seen: number[] = [];
    const out = observeGame({ match, timeline, masterPlus: new Set(["puuid-0", "puuid-5", "puuid-9"]), keyToId, items: null, weightFor: (m) => (seen.push(m), 4) })!;
    expect(seen).toEqual([3]);
    expect(out.observations).toHaveLength(3);
    const riven = out.observations.find((o) => o.champion === "Riven")!;
    expect(riven).toMatchObject({ role: "TOP", opponent: "Darius", win: true, weight: 4 });
    expect(riven.choices.spells).toBe("4,12");
    // The scripted timeline's first-minute purchases (it records one skill point each, fewer than the three a skill order needs).
    expect(riven.choices.start).toMatch(/^\d+(,\d+)*$/);
    expect(riven.choices.skills).toBeUndefined();
    expect(out.observations.find((o) => o.champion === "Darius")).toMatchObject({ opponent: "Riven", win: false });
    expect(out.patch).toMatch(/^\d+\.\d+$/);
  });

  it("returns nothing that names a player or the game", () => {
    const { match, timeline } = game();
    const out = observeGame({ match, timeline, masterPlus: new Set(players.map((p) => p.puuid)), keyToId, items: null, weightFor: () => 1 })!;
    const text = JSON.stringify([out, countDeltas(out.observations, out.patch, "europe")]);
    for (const p of players) {
      expect(text).not.toContain(p.puuid);
      expect(text).not.toContain(p.gameName);
    }
    expect(text).not.toContain("EUW1_1");
  });

  it("counts nothing from another queue, a remake, or a game with no Master+ player", () => {
    const base = { keyToId, items: null, weightFor: () => 1 };
    expect(observeGame({ ...game({ queueId: 400 }), masterPlus: new Set(["puuid-0"]), ...base })).toBeNull();
    expect(observeGame({ ...game({ durationS: 240 }), masterPlus: new Set(["puuid-0"]), ...base })).toBeNull();
    expect(observeGame({ ...game(), masterPlus: new Set(["someone-else"]), ...base })).toBeNull();
    expect(observeGame({ ...game(), masterPlus: new Set(["puuid-0"]), ...base, weightFor: () => 0 })).toBeNull();
  });

  it("still counts the record's choices without a timeline (no skills, start or lane end)", () => {
    const { match } = game();
    const out = observeGame({ match, timeline: null, masterPlus: new Set(["puuid-0"]), keyToId, items: null, weightFor: () => 1 })!;
    const riven = out.observations[0]!;
    expect(riven.choices.spells).toBe("4,12");
    expect(riven.choices.start).toBeUndefined();
    expect(riven.end).toBeUndefined();
  });
});
