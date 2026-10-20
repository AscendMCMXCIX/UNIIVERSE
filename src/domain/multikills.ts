/*
  Multikills (double, triple, quadra and pentakills), from the counts Riot records for each player
  in each game (doubleKills, tripleKills, quadraKills, pentaKills on the match record). UNIIVERSE
  keeps them from the match records stored since Team Leaderboards (Phase 14); older records have
  none, and those games are left out, never counted as zero. So a total always says how many games
  it comes from, and it is never a career total.

  Each stored game carries its counts in one short text (server/accounts/account-rows):
    null       the game's record has no multikill counts,
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

const count = (v: string | undefined) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : 0;
};

/** One game's counts from its stored short form; null when its record has none. */
export function parseMultikills(raw: string | null | undefined): MultikillCounts | null {
  if (raw === null || raw === undefined) return null;
  const [d, t, q, p] = raw.split(",");
  return { double: count(d), triple: count(t), quadra: count(q), penta: count(p) };
}

export interface MultikillSummary extends MultikillCounts {
  /** Games in the population, whether or not their record has multikill counts. */
  games: number;
  /** Games whose record has them: the totals come from these only. */
  counted: number;
}

/** Totals over the games given (already filtered and de-duplicated by the caller). */
export function multikillsOfGames(games: ReadonlyArray<{ multikills?: string | null }>): MultikillSummary {
  const out: MultikillSummary = { games: games.length, counted: 0, double: 0, triple: 0, quadra: 0, penta: 0 };
  for (const g of games) {
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
