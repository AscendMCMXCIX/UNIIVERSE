import { describe, expect, it } from "vitest";
import { auditCounts, leaderboardScopeVerdicts, type LeaderboardScopeRead } from "../../../scripts/leaderboard-facts.mjs";

/*
  The Production check's 30-day rule facts (scripts/leaderboard-facts.mjs): the page's count of
  active players equals the leaderboard audit's independent count (a warning only while a member is
  at the 30-day edge, or with no count to compare), every board within it, and Recent form's full
  windows. The readings below are what readLeaderboardScope returns in a page.
*/

const read = (over: Partial<LeaderboardScopeRead> = {}): LeaderboardScopeRead => ({ scopeCount: 7, form: 6, partialForm: 0, multikills: 7, players: 7, empty: false, ...over });
const statuses = (v: ReturnType<typeof leaderboardScopeVerdicts>) => v.map((x) => x.status);

describe("the 30-day rule facts", () => {
  it("pass when the page counts what the audit derives, every board is within it and Recent form lists full windows", () => {
    expect(statuses(leaderboardScopeVerdicts({ kind: "desktop", read: read(), active: 7, boundary: 0 }))).toEqual(["PASS", "PASS", "PASS"]);
  });

  it("fail on a count the audit does not give, unless a member is at the 30-day edge (then a warning)", () => {
    expect(leaderboardScopeVerdicts({ kind: "desktop", read: read(), active: 6, boundary: 0 })[0]!.status).toBe("FAIL");
    expect(leaderboardScopeVerdicts({ kind: "desktop", read: read(), active: 6, boundary: 1 })[0]!.status).toBe("WARN");
  });

  it("warn, never fail, with no audit count to compare (a local run, no secret, the job not deployed yet)", () => {
    const v = leaderboardScopeVerdicts({ kind: "phone", read: read(), active: null, boundary: null });
    expect(statuses(v)).toEqual(["WARN", "PASS", "PASS"]);
    expect(JSON.stringify(v[0]!.detail)).toMatch(/not compared/);
  });

  it("fail on a board with more players than are active, and on a Recent form row that is not a full window", () => {
    expect(leaderboardScopeVerdicts({ kind: "tablet", read: read({ multikills: 8 }), active: 7, boundary: 0 })[1]!.status).toBe("FAIL");
    expect(leaderboardScopeVerdicts({ kind: "tablet", read: read({ players: 9 }), active: 7, boundary: 0 })[1]!.status).toBe("FAIL");
    expect(leaderboardScopeVerdicts({ kind: "tablet", read: read({ partialForm: 1 }), active: 7, boundary: 0 })[2]!.status).toBe("FAIL");
  });

  it("an empty page is not applicable; a page with boards but no count fails", () => {
    expect(statuses(leaderboardScopeVerdicts({ kind: "desktop", read: read({ scopeCount: null, empty: true }), active: 0, boundary: 0 }))).toEqual(["PASS"]);
    expect(statuses(leaderboardScopeVerdicts({ kind: "desktop", read: read({ scopeCount: null }), active: 7, boundary: 0 }))).toEqual(["FAIL"]);
  });

  it("reads the audit's counts from the environment the workflow sets, and nothing that is not a count", () => {
    expect(auditCounts({ LIVE_ACTIVE_PLAYERS: "7", LIVE_LEADERBOARD_BOUNDARY: "0" })).toEqual({ active: 7, boundary: 0 });
    expect(auditCounts({})).toEqual({ active: null, boundary: null });
    expect(auditCounts({ LIVE_ACTIVE_PLAYERS: "seven", LIVE_LEADERBOARD_BOUNDARY: "" })).toEqual({ active: null, boundary: null });
  });
});
