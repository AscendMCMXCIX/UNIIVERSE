import { defineJob } from "./registry";
import { createRiotClient, parsePlatforms } from "@/server/riot/api/client";
import { checkRiotCredential } from "@/server/riot/credential";

/**
 * Riot key check: one request, no data stored beyond the credential record. Run it from Settings
 * or the data-jobs workflow to see whether the configured key is accepted, without waiting for
 * the next ingestion run to fail.
 */
defineJob({
  key: "riot-check",
  description: "Check whether the configured Riot API key is accepted (one cheap request; records the credential status for Data health).",
  defaultIntervalMinutes: null,
  allowConcurrent: true,
  run: async (ctx) => {
    const client = createRiotClient();
    if (!client) return { ok: true, degraded: true, error: "RIOT_API_KEY is not configured.", summary: { state: "not-configured" } };
    const platform = parsePlatforms(process.env.RIOT_PLATFORMS)[0] ?? "oc1";
    const result = await checkRiotCredential(ctx.db, client, platform);
    ctx.log(result.message);
    return { ok: true, degraded: !result.ok, error: result.ok ? undefined : result.message, summary: { state: result.state, statusCode: result.statusCode, platform, keyInUse: client.keyFingerprint } };
  },
});
