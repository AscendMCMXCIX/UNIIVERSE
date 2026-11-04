import { describe, expect, it } from "vitest";
import { opensRecentFormPreview, parseLeaderboardTab, recentLeaderboardHref } from "./recent-view";

describe("the admins' preview of the proposed Leaderboards", () => {
  const owner = { role: "owner" as const, admin: true };
  const admin = { role: "player" as const, admin: true };
  const member = { role: "player" as const, admin: false };

  it("opens only for administrators who ask for it; everyone else gets today's boards", () => {
    expect(opensRecentFormPreview(owner, { preview: "recent-form" })).toBe(true);
    expect(opensRecentFormPreview(admin, { preview: "recent-form" })).toBe(true);
    expect(opensRecentFormPreview(member, { preview: "recent-form" })).toBe(false);
    expect(opensRecentFormPreview(null, { preview: "recent-form" })).toBe(false);
    expect(opensRecentFormPreview(owner, {})).toBe(false);
    expect(opensRecentFormPreview(owner, { preview: ["recent-form", "x"] })).toBe(false);
  });

  it("reads the view from the address: Recent form unless Records & achievements is asked for", () => {
    expect(parseLeaderboardTab({})).toEqual({ tab: "form", season: null });
    expect(parseLeaderboardTab({ view: "records", season: "15" })).toEqual({ tab: "records", season: "15" });
    expect(parseLeaderboardTab({ view: "anything" }).tab).toBe("form");
  });

  it("writes addresses that keep the preview and leave out the defaults", () => {
    expect(recentLeaderboardHref({ tab: "form" })).toBe("/leaderboards");
    expect(recentLeaderboardHref({ tab: "records" }, { keep: { preview: "recent-form" } })).toBe("/leaderboards?preview=recent-form&view=records");
    expect(recentLeaderboardHref({ tab: "records", season: 15 }, { basePath: "/public/leaderboards" })).toBe("/public/leaderboards?view=records&season=15");
  });
});
