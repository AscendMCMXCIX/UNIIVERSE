import { and, eq, isNotNull, ne } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { defineJob } from "./registry";
import { appSettings, riotAccounts, type HistoryBackfill } from "@/server/db/schema";
import { currentSeason } from "@/server/accounts/sync";
import { SCHEDULED_SYNC_LEASE_MS, claimAccountSync } from "@/server/accounts/refresh";

/** Where the history states from before the marking are kept, so it can be undone (docs/DATA_PIPELINES.md). */
export const HISTORY_RESCAN_PREVIOUS_KEY = "history_rescan:previous";

/**
 * Marks every finished queue of this season's collection for one rescan, on every player's
 * account. A queue finished before the sync could rescan (#201) may have stopped with games
 * still unread below its offset: the paging of that time could leave them behind, and a finished
 * queue is never read past its offset again. rank-audit found four Solo/Duo lists one to six games
 * short of Riot's count (6 Nov 2026). The sync's own rescan (accounts/sync.ts, phase 1) then reads
 * the older pages again on the account's next sync: one list request per hundred games, nothing for
 * a game already stored, and the missing games folded as any listed game is. Adds rows only.
 *
 * Each account is marked while its sync lease is held, so no sync is running that would write its
 * older state back. An account whose lease is busy is left for the next run (`busy`), and a queue
 * already marked is not counted again, so running it twice changes nothing. The history state of
 * every account it changes is kept first under HISTORY_RESCAN_PREVIOUS_KEY (the first run's, never
 * overwritten), so the marking can be undone. Counts only in its answer.
 */
export async function markHistoryRescan(db: Db, now: Date = new Date()): Promise<{ season: number; accounts: number; marked: number; queuesMarked: number; byQueue: Record<string, number>; busy: number; previousKept: number }> {
  const season = await currentSeason(db, now);
  const accounts = await db
    .select({ id: riotAccounts.id, state: riotAccounts.historyBackfill })
    .from(riotAccounts)
    .where(and(eq(riotAccounts.ownerType, "player"), isNotNull(riotAccounts.puuid), ne(riotAccounts.label, "demo")));
  const [kept] = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, HISTORY_RESCAN_PREVIOUS_KEY));
  const previous = { ...((kept?.value as { accounts?: Record<string, HistoryBackfill> } | undefined)?.accounts ?? {}) };
  const out = { season, accounts: accounts.length, marked: 0, queuesMarked: 0, byQueue: {} as Record<string, number>, busy: 0, previousKept: 0 };
  for (const account of accounts) {
    const due = (s: HistoryBackfill | null) => (s && s.season === season ? Object.entries(s.queues).filter(([, q]) => q.done && q.offset > 0 && !q.rescan).map(([id]) => id) : []);
    if (due(account.state).length === 0) continue;
    if (!(await claimAccountSync(db, account.id, SCHEDULED_SYNC_LEASE_MS, now))) {
      out.busy += 1;
      continue;
    }
    // Read again under the lease: the state a sync may have written just before it.
    const [row] = await db.select({ state: riotAccounts.historyBackfill }).from(riotAccounts).where(eq(riotAccounts.id, account.id));
    const state = row?.state ?? null;
    const queues = due(state);
    if (!state || queues.length === 0) continue;
    if (!previous[account.id]) previous[account.id] = state;
    const next: HistoryBackfill = { ...state, queues: { ...state.queues } };
    for (const id of queues) {
      next.queues[id] = { ...state.queues[id]!, rescan: true };
      out.byQueue[id] = (out.byQueue[id] ?? 0) + 1;
    }
    out.queuesMarked += queues.length;
    out.marked += 1;
    await db
      .insert(appSettings)
      .values({ key: HISTORY_RESCAN_PREVIOUS_KEY, value: { savedAt: now.toISOString(), accounts: previous }, updatedAt: now })
      .onConflictDoUpdate({ target: appSettings.key, set: { value: { savedAt: now.toISOString(), accounts: previous }, updatedAt: now } });
    await db.update(riotAccounts).set({ historyBackfill: next, updatedAt: now }).where(eq(riotAccounts.id, account.id));
  }
  out.previousKept = Object.keys(previous).length;
  return out;
}

defineJob({
  key: "history-rescan",
  description: "One-off repair: marks every finished queue of this season's collection for one rescan on every player's account (taken under each account's sync lease, its earlier state kept first), so the next sync reads the older pages again and folds any listed game the paging before #201 left behind. Adds rows only, through the sync. Counts only.",
  defaultIntervalMinutes: null,
  run: async (ctx) => {
    const summary = await markHistoryRescan(ctx.db);
    ctx.log(`history-rescan: ${summary.queuesMarked} queues on ${summary.marked} accounts marked, ${summary.busy} busy`);
    return { ok: true, summary };
  },
});
