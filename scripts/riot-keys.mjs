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
 * One of Next.js's inline RSC scripts, `self.__next_f.push([kind, data])`, as its Node.js writer
 * writes production's pages (next/dist/server/app-render/stream-ops.node.js) and its web writer the
 * edge runtime's (use-flight-response.js). Kind 1 is text, kind 3 bytes in base64: the Node.js
 * writer uses it for any piece that is not whole UTF-8 by itself, one cut inside a character
 * included. The first script, `(self.__next_f=self.__next_f||[]).push([0])`, carries no data and is
 * not matched. A script's data has every "<" escaped, so its first ")</script>" is its end.
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
 * A page's two texts: its RSC payload (rebuilt from its inline scripts, in order) and the rest of its
 * HTML, without the scripts read into the payload, so that nothing is counted twice. `chunks` is the
 * number of data scripts read; `unreadable` those that did not read as Next.js writes them (they stay
 * in the HTML, which is still searched).
 */
function pageTexts(html) {
  const parts = [];
  let unreadable = 0;
  const rest = String(html).replace(FLIGHT, (script, argument) => {
    const bytes = flightBytes(argument);
    if (!bytes) {
      unreadable += 1;
      return script;
    }
    parts.push(bytes);
    return "";
  });
  return { payload: Buffer.concat(parts).toString("utf8"), rest, chunks: parts.length, unreadable };
}

/** How often each Riot key appears in a page, its RSC payload and the rest of its HTML (pageTexts). */
export function riotKeysOnPage(html) {
  const { payload: text, rest, chunks, unreadable } = pageTexts(html);
  const payload = countKeys(text);
  const page = countKeys(rest);
  const keys = Object.fromEntries(RIOT_KEYS.map((k) => [k, payload[k] + page[k]]));
  return { keys, total: Object.values(keys).reduce((a, b) => a + b, 0), chunks, unreadable };
}

/*
  The public team page's Riot figures (Release 19, the owner's request of 26 Nov 2026, item 7): with
  Riot data off on the public pages (a Personal key), the page's data carries no figure from Riot
  (server/public/team.ts): the card's statistics are hidden ("statsVisible": false, every season
  figure null), each pool champion's games 0, its figures null and its tier "unknown", and no rank.
  Counted in the same two texts as the keys; counts only, never a value.
*/

/** The figure keys a member's card or pool carries when Riot data may appear (a value that is a number, or a date's digits, is a figure). */
export const RIOT_FIGURE_KEYS = ["winRate", "kda", "kdaRatio", "csPerMinute", "visionPerGame", "damagePerMinute", "masteryPoints", "leaguePoints", "lastPlayedAt"];
const FIGURE = new RegExp(`${QUOTE}(${RIOT_FIGURE_KEYS.join("|")})${QUOTE}\\s*:\\s*(?:-?\\d|${QUOTE}\\d)`, "g");
const STATS_VISIBLE = new RegExp(`${QUOTE}statsVisible${QUOTE}\\s*:\\s*true`, "g");
const GAMES = new RegExp(`${QUOTE}games${QUOTE}\\s*:\\s*[1-9]`, "g");
const TIER = new RegExp(`${QUOTE}tier${QUOTE}\\s*:\\s*${QUOTE}(?!unknown${QUOTE})[A-Za-z]`, "g");

function countFigures(text) {
  const figures = Object.fromEntries(RIOT_FIGURE_KEYS.map((k) => [k, 0]));
  for (const m of text.matchAll(FIGURE)) figures[m[1]] += 1;
  return { figures, statsVisible: (text.match(STATS_VISIBLE) ?? []).length, games: (text.match(GAMES) ?? []).length, tiers: (text.match(TIER) ?? []).length };
}

/** How often a Riot figure appears in a page's data (its RSC payload and the rest of its HTML), by kind. */
export function riotFiguresOnPage(html) {
  const { payload, rest, chunks, unreadable } = pageTexts(html);
  const a = countFigures(payload);
  const b = countFigures(rest);
  const figures = Object.fromEntries(RIOT_FIGURE_KEYS.map((k) => [k, a.figures[k] + b.figures[k]]));
  const counts = { statsVisible: a.statsVisible + b.statsVisible, games: a.games + b.games, tiers: a.tiers + b.tiers };
  return { figures, ...counts, total: Object.values(figures).reduce((x, y) => x + y, 0) + counts.statsVisible + counts.games + counts.tiers, chunks, unreadable };
}
