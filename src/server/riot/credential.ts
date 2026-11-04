import { eq } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { appSettings } from "@/server/db/schema";
import { RiotApiError, RiotDeadlineError, normaliseRiotKey, riotKeyFingerprint, type RiotApiClient, type RiotClientOptions } from "@/server/riot/api/client";
import { cachedFor, invalidateCache } from "@/server/observability/cache";
import { probeSyncRequests } from "@/server/accounts/sync-probe";

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
  /**
   * The request refused while Riot accepted the key itself (an API and its routing host, as the
   * key check's sync probe names it), when that was the last outcome; absent otherwise.
   */
  refusedRequest?: string | null;
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

/** A refusal (401/403) recorded as the last outcome under this key (a record without a fingerprint counts, as in getRiotCredentialStatus). */
const refusalRecordedFor = (s: Stored | null, fingerprint: string | null | undefined): boolean =>
  !!s && s.lastOutcome === "error" && (s.lastStatusCode === 401 || s.lastStatusCode === 403) && (!s.fingerprint || !fingerprint || s.fingerprint === fingerprint);

/**
 * Records the outcome of a Riot interaction. Cheap: one upsert, called per job run or per account
 * sync, never per request. A failure that is no answer from Riot (a rate limit, a 5xx, a network
 * error) does not replace a refusal recorded under the same key: Riot's last answer was a refusal,
 * and only an answer says otherwise. `refusedRequest` (with a 401/403 `error`) names the one
 * request Riot refused while it accepted the key; `message` then replaces the usual wording.
 */
