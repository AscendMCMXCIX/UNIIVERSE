import { describe, expect, it } from "vitest";
import { REFRESH_TOAST, refreshNote, waitText } from "./refresh-note";

const at = "2026-10-22T04:00:00.000Z";

describe("refreshNote", () => {
  it("says what arrived, and only calls it new when something is", () => {
    expect(refreshNote({ status: "updated", newGames: 2, checkedAt: at }, { status: "fetched", fetched: 40, unavailable: 0, remaining: 787 })).toEqual({ text: "2 new games · multikills for 40 more games; the other 787 follow automatically", tone: "good", retryInSeconds: 0 });
    expect(refreshNote({ status: "no-new", checkedAt: at }, null)).toEqual({ text: "No new games", tone: "muted", retryInSeconds: 0 });
    // Multikill counts alone are news too.
    expect(refreshNote({ status: "no-new", checkedAt: at }, { status: "complete", fetched: 5 })).toMatchObject({ text: "No new games · the last 5 multikill counts are in", tone: "good" });
    expect(refreshNote({ status: "no-new", checkedAt: at }, { status: "complete", fetched: 0 }).text).toBe("No new games · multikill counts complete");
  });

  it("names an account that could not be read beside the result, with the warning tone", () => {
    const problem = { accounts: 1, message: "Riot's servers are having trouble. Your account is saved and retried automatically." };
    expect(refreshNote({ status: "no-new", checkedAt: at, problem }, null)).toEqual({ text: `No new games · 1 account could not be read: ${problem.message}`, tone: "info", retryInSeconds: 0 });
    expect(refreshNote({ status: "updated", newGames: 3, checkedAt: at, problem: { ...problem, accounts: 2 } }, null)).toMatchObject({ text: `3 new games · 2 accounts could not be read: ${problem.message}`, tone: "info" });
    expect(REFRESH_TOAST[refreshNote({ status: "no-new", checkedAt: at, problem }, null).tone]).toBe("warning");
  });

  it("waits out the server's cooldown and says for how long", () => {
    const r = refreshNote({ status: "recent", checkedAt: at, retryInSeconds: 75 }, { status: "recent", remaining: 12, retryInSeconds: 110 });
    expect(r).toEqual({ text: "Games checked recently · multikills fetched recently; 12 still to come · try again in 2 min", tone: "wait", retryInSeconds: 110 });
  });

  it("passes a failure or an unavailable refresh on as it is, without a second step", () => {
    expect(refreshNote({ status: "failed", message: "Riot did not answer in time." }, null)).toEqual({ text: "Couldn't refresh: Riot did not answer in time.", tone: "bad", retryInSeconds: 0 });
    expect(refreshNote({ status: "unavailable", message: "Match refresh is not available right now; games keep arriving through the regular sync." }, null)).toMatchObject({ tone: "info", text: /not available right now/ });
  });

  it("ends as a success only when the refresh ran; a wait, a refusal and a failure say so", () => {
    const kind = (games: Parameters<typeof refreshNote>[0]) => REFRESH_TOAST[refreshNote(games, null).tone];
    expect(kind({ status: "updated", newGames: 1, checkedAt: at })).toBe("success");
    expect(kind({ status: "no-new", checkedAt: at })).toBe("success");
    expect(kind({ status: "recent", checkedAt: at, retryInSeconds: 30 })).toBe("info");
    expect(kind({ status: "unavailable", message: "Match refresh is not available right now." })).toBe("warning");
    expect(kind({ status: "failed", message: "Riot did not answer in time." })).toBe("error");
  });

  it("writes waits in seconds, then whole minutes", () => {
    expect(waitText(45)).toBe("45 s");
    expect(waitText(61)).toBe("2 min");
  });
});
