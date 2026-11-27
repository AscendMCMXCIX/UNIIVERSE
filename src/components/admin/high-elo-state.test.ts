import { describe, expect, it } from "vitest";
import { highEloLines } from "./high-elo-state";

/* Admin's card for the Master+ builds' collection: every reason it is off, in words, and what is stored, counts only. */

describe("the Master+ builds' card", () => {
  it("says every reason collection is off and what is stored", () => {
    expect(highEloLines({ on: false, off: ["not-registered", "switch-off"], rows: 0, bytes: 0, maxBytes: 40 * 1024 * 1024, gamesToday: 0, dailyGames: 1000, lastSlice: null })).toEqual([
      "Riot registration: the ladder requests are not in this build",
      "Switch: UNIIVERSE_HIGH_ELO_COLLECTION is not on",
      "Stored: 0 counts (0.0 MB of 40.0 MB)",
      "Last slice: none",
    ]);
  });

  it("on, says today's games against the daily cap and the last slice's regions", () => {
    const lines = highEloLines({ on: true, off: [], rows: 48_211, bytes: 11.4 * 1024 * 1024, maxBytes: 40 * 1024 * 1024, gamesToday: 312, dailyGames: 1000, lastSlice: { at: "2026-12-01T03:17:00Z", regions: ["americas written", "sea nothing new"] } });
    expect(lines[0]).toBe("Stored: 48,211 counts (11.4 MB of 40.0 MB)");
    expect(lines[1]).toBe("Today: 312 games of 1,000");
    expect(lines[2]).toMatch(/^Last slice: .+, americas written, sea nothing new$/);
  });
});
