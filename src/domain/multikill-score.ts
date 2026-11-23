import type { GameRole } from "./season-stats";
import type { MultikillCounts } from "./multikills";

/*
  The multikill score (docs/TEAM_LEADERBOARDS.md, "The multikill score"; docs/LEADERBOARDS_MODEL.md
  §4): how often a member makes multikills, per game, against what players on the same roles and
  champions make in the same stored games. Pure functions; the page's data (server/leaderboards)
  reads the comparison players' counts in one aggregate query.

  In plain words: 100 is the usual for a member's roles and champions; 130 is 30% more multikills
  than usual. Each kind (double, triple, quadra, penta) is compared on its own and the four count
  equally, so a rarer kind counts for more per kill; with few games a score stays near 100.

  1. Each multikill once, at its largest (`multikillEvents`). Riot keeps four counters per player
     and game. Whether a pentakill also adds to the double, triple and quadra counters ("nested") or
     only to the pentakill counter ("separate") is not documented; `readCountingRule` reads it from
     the stored games themselves: nested counters can never show more triples than doubles (more
     quadras than triples, pentas than quadras, or a largest multikill of 3+ without a double), while
     separate counters show that in most games whose one multikill was a triple. Nested counts are
     turned into one event each (doubles − triples are the multikills that stopped at a double, and
     so on); separate counts already are. While the stored games cannot tell (fewer than 20 games
     with a triple), the nested reading is assumed: it is the one that can never count a multikill
     twice, and the page says so.

  2. The comparison (`buildMultikillBaseline`, `expectedRates`): every other player in the same
     stored games (allies and opponents, never a team member, never a removed player), with
     Riot's position and champion, once they have BASELINE_MIN_GAMES games (else the team's own
     games, said as such). Per game and kind, a role's rate is its events over its games, leaning
     toward every position's rate by ROLE_PRIOR_GAMES pseudo-games; a champion moves the role's
     rates by its own multikill tendency, leaning toward the role by CHAMPION_PRIOR_GAMES
     pseudo-games, so a champion seen in a few games barely moves them (its tendency is the same for every kind: a
     champion with twice the role's multikills is expected to make twice its pentakills too).

  3. The score (`scoreMember`): for each kind k, the member's events O_k and the events expected
     for their games X_k (each game's rate for its role and champion, added up):
        index_k = (O_k + PRIOR) / (X_k + PRIOR)        score = 100 × mean of the four indexes
     PRIOR = 2 multikills: as if every member had already made two of each kind at exactly the
     usual rate. Doubles, expected dozens of times, are soon the member's own; a pentakill, expected
     a fraction of a time, moves its index by a half at most (3 ÷ 2), the score by 12.5 points, so one lucky game cannot decide the
     board, and over hundreds of games a kind's weight approaches how rare it is (one more pentakill
     is worth about 85 more double kills over 500 games of a mid, about 4 over 12).

  4. Places (`rankMultikillScores`): 20 or more games with counts are ranked; 10–19 are provisional,
     listed after every ranked member; fewer, the board's last group with no score. Equal scores as
     shown share a place. The counts shown beside a score are always Riot's own.
*/

export const MULTIKILL_KEYS = ["double", "triple", "quadra", "penta"] as const;
export type MultikillKey = (typeof MULTIKILL_KEYS)[number];

/** How strongly a score leans toward 100: as if two multikills of each kind had been made at exactly the usual rate. */
export const MULTIKILL_PRIOR = 2;
/** The comparison players' games needed, all positions together, before a score is compared with them (see BASELINE_REASON). */
export const BASELINE_MIN_GAMES = 1000;
/** A role's rates lean toward every position's as if it had this many more games at their rates. */
export const ROLE_PRIOR_GAMES = 200;
/** A champion's tendency counts as if it had this many more games at the role's rates (it moves the role's rates by half at 50 games). */
export const CHAMPION_PRIOR_GAMES = 50;
/** Games with multikill counts for a place on the board. */
export const MULTIKILL_RANKED_GAMES = 20;
/** Games with multikill counts for a provisional score. */
export const MULTIKILL_PROVISIONAL_GAMES = 10;
/** Games with a triple kill the stored games need before they can tell how Riot counts. */
export const COUNTING_EVIDENCE_GAMES = 20;

/**
 * Why BASELINE_MIN_GAMES is 1,000 (docs/TEAM_LEADERBOARDS.md): at the rates usually seen (about one
 * double kill every two games, a triple every 15, a quadra every 100), 1,000 games hold about 500
 * double kills and 65 triple kills, so those rates are known within about 5% and 12% (1/√n), and about
 * 10 quadra kills, within about a third. With PRIOR's cushion, a rare kind's rate a third off moves a
 * 100-game member's score by under 4 points (the tests show it), against gaps of tens of points.
 */
