import { and, asc, desc, eq, gt, lte } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { rankSnapshots, riotAccounts, type SessionStartRank } from "@/server/db/schema";
import { ladderScore } from "@/domain/rank-progress";

/*
  A session's LP change, from the Solo/Duo rank snapshots the account sync already stores (no Riot
  request). Riot reports only the current rank, so a change is given only when two snapshots
  bracket exactly the session's games: the snapshot's season wins and losses must have grown by
  the number of games the session has on that account. Anything else (games outside the session in
  between, a rank not read since the last game, games on several accounts) says why there is no
  figure instead of guessing one.
*/

/** The rank a session starts at: the latest Solo/Duo snapshot of its account (else the Main account). */
export async function sessionStartRank(db: Db, ownerPlayerId: string, accountId: string | null, at: Date): Promise<SessionStartRank | null> {
  let id = accountId;
  if (!id) {
    const accounts = await db.select({ id: riotAccounts.id, label: riotAccounts.label }).from(riotAccounts).where(eq(riotAccounts.playerId, ownerPlayerId));
    id = (accounts.find((a) => a.label === "main") ?? accounts[0])?.id ?? null;
  }
  if (!id) return null;
  const [snap] = await db
    .select({ tier: rankSnapshots.tier, division: rankSnapshots.division, leaguePoints: rankSnapshots.leaguePoints, wins: rankSnapshots.wins, losses: rankSnapshots.losses, capturedAt: rankSnapshots.capturedAt })
    .from(rankSnapshots)
    .where(and(eq(rankSnapshots.accountId, id), eq(rankSnapshots.queue, "solo"), lte(rankSnapshots.capturedAt, at)))
    .orderBy(desc(rankSnapshots.capturedAt))
    .limit(1);
  if (!snap) return null;
  return { accountId: id, tier: snap.tier, division: snap.division, leaguePoints: snap.leaguePoints, wins: snap.wins, losses: snap.losses, at: snap.capturedAt.toISOString() };
}

export type SessionLp =
  | { state: "known"; accountId: string; from: { tier: string; division: string | null; leaguePoints: number | null }; to: { tier: string; division: string | null; leaguePoints: number | null }; change: number }
  | { state: "unknown"; reason: "no-games" | "several-accounts" | "no-rank" | "not-read-yet" | "other-games" };

export const LP_REASON_TEXT: Record<Extract<SessionLp, { state: "unknown" }>["reason"], string> = {
  "no-games": "No games yet.",
  "several-accounts": "Played on more than one account: LP is per account.",
  "no-rank": "No Solo/Duo rank was recorded for this account before the session.",
  "not-read-yet": "The rank after the last game has not been read yet; it comes with the next account update.",
  "other-games": "Other Solo/Duo games were played before the rank was read again, so the session's share is unknown.",
};

/** LP gained or lost over a session, or why it is not known. */
export async function sessionLpChange(db: Db, session: { startedAt: Date; accountId: string | null; startRank: SessionStartRank | null }, games: ReadonlyArray<{ accountId: string | null }>): Promise<SessionLp> {
  if (games.length === 0) return { state: "unknown", reason: "no-games" };
  const accounts = new Set(games.map((g) => g.accountId));
  const accountId = session.accountId ?? (accounts.size === 1 ? [...accounts][0] : null);
  if (!accountId || accounts.has(null) || accounts.size > 1) return { state: "unknown", reason: "several-accounts" };
  const n = games.length;
  let start: { tier: string | null; division: string | null; leaguePoints: number | null; wins: number | null; losses: number | null; capturedAt: Date } | null =
    session.startRank && session.startRank.accountId === accountId && session.startRank.at ? { ...session.startRank, wins: session.startRank.wins ?? null, losses: session.startRank.losses ?? null, capturedAt: new Date(session.startRank.at) } : null;
  if (!start) {
    const [snap] = await db
      .select()
      .from(rankSnapshots)
      .where(and(eq(rankSnapshots.accountId, accountId), eq(rankSnapshots.queue, "solo"), lte(rankSnapshots.capturedAt, session.startedAt)))
      .orderBy(desc(rankSnapshots.capturedAt))
      .limit(1);
    start = snap ?? null;
  }
  if (!start || !start.tier || start.wins === null || start.losses === null) return { state: "unknown", reason: "no-rank" };
  const target = start.wins + start.losses + n;
  const later = await db
    .select()
    .from(rankSnapshots)
    .where(and(eq(rankSnapshots.accountId, accountId), eq(rankSnapshots.queue, "solo"), gt(rankSnapshots.capturedAt, start.capturedAt)))
    .orderBy(asc(rankSnapshots.capturedAt))
    .limit(200);
  const end = later.find((s) => s.wins !== null && s.losses !== null && s.wins + s.losses >= target);
  if (!end) return { state: "unknown", reason: "not-read-yet" };
  if (end.wins! + end.losses! > target) return { state: "unknown", reason: "other-games" };
  const from = ladderScore(start);
  const to = ladderScore(end);
  if (from === null || to === null || !end.tier) return { state: "unknown", reason: "no-rank" };
  return { state: "known", accountId, from: { tier: start.tier, division: start.division, leaguePoints: start.leaguePoints }, to: { tier: end.tier, division: end.division, leaguePoints: end.leaguePoints }, change: to - from };
}
