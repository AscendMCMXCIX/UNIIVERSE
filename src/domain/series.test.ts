import { describe, expect, it } from "vitest";
import { canStartNextGame, describeSeries, scoreSeries, seriesLabel, winsNeeded } from "./series";

describe("best-of series rules", () => {
  it("knows how many wins decide a series", () => {
    expect(winsNeeded(1)).toBe(1);
    expect(winsNeeded(3)).toBe(2);
    expect(winsNeeded(5)).toBe(3);
    expect(seriesLabel(1)).toBe("Single game");
    expect(seriesLabel(3)).toBe("Best of 3");
  });

  it("ends a best of three at 2-0 or 2-1 and a best of five at 3-0 to 3-2", () => {
    expect(scoreSeries(3, ["win", "win"]).winner).toBe("us");
    expect(scoreSeries(3, ["win", "loss"]).winner).toBeNull();
    expect(scoreSeries(3, ["win", "loss", "loss"]).winner).toBe("them");
    expect(scoreSeries(5, ["win", "win", "win"])).toMatchObject({ ourWins: 3, theirWins: 0, winner: "us", decided: 3 });
    expect(scoreSeries(5, ["loss", "win", "loss", "win"]).winner).toBeNull();
    expect(scoreSeries(5, ["loss", "win", "loss", "win", "loss"]).winner).toBe("them");
    // Cancelled or unrecorded games do not count either way.
    expect(scoreSeries(3, ["win", "cancelled", null, "win"]).winner).toBe("us");
  });

  it("allows the next game only while the series is open, undecided and not fully played", () => {
    expect(canStartNextGame({ status: "in_progress", bestOf: 3, ourWins: 1, theirWins: 0, gamesStarted: 1 })).toBe(true);
    expect(canStartNextGame({ status: "in_progress", bestOf: 3, ourWins: 2, theirWins: 0, gamesStarted: 2 })).toBe(false);
    expect(canStartNextGame({ status: "in_progress", bestOf: 3, ourWins: 1, theirWins: 1, gamesStarted: 3 })).toBe(false);
    expect(canStartNextGame({ status: "completed", bestOf: 3, ourWins: 1, theirWins: 0, gamesStarted: 1 })).toBe(false);
    expect(canStartNextGame({ status: "cancelled", bestOf: 5, ourWins: 0, theirWins: 0, gamesStarted: 0 })).toBe(false);
    expect(canStartNextGame({ status: "in_progress", bestOf: 1, ourWins: 0, theirWins: 0, gamesStarted: 1 })).toBe(false);
  });

  it("describes the state in plain words", () => {
    expect(describeSeries({ status: "completed", ourWins: 2, theirWins: 1, winner: "us", ourName: "UNIIVERSE", theirName: "Team X" })).toBe("UNIIVERSE wins 2-1");
    expect(describeSeries({ status: "completed", ourWins: 0, theirWins: 2, winner: "them", ourName: "UNIIVERSE", theirName: "Team X" })).toBe("Team X wins 0-2");
    expect(describeSeries({ status: "in_progress", ourWins: 1, theirWins: 1, winner: null, ourName: "U", theirName: "" })).toBe("1-1, in progress");
    expect(describeSeries({ status: "cancelled", ourWins: 1, theirWins: 0, winner: null, ourName: "U", theirName: "" })).toBe("cancelled at 1-0");
  });
});
