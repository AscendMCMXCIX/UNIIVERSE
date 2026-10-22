import { describe, expect, it } from "vitest";
import { refreshNote, waitText } from "./refresh-note";

const at = "2026-10-22T04:00:00.000Z";

describe("refreshNote", () => {
  it("says what arrived, and only calls it new when something is", () => {
    expect(refreshNote({ status: "updated", newGames: 2, checkedAt: at }, { status: "fetched", fetched: 40, unavailable: 0, remaining: 787 })).toEqual({ text: "2 new games · multikills for 40 more games, 787 to go", tone: "good", retryInSeconds: 0 });
    expect(refreshNote({ status: "no-new", checkedAt: at }, null)).toEqual({ text: "No new games", tone: "muted", retryInSeconds: 0 });
    // Multikill counts alone are news too.
    expect(refreshNote({ status: "no-new", checkedAt: at }, { status: "complete", fetched: 5 })).toMatchObject({ text: "No new games · the last 5 multikill counts are in", tone: "good" });
    expect(refreshNote({ status: "no-new", checkedAt: at }, { status: "complete", fetched: 0 }).text).toBe("No new games · multikill counts complete");
  });

  it("waits out the server's cooldown and says for how long", () => {
    const r = refreshNote({ status: "recent", checkedAt: at, retryInSeconds: 75 }, { status: "recent", remaining: 12, retryInSeconds: 110 });
    expect(r).toEqual({ text: "Games checked recently · multikills fetched recently, 12 to go · try again in 2 min", tone: "wait", retryInSeconds: 110 });
  });

  it("passes a failure or an unavailable refresh on as it is, without a second step", () => {
    expect(refreshNote({ status: "failed", message: "Riot did not answer in time." }, null)).toEqual({ text: "Couldn't refresh: Riot did not answer in time.", tone: "bad", retryInSeconds: 0 });
    expect(refreshNote({ status: "unavailable", message: "Match refresh is not available right now; games keep arriving through the regular sync." }, null)).toMatchObject({ tone: "info", text: /not available right now/ });
  });

  it("writes waits in seconds, then whole minutes", () => {
    expect(waitText(45)).toBe("45 s");
    expect(waitText(61)).toBe("2 min");
  });
});
