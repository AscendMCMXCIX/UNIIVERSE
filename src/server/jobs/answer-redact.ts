/**
 * The job endpoint's answer, with no player identifier in it. A manual Data jobs run prints the
 * answer in the repository's public Actions log (`.github/workflows/data-jobs.yml`), and a job's last
 * log lines travel in it (registry.ts): an account sync's "match <id> failed …", a backfill's
 * "<id>: <error>" whose error repeats the id in Riot's address. So the identifiers that
 * `scripts/redact.mjs` takes out of the Production check's output are taken out here too, by the
 * same rules (`answer-redact.test.ts` holds the two to the same results): ids in an address or a
 * summary, PUUIDs and other long tokens, Riot IDs (Name#TAG) and Riot match ids
 * (OC1_1234567890, a made-up example), with any `?match=` value. Counts, states and job names stay
 * readable, and the stored copy that administrators read keeps its lines as they were.
 */
export function redactIdentifiers(text: string): string {
  return text
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<id>")
    .replace(/[A-Za-z0-9_-]{40,}/g, "<token>")
    .replace(/[\p{L}\p{N}._][\p{L}\p{N} ._]{2,15}#[\p{L}\p{N}]{2,5}\b/gu, "<riot-id>")
    .replace(/\b[A-Z][A-Z0-9]{1,4}_\d{6,}\b/g, "<match>")
    .replace(/([?&]match=)[^&#\s"'\\)<]+/g, "$1<match>");
}

/** A JSON answer whose text has been through redactIdentifiers (the replacements keep it valid JSON). */
export function redactedJson(body: unknown, status: number): Response {
  return new Response(redactIdentifiers(JSON.stringify(body)), { status, headers: { "content-type": "application/json" } });
}
