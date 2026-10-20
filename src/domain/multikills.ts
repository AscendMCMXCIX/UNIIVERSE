/*
  Multikills (double, triple, quadra and pentakills), from the counts Riot records for each player
  in each game (doubleKills, tripleKills, quadraKills, pentaKills on the match record). UNIIVERSE
  keeps them from the match records stored since Team Leaderboards (Phase 14); for older games of
  the offered seasons the records are fetched again, a few an hour (server/accounts/figures-backfill).
  A game without counts is left out, never counted as zero, so a total always says how many games
  it comes from, and it is never a career total.

  Each stored game carries its counts in one short text (server/accounts/account-rows):
    null       no counts yet: the record is still to be fetched again,
    "-"        no counts, ever: Riot no longer provides the game's record (or sent none),
    ""         it has them and they are all zero (most games),
    "2,1,0,0"  double, triple, quadra and pentakills, in that order.
*/

export interface MultikillCounts {
  double: number;
  triple: number;
  quadra: number;
  penta: number;
}

export const MULTIKILL_KINDS: ReadonlyArray<{ key: keyof MultikillCounts; label: string; size: 2 | 3 | 4 | 5 }> = [
  { key: "double", label: "Double kills", size: 2 },
  { key: "triple", label: "Triple kills", size: 3 },
  { key: "quadra", label: "Quadra kills", size: 4 },
  { key: "penta", label: "Pentakills", size: 5 },
];

/** The stored form of a game whose record will never have counts. */
export const UNAVAILABLE = "-";

const count = (v: string | undefined) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : 0;
};

/** One game's counts from its stored short form; null when its record has none (yet, or ever). */
export function parseMultikills(raw: string | null | undefined): MultikillCounts | null {
  if (raw === null || raw === undefined || raw === UNAVAILABLE) return null;
  const [d, t, q, p] = raw.split(",");
  return { double: count(d), triple: count(t), quadra: count(q), penta: count(p) };
}

export interface MultikillSummary extends MultikillCounts {
  /** Games in the population, whether or not their record has multikill counts. */
  games: number;
  /** Games whose record has them: the totals come from these only. */
  counted: number;
  /** Games whose record Riot no longer provides: they will never have counts. The rest (games − counted − unavailable) are still to be fetched. */
  unavailable: number;
}

/** Totals over the games given (already filtered and de-duplicated by the caller). */
export function multikillsOfGames(games: ReadonlyArray<{ multikills?: string | null }>): MultikillSummary {
  const out: MultikillSummary = { games: games.length, counted: 0, unavailable: 0, double: 0, triple: 0, quadra: 0, penta: 0 };
  for (const g of games) {
    if (g.multikills === UNAVAILABLE) out.unavailable += 1;
    const m = parseMultikills(g.multikills);
    if (!m) continue;
    out.counted += 1;
    out.double += m.double;
    out.triple += m.triple;
    out.quadra += m.quadra;
    out.penta += m.penta;
  }
  return out;
}

/**
 * The champions with the most multikills in the games given (already filtered and de-duplicated),
 * at most `limit`: ordered by pentakills, then quadra, triple and double kills, then name. Only
 * games with counts take part; champions without a single multikill are left out.
 */
export function multikillsByChampion(games: ReadonlyArray<{ championId: string; multikills?: string | null }>, limit = 12): Array<{ championId: string; multikills: MultikillSummary }> {
  const by = new Map<string, Array<{ multikills?: string | null }>>();
  for (const g of games) {
    if (g.multikills === null || g.multikills === undefined || g.multikills === UNAVAILABLE) continue;
    const list = by.get(g.championId);
    if (list) list.push(g);
    else by.set(g.championId, [g]);
  }
  return [...by.entries()]
    .map(([championId, list]) => ({ championId, multikills: multikillsOfGames(list) }))
    .filter((c) => c.multikills.double + c.multikills.triple + c.multikills.quadra + c.multikills.penta > 0)
    .sort((a, b) => b.multikills.penta - a.multikills.penta || b.multikills.quadra - a.multikills.quadra || b.multikills.triple - a.multikills.triple || b.multikills.double - a.multikills.double || a.championId.localeCompare(b.championId))
    .slice(0, limit);
}

export const MULTIKILL_NAMES: Readonly<Record<2 | 3 | 4 | 5, string>> = { 2: "Double kill", 3: "Triple kill", 4: "Quadra kill", 5: "Pentakill" };

/**
 * The largest multikill a player made in one game (2 = double … 5 = penta), or null for none or
 * no record. Riot's largestMultiKill when it sent one, else the largest kind with a count; the
 * Summoner's Rift queues UNIIVERSE keeps stop at a pentakill.
 */
export function largestMultikill(stats: { largestMultiKill?: number; doubleKills?: number; tripleKills?: number; quadraKills?: number; pentaKills?: number } | null | undefined): 2 | 3 | 4 | 5 | null {
  if (!stats) return null;
  const largest = typeof stats.largestMultiKill === "number" ? stats.largestMultiKill : (stats.pentaKills ?? 0) > 0 ? 5 : (stats.quadraKills ?? 0) > 0 ? 4 : (stats.tripleKills ?? 0) > 0 ? 3 : (stats.doubleKills ?? 0) > 0 ? 2 : 0;
  return largest >= 5 ? 5 : largest >= 2 ? (largest as 2 | 3 | 4) : null;
}

const n = (v: number) => v.toLocaleString("en");

/**
 * How complete a total's counts are, in words, so a partial total is never read as the season's:
 * "From all 589 games", "From 50 of 1,103 games", "No counts yet for these 1,103 games", with a note
 * on the games still being fetched and those Riot no longer provides.
 */
export function multikillCoverage(m: MultikillSummary): { label: string; note: string | null; state: "complete" | "partial" | "none" } {
  const pending = Math.max(0, m.games - m.counted - m.unavailable);
  const state = m.counted === m.games ? "complete" : m.counted ? "partial" : "none";
  const games = (k: number) => `${n(k)} game${k === 1 ? "" : "s"}`;
  const label = state === "complete" ? `From all ${games(m.games)}` : state === "partial" ? `From ${n(m.counted)} of ${games(m.games)}` : `No counts ${pending ? "yet " : ""}for these ${games(m.games)}`;
  const notes: string[] = [];
  if (pending > 0)
    notes.push(
      state === "partial"
        ? `The other ${n(pending)} game${pending === 1 ? "'s" : "s'"} counts are still being fetched from Riot (a few each hour), so these totals are not complete yet.`
        : pending === m.games
          ? "Their counts are still being fetched from Riot, a few each hour."
          : `${n(pending)} of them are still being fetched from Riot, a few each hour.`,
    );
  if (m.unavailable > 0) notes.push(`Riot no longer provides the record${m.unavailable === 1 ? "" : "s"} of ${games(m.unavailable)}, so ${m.unavailable === 1 ? "it is" : "they are"} left out.`);
  return { label, note: notes.length ? notes.join(" ") : null, state };
}
