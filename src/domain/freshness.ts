/*
  Pages that update themselves (components/ui/freshness-watcher.tsx). An open page asks the server
  now and then for a short version of the data it shows (server/ops/freshness.ts) and is read again
  only when that version has changed, so new games, ranks or edits appear without a reload while
  scroll position, filters and open windows stay as they are. The version comes from stored data
  alone: asking never calls Riot.
*/

/** What a page shows: one player's data, the team's (Team Overview, Leaderboards, Players, Matches), or the jobs (Admin Mode). */
export type FreshnessScope = { kind: "player"; playerId: string } | { kind: "team" } | { kind: "jobs" };

/**
 * How soon the data may change: `now` while a refresh is running or an account awaits its first
 * one, `catching-up` while an account is still adding this season's older games, `idle` otherwise.
 */
export type FreshnessPace = "now" | "catching-up" | "idle";

export interface Freshness {
  /** Changes whenever anything the page shows changes; nothing else can be read from it. */
  v: string;
  pace: FreshnessPace;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function scopeKey(scope: FreshnessScope): string {
  return scope.kind === "player" ? `player:${scope.playerId}` : scope.kind;
}

export function parseScope(raw: string | null | undefined): FreshnessScope | null {
  if (raw === "team" || raw === "jobs") return { kind: raw };
  const id = raw?.startsWith("player:") ? raw.slice("player:".length) : null;
  return id && UUID.test(id) ? { kind: "player", playerId: id } : null;
}

/** The first idle wait, and the longest: an idle page asks after 1, 2, 4 and 8 minutes, then every 10. */
const IDLE_FIRST_MS = 60_000;
const IDLE_MAX_MS = 10 * 60_000;

/** How long to wait before asking again, after `idleChecks` answers in a row that changed nothing while idle. */
export function nextCheckMs(pace: FreshnessPace, idleChecks: number): number {
  if (pace === "now") return 10_000;
  if (pace === "catching-up") return 30_000;
  return Math.min(IDLE_MAX_MS, IDLE_FIRST_MS * 2 ** Math.max(0, idleChecks));
}

/** Coming back to a page (the tab shown again, the window focused) asks at once unless it asked this recently. */
export const RETURN_CHECK_AFTER_MS = 5_000;
