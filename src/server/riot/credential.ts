import { eq } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { appSettings } from "@/server/db/schema";
import { RiotApiError, normaliseRiotKey, riotKeyFingerprint, type RiotApiClient } from "@/server/riot/api/client";
import { cachedFor, invalidateCache } from "@/server/observability/cache";

/*
  Riot credential health. Every place that talks to Riot with a database at hand records the
  outcome here (one small row in app_settings), so Settings → Data health can say whether the
  configured key is currently accepted, when Riot last answered and what the last failure was,
  without ever showing the key. Never logs or stores the key itself.
*/

export type CredentialState = "accepted" | "rejected" | "unknown" | "unavailable" | "not-configured";

export interface RiotCredentialStatus {
  configured: boolean;
  /** accepted = a request succeeded under this key · rejected = 401/403 · unavailable = network/5xx/429 · unknown = never tried */
  state: CredentialState;
  /** Last characters of the key in use, enough to tell which key a deployment carries. */
  keyFingerprint: string | null;
  lastOkAt: Date | null;
  lastErrorAt: Date | null;
  /** Plain-language description of the last failure (no key, no URLs with secrets). */
  lastError: string | null;
  /** HTTP status of the last failure, when it was an HTTP answer. */
  lastStatusCode: number | null;
  /** What the operator should do, when anything. */
  advice: string | null;
}

const KEY = "riot-credential";

interface Stored {
  fingerprint: string | null;
  lastOkAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
  lastStatusCode: number | null;
  /** The last outcome, so a rejection after a success is not hidden by the older success. */
  lastOutcome: "ok" | "error" | null;
}

/** Classifies a Riot failure for the credential record. */
export function classifyRiotFailure(err: unknown): { state: CredentialState; statusCode: number | null; message: string } {
  if (err instanceof RiotApiError) {
    if (err.status === 401) return { state: "rejected", statusCode: 401, message: "Riot answered 401 Unauthorized: it does not recognise the key that was sent." };
    if (err.status === 403) return { state: "rejected", statusCode: 403, message: "Riot answered 403 Forbidden: the key was rejected (development keys expire after 24 hours)." };
    if (err.status === 429) return { state: "unavailable", statusCode: 429, message: "Riot is rate limiting requests; the key is accepted, requests slow down automatically." };
    if (err.status === 0) return { state: "unavailable", statusCode: null, message: "Riot could not be reached (network error or timeout)." };
    if (err.status >= 500) return { state: "unavailable", statusCode: err.status, message: `Riot answered ${err.status}: its servers are having trouble.` };
    return { state: "accepted", statusCode: err.status, message: `Riot answered ${err.status} for a request (the key itself was accepted).` };
  }
  return { state: "unavailable", statusCode: null, message: (err as Error)?.message ?? String(err) };
}

async function readStored(db: Db): Promise<Stored | null> {
  const [row] = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, KEY));
  return (row?.value as Stored | undefined) ?? null;
}

/** Records the outcome of a Riot interaction. Cheap: one upsert, called per job run or per account sync, never per request. */
export async function recordRiotOutcome(db: Db, client: RiotApiClient | { keyFingerprint?: string }, outcome: { ok: boolean; error?: unknown }): Promise<void> {
  try {
    const previous = (await readStored(db)) ?? { fingerprint: null, lastOkAt: null, lastErrorAt: null, lastError: null, lastStatusCode: null, lastOutcome: null };
    const now = new Date().toISOString();
    const fingerprint = client.keyFingerprint ?? previous.fingerprint;
    let next: Stored;
    if (outcome.ok) next = { ...previous, fingerprint, lastOkAt: now, lastOutcome: "ok" };
    else {
      const c = typeof outcome.error === "string" ? { statusCode: null, message: outcome.error } : classifyRiotFailure(outcome.error);
      next = { ...previous, fingerprint, lastErrorAt: now, lastError: c.message, lastStatusCode: c.statusCode, lastOutcome: "error" };
    }
    await db.insert(appSettings).values({ key: KEY, value: next, updatedAt: new Date() }).onConflictDoUpdate({ target: appSettings.key, set: { value: next, updatedAt: new Date() } });
    invalidateCache("riot-credential");
  } catch {
    /* health bookkeeping must never fail the caller */
  }
}

/** Current credential status for Data health (cached briefly; never includes the key). */
export async function getRiotCredentialStatus(db: Db, env: Record<string, string | undefined> = process.env): Promise<RiotCredentialStatus> {
  // The key as the client uses it (quotes pasted with it stripped), so the fingerprint matches the
  // one the jobs record outcomes under; otherwise a quoted key would read "unknown" for ever.
  const key = normaliseRiotKey(env.RIOT_API_KEY) ?? "";
  const configured = key.length > 0;
  const fingerprint = configured ? riotKeyFingerprint(key) : null;
  return cachedFor(
    `riot-credential:${fingerprint ?? "none"}`,
    30_000,
    async () => {
      const stored = await readStored(db);
      const sameKey = !stored?.fingerprint || stored.fingerprint === fingerprint;
      const lastOkAt = stored?.lastOkAt && sameKey ? new Date(stored.lastOkAt) : null;
      const lastErrorAt = stored?.lastErrorAt && sameKey ? new Date(stored.lastErrorAt) : null;
      const lastError = sameKey ? (stored?.lastError ?? null) : null;
      const lastStatusCode = sameKey ? (stored?.lastStatusCode ?? null) : null;
      let state: CredentialState;
      let advice: string | null = null;
      if (!configured) {
        state = "not-configured";
        advice = "Add RIOT_API_KEY to the host's environment variables (Vercel → Project → Settings → Environment Variables) and redeploy.";
      } else if (!stored || !sameKey || (!lastOkAt && !lastErrorAt)) {
        state = "unknown";
        advice = "No Riot request has been recorded under this key yet. Run the Riot key check (Settings → Data jobs → riot-check) or link an account.";
      } else if (stored.lastOutcome === "error" && (lastStatusCode === 401 || lastStatusCode === 403)) {
        state = "rejected";
        advice = "Riot rejected this key. Generate a new development key (or use an approved production key) at developer.riotgames.com, replace RIOT_API_KEY in Vercel → your project → Settings → Environment Variables (Production), then redeploy. Linked accounts stay Pending and sync automatically afterwards.";
      } else if (stored.lastOutcome === "error") {
        state = "unavailable";
        advice = "The key was accepted the last time Riot answered; the most recent request failed for another reason (rate limit, outage or network). Nothing to change unless it persists.";
      } else {
        state = "accepted";
      }
      return { configured, state, keyFingerprint: fingerprint, lastOkAt, lastErrorAt, lastError, lastStatusCode, advice };
    },
    db,
  );
}

/** One cheap authenticated request to find out whether the key is accepted right now. */
export async function checkRiotCredential(db: Db, client: RiotApiClient, platform: string): Promise<{ ok: boolean; state: CredentialState; message: string; statusCode: number | null }> {
  try {
    await client.platformStatus(platform);
    await recordRiotOutcome(db, client, { ok: true });
    return { ok: true, state: "accepted", message: `Riot accepted the key (platform status for ${platform} answered).`, statusCode: 200 };
  } catch (err) {
    await recordRiotOutcome(db, client, { ok: false, error: err });
    const c = classifyRiotFailure(err);
    return { ok: false, state: c.state, message: c.message, statusCode: c.statusCode };
  }
}
