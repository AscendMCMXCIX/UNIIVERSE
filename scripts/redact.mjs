/**
 * The repository is public, so the log, the summary and report.json can be read by anyone. Signed in,
 * the checks see members' pages: identifiers are taken out of everything this script prints or
 * writes. Out go the ids in a page's address (/players/<uuid>), PUUIDs and other long tokens,
 * Riot IDs (Name#TAG) and Riot match ids (OC1_123456789, and any ?match= value). Counts,
 * statuses, check names and the app's own paths stay readable.
 */
export function redact(text) {
  return String(text)
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<id>")
    .replace(/[A-Za-z0-9_-]{40,}/g, "<token>")
    .replace(/[\p{L}\p{N}._][\p{L}\p{N} ._]{2,15}#[\p{L}\p{N}]{2,5}\b/gu, "<riot-id>")
    // Riot match ids (OC1_714675070): with any Riot API key, MATCH-V5 turns one into every
    // participant's Riot ID and PUUID, so they are personal data here. Anywhere: an address, JSON,
    // a DOM id quoted by an axe selector (match-<id>, together-<id>-100). Then any ?match= value.
    .replace(/\b[A-Z][A-Z0-9]{1,4}_\d{6,}\b/g, "<match>")
    .replace(/([?&]match=)[^&#\s"'\\)<]+/g, "$1<match>");
}