export const BASELINE_REASON = "About 500 double and 65 triple kills at the usual rates: those rates are known within 5–12%.";

export type CountingRule = "nested" | "separate";

export interface CountingEvidence {
  /** Player-games (anyone's, in the same stored games) with at least one triple kill counted. */
  withTriple: number;
  /** Player-games whose counters nested counting could not give (more triples than doubles, and so on). */
  outOfOrder: number;
}

export interface CountingReading {
  rule: CountingRule;
  /** True when the stored games show the rule; false when it is assumed (too few games with a triple to tell). */
  shown: boolean;
  evidence: CountingEvidence;
}

/**
 * How Riot's counters count, read from the stored games: nested when at least 20 player-games
 * have a triple and under 1% of them break the nested order (a stray record cannot flip it), separate
 * when 10% or more do (separate counters break it in most games whose one multikill was a triple);
 * otherwise assumed nested, the reading that can never count a multikill twice.
 */
export function readCountingRule(evidence: CountingEvidence): CountingReading {
  const { withTriple, outOfOrder } = evidence;
  if (withTriple >= COUNTING_EVIDENCE_GAMES) {
    if (outOfOrder < withTriple * 0.01) return { rule: "nested", shown: true, evidence };
    if (outOfOrder >= withTriple * 0.1) return { rule: "separate", shown: true, evidence };
  }
  return { rule: "nested", shown: false, evidence };
}

/** True when one game's counters could not come from nested counting. */
export function breaksNestedOrder(c: MultikillCounts, largest?: number | null): boolean {
  if (c.triple > c.double || c.quadra > c.triple || c.penta > c.quadra) return true;
  if (typeof largest === "number") return (largest >= 3 && c.double === 0) || (largest >= 4 && c.triple === 0) || (largest >= 5 && c.quadra === 0);
  return false;
}

/**
 * One game's multikills, each once at its largest. Nested counters: a pentakill also counted a
 * double, a triple and a quadra, so the multikills that stopped at a double are doubles − triples,
 * and so on (never below zero). Separate counters already count each once.
 * Worked example, nested {double 2, triple 1, quadra 1, penta 1}: one double that stopped there and
 * one pentakill → {double 1, triple 0, quadra 0, penta 1}.
 */
export function multikillEvents(c: MultikillCounts, rule: CountingRule): MultikillCounts {
  if (rule === "separate") return { ...c };
  return { double: Math.max(0, c.double - c.triple), triple: Math.max(0, c.triple - c.quadra), quadra: Math.max(0, c.quadra - c.penta), penta: c.penta };
}

const ZERO = (): MultikillCounts => ({ double: 0, triple: 0, quadra: 0, penta: 0 });
const add = (a: MultikillCounts, b: MultikillCounts) => {
  for (const k of MULTIKILL_KEYS) a[k] += b[k];
  return a;
};
const total = (c: MultikillCounts) => c.double + c.triple + c.quadra + c.penta;

/** The comparison players' multikills in one group (a role, a role and champion, or everyone), each counted once (`multikillEvents`), under both readings. */
export interface BaselineGroup {
  games: number;
  /** Events under the nested reading (doubles − triples …, per game, never below zero). */
  nested: MultikillCounts;
  /** Events under the separate reading (the counters as they are). */
  separate: MultikillCounts;
}

/** One aggregate row of the comparison players: a position and champion, its games and both readings' events. */
export interface BaselineRow extends BaselineGroup {
  /** Riot's position as stored ("MIDDLE", "UTILITY", or the demo's "MID", "SUPPORT"); null when it has none. */
  position: string | null;
  championId: string | null;
}

export interface MultikillBaseline {
  /** Who the comparison is: the other players in the same stored games, or the team's own games (no other players' counts). */
  source: "same-games" | "team";
  reading: CountingReading;
  all: { games: number; events: MultikillCounts };
  roles: Partial<Record<GameRole, { games: number; events: MultikillCounts }>>;
  /** By `${role}|${championId}`. */
  champions: Record<string, { games: number; events: MultikillCounts }>;
}

const POSITION_ROLE: Readonly<Record<string, GameRole>> = { TOP: "TOP", JUNGLE: "JUNGLE", MIDDLE: "MID", MID: "MID", BOTTOM: "ADC", ADC: "ADC", UTILITY: "SUPPORT", SUPPORT: "SUPPORT" };
/** A stored position as a role (Riot's names and the demo's), or null. */
export const roleOfPosition = (position: string | null | undefined): GameRole | null => (position ? (POSITION_ROLE[position.toUpperCase()] ?? null) : null);