export async function recordRiotOutcome(db: Db, client: RiotApiClient | { keyFingerprint?: string }, outcome: { ok: boolean; error?: unknown; message?: string; refusedRequest?: string }): Promise<void> {
  try {
    const previous: Stored = (await readStored(db)) ?? { fingerprint: null, lastOkAt: null, lastErrorAt: null, lastError: null, lastStatusCode: null, lastOutcome: null };
    const now = new Date().toISOString();
    const fingerprint = client.keyFingerprint ?? previous.fingerprint;
    let next: Stored;
    if (outcome.ok) next = { ...previous, fingerprint, lastOkAt: now, lastOutcome: "ok", refusedRequest: null };
    else {
      const c = typeof outcome.error === "string" ? { state: "unavailable" as const, statusCode: null, message: outcome.error } : classifyRiotFailure(outcome.error);
      if (c.state === "unavailable" && refusalRecordedFor(previous, fingerprint)) return;
      next = { ...previous, fingerprint, lastErrorAt: now, lastError: outcome.message ?? c.message, lastStatusCode: c.statusCode, lastOutcome: "error", refusedRequest: outcome.refusedRequest ?? null };
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
      } else if (stored.lastOutcome === "error" && (lastStatusCode === 401 || lastStatusCode === 403) && stored.refusedRequest) {
        state = "rejected";
        advice = `Riot accepts this key for its platform status but refused ${stored.refusedRequest}, a request the account sync makes, so linked accounts stay Pending. An expired or revoked key fails every request, so this is not one: the routing value may not serve that request, Riot may no longer serve that endpoint, or the key may have no access to that API. Check key now asks again.`;
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

/** How long the key check may ask Riot, from its start (see riotKeyCheckLimits). */
export const RIOT_KEY_CHECK_MS = 30_000;
/** How long one of the key check's requests may take, its answer included. */
export const RIOT_KEY_CHECK_REQUEST_TIMEOUT_MS = 7_000;

/**
 * The Riot client limits for a key check started at `startedAt` (its caller's start; with a time
 * budget, the shorter of the two): a deadline, one retry and a short timeout. The check may ask
 * up to 29 requests (platform status and the sync probe's); without these limits one slow host
 * kept it going for minutes (four retries of 15 s each, and every rate-limit and Retry-After
 * wait). No request starts after the deadline and none waits past it; a request already sent
 * ends within its timeout. So the check's requests end by RIOT_KEY_CHECK_MS +
 * RIOT_KEY_CHECK_REQUEST_TIMEOUT_MS (37 s) after it starts. The scheduled Data jobs run waits up
 * to 45 s for riot-check's answer (`curl --max-time 45` in .github/workflows/data-jobs.yml),
 * which leaves 8 s for the function to start and for the check's few database queries: keep
 * that wait longer than the two together. The job route and Admin's pages allow 300 s.
 */
export function riotKeyCheckLimits(startedAt: number, budgetMs: number = RIOT_KEY_CHECK_MS): Required<Pick<RiotClientOptions, "deadline" | "maxRetries" | "timeoutMs">> {
  return { deadline: startedAt + Math.min(budgetMs, RIOT_KEY_CHECK_MS), maxRetries: 1, timeoutMs: RIOT_KEY_CHECK_REQUEST_TIMEOUT_MS };
}

/**
 * Whether the key is accepted right now: one cheap authenticated request (platform status). While
 * a refusal (401/403) is recorded under this key, Riot accepting platform status is not enough to
 * clear it, as Riot may refuse one API or one routing host the sync needs and nothing else: the
 * check then also asks the requests an account sync makes (probeSyncRequests), and the key is
 * recorded as accepted only when Riot answers each of them and refuses none. The scheduled Data
 * jobs run relies on that: it drops "riot-key" when this check says "accepted". Callers give the
 * client riotKeyCheckLimits. A stop for time (RiotDeadlineError) is no answer from Riot: nothing
 * is recorded, so a recorded refusal stands, and the check answers "unavailable".
 */
export async function checkRiotCredential(db: Db, client: RiotApiClient, platform: string): Promise<{ ok: boolean; state: CredentialState; message: string; statusCode: number | null }> {
  const refusalRecorded = refusalRecordedFor(await readStored(db), client.keyFingerprint);
  const stands = refusalRecorded ? " Riot's earlier refusal stands until it answers." : "";
  let accepted = `Riot accepted the key (platform status for ${platform} answered)`;
  let statusCode = 200;
  try {
    await client.platformStatus(platform);
  } catch (err) {
    if (err instanceof RiotDeadlineError) {
      // Riot's rate limits (a 429's Retry-After elsewhere under the key) would have kept the
      // request waiting past the check's deadline: not an answer about the key, so nothing is
      // recorded, as for a sync that stops for time.
      return { ok: false, state: "unavailable", message: `The key check ran out of time before it could ask platform status for ${platform}; nothing was recorded.${stands}`, statusCode: null };
    }
    const c = classifyRiotFailure(err);
    // Another answer (a 404) also means the key was accepted; after a refusal it is no more proof
    // than a 200, so the sync's requests are asked below as well.
    if (!(refusalRecorded && c.state === "accepted")) {
      await recordRiotOutcome(db, client, { ok: false, error: err });
      return { ok: false, state: c.state, message: `${c.message}${c.state === "unavailable" ? stands : ""}`, statusCode: c.statusCode };
    }
    accepted = `Riot accepted the key (platform status for ${platform} answered ${c.statusCode})`;
    statusCode = c.statusCode ?? statusCode;
  }
  if (!refusalRecorded) {
    await recordRiotOutcome(db, client, { ok: true });
    return { ok: true, state: "accepted", message: `${accepted}.`, statusCode: 200 };
  }
  const probe = await probeSyncRequests(db, client);
  if (probe.refused) {
    const { request, error } = probe.refused;
    const message = `${accepted}, but refused ${request} with ${error.status} for a linked account: a request the account sync makes, so linked accounts stay Pending. An expired or revoked key fails every request, platform status included.`;
    await recordRiotOutcome(db, client, { ok: false, error, message, refusedRequest: request });
    return { ok: false, state: "rejected", message, statusCode: error.status };
  }
  const unanswered = probe.failures.find((f) => classifyRiotFailure(f.error).state === "unavailable");
  if (unanswered || probe.outOfTime) {
    // Not recorded: a request with no answer, or one the check had no time left to ask, never
    // replaces the refusal (recordRiotOutcome).
    const c = unanswered ? classifyRiotFailure(unanswered.error) : null;
    const notAnswered = unanswered && c ? `${unanswered.request} did not get through. ${c.message}` : "";
    const notAsked = probe.outOfTime ? `${unanswered ? " The check then" : "the check"} ran out of time before it asked ${probe.outOfTime}.` : "";
    return { ok: false, state: "unavailable", message: `${accepted}, but ${notAnswered}${notAsked} Riot's earlier refusal stands until ${unanswered && probe.outOfTime ? "those requests are" : "that request is"} answered.`, statusCode: c?.statusCode ?? null };
  }
  await recordRiotOutcome(db, client, { ok: true });
  const asked = probe.accounts > 0 ? ` and the requests an account sync makes (one linked account per server in use: ${probe.accounts})` : "";
  return { ok: true, state: "accepted", message: `${accepted}${asked}.`, statusCode };
}
