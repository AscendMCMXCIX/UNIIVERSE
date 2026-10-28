/*
  Pages that update themselves (components/ui/freshness-watcher.tsx). An open page asks the server
  now and then for a short version of the data it shows (server/ops/freshness.ts) and is read again
  only when that version has changed, so new games, ranks or edits appear without a reload while
  scroll position, filters and open windows stay as they are. The version comes from stored data
  alone: asking never calls Riot.
*/

/**
 * What a page shows: one player's data, the team's (Team Overview, Leaderboards, Players, Matches),
 * the jobs (Admin Mode), or a player's own Ranked Development (their profile data and their private
 * sessions, objectives and reviews; only the player themselves may watch it).
 */
export type FreshnessScope = { kind: "player"; playerId: string } | { kind: "development"; playerId: string } | { kind: "team" } | { kind: "jobs" };

/**
 * How soon the data may change: `now` while a refresh is running or an account awaits its first
 * one, `catching-up` while an account is still adding this season's older games, `session` while a
 * ranked session runs (its next game may arrive any minute), `idle` otherwise.
 */
export type FreshnessPace = "now" | "catching-up" | "session" | "idle";

export interface Freshness {
  /** Changes whenever anything the page shows changes; nothing else can be read from it. */
  v: string;
  pace: FreshnessPace;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function scopeKey(scope: FreshnessScope): string {
  return scope.kind === "player" || scope.kind === "development" ? `${scope.kind}:${scope.playerId}` : scope.kind;
}

export function parseScope(raw: string | null | undefined): FreshnessScope | null {
  if (raw === "team" || raw === "jobs") return { kind: raw };
  for (const kind of ["player", "development"] as const) {
    const id = raw?.startsWith(`${kind}:`) ? raw.slice(kind.length + 1) : null;
    if (id) return UUID.test(id) ? { kind, playerId: id } : null;
  }
  return null;
}

/** The scope a page's watcher stands in for: a Ranked Development page covers its player's profile scope. */
export function coveredScope(scope: FreshnessScope): string | null {
  return scope.kind === "development" ? scopeKey({ kind: "player", playerId: scope.playerId }) : null;
}

/** The first idle wait, and the longest: an idle page asks after 1, 2, 4 and 8 minutes, then every 10. */
const IDLE_FIRST_MS = 60_000;
const IDLE_MAX_MS = 10 * 60_000;

/** How long to wait before asking again, after `idleChecks` answers in a row that changed nothing while idle. */
export function nextCheckMs(pace: FreshnessPace, idleChecks: number): number {
  if (pace === "now") return 10_000;
  if (pace === "catching-up") return 30_000;
  if (pace === "session") return SESSION_CHECK_MS;
  return Math.min(IDLE_MAX_MS, IDLE_FIRST_MS * 2 ** Math.max(0, idleChecks));
}

/** While a ranked session runs, its page asks every two minutes (a new game may have been synced). */
export const SESSION_CHECK_MS = 2 * 60_000;

/** Coming back to a page (the tab shown again, the window focused) asks at once unless it asked this recently. */
export const RETURN_CHECK_AFTER_MS = 5_000;
