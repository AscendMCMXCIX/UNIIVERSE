/**
 * Plain-language state of a linked Riot account, derived from the sync columns. Shared by the
 * profile page, the Team page and the admin diagnostics so every screen says the same thing.
 *
 * Labels: Updating (not verified yet, or verified and the first data on its way) · Catching up on
 * history (recent data in, older games of the season still being added automatically) · Up to
 * date · Delayed (no successful refresh for six hours, or Riot unavailable; retried
 * automatically) · Needs attention (a person must act, e.g. the Riot ID does not exist).
 *
 * Stored `syncStatus` values: never (not attempted) | pending (attempted, Riot unavailable or
 * key rejected; retried automatically) | ok | unresolved (Riot ID not found) | failed (needs a
 * person: duplicate account, unreadable id) | demo (seeded, never synced).
 */
/** Updating (pending, verified) · Catching up on history (syncing) · Up to date (synced) · Delayed (stale) · Needs attention (error) */
export type AccountSyncState = "pending" | "verified" | "syncing" | "synced" | "stale" | "error";

export interface AccountSyncView {
  state: AccountSyncState;
  /** Updating · Catching up on history · Up to date · Delayed · Needs attention */
  label: string;
  tone: "good" | "neutral" | "warn" | "bad";
  /** One sentence a teammate understands; never an HTTP status code. */
  detail: string;
  lastUpdatedAt: Date | null;
}

/** A player's accounts are refreshed when someone views them and they were last synced longer ago than this. */
export const VIEW_REFRESH_AFTER_MS = 15 * 60_000;

/**
 * Whether viewing a player refreshes this account (server/accounts/kickoff.ts): unverified accounts,
 * accounts still adding this season's history, and accounts not refreshed for 15 minutes. Never a
 * demo account, nor an account a person must correct or remove (a Riot ID Riot could not find, or
 * one already linked).
 */
export function dueForViewRefresh(a: AccountSyncFacts, now: Date = new Date()): boolean {
  if (a.syncStatus === "demo") return false;
  const view = describeAccountSync(a, now);
  // Riot could not find the Riot ID, or the account is the same as another linked one: a person
  // has to correct or remove it; the scheduler retries it with its back-off, a view does not.
  if (view.state === "error" && (a.syncStatus === "unresolved" || a.syncStatus === "failed")) return false;
  if (view.state === "syncing" || view.state === "pending" || view.state === "verified") return true;
  return !a.lastSyncAt || now.getTime() - a.lastSyncAt.getTime() > VIEW_REFRESH_AFTER_MS;
}

/** Accounts refresh every 45 minutes or so while the team is active; six hours without one is a delay. */
export const ACCOUNT_STALE_AFTER_HOURS = 6;

/** Whether a manual retry is worth offering: only when automation has not managed on its own. */
export function canRetrySync(view: AccountSyncView): boolean {
  return view.state === "stale" || view.state === "error";
}

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
  if (a.syncStatus === "demo") return { state: "synced", label: "Up to date", tone: "good", detail: "Demo account with seeded history.", lastUpdatedAt: last };
  if (a.syncStatus === "ok") {
    const ageH = last ? (now.getTime() - last.getTime()) / 3_600_000 : Infinity;
    if (ageH > ACCOUNT_STALE_AFTER_HOURS) {
      const ago = ageH >= 48 ? `${Math.round(ageH / 24)} days` : `${Math.round(ageH)} hours`;
      return { state: "stale", label: "Delayed", tone: "warn", detail: `Last refreshed ${ago} ago; it is retried automatically. Recommendations still use the data already gathered.`, lastUpdatedAt: last };
    }
    if (a.history && !a.history.completedAt) {
      const n = seasonGames(a.history);
      return { state: "syncing", label: "Catching up on history", tone: "neutral", detail: `Recent games, rank and mastery are in. Older games from this season are being added automatically${n ? ` (${n} so far)` : ""}; season statistics are marked partial until then. Nothing to do.`, lastUpdatedAt: last };
    }
    return { state: "synced", label: "Up to date", tone: "good", detail: "Rank, mastery and this season's games are up to date and refresh automatically.", lastUpdatedAt: last };
  }
  if (a.syncStatus === "unresolved") return { state: "error", label: "Needs attention", tone: "bad", detail: a.syncError ?? "Riot could not find this Riot ID. Check the spelling and the #TAG exactly as shown in the League client.", lastUpdatedAt: last };
  if (a.syncStatus === "failed") return { state: "error", label: "Needs attention", tone: "bad", detail: a.syncError ?? "This account could not be synced. See the message on the account.", lastUpdatedAt: last };
  if (a.syncStatus === "pending") {
    // Verified before, Riot unavailable now: the data already gathered stays in use.
    if (a.puuid && last) return { state: "stale", label: "Delayed", tone: "warn", detail: a.syncError ?? "Riot is not answering right now; the account is retried automatically.", lastUpdatedAt: last };
    return { state: "pending", label: "Updating", tone: "neutral", detail: a.syncError ?? "Saved; verification with Riot is retried automatically.", lastUpdatedAt: last };
  }
  // "never": saved, not yet attempted.
  if (a.riotConfigured === false) return { state: "pending", label: "Updating", tone: "neutral", detail: "Saved. It will be verified with Riot once the owner configures a Riot API key.", lastUpdatedAt: last };
  if (a.puuid) return { state: "verified", label: "Updating", tone: "neutral", detail: "Riot confirmed this account; the first games arrive within minutes, automatically.", lastUpdatedAt: last };
  return { state: "pending", label: "Updating", tone: "neutral", detail: "Saved; verification with Riot runs automatically within minutes.", lastUpdatedAt: last };
}

/** Summary across a player's accounts, for cards and checklists. */
export function summariseAccounts(views: AccountSyncView[]): { state: AccountSyncState | "none"; label: string } {
  if (views.length === 0) return { state: "none", label: "No Riot account linked" };
  if (views.some((v) => v.state === "error")) return { state: "error", label: `${views.filter((v) => v.state === "error").length} of ${views.length} account${views.length === 1 ? "" : "s"} need attention` };
  if (views.every((v) => v.state === "synced")) return { state: "synced", label: views.length === 1 ? "Riot account up to date" : `${views.length} Riot accounts up to date` };
  if (views.some((v) => v.state === "pending" || v.state === "verified")) return { state: "pending", label: `${views.filter((v) => v.state === "pending" || v.state === "verified").length} of ${views.length} account${views.length === 1 ? "" : "s"} updating` };
  if (views.some((v) => v.state === "stale")) return { state: "stale", label: "Riot data is delayed; retried automatically" };
  return { state: "syncing", label: "Catching up on this season's games" };
}
