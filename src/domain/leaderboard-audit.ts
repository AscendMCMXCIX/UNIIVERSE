import { LEADERBOARD_ACTIVE_DAYS } from "./leaderboards";

/*
  THE LEADERBOARD AUDIT (Release 19, the owner's request of 26 Nov 2026, item 7): Team Leaderboards'
  30-day rule checked on production data, read only, in counts and anonymous labels.

  The rule (domain/leaderboards): a member appears on the boards only with a counted game (a
  supported queue, not a remake, not after now) AND a successful data update, both within
  LEADERBOARD_ACTIVE_DAYS days. The audit takes each member's newest counted game and newest
  successful update from its own SQL (server/leaderboards/audit.ts, never the page's code), works
  out who should be shown here, written out again rather than calling the page's isActivePlayer,
  and compares that with what the page's own path shows (`view`, the page's buildLeaderboardsView
  over its loadLeaderboardData).

  Automatic reappearance cannot be forced on production without changing data, so the rule's
  boundary is checked by evaluating the page's view at shifted times on the real stored data: a
  member's view a minute past their last game's 30 days (absent), and an inactive member's view a
  day after their last game (present exactly when an update lies within the 30 days before). The
  shifted view also sees updates made after the shifted time (the rule has no upper bound on the
  update), so it verifies the rule's code path on production data. It is not an observed
  reappearance; `returnedRecently` says whether one was observed (a member whose newest counted
  game followed a gap of more than 30 days, within the last 30 days).

  Members appear as p1, p2… in the team's own order. No name, id or Riot identity leaves the audit.
*/

const DAY = 86_400_000;
const WINDOW = LEADERBOARD_ACTIVE_DAYS * DAY;
/** Recent form lists full windows only (20 games); the multikill table ranks 20+ games with counts. */
export const AUDIT_FORM_GAMES = 20;
export const AUDIT_MULTIKILL_GAMES = 20;

export interface AuditMember {
  id: string;
  /** Newest counted game at or before now (ms), from the audit's own SQL; null for none. */
  lastGameAt: number | null;
  /** Newest successful data update (ms): a syncable account's cursor, a demo account's seeded time; null for none. */
  lastSyncedAt: number | null;
  /** The newest counted game that followed a gap of more than 30 days (ms); null when none did. */
  returnedAt: number | null;
  /** Linked accounts. */
  accounts: number;
  /** Counted games dated after now (a clock ahead): the shifted views of such a member are not checked. */
  futureGames: number;
}

/** What one view of the page shows, by player id (never sent anywhere). */
export interface ShownView {
  players: readonly string[];
  form: ReadonlyArray<{ playerId: string; games: number }>;
  multikills: ReadonlyArray<{ playerId: string; counted: number }>;
  recordHolders: readonly string[];
  milestoneHolders: readonly string[];
  playerCount: number;
  memberCount: number;
}

export interface LeaderboardAuditSummary {
  members: number;
  active: number;
  inactive: { total: number; noRecentGame: number; noRecentSync: number; both: number; noAccount: number };
  shown: { scopeCount: number; recentForm: number; multikills: number; recordHolders: number; milestoneHolders: number };
  violations: string[];
  rule: {
    absentAfter30Days: { checked: number; absent: number; skipped: number };
    presentWithinWindow: { checked: number; present: number; expectedPresent: number };
    note: string;
  };
  returnedRecently: { players: number; shown: number; observed: boolean; note: string };
  /** Members whose 30-day edge (game or update) falls within an hour of now: a page read moments later may differ by them. */
  boundaryWithinHour: number;
  /** Who should be shown now, as a count: the Production check compares the page's own count with it. */
  activeCount: number;
}

/** Whether the rule shows a member at `now`: written here again, independent of the page's isActivePlayer. */
export function expectedShown(m: Pick<AuditMember, "lastGameAt" | "lastSyncedAt">, now: number): boolean {
  if (m.lastGameAt === null || m.lastSyncedAt === null) return false;
  return now - m.lastGameAt <= WINDOW && m.lastGameAt <= now && now - m.lastSyncedAt <= WINDOW;
}

/**
 * The audit: who should be shown, what the page shows, the rule at its boundary (views at shifted
 * times) and whether a return was observed. `view(at)` is the page's view at a time.
 */
