import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { describeAccountSync, dueForViewRefresh, type AccountSyncFacts } from "@/domain/account-status";
import { VIEW_REFRESH_LEASE_MS, accountSyncLeaseKey, backgroundRefreshEnabled, viewRefreshLeaseKey } from "@/server/jobs/background";
import { SCHEDULED_SYNC_LEASE_MS } from "@/server/accounts/refresh";
import type { Freshness, FreshnessPace, FreshnessScope } from "@/domain/freshness";

/*
  The version an open page compares to learn whether its data changed (domain/freshness.ts). One
  statement each, on indexed tables, returning one short row (the bulky parts as hashes, so a check
  sends a few hundred bytes from the database): cheap enough to ask every few minutes while a page
  is on screen, and it reads stored data only, never Riot.

  Each version covers what its pages show and nothing else, so a page is read again only when
  something on it changed: a player's profile follows their accounts' syncs (the "updated" time
  included), their card, pools and picture, and the ranks stored for the players in their games;
  the team's pages follow games, ranks, the roster, cards, pools and the lineup but not each
  account's routine check, which would re-read them every few minutes for nothing.
*/

const rowsOf = <T,>(result: unknown): T[] => ((result as { rows?: T[] }).rows ?? (result as T[])) as T[];

/** A job that started this recently and has not finished is still running. */
const JOB_RUNNING_MS = 10 * 60_000;

const digest = (parts: unknown): string => createHash("sha256").update(JSON.stringify(parts)).digest("base64url").slice(0, 22);
const time = (v: string | Date | null | undefined): number | null => (v ? new Date(v).getTime() : null);

interface PlayerAccountRow {
  id: string;
  sync_status: string;
  sync_error: string | null;
  last_sync_at: string | null;
  has_puuid: boolean;
  history: AccountSyncFacts["history"];
  riot_id: string;
  rank: unknown[];
}

/**
 * A player's profile: their accounts (state, Riot ID, rank, last update), games, figures, mastery,
 * the timelines of their games (Matchups) and profile edits. `visit`: asked while rendering the profile, whose visit refresh starts right
 * after the page is sent when an account is due, so the page should ask again soon.
 */
