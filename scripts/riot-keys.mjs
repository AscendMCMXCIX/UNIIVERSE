/*
  The public team page's Riot keys, for the live check (scripts/live-check.mjs; docs/LIVE_VALIDATION.md,
  "What it checks"). The page anyone can open is built field by field from an allowlist
  (server/public/team.ts), and CI pins the public card's fields (tests/db/public-access.test.ts);
  this looks at the page production actually serves. A key here is a JSON key, wherever the page
  carries JSON: in its HTML (a JSON script block, JSON in an attribute) and in the RSC payload
  Next.js writes into it as `self.__next_f.push(...)` scripts. That payload is joined in order
  before it is read, because Next.js cuts it wherever its stream did, a key included. Letter case
  counts: the card's own "tagline" (its motto) is not Riot's "tagLine". Only counts come back,
  never a value.
*/

/** The keys that would carry a Riot account: its PUUID, its Riot ID and the Riot ID's two parts. */
export const RIOT_KEYS = ["puuid", "gameName", "tagLine", "riotId"];

/** A double quote as JSON writes it, also inside a JavaScript string (\" or deeper) and in an HTML attribute (&quot;). */
const QUOTE = String.raw`(?:\\*"|&quot;|&#0*34;|&#[xX]0*22;)`;
/** One of the keys: its name in quotes, then a colon. A JSON string that is a value is never followed by a colon. */
const KEY = new RegExp(`${QUOTE}(${RIOT_KEYS.join("|")})${QUOTE}\\s*:`, "g");
/**
 * One of Next.js's inline RSC scripts, `self.__next_f.push([kind, data])` (next/dist/server/app-render/
 * use-flight-response.js). Kind 1 is text, kind 3 bytes in base64. The first script,
 * `(self.__next_f=self.__next_f||[]).push([0])`, carries no data and is not matched. A script's
 * data has every "<" escaped, so its first ")</script>" is its end.
 */
const FLIGHT = /<script\b[^>]*>\s*self\.__next_f\.push\(([\s\S]*?)\)\s*;?\s*<\/script>/g;

/** A data script's bytes, or null when it does not read as Next.js writes them. */
function flightBytes(argument) {
  let entry;
  try {
    entry = JSON.parse(argument);
  } catch {
    return null;
  }
  if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[1] !== "string") return null;
  if (entry[0] === 1) return Buffer.from(entry[1], "utf8");
  if (entry[0] === 3) return Buffer.from(entry[1], "base64");
  return null;
}

function countKeys(text) {
  const counts = Object.fromEntries(RIOT_KEYS.map((k) => [k, 0]));
  for (const m of text.matchAll(KEY)) counts[m[1]] += 1;
  return counts;
}

/**
 * How often each Riot key appears in a page: in its RSC payload (rebuilt from its inline scripts, in
 * order) and in the rest of its HTML. `chunks` is the number of data scripts read; `unreadable`
 * those that did not read as Next.js writes them (they stay in the HTML, which is still searched).
 */
export function riotKeysOnPage(html) {
  const parts = [];
  let unreadable = 0;
  // The page without the scripts read into the payload, so that no key is counted twice.
  const rest = String(html).replace(FLIGHT, (script, argument) => {
    const bytes = flightBytes(argument);
    if (!bytes) {
      unreadable += 1;
      return script;
    }
    parts.push(bytes);
    return "";
  });
  const payload = countKeys(Buffer.concat(parts).toString("utf8"));
  const page = countKeys(rest);
  const keys = Object.fromEntries(RIOT_KEYS.map((k) => [k, payload[k] + page[k]]));
  return { keys, total: Object.values(keys).reduce((a, b) => a + b, 0), chunks: parts.length, unreadable };
}
