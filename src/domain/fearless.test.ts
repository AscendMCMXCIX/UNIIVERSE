import { describe, expect, it } from "vitest";
import { fearlessLocks } from "./fearless";

describe("Fearless locks", () => {
  const games = [
    { gameNumber: 1, picks: [{ championId: "Riven", side: "us" as const }, { championId: "Gwen", side: "them" as const }] },
    { gameNumber: 2, picks: [{ championId: "Ahri", side: "them" as const }] },
  ];
  it("locks every champion picked by either team in earlier games", () => {
    expect(fearlessLocks(games, 2).map((l) => l.championId)).toEqual(["Riven", "Gwen"]);
    expect(fearlessLocks(games, 3).map((l) => l.championId)).toEqual(["Riven", "Gwen", "Ahri"]);
  });
  it("starts game 1 with nothing locked and ignores later games", () => {
    expect(fearlessLocks(games, 1)).toEqual([]);
  });
  it("remembers the game a champion was first used in", () => {
    expect(fearlessLocks(games, 3).find((l) => l.championId === "Ahri")).toEqual({ championId: "Ahri", gameNumber: 2, side: "them" });
  });
});
