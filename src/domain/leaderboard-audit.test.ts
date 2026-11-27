import { describe, expect, it } from "vitest";
import { auditLeaderboards, expectedShown, type AuditMember, type ShownView } from "./leaderboard-audit";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 27, 12);
const member = (id: string, lastGameDays: number | null, lastSyncDays: number | null, o: Partial<AuditMember> = {}): AuditMember => ({
  id,
  lastGameAt: lastGameDays === null ? null : NOW - lastGameDays * DAY,
  lastSyncedAt: lastSyncDays === null ? null : NOW - lastSyncDays * DAY,
  returnedAt: null,
  accounts: 1,
  futureGames: 0,
  ...o,
});

/** A page that follows the rule exactly (its own reading, written as the page's isActivePlayer would). */
const faithful = (members: readonly AuditMember[]) => (at: number): ShownView => {
  const shown = members.filter((m) => m.lastGameAt !== null && m.lastSyncedAt !== null && m.lastGameAt >= at - 30 * DAY && m.lastGameAt <= at && m.lastSyncedAt >= at - 30 * DAY).map((m) => m.id);
  return { players: shown, form: shown.map((playerId) => ({ playerId, games: 20 })), multikills: shown.map((playerId) => ({ playerId, counted: 25 })), recordHolders: shown.slice(0, 1), milestoneHolders: shown.slice(0, 2), playerCount: shown.length, memberCount: members.length };
};

const team = [member("ace", 1, 0), member("bea", 3, 0), member("cal", 2, 40), member("dot", 45, 0), member("eve", null, null, { accounts: 0 }), member("fay", 40, 50)];

describe("the leaderboard audit", () => {
  it("re-derives the 30-day rule: a counted game and a successful update, both within 30 days", () => {
    expect(expectedShown(member("x", 29.9, 29.9), NOW)).toBe(true);
    expect(expectedShown(member("x", 30.1, 1), NOW)).toBe(false);
    expect(expectedShown(member("x", 1, 30.1), NOW)).toBe(false);
    expect(expectedShown(member("x", -1, 0), NOW)).toBe(false); // a game after now
    expect(expectedShown(member("x", null, 0), NOW)).toBe(false);
  });

  it("passes a page that follows the rule, in counts and p-labels only, with the boundary checked at shifted times", () => {
    const s = auditLeaderboards(team, faithful(team), NOW);
    expect(s.violations).toEqual([]);
    expect(s).toMatchObject({ members: 6, active: 2, activeCount: 2, inactive: { total: 4, noRecentGame: 1, noRecentSync: 1, both: 1, noAccount: 1 } });
    expect(s.shown).toEqual({ scopeCount: 2, recentForm: 2, multikills: 2, recordHolders: 1, milestoneHolders: 2 });
    // Each active member absent a minute past their game's 30 days; each inactive member with a game
    // present a day after it exactly when an update lies within the 30 days before.
    expect(s.rule.absentAfter30Days).toEqual({ checked: 2, absent: 2, skipped: 0 });
    expect(s.rule.presentWithinWindow).toMatchObject({ checked: 3 });
    expect(s.rule.presentWithinWindow.present).toBe(s.rule.presentWithinWindow.expectedPresent);
    expect(s.rule.note).toMatch(/not an observed reappearance/);
    expect(s.returnedRecently).toMatchObject({ players: 0, observed: false });
    expect(JSON.stringify(s)).not.toMatch(/ace|bea|cal|dot|eve|fay/);
  });

  it("names each difference by label: shown but not eligible, eligible but missing, rows outside the rule, short windows", () => {
    const wrong = (at: number): ShownView => {
      const v = faithful(team)(at);
      return { ...v, players: [...v.players.filter((id) => id !== "bea"), "cal"], form: [{ playerId: "ace", games: 18 }, { playerId: "dot", games: 20 }], multikills: [{ playerId: "ace", counted: 12 }], playerCount: 3 };
    };
    const s = auditLeaderboards(team, wrong, NOW);
    expect(s.violations).toEqual(
      expect.arrayContaining([
        "p3: shown, but the rule does not show them",
        "p2: eligible, but missing from the boards",
        "p4: on Recent form, but the rule does not show them",
        "p1: a Recent form row of 18 games, not a full window of 20",
        "p1: a multikill row with 12 games with counts, under 20",
        "the page counts 3 active players, the rule 2",
      ]),
    );
  });

  it("says plainly when no return was observed, and counts one when it was", () => {
    const back = [...team.slice(0, 2), member("gus", 3, 0, { returnedAt: NOW - 3 * DAY })];
    const s = auditLeaderboards(back, faithful(back), NOW);
    expect(s.returnedRecently).toMatchObject({ players: 1, shown: 1, observed: true });
    expect(s.violations).toEqual([]);
    const hidden = auditLeaderboards(back, (at) => ({ ...faithful(back)(at), players: faithful(back)(at).players.filter((id) => id !== "gus") }), NOW);
    expect(hidden.violations).toContain("p3: returned within the last 30 days, eligible, and not shown");
  });

  it("catches a page that keeps a member past the 30 days, and one with an hour to the edge is counted for the live check's tolerance", () => {
    const sticky = (at: number) => ({ ...faithful(team)(at), players: [...new Set([...faithful(team)(at).players, "ace"])] });
    expect(auditLeaderboards(team, sticky, NOW).violations).toContain("p1: still shown a minute after their last game's 30 days");
    const edge = [member("hal", 30 - 0.5 / 24, 0)];
    expect(auditLeaderboards(edge, faithful(edge), NOW).boundaryWithinHour).toBe(1);
  });

  it("skips the shifted views of a member with games dated after now", () => {
    const ahead = [member("ivy", 1, 0, { futureGames: 1 })];
    expect(auditLeaderboards(ahead, faithful(ahead), NOW).rule.absentAfter30Days).toEqual({ checked: 0, absent: 0, skipped: 1 });
  });
});