export async function playerFreshness(db: Db, playerId: string, { now = new Date(), visit = false }: { now?: Date; visit?: boolean } = {}): Promise<Freshness> {
  const [row] = rowsOf<{ profile: string | null; pools: string | null; accounts: PlayerAccountRow[] | null; games: unknown; ranks: unknown; mastery: string | number | null; timelines: unknown; lookups: string | null; lease: string | null; slice: { progress?: boolean } | string | null; account_leases: Record<string, string> | null }>(
    await db.execute(sql`
      WITH acc AS (SELECT id FROM riot_accounts WHERE player_id = ${playerId} AND owner_type = 'player')
      SELECT
        (SELECT md5(concat_ws('|', p.updated_at, p.display_name, p.featured_champion_id, p.featured_skin_num, p.card_accent, p.card_style::text, p.card_banner_version, p.social_links::text,
            (SELECT string_agg(u.avatar_version::text, ',') FROM users u WHERE u.player_id = p.id)))
          FROM players p WHERE p.id = ${playerId}) AS profile,
        md5(concat_ws('|',
          (SELECT string_agg(concat_ws(':', slot, champion_id, position), ',' ORDER BY slot, position, champion_id) FROM player_champion_pools WHERE player_id = ${playerId}),
          (SELECT string_agg(concat_ws(':', role, champion_id, position), ',' ORDER BY role, position, champion_id) FROM player_role_pools WHERE player_id = ${playerId}))) AS pools,
        (SELECT json_agg(json_build_object('id', a.id, 'sync_status', a.sync_status, 'sync_error', a.sync_error, 'last_sync_at', a.last_sync_at, 'has_puuid', a.puuid IS NOT NULL, 'history', a.history_backfill, 'riot_id', a.game_name || '#' || a.tag_line,
            'rank', json_build_array(a.rank_queue, a.tier, a.division, a.league_points, a.ranked_wins, a.ranked_losses)) ORDER BY a.id)
          FROM riot_accounts a WHERE a.id IN (SELECT id FROM acc)) AS accounts,
        (SELECT json_build_array(count(*), max(game_creation), count(*) FILTER (WHERE summarised_at IS NOT NULL), count(*) FILTER (WHERE extra_stats IS NOT NULL))
          FROM account_matches WHERE account_id IN (SELECT id FROM acc)) AS games,
        (SELECT json_build_array(count(*), max(captured_at)) FROM rank_snapshots WHERE account_id IN (SELECT id FROM acc)) AS ranks,
        (SELECT sum(points) FROM account_mastery WHERE account_id IN (SELECT id FROM acc)) AS mastery,
        -- The timelines of their games (Matchups): how many are stored, and how many with frames and with events (no record's JSON is read).
        (SELECT json_build_array(count(*), count(*) FILTER (WHERE frames IS NOT NULL), count(*) FILTER (WHERE events IS NOT NULL))
          FROM match_timelines WHERE match_id IN (SELECT match_id FROM account_matches WHERE account_id IN (SELECT id FROM acc))) AS timelines,
        -- Opponents' ranks shown in Match History, stored when someone opens a game (any player's: rare, and one value).
        (SELECT max(observed_at) FROM last_known_ranks WHERE source = 'match lookup') AS lookups,
        (SELECT updated_at FROM app_settings WHERE key = ${viewRefreshLeaseKey(playerId)}) AS lease,
        -- What the last view's slice recorded (accounts/kickoff.ts): whether it moved the history on.
        (SELECT value FROM app_settings WHERE key = ${viewRefreshLeaseKey(playerId)}) AS slice,
        -- When each account was last claimed by a sync (the scheduler, a Refresh, Retry sync, a slice).
        (SELECT json_object_agg(key, updated_at) FROM app_settings WHERE key IN (SELECT 'account_sync:' || id::text FROM acc)) AS account_leases`),
  );
  const accounts = row?.accounts ?? [];
  const riotConfigured = !!process.env.RIOT_API_KEY;
  const facts = accounts.map((a): AccountSyncFacts => ({ syncStatus: a.sync_status, syncError: a.sync_error, lastSyncAt: a.last_sync_at ? new Date(a.last_sync_at) : null, puuid: a.has_puuid ? "known" : null, history: a.history, riotConfigured }));
  const states = facts.map((f) => describeAccountSync(f, now).state);
  // A view's slice holds its lease for two minutes, or gives it back at once when it started
  // nothing (every due account held by another sync).
  const leaseHeld = (time(row?.lease) ?? 0) > now.getTime() - VIEW_REFRESH_LEASE_MS;
  const refreshStarting = visit && riotConfigured && backgroundRefreshEnabled() && facts.some((f) => dueForViewRefresh(f, now));
  // Accounts waiting for Riot only move while Riot is configured; without it nothing will change soon.
  const pace: FreshnessPace = leaseHeld || refreshStarting || (riotConfigured && states.some((s) => s === "pending" || s === "verified")) ? "now" : states.includes("syncing") ? "catching-up" : "idle";
  // The next slice of an account still adding this season's history could start now: no view's
  // slice holds the player (the last one gave its lease back, or its two minutes ran out), no other
  // sync holds the account (the scheduler, a Refresh, Retry sync: SCHEDULED_SYNC_LEASE_MS), and the
  // last slice moved the history on. It is part of the version, so a page left open on the
  // profile renders again, and that render starts the slice: the history fills in while the page
  // is watched, not one slice per visit. Never for a complete profile, and never for a history the
  // last slice could not move (a game Riot answers 5xx for every time): those wait for a visit or
  // a data change, as before, instead of a slice every two minutes.
  const accountLeases = row?.account_leases ?? {};
  const heldByAnotherSync = (accountId: string) => (time(accountLeases[accountSyncLeaseKey(accountId)]) ?? 0) > now.getTime() - SCHEDULED_SYNC_LEASE_MS;
  const lastSliceMoved = !(row?.slice && typeof row.slice === "object" && row.slice.progress === false);
  const sliceCanStart =
    riotConfigured && backgroundRefreshEnabled() && !leaseHeld && lastSliceMoved && accounts.some((a, i) => states[i] === "syncing" && dueForViewRefresh(facts[i]!, now) && !heldByAnotherSync(a.id));
  return {
    v: digest([row?.profile ?? null, row?.pools ?? null, accounts.map((a) => [a.id, a.sync_status, a.sync_error, time(a.last_sync_at), a.riot_id, a.history?.completedAt ?? null, a.rank]), row?.games, row?.ranks, Number(row?.mastery ?? 0), row?.timelines ?? null, time(row?.lookups), sliceCanStart]),
    pace,
  };
}

/**
 * The team's pages (Team Overview, Players, Leaderboards, Matches): the roster and its cards, pools
 * and pictures, the current lineup, members' ranks and games, team matches and bookmarks. Current
 * team members only (on the team, not archived, not personal use, as listPlayers): a personal-use
 * player is on none of these pages, and their activity must not move a version every teammate can
 * ask for. A player joining or leaving the team still moves it (the roster).
 */