export function auditLeaderboards(members: readonly AuditMember[], view: (at: number) => ShownView, now: number): LeaderboardAuditSummary {
  const label = new Map(members.map((m, i) => [m.id, `p${i + 1}`]));
  const name = (id: string) => label.get(id) ?? "a non-member";
  const expected = new Set(members.filter((m) => expectedShown(m, now)).map((m) => m.id));
  const shown = view(now);
  const shownSet = new Set(shown.players);
  const violations: string[] = [];
  for (const id of shown.players) if (!expected.has(id)) violations.push(`${name(id)}: shown, but the rule does not show them`);
  for (const id of expected) if (!shownSet.has(id)) violations.push(`${name(id)}: eligible, but missing from the boards`);
  const outside = (board: string, ids: readonly string[]) => {
    for (const id of new Set(ids)) if (!expected.has(id)) violations.push(`${name(id)}: on ${board}, but the rule does not show them`);
  };
  outside("Recent form", shown.form.map((r) => r.playerId));
  outside("the multikill table", shown.multikills.map((r) => r.playerId));
  outside("the season records", shown.recordHolders);
  outside("the milestones", shown.milestoneHolders);
  for (const r of shown.form) if (r.games !== AUDIT_FORM_GAMES) violations.push(`${name(r.playerId)}: a Recent form row of ${r.games} games, not a full window of ${AUDIT_FORM_GAMES}`);
  for (const r of shown.multikills) if (r.counted < AUDIT_MULTIKILL_GAMES) violations.push(`${name(r.playerId)}: a multikill row with ${r.counted} games with counts, under ${AUDIT_MULTIKILL_GAMES}`);
  if (shown.playerCount !== expected.size) violations.push(`the page counts ${shown.playerCount} active players, the rule ${expected.size}`);
  if (shown.memberCount !== members.length) violations.push(`the page counts ${shown.memberCount} members, the audit ${members.length}`);

  // The rule at its boundary, on the real stored data, by the page's own view at shifted times.
  const absent = { checked: 0, absent: 0, skipped: 0 };
  const present = { checked: 0, present: 0, expectedPresent: 0 };
  for (const m of members) {
    if (m.lastGameAt === null) continue;
    if (m.futureGames > 0) {
      absent.skipped += expected.has(m.id) ? 1 : 0;
      continue;
    }
    if (expected.has(m.id)) {
      const at = m.lastGameAt + WINDOW + 60_000;
      absent.checked += 1;
      if (!view(at).players.includes(m.id)) absent.absent += 1;
      else violations.push(`${name(m.id)}: still shown a minute after their last game's ${LEADERBOARD_ACTIVE_DAYS} days`);
    } else {
      const at = m.lastGameAt + DAY;
      const should = m.lastSyncedAt !== null && at - m.lastSyncedAt <= WINDOW;
      present.checked += 1;
      if (should) present.expectedPresent += 1;
      const is = view(at).players.includes(m.id);
      if (is) present.present += 1;
      if (is !== should) violations.push(`${name(m.id)}: a day after their last game, ${is ? "shown without an update within the 30 days" : "not shown with an update within the 30 days"}`);
    }
  }

  const returned = members.filter((m) => m.returnedAt !== null && now - m.returnedAt <= WINDOW && m.returnedAt <= now);
  const returnedShown = returned.filter((m) => shownSet.has(m.id)).length;
  for (const m of returned) if (expected.has(m.id) && !shownSet.has(m.id)) violations.push(`${name(m.id)}: returned within the last 30 days, eligible, and not shown`);

  const noGame = (m: AuditMember) => m.lastGameAt === null || now - m.lastGameAt > WINDOW;
  const noSync = (m: AuditMember) => m.lastSyncedAt === null || now - m.lastSyncedAt > WINDOW;
  const inactive = members.filter((m) => !expected.has(m.id));
  const edge = (t: number | null) => t !== null && Math.abs(t + WINDOW - now) <= 3_600_000;
  return {
    members: members.length,
    active: expected.size,
    inactive: {
      total: inactive.length,
      noRecentGame: inactive.filter((m) => noGame(m) && !noSync(m)).length,
      noRecentSync: inactive.filter((m) => noSync(m) && !noGame(m)).length,
      both: inactive.filter((m) => noGame(m) && noSync(m) && m.accounts > 0).length,
      noAccount: inactive.filter((m) => m.accounts === 0).length,
    },
    shown: { scopeCount: shown.playerCount, recentForm: shown.form.length, multikills: shown.multikills.length, recordHolders: new Set(shown.recordHolders).size, milestoneHolders: new Set(shown.milestoneHolders).size },
    violations,
    rule: {
      absentAfter30Days: absent,
      presentWithinWindow: present,
      note: "Checked by evaluating the page's own view at shifted times on the stored data (it also sees updates made after the shifted time): the rule's code path, not an observed reappearance.",
    },
    returnedRecently: {
      players: returned.length,
      shown: returnedShown,
      observed: returned.length > 0,
      note: returned.length > 0 ? "A member returned after more than 30 days within the last 30 days: a reappearance was observed." : "No member has returned in the last 30 days, so a reappearance was not observed.",
    },
    boundaryWithinHour: members.filter((m) => edge(m.lastGameAt) || edge(m.lastSyncedAt)).length,
    activeCount: expected.size,
  };
}
