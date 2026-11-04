import { describe, expect, it } from "vitest";
import { parseLeaderboardTab, recentLeaderboardHref } from "./recent-view";

describe("the Leaderboards' addresses", () => {
  it("reads the view from the address: Recent form unless Records & achievements is asked for", () => {
    expect(parseLeaderboardTab({})).toEqual({ tab: "form", season: null });
    expect(parseLeaderboardTab({ view: "records", season: "15" })).toEqual({ tab: "records", season: "15" });
    expect(parseLeaderboardTab({ view: "anything" }).tab).toBe("form");
  });

  it("writes addresses that leave out the defaults", () => {
    expect(recentLeaderboardHref({ tab: "form" })).toBe("/leaderboards");
    expect(recentLeaderboardHref({ tab: "records" })).toBe("/leaderboards?view=records");
    expect(recentLeaderboardHref({ tab: "records", season: 15 }, { basePath: "/public/leaderboards" })).toBe("/public/leaderboards?view=records&season=15");
  });
});
