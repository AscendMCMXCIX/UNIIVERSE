import { describe, expect, it } from "vitest";
import { championCards, otherChampionsPlayed, parsePatchWindow, summarise, type HistoryBucket } from "./player-stats";

const b = (championId: string, queueGroup: string, patchDistance: number | null, games: number, wins: number): HistoryBucket => ({ championId, queueGroup, patchDistance, games, wins, lastPlayedAt: null });
const buckets: HistoryBucket[] = [
  b("Riven", "solo", 0, 10, 6),
  b("Riven", "solo", 1, 8, 4),
  b("Riven", "solo", 2, 4, 1),
  b("Riven", "solo", 3, 20, 15),
  b("Riven", "flex", 0, 5, 4),
  b("Riven", "normal", 0, 9, 9),
  b("Gwen", "flex", 2, 3, 1),
  b("Jax", "solo", 0, 2, 2),
  b("Sion", "solo", null, 7, 7),
];

describe("player statistics", () => {
  it("counts only the chosen queues inside the patch window and never invents a win rate", () => {
    expect(summarise(buckets, { queues: ["solo"], window: 2, championId: "Riven" })).toMatchObject({ games: 22, wins: 11, losses: 11, winRate: 0.5 });
    expect(summarise(buckets, { queues: ["solo", "flex"], window: 0, championId: "Riven" })).toMatchObject({ games: 15, wins: 10 });
    expect(summarise(buckets, { queues: ["solo"], window: "all", championId: "Riven" })).toMatchObject({ games: 42, wins: 26 });
    expect(summarise(buckets, { queues: ["flex"], window: 1, championId: "Gwen" })).toEqual({ games: 0, wins: 0, losses: 0, winRate: null, lastPlayedAt: null });
    // Normal games are never part of ranked statistics; unknown patches only count in the long history.
    expect(summarise(buckets, { queues: ["solo", "flex"], window: 2, championId: "Sion" }).games).toBe(0);
    expect(summarise(buckets, { queues: ["solo"], window: "all", championId: "Sion" }).games).toBe(7);
  });

  it("builds one card per configured champion in pool order, with fixed Solo/Duo, Flex and recent-three-patch context", () => {
    const cards = championCards(buckets, ["Gwen", "Riven", "Camille"], { mode: "ranked", window: 2 });
    expect(cards.map((c) => c.championId)).toEqual(["Gwen", "Riven", "Camille"]);
    expect(cards[1]).toMatchObject({ selected: { games: 27, wins: 15 }, solo: { games: 22 }, flex: { games: 5, wins: 4 }, recentThreePatches: { games: 27 } });
    expect(cards[2]!.selected.winRate).toBeNull();
    const soloOnly = championCards(buckets, ["Riven"], { mode: "solo", window: 0 });
    expect(soloOnly[0]!.selected).toMatchObject({ games: 10, wins: 6 });
  });

  it("lists other champions actually played in the window, most played first, without the pool", () => {
    expect(otherChampionsPlayed(buckets, ["Riven"], { mode: "ranked", window: 2 })).toEqual(["Gwen", "Jax"]);
    expect(otherChampionsPlayed(buckets, ["Riven"], { mode: "solo", window: 0 })).toEqual(["Jax"]);
    expect(parsePatchWindow("1")).toBe(1);
    expect(parsePatchWindow("all")).toBe("all");
    expect(parsePatchWindow("nonsense")).toBe(2);
  });
});