/** The comparison from its aggregate rows, read with the counting rule the stored games show. */
export function buildMultikillBaseline(rows: readonly BaselineRow[], evidence: CountingEvidence, source: MultikillBaseline["source"] = "same-games"): MultikillBaseline {
  const reading = readCountingRule(evidence);
  const all = { games: 0, events: ZERO() };
  const roles: MultikillBaseline["roles"] = {};
  const champions: MultikillBaseline["champions"] = {};
  for (const r of rows) {
    if (r.games <= 0) continue;
    const events = r[reading.rule];
    all.games += r.games;
    add(all.events, events);
    const role = roleOfPosition(r.position);
    if (!role) continue;
    const g = (roles[role] ??= { games: 0, events: ZERO() });
    g.games += r.games;
    add(g.events, events);
    if (r.championId) {
      const c = (champions[`${role}|${r.championId}`] ??= { games: 0, events: ZERO() });
      c.games += r.games;
      add(c.events, events);
    }
  }
  return { source, reading, all, roles, champions };
}

/** What a game is compared with: its role's players (200+ games of their own), every position together, or nothing reliable. */
export type ComparisonLevel = "role" | "all" | "none";

/**
 * The multikills per game expected of a game on this role and champion.
 *  - None while the comparison players have fewer than BASELINE_MIN_GAMES games in all (the page
 *    then compares with the team's own games, every position together, said as such).
 *  - Each kind's role rate leans toward every position's by ROLE_PRIOR_GAMES pseudo-games:
 *    (role's events + 200 × all positions' rate) ÷ (role's games + 200), so a rare kind in a small
 *    role is not read from a handful of games. The game counts as compared by role once the role
 *    has 200 games of its own (they then outweigh the lean); a game without a role, with every position.
 *  - A champion moves the role's rates by its own multikill tendency, leaning toward the role by
 *    CHAMPION_PRIOR_GAMES pseudo-games.
 * Worked example: a role at 0.5 multikills a game (doubles 0.4); a champion with 50 games and 40
 * multikills in it (0.8 a game): its factor is (40 + 50 × 0.5) ÷ ((50 + 50) × 0.5) = 1.3, so its
 * expected doubles are 0.4 × 1.3 = 0.52 a game.
 */
export function expectedRates(baseline: MultikillBaseline, role: GameRole | null, championId: string | null): { level: ComparisonLevel; rates: MultikillCounts } {
  const { all } = baseline;
  if (all.games <= 0 || (baseline.source === "same-games" && all.games < BASELINE_MIN_GAMES)) return { level: "none", rates: ZERO() };
  const rates = ZERO();
  for (const k of MULTIKILL_KEYS) rates[k] = all.events[k] / all.games;
  if (!role || baseline.source === "team") return { level: "all", rates };
  const group = baseline.roles[role] ?? { games: 0, events: ZERO() };
  for (const k of MULTIKILL_KEYS) rates[k] = (group.events[k] + ROLE_PRIOR_GAMES * rates[k]) / (group.games + ROLE_PRIOR_GAMES);
  const perGame = total(rates);
  const champ = championId ? baseline.champions[`${role}|${championId}`] : undefined;
  if (champ && perGame > 0) {
    const factor = (total(champ.events) + CHAMPION_PRIOR_GAMES * perGame) / ((champ.games + CHAMPION_PRIOR_GAMES) * perGame);
    for (const k of MULTIKILL_KEYS) rates[k] *= factor;
  }
  return { level: group.games >= ROLE_PRIOR_GAMES ? "role" : "all", rates };
}

/** One game of a member: its role and champion, and Riot's counters (null when its record has none: left out, never zero). */
export interface ScoreGame {
  role: GameRole | null;
  championId: string;
  counts: MultikillCounts | null;
}

export interface KindScore {
  /** The member's multikills of this kind, each once at its largest. */
  made: number;
  /** What the same roles and champions would make in these games. */
  expected: number;
  /** (made + PRIOR) ÷ (expected + PRIOR). */
  index: number;
}

export interface MemberScore {
  playerId: string;
  /** Games this season, with or without counts. */
  games: number;
  /** Games whose record has Riot's counts: the score comes from these only. */
  counted: number;
  /** Riot's own counters added up (what the page shows). */
  counts: MultikillCounts;
  /** Each multikill once at its largest (what the score counts). */
  events: MultikillCounts;
  kinds: Record<MultikillKey, KindScore>;
  /** Counted games compared within their role (the rest with every position's players, or the team's games). */
  roleGames: number;
  /** 100 × the mean of the four indexes, unrounded; null with no counted game or no comparison. */
  score: number | null;
  status: "ranked" | "provisional" | "not-enough";
}

/**
 * A member's multikill score over their games. Games without counts are left out (never zero).
 * Worked example: 40 games, role rates double 0.5, triple 0.06, quadra 0.01, penta 0.002 (no champion
 * data); made 26, 4, 1, 0 → expected 20, 2.4, 0.4, 0.08 → indexes 28/22 = 1.27, 6/4.4 = 1.36,
 * 3/2.4 = 1.25, 2/2.08 = 0.96 → score 100 × 4.85 ÷ 4 = 121.
 */
