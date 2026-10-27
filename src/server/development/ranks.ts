import { and, asc, desc, eq, gt, lte } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { rankSnapshots, riotAccounts, type SessionStartRank } from "@/server/db/schema";
import { ladderScore } from "@/domain/rank-progress";
import type { SessionLp } from "@/domain/development/sessions";

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

export type { SessionLp } from "@/domain/development/sessions";

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
