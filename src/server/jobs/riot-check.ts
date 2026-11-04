import { defineJob } from "./registry";
import { createRiotClient, parsePlatforms, riotKeyTier } from "@/server/riot/api/client";
import { checkRiotCredential, riotKeyCheckLimits } from "@/server/riot/credential";

/**
 * Riot key check: no data stored beyond the credential record. Run it from Settings or the
 * data-jobs workflow to see whether the configured key is accepted, without waiting for the next
 * account sync to fail. It sends one platform-status request; while Riot's refusal of a request is
 * recorded, it also sends the requests an account sync makes, for at most one linked account per
 * server, before it records the key as accepted (checkRiotCredential). All of it is bounded by the
 * key check's deadline (riotKeyCheckLimits: 30 s from the job's start, or its budget when shorter).
 * The scheduled Data jobs run asks it once when health lists "riot-key", and its "accepted" clears it.
 */
defineJob({
  key: "riot-check",
  description: "Check whether the configured Riot API key is accepted (one platform-status request; while a refusal is recorded, also the requests an account sync makes for at most one linked account per server, within 30 seconds; records the credential status for Data health).",
  defaultIntervalMinutes: null,
  allowConcurrent: true,
  run: async (ctx) => {
    const client = createRiotClient(riotKeyCheckLimits(ctx.startedAt, ctx.budgetMs));
    if (!client) return { ok: true, degraded: true, error: "RIOT_API_KEY is not configured.", summary: { state: "not-configured" } };
    const platform = parsePlatforms(process.env.RIOT_PLATFORMS)[0] ?? "oc1";
    const result = await checkRiotCredential(ctx.db, client, platform);
    ctx.log(result.message);
    // The limits Riot states for the key tell a Production key from the other two; expiry tells a
    // Development key from a Personal one (it stops working 24 hours after it is issued).
    return { ok: true, degraded: !result.ok, error: result.ok ? undefined : result.message, summary: { state: result.state, statusCode: result.statusCode, platform, keyInUse: client.keyFingerprint, appRateLimit: client.reportedAppLimits ?? null, tier: riotKeyTier(client.reportedAppLimits) } };
  },
});