export function scoreMember(playerId: string, games: readonly ScoreGame[], baseline: MultikillBaseline): MemberScore {
  const counts = ZERO();
  const events = ZERO();
  const expected = ZERO();
  let counted = 0;
  let roleGames = 0;
  let compared = 0;
  for (const g of games) {
    if (!g.counts) continue;
    counted += 1;
    add(counts, g.counts);
    add(events, multikillEvents(g.counts, baseline.reading.rule));
    const { level, rates } = expectedRates(baseline, g.role, g.championId);
    if (level === "none") continue;
    compared += 1;
    if (level === "role") roleGames += 1;
    add(expected, rates);
  }
  const kinds = Object.fromEntries(MULTIKILL_KEYS.map((k) => [k, { made: events[k], expected: expected[k], index: (events[k] + MULTIKILL_PRIOR) / (expected[k] + MULTIKILL_PRIOR) }])) as Record<MultikillKey, KindScore>;
  // Every counted game needs a comparison: a score from part of them would not say what it counts.
  const score = counted > 0 && compared === counted ? (100 * MULTIKILL_KEYS.reduce((s, k) => s + kinds[k].index, 0)) / MULTIKILL_KEYS.length : null;
  const status = score === null || counted < MULTIKILL_PROVISIONAL_GAMES ? "not-enough" : counted < MULTIKILL_RANKED_GAMES ? "provisional" : "ranked";
  return { playerId, games: games.length, counted, counts, events, kinds, roleGames, score, status };
}

/** The score as the page shows it (whole points): places and ties use this. */
export const shownScore = (score: number) => Math.round(score);

export interface RankedScore extends MemberScore {
  /** Shared places repeat (1, 2, 2, 4); null for provisional and not-enough members. */
  place: number | null;
  tied: boolean;
}

/**
 * The board: ranked members by score (as shown), more counted games first on a tie, then by name;
 * provisional members after them in the same order; then the members with too few games, most
 * counted games first. Equal shown scores share a place.
 */
export function rankMultikillScores(scores: readonly MemberScore[], nameOf: (id: string) => string): RankedScore[] {
  const byScore = (a: MemberScore, b: MemberScore) => shownScore(b.score ?? 0) - shownScore(a.score ?? 0) || b.counted - a.counted || nameOf(a.playerId).localeCompare(nameOf(b.playerId));
  const ranked = scores.filter((s) => s.status === "ranked").sort(byScore);
  const provisional = scores.filter((s) => s.status === "provisional").sort(byScore);
  const rest = scores.filter((s) => s.status === "not-enough").sort((a, b) => b.counted - a.counted || b.games - a.games || nameOf(a.playerId).localeCompare(nameOf(b.playerId)));
  const placed: RankedScore[] = ranked.map((s) => {
    const shown = shownScore(s.score!);
    const first = ranked.findIndex((r) => shownScore(r.score!) === shown);
    const shared = ranked.filter((r) => shownScore(r.score!) === shown).length > 1;
    return { ...s, place: first + 1, tied: shared };
  });
  return [...placed, ...provisional.map((s) => ({ ...s, place: null, tied: false })), ...rest.map((s) => ({ ...s, place: null, tied: false }))];
}

/**
 * The comparison from the team's own games, for a season whose stored records hold no other
 * players' counts: every member's games together, every position at once (said so on the page:
 * it is not adjusted for role or champion).
 */
export function teamBaseline(games: ReadonlyArray<{ counts: MultikillCounts | null; largest?: number | null }>): MultikillBaseline {
  let withTriple = 0;
  let outOfOrder = 0;
  const row: BaselineRow = { position: null, championId: null, games: 0, nested: ZERO(), separate: ZERO() };
  for (const g of games) {
    if (!g.counts) continue;
    row.games += 1;
    if (g.counts.triple > 0) withTriple += 1;
    if (breaksNestedOrder(g.counts, g.largest)) outOfOrder += 1;
    add(row.nested, multikillEvents(g.counts, "nested"));
    add(row.separate, g.counts);
  }
  return buildMultikillBaseline([row], { withTriple, outOfOrder }, "team");
}

/**
 * Most of one kind (Riot's own counts): the highest count and every member who has it (a shared
 * record is shared, not decided by a rule nobody can see); none while nobody has one.
 */
export function mostOfKind(scores: readonly Pick<MemberScore, "playerId" | "counts">[], kind: MultikillKey): { count: number; holders: string[] } | null {
  const best = scores.reduce((m, s) => Math.max(m, s.counts[kind]), 0);
  if (best <= 0) return null;
  return { count: best, holders: scores.filter((s) => s.counts[kind] === best).map((s) => s.playerId) };
}
