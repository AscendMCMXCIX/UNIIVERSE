/**
 * Plain-language state of a linked Riot account, derived from the sync columns. Shared by the
 * profile page, the Team page and the admin diagnostics so every screen says the same thing.
 *
 * Labels: Pending sync (not verified yet) · Verified (Riot confirmed it, no data yet) ·
 * Synchronising (recent data in, season history still being collected) · Synced · Delayed (no
 * successful refresh for a day, or Riot unavailable) · Failed (needs a person).
 *
 * Stored `syncStatus` values: never (not attempted) | pending (attempted, Riot unavailable or
 * key rejected; retried automatically) | ok | unresolved (Riot ID not found) | failed (needs a
 * person: duplicate account, unreadable id) | demo (seeded, never synced).
 */
/** Pending sync · Verified · Synchronising · Synced · Delayed · Failed */
export type AccountSyncState = "pending" | "verified" | "syncing" | "synced" | "stale" | "error";

export interface AccountSyncView {
  state: AccountSyncState;
  /** Pending sync · Verified · Synchronising · Synced · Delayed · Failed */
  label: string;
  tone: "good" | "neutral" | "warn" | "bad";
  /** One sentence a teammate understands; never an HTTP status code. */
  detail: string;
  lastUpdatedAt: Date | null;
}

export const ACCOUNT_STALE_AFTER_HOURS = 24;

export interface AccountSyncFacts {
  syncStatus: string;
  syncError: string | null;
  lastSyncAt: Date | null;
  puuid: string | null;
  resolveAttempts?: number;
  riotConfigured?: boolean;
  /** Season history collection (riot_accounts.history_backfill), when known. */
  history?: { completedAt: string | null; queues: Record<string, { offset: number; done: boolean }> } | null;
}

/** Games collected so far for the season (sum of the per-queue positions). */
function seasonGames(history: AccountSyncFacts["history"]): number {
  return history ? Object.values(history.queues).reduce((s, q) => s + q.offset, 0) : 0;
}

export function describeAccountSync(a: AccountSyncFacts, now: Date = new Date()): AccountSyncView {
  const last = a.lastSyncAt ?? null;
  if (a.syncStatus === "demo") return { state: "synced", label: "Synced", tone: "good", detail: "Demo account with seeded history.", lastUpdatedAt: last };
  if (a.syncStatus === "ok") {
    const ageH = last ? (now.getTime() - last.getTime()) / 3_600_000 : Infinity;
    if (ageH > ACCOUNT_STALE_AFTER_HOURS) return { state: "stale", label: "Delayed", tone: "warn", detail: `Last refreshed ${Math.round(ageH / 24)} day${Math.round(ageH / 24) === 1 ? "" : "s"} ago; the next scheduled sync will catch up. Recommendations still use the data already gathered.`, lastUpdatedAt: last };
    if (a.history && !a.history.completedAt) {
      const n = seasonGames(a.history);
      return { state: "syncing", label: "Synchronising", tone: "neutral", detail: `Rank, mastery and recent games are in; older games from this season are still being collected${n ? ` (${n} so far)` : ""}. Statistics are marked partial until it finishes.`, lastUpdatedAt: last };
    }
    return { state: "synced", label: "Synced", tone: "good", detail: "Riot account verified; rank, mastery and this season's games are up to date.", lastUpdatedAt: last };
  }
  if (a.syncStatus === "unresolved") return { state: "error", label: "Failed", tone: "bad", detail: a.syncError ?? "Riot could not find this Riot ID. Check the spelling and the #TAG exactly as shown in the League client.", lastUpdatedAt: last };
  if (a.syncStatus === "failed") return { state: "error", label: "Failed", tone: "bad", detail: a.syncError ?? "This account could not be synced. See the message on the account.", lastUpdatedAt: last };
  if (a.syncStatus === "pending") {
    // Verified before, Riot unavailable now: the data already gathered stays in use.
    if (a.puuid && last) return { state: "stale", label: "Delayed", tone: "warn", detail: a.syncError ?? "Riot is not answering right now; the account is retried automatically.", lastUpdatedAt: last };
    return { state: "pending", label: "Pending sync", tone: "neutral", detail: a.syncError ?? "Saved; verification with Riot is pending and retried automatically.", lastUpdatedAt: last };
  }
  // "never": saved, not yet attempted.
  if (a.riotConfigured === false) return { state: "pending", label: "Pending sync", tone: "neutral", detail: "Saved. It will be verified with Riot once the owner configures a Riot API key.", lastUpdatedAt: last };
  if (a.puuid) return { state: "verified", label: "Verified", tone: "neutral", detail: "Riot confirmed this account; the first data sync is queued.", lastUpdatedAt: last };
  return { state: "pending", label: "Pending sync", tone: "neutral", detail: "Saved; verification with Riot is queued and runs automatically.", lastUpdatedAt: last };
}

/** Summary across a player's accounts, for cards and checklists. */
export function summariseAccounts(views: AccountSyncView[]): { state: AccountSyncState | "none"; label: string } {
  if (views.length === 0) return { state: "none", label: "No Riot account linked" };
  if (views.some((v) => v.state === "error")) return { state: "error", label: `${views.filter((v) => v.state === "error").length} of ${views.length} account${views.length === 1 ? "" : "s"} need attention` };
  if (views.every((v) => v.state === "synced")) return { state: "synced", label: views.length === 1 ? "Riot account synced" : `${views.length} Riot accounts synced` };
  if (views.some((v) => v.state === "pending" || v.state === "verified")) return { state: "pending", label: `${views.filter((v) => v.state === "pending" || v.state === "verified").length} of ${views.length} account${views.length === 1 ? "" : "s"} waiting for the first sync` };
  if (views.some((v) => v.state === "stale")) return { state: "stale", label: "Riot data is delayed; a refresh is due" };
  return { state: "syncing", label: "Collecting this season's games" };
}
