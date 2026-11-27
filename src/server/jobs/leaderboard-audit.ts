import { defineJob } from "./registry";
import { getOrCreateTeam } from "@/server/repositories/team";
import { loadLeaderboardData } from "@/server/leaderboards/service";
import { buildLeaderboardsView } from "@/server/leaderboards/recent-view";
import { readAuditMembers } from "@/server/leaderboards/audit";
import { auditLeaderboards, type ShownView } from "@/domain/leaderboard-audit";

/*
  Team Leaderboards' 30-day rule on production data (domain/leaderboard-audit): who should be shown,
  from the audit's own SQL, against what the page's own path shows, the rule at its boundary by
  views at shifted times, and whether a return was observed. Counts and p1/p2 labels only: no
  name, id or Riot identity. The Production check calls it before the live check and compares the
  page's own count of active players with `activeCount` (docs/LIVE_VALIDATION.md). It reads the
  Leaderboards page's data once, as the page does (the page's loader also copies the figures of
  newly stored match details onto their games, normally none); it writes nothing of its own.
*/

/** The view's players, row by row, by id (kept in the job; never in its answer). */
function shownOf(view: ReturnType<typeof buildLeaderboardsView>): ShownView {
  return {
    players: Object.keys(view.players),
    form: view.form.rows.map((r) => ({ playerId: r.playerId, games: r.games })),
    multikills: view.records.multikills.rows.map((r) => ({ playerId: r.playerId, counted: r.counted })),
    recordHolders: view.records.records.flatMap((r) => (r.holder ? [r.holder.playerId] : [])),
    milestoneHolders: view.records.milestones.items.map((m) => m.playerId),
    playerCount: view.playerCount,
    memberCount: view.memberCount,
  };
}

defineJob({
  key: "leaderboard-audit",
  kind: "check",
  cost: "Reads the Leaderboards page's data once (about 0.3 MB from the database).",
  description:
    "Read-only check of who Team Leaderboards show: each member's newest counted game and newest successful update from the job's own query, against the page's own view (shown but not eligible, eligible but missing, rows outside the rule, Recent form's full windows, the multikill table's 20 games), the 30-day rule at its boundary by views at shifted times (not an observed reappearance), and whether a member returned after more than 30 days. Members as p1/p2 only. Changes nothing.",
  defaultIntervalMinutes: null,
  allowConcurrent: true,
  run: async (ctx) => {
    const db = ctx.db;
    const now = Date.now();
    const team = await getOrCreateTeam(db);
    const members = await readAuditMembers(db, team.id, now);
    // The page's own data, as the page reads it (its games cache answers only while the stored
    // history's fingerprint is unchanged; the members and their update times are read afresh).
    const data = await loadLeaderboardData(db, team.id);
    // No multikill comparison: who is shown does not depend on it, and it is the page's slowest read.
    const view = (at: number) => shownOf(buildLeaderboardsView(data, {}, null, { now: new Date(at) }));
    const summary = auditLeaderboards(members, view, now);
    ctx.log(`leaderboard-audit: ${summary.members} members, ${summary.active} active, ${summary.shown.scopeCount} shown; ${summary.violations.length} violations; rule checked at ${summary.rule.absentAfter30Days.checked + summary.rule.presentWithinWindow.checked} shifted times`);
    return {
      ok: summary.violations.length === 0,
      error: summary.violations.length ? `${summary.violations.length} ${summary.violations.length === 1 ? "difference" : "differences"} between the 30-day rule and the boards: ${summary.violations.slice(0, 3).join("; ")}` : undefined,
      summary: summary as unknown as Record<string, unknown>,
    };
  },
});