export async function teamFreshness(db: Db): Promise<Freshness> {
  const [row] = rowsOf<Record<string, unknown>>(
    await db.execute(sql`
      WITH members AS (SELECT * FROM players WHERE archived_at IS NULL AND team_member),
      acc AS (SELECT id FROM riot_accounts WHERE owner_type = 'player' AND player_id IN (SELECT id FROM members))
      SELECT
        (SELECT string_agg(concat_ws('|', id, updated_at), ',' ORDER BY id) FROM teams) AS team,
        md5((SELECT string_agg(concat_ws('|', id, updated_at, display_name, team_member, "group", sort_order, primary_role, secondary_role, additional_roles::text,
            featured_champion_id, featured_skin_num, card_accent, card_style::text, card_banner_version, social_links::text), ',' ORDER BY id) FROM members)) AS roster,
        md5(concat_ws('|',
          (SELECT string_agg(concat_ws(':', player_id, avatar_version), ',' ORDER BY player_id) FROM users WHERE player_id IN (SELECT id FROM members)),
          (SELECT string_agg(concat_ws(':', player_id, slot, champion_id, position), ',' ORDER BY player_id, slot, position, champion_id) FROM player_champion_pools WHERE player_id IN (SELECT id FROM members)),
          (SELECT string_agg(concat_ws(':', player_id, role, champion_id, position), ',' ORDER BY player_id, role, position, champion_id) FROM player_role_pools WHERE player_id IN (SELECT id FROM members)))) AS looks,
        (SELECT json_agg(json_build_array(l.id, s.role, s.player_id) ORDER BY s.role) FROM lineup_slots s JOIN lineups l ON l.id = s.lineup_id WHERE l.is_current) AS lineup,
        (SELECT json_agg(json_build_array(s.role, s.player_id) ORDER BY s.role) FROM lineup_substitutes s JOIN lineups l ON l.id = s.lineup_id WHERE l.is_current) AS substitutes,
        md5((SELECT string_agg(concat_ws('|', a.id, a.sync_status, a.game_name, a.tag_line, a.rank_queue, a.tier, a.division, a.league_points, a.ranked_wins, a.ranked_losses), ',' ORDER BY a.id)
          FROM riot_accounts a WHERE a.id IN (SELECT id FROM acc))) AS accounts,
        (SELECT json_build_array(count(*), max(game_creation), count(*) FILTER (WHERE summarised_at IS NOT NULL), count(*) FILTER (WHERE extra_stats IS NOT NULL))
          FROM account_matches WHERE account_id IN (SELECT id FROM acc)) AS games,
        md5((SELECT string_agg(concat_ws('|', id, note), ',' ORDER BY id) FROM team_bookmarks)) AS bookmarks`),
  );
  return { v: digest(row ?? null), pace: "idle" };
}

/**
 * Admin Mode's health and data pages: job runs and the pipelines' status. A job is running when
 * the newest run not finished started within JOB_RUNNING_MS: a run whose process died earlier
 * stays open until it is closed as interrupted (server/ops/refresh-status.ts), and must not hide
 * one that is going now.
 */
export async function jobsFreshness(db: Db, now: Date = new Date()): Promise<Freshness> {
  const since = new Date(now.getTime() - 2 * 86_400_000).toISOString();
  const [row] = rowsOf<{ last_run: number | null; finished: string | null; running_since: string | null; status: string | null }>(
    await db.execute(sql`
      SELECT
        (SELECT max(id) FROM job_runs WHERE started_at >= ${since}::timestamptz) AS last_run,
        (SELECT max(finished_at) FROM job_runs WHERE started_at >= ${since}::timestamptz) AS finished,
        (SELECT max(started_at) FROM job_runs WHERE started_at >= ${since}::timestamptz AND finished_at IS NULL) AS running_since,
        (SELECT max(updated_at) FROM data_refresh_status) AS status`),
  );
  const running = (time(row?.running_since) ?? 0) > now.getTime() - JOB_RUNNING_MS;
  return { v: digest([row?.last_run ?? null, time(row?.finished), time(row?.status)]), pace: running ? "now" : "idle" };
}

export function freshness(db: Db, scope: FreshnessScope): Promise<Freshness> {
  return scope.kind === "player" ? playerFreshness(db, scope.playerId) : scope.kind === "team" ? teamFreshness(db) : jobsFreshness(db);
}
