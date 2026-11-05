import { benjaminiHochberg, compareStratified, erfc, twoSidedZ, Z_95, type StratifiedComparison, type Stratum } from "./stats/inference";
import { designStructure, fitLogistic, isEstimable, pointsFor, type GroupedRow } from "./stats/logistic";
import { MIN_VALID_DURATION_S, SEASON_MODES } from "./season-stats";
import { seasonOfGame } from "./season";

/*
  TEAM INSIGHTS: what the team's own games say about playing together, and which of it is more
  than chance (docs/TEAM_INSIGHTS.md).

  Three questions, each answered by comparing a member's record in two kinds of game:
  - With teammates or alone: games with at least one other member on their side, against games
    with no other member in the game.
  - With one teammate: games with this teammate on the side against games without them (alone or
    with others), with every other teammate's presence held equal (a logistic regression, below),
    so a teammate who often plays alongside a strong one is not credited with that teammate's games.
  - The team lately: sides with two or more members in the last 30 days, against the same kind of
    side earlier in the season.

  Rules, the same for every comparison:
  - Like with like: a member's games are only compared within the same game mode (queue) and the
    same role (Riot's position for that game). A difference made only by playing other roles or
    other modes in one kind of game disappears (Mantel–Haenszel, domain/stats/inference.ts; the
    regression has one intercept per mode and role).
  - One person is one member: several linked accounts in one game count once; a member seen on
    both sides of one game (two of their accounts against each other) is left out of that game. A
    game with members on both sides is left out of every comparison.
  - Who was in a game comes from each member's own stored game (its side) and from the stored match
    record (every player's account), so a teammate whose history does not reach back that far is
    still found. A game whose side cannot be read is left out and counted.
  - Supported Summoner's Rift queues of the season only; remakes (under five minutes) and games
    without a result are left out, as everywhere else in UNIIVERSE.
  - A comparison is tested only with at least MIN_GAMES_EACH_SIDE comparable games on each side.
    Every tested comparison counts towards the multiple-comparison adjustment (Benjamini–Hochberg
    at a 5% false discovery rate). A finding must also differ by at least five points, with its 95%
    interval clear of zero. A finding's interval is widened for the number of findings
    (Benjamini–Yekutieli false coverage).
  - Nothing is weighted, shrunk or predicted: a finding describes these games. Matchmaking adjusts
    opponents to results, and who plays together is chosen, so a difference never says why.
*/

/** Games needed on each side of a comparison (in strata with both sides) before it is tested. */
export const MIN_GAMES_EACH_SIDE = 20;
/** False discovery rate for the Benjamini–Hochberg adjustment. */
export const FALSE_DISCOVERY_RATE = 0.05;
/** A finding must differ by at least this much (win rate, 0–1) as well as pass the test. */
export const MIN_FINDING_DIFFERENCE = 0.05;
/** "Lately", for the team's record together. */
export const RECENT_DAYS = 30;
const DAY_MS = 86_400_000;

/** The supported 5v5 Summoner's Rift queues (all season modes). */
export const INSIGHT_QUEUES: ReadonlySet<number> = new Set(SEASON_MODES.find((m) => m.key === "all")!.queues);

/** One stored game of one member's linked account. */
export interface InsightGame {
  matchId: string;
  playerId: string;
  queueId: number | null;
  /** Riot's position for the game (TOP | JUNGLE | MID | ADC | SUPPORT), else null or UNKNOWN. */
  role: string | null;
  win: boolean | null;
  gameCreation: number;
  durationS: number | null;
  patch: string | null;
}

/** A current member found in a game's stored record, with the side they played on. */
export interface InsightPresence {
  matchId: string;
  playerId: string;
  /** 100 or 200. */
  teamId: number;
}

export type ComparisonKind = "with-team" | "with-teammate" | "team-recent";
export type UntestedReason = "too-few-games" | "inseparable" | "no-fit" | "no-others";

export interface InsightComparison {
  /** Stable key: "with-team:<player>", "with-teammate:<player>:<teammate>", "team-recent". */
  id: string;
  kind: ComparisonKind;
  /**
   * How the difference was formed: Mantel–Haenszel within mode and role (with-team, team-recent),
   * or the regression against the other teammates, every other teammate held equal (with-teammate). Either way `difference`,
   * `low` and `high` are win-rate points (0–1) and `pValue` is two-sided.
   */
  method: "mantel-haenszel" | "logistic";
  /** The member whose games are compared (null for the team's record). */
  playerId: string | null;
  /** The teammate asked about (with-teammate only). */
  teammateId: string | null;
  result: StratifiedComparison;
  /** Whether it had enough comparable games on each side to be tested (and, for the regression, a stable fit). */
  tested: boolean;
  /**
   * Why it was not tested: too few comparable games; a teammate whose effect these games cannot
   * tell apart from other teammates' (always together, or in a fixed pattern); a fit the games
   * cannot support (every game with them won, say); or no other teammate to compare with.
   */
  untestedReason: UntestedReason | null;
  /** Benjamini–Hochberg adjusted p-value among every tested comparison; null when not tested. */
  qValue: number | null;
  /** Tested, adjusted value within the false discovery rate, a difference of five points or more, and a 95% interval clear of zero. */
  finding: boolean;
  /**
   * The interval the page shows: a finding's is widened for the number of findings (false
   * coverage), every other tested comparison's is its 95% interval.
   */
  shown: { low: number; high: number; adjusted: boolean } | null;
  /** The first and last game the comparison used (any side), ms. */
  from: number | null;
  to: number | null;
}

export interface ExcludedGames {
  /** A member's games outside the season, outside the supported queues, remakes or without a result. */
  ineligible: number;
  /** Eligible games whose side could not be read: no side on the member's stored game and no stored record listing them. */
  unknownSide: number;
  /** Games where one member's accounts were on both sides. */
  bothSides: number;
}

export interface TeamInsights {
  season: number;
  /** Members whose games were read. */
  members: number;
  /** One per member per game: the games every comparison draws from. */
  memberGames: number;
  /** Distinct games among them (a game several members played counts once). */
  matches: number;
  /** Games with two or more members on one side (each side of a match once). */
  teamGames: number;
  /** Every comparison that could be formed, tested or not, findings first. */
  comparisons: InsightComparison[];
  /** How many were tested (the adjustment's count). */
  tested: number;
  /** The findings, strongest evidence first. */
  findings: InsightComparison[];
  /**
   * About how large a difference (points, 0–1) has to be before it can stand out: the median, over
   * the tested comparisons, of the half-width of the interval at the level a single finding must
   * reach after the adjustment, and never less than the five-point floor. Null when nothing was tested.
   */
  typicalMargin: number | null;
  excluded: ExcludedGames;
  /** First and last eligible game read, ms. */
  from: number | null;
  to: number | null;
}

/** A member's eligible game, with who else was in it. */
interface MemberGame {
  matchId: string;
  playerId: string;
  queueId: number;
  role: string;
  win: boolean;
  gameCreation: number;
  teamId: number;
  /** Other members on the same side. */
  teammates: ReadonlySet<string>;
  /** Other members on the other side. */
  opponents: ReadonlySet<string>;
}

const ROLE_KEYS = new Set(["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"]);

/** Whether a stored game can be compared at all (before who was in it is known). */
export function isEligibleInsightGame(g: InsightGame, season: number): boolean {
  return (
    g.queueId !== null &&
    INSIGHT_QUEUES.has(g.queueId) &&
    g.win !== null &&
    // A remake is a known short game; an unknown duration is not a remake (as on Leaderboards).
    (g.durationS === null || g.durationS >= MIN_VALID_DURATION_S) &&
    seasonOfGame(g.patch, g.gameCreation) === season
  );
}

/**
 * Each member's eligible games (one per match), with the members on each side read from the
 * presences (their own stored games' sides and the stored records). Pure; the input order does not matter.
 */
export function memberGamesOf(games: readonly InsightGame[], presences: readonly InsightPresence[], season: number): { games: MemberGame[]; excluded: ExcludedGames } {
  const excluded: ExcludedGames = { ineligible: 0, unknownSide: 0, bothSides: 0 };
  // Who was in each match, and on which sides (a member can appear twice through two accounts).
  const sidesOf = new Map<string, Map<string, Set<number>>>();
  for (const p of presences) {
    if (p.teamId !== 100 && p.teamId !== 200) continue;
    const m = sidesOf.get(p.matchId) ?? new Map<string, Set<number>>();
    const s = m.get(p.playerId) ?? new Set<number>();
    s.add(p.teamId);
    m.set(p.playerId, s);
    sidesOf.set(p.matchId, m);
  }
  // One game per member per match: the earliest stored row (two accounts in one game are one game).
  const seen = new Set<string>();
  const out: MemberGame[] = [];
  const ordered = [...games].sort((a, b) => a.gameCreation - b.gameCreation || a.matchId.localeCompare(b.matchId) || a.playerId.localeCompare(b.playerId));
  for (const g of ordered) {
    const key = `${g.matchId}|${g.playerId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!isEligibleInsightGame(g, season)) {
      excluded.ineligible += 1;
      continue;
    }
    const inMatch = sidesOf.get(g.matchId);
    const own = inMatch?.get(g.playerId);
    if (!inMatch || !own || own.size === 0) {
      excluded.unknownSide += 1;
      continue;
    }
    if (own.size > 1) {
      excluded.bothSides += 1;
      continue;
    }
    const teamId = [...own][0]!;
    const teammates = new Set<string>();
    const opponents = new Set<string>();
    for (const [playerId, sides] of inMatch) {
      if (playerId === g.playerId) continue;
      // A member on both sides is no one's teammate (and is left out of their own games above).
      if (sides.size > 1) opponents.add(playerId);
      else if (sides.has(teamId)) teammates.add(playerId);
      else opponents.add(playerId);
    }
    out.push({
      matchId: g.matchId,
      playerId: g.playerId,
      queueId: g.queueId!,
      role: g.role && ROLE_KEYS.has(g.role) ? g.role : "UNKNOWN",
      win: g.win!,
      gameCreation: g.gameCreation,
      teamId,
      teammates,
      opponents,
    });
  }
  return { games: out, excluded };
}

/** Builds strata from labelled games; a game labelled null is left out. */
function stratify<T>(items: readonly T[], label: (x: T) => "exposed" | "other" | null, stratumOf: (x: T) => string, win: (x: T) => boolean, when: (x: T) => number): { strata: Stratum[]; from: number | null; to: number | null } {
  const byKey = new Map<string, Stratum>();
  let from: number | null = null;
  let to: number | null = null;
  for (const x of items) {
    const side = label(x);
    if (!side) continue;
    const k = stratumOf(x);
    const s = byKey.get(k) ?? { exposedWins: 0, exposedGames: 0, otherWins: 0, otherGames: 0 };
    if (side === "exposed") {
      s.exposedGames += 1;
      if (win(x)) s.exposedWins += 1;
    } else {
      s.otherGames += 1;
      if (win(x)) s.otherWins += 1;
    }
    byKey.set(k, s);
    const t = when(x);
    from = from === null ? t : Math.min(from, t);
    to = to === null ? t : Math.max(to, t);
  }
  return { strata: [...byKey.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, s]) => s), from, to };
}

const roleStratum = (g: MemberGame) => `${g.queueId}|${g.role}`;

/** One side of a match with two or more members on it: the unit of the team's own record. */
interface TeamGame {
  matchId: string;
  teamId: number;
  queueId: number;
  win: boolean;
  gameCreation: number;
}

function teamGamesOf(games: readonly MemberGame[]): TeamGame[] {
  const out = new Map<string, TeamGame>();
  for (const g of games) {
    // A match with members on both sides is one win and one loss for the team: left out.
    if (g.teammates.size === 0 || g.opponents.size > 0) continue;
    const key = `${g.matchId}|${g.teamId}`;
    if (!out.has(key)) out.set(key, { matchId: g.matchId, teamId: g.teamId, queueId: g.queueId, win: g.win, gameCreation: g.gameCreation });
  }
  return [...out.values()];
}

/** Teammates with fewer games than this together (in the regression's games) are pooled as one "other teammate". */
const MODEL_MIN_GAMES = 5;

/** Interval ends (points) at a given z, for comparisons whose interval can be redrawn after the adjustment. */
type IntervalAt = (z: number) => { low: number; high: number };

/**
 * One member's teammates: among the member's games with no member against them (alone or with
 * teammates), a logistic regression of the result on one intercept per game mode and role and one
 * indicator per teammate with at least MODEL_MIN_GAMES games together (the others pooled as one).
 * A teammate's figure is their own coefficient: "with this teammate on the side, against without
 * them, every other teammate's presence held equal". So a teammate who often plays alongside a
 * strong one is not credited with that teammate's games, and a strong one does not make the others
 * look weak. Effects add up on the log-odds scale, and a general "playing with teammates" effect
 * shows in every teammate's figure (the with-teammates comparison measures it on its own).
 *
 * Which figures the games can estimate is decided exactly, from the design's null space: two
 * teammates who always play together, or a member with no games without teammates in a mode and
 * role, are reported as not separable, and stay in the model so the others are held equal to them.
 * Teammates below the minimum comparable games are listed, untested, with their raw records.
 */
function teammateComparisons(playerId: string, mine: readonly MemberGame[], ids: readonly string[], intervals: Map<string, IntervalAt>): Array<Omit<InsightComparison, "qValue" | "finding" | "shown">> {
  const usable = mine.filter((g) => g.opponents.size === 0);
  const mates = ids.filter((id) => id !== playerId && usable.some((g) => g.teammates.has(id)));
  if (mates.length === 0) return [];
  // Strata where the result varies: a stratum of only wins (or only losses) says nothing about
  // who made the difference, and would have no finite intercept.
  const outcomes = new Map<string, Set<boolean>>();
  for (const g of usable) outcomes.set(roleStratum(g), (outcomes.get(roleStratum(g)) ?? new Set<boolean>()).add(g.win));
  const games = usable.filter((g) => outcomes.get(roleStratum(g))!.size === 2);

  // Comparable games for a teammate: in the modes and roles where the member played both with and without them.
  const comparable = (id: string) => {
    const byStratum = new Map<string, { with: number; without: number }>();
    for (const g of games) {
      const s = byStratum.get(roleStratum(g)) ?? { with: 0, without: 0 };
      if (g.teammates.has(id)) s.with += 1;
      else s.without += 1;
      byStratum.set(roleStratum(g), s);
    }
    let w = 0;
    let wo = 0;
    for (const s of byStratum.values()) {
      if (s.with > 0 && s.without > 0) {
        w += s.with;
        wo += s.without;
      }
    }
    return { with: w, without: wo };
  };
  const raw = (id: string) => {
    const withIt = usable.filter((g) => g.teammates.has(id));
    const without = usable.filter((g) => !g.teammates.has(id));
    return { with: withIt.length, withWins: withIt.filter((g) => g.win).length, without: without.length, withoutWins: without.filter((g) => g.win).length };
  };
  const together = (id: string) => games.filter((g) => g.teammates.has(id)).length;
  const modelled = mates.filter((id) => together(id) >= MODEL_MIN_GAMES).sort((a, b) => together(b) - together(a) || a.localeCompare(b));
  const pooledIds = new Set(mates.filter((id) => !modelled.includes(id)));
  const pooledPresent = (g: MemberGame) => [...g.teammates].some((id) => pooledIds.has(id));
  const pooled = games.filter(pooledPresent).length >= MODEL_MIN_GAMES;

  // Design: strata intercepts, the pooled teammates, then each modelled teammate.
  const strataKeys = [...new Set(games.map(roleStratum))].sort();
  const columns = strataKeys.length + (pooled ? 1 : 0) + modelled.length;
  const firstMate = strataKeys.length + (pooled ? 1 : 0);
  const xOf = (g: MemberGame): number[] => [...strataKeys.map((k) => (k === roleStratum(g) ? 1 : 0)), ...(pooled ? [pooledPresent(g) ? 1 : 0] : []), ...modelled.map((id) => (g.teammates.has(id) ? 1 : 0))];
  const grouped = new Map<string, { x: number[]; wins: number; games: number }>();
  for (const g of games) {
    const x = xOf(g);
    const key = x.join("");
    const row = grouped.get(key) ?? { x, wins: 0, games: 0 };
    row.games += 1;
    if (g.win) row.wins += 1;
    grouped.set(key, row);
  }
  const rows = [...grouped.values()];
  const structure = modelled.length ? designStructure(rows.map((r) => r.x), columns) : { pivots: [], nullSpace: [] };
  const fit = modelled.length && structure.pivots.length ? fitLogistic(rows.map((r): GroupedRow => ({ x: structure.pivots.map((c) => r.x[c]!), wins: r.wins, games: r.games }))) : null;
  // The fitted coefficients on every column (zero on the columns the pivots already explain) and their covariance.
  const theta = new Array<number>(columns).fill(0);
  const cov = Array.from({ length: columns }, () => new Array<number>(columns).fill(0));
  if (fit) {
    structure.pivots.forEach((c, i) => {
      theta[c] = fit.coefficients[i]!;
      structure.pivots.forEach((d, j) => {
        cov[c]![d] = fit.covariance[i]![j]!;
      });
    });
  }
  const linear = (x: readonly number[]) => x.reduce((s, v, i) => s + v * theta[i]!, 0);
  const span = usable.length ? { from: Math.min(...usable.map((g) => g.gameCreation)), to: Math.max(...usable.map((g) => g.gameCreation)) } : { from: null, to: null };

  return mates.map((teammateId) => {
    const r = raw(teammateId);
    const c = comparable(teammateId);
    const base: StratifiedComparison = {
      exposed: { wins: r.withWins, games: r.with },
      other: { wins: r.withoutWins, games: r.without },
      informativeStrata: 0,
      comparedGames: { exposed: c.with, other: c.without },
      difference: null,
      low: null,
      high: null,
      pValue: null,
      se: null,
    };
    const common = { id: `with-teammate:${playerId}:${teammateId}`, kind: "with-teammate" as const, method: "logistic" as const, playerId, teammateId, from: span.from, to: span.to };
    const untested = (reason: UntestedReason) => ({ ...common, result: base, tested: false, untestedReason: reason });
    if (c.with < MIN_GAMES_EACH_SIDE || c.without < MIN_GAMES_EACH_SIDE) return untested("too-few-games");
    const j = modelled.indexOf(teammateId);
    if (j === -1) return untested("no-others");
    const l = new Array<number>(columns).fill(0);
    l[firstMate + j] = 1;
    if (!isEstimable(l, structure.nullSpace)) return untested("inseparable");
    if (!fit) return untested("no-fit");
    const estimate = theta[firstMate + j]!;
    const se = Math.sqrt(Math.max(0, cov[firstMate + j]![firstMate + j]!));
    if (!Number.isFinite(estimate) || !Number.isFinite(se) || se === 0 || Math.abs(estimate) > 10) return untested("no-fit");
    // The games with this teammate, as if they had not been there (everything else equal).
    const without = games.filter((g) => g.teammates.has(teammateId)).map((g) => linear(xOf(g)) - estimate);
    const at: IntervalAt = (z) => ({ low: pointsFor(without, estimate - z * se), high: pointsFor(without, estimate + z * se) });
    intervals.set(common.id, at);
    const ci = at(Z_95);
    const result: StratifiedComparison = {
      ...base,
      informativeStrata: new Set(games.filter((g) => g.teammates.has(teammateId)).map(roleStratum)).size,
      difference: pointsFor(without, estimate),
      low: ci.low,
      high: ci.high,
      pValue: Math.min(1, erfc(Math.abs(estimate / se) / Math.SQRT2)),
      se: (ci.high - ci.low) / (2 * Z_95),
    };
    return { ...common, result, tested: true, untestedReason: null };
  });
}

/**
 * Every comparison the members' games allow, which were tested, and which are findings.
 * `now` decides "lately"; `memberIds` are the current members (anyone else in the input is ignored).
 */
export function teamInsights(input: { games: readonly InsightGame[]; presences: readonly InsightPresence[]; memberIds: readonly string[]; season: number; now: number }): TeamInsights {
  const members = new Set(input.memberIds);
  const { games, excluded } = memberGamesOf(
    input.games.filter((g) => members.has(g.playerId)),
    input.presences.filter((p) => members.has(p.playerId)),
    input.season,
  );
  const ids = [...members].sort();
  const intervals = new Map<string, IntervalAt>();
  const comparisons: Array<Omit<InsightComparison, "qValue" | "finding" | "shown">> = [];
  const addStratified = (kind: ComparisonKind, id: string, playerId: string | null, built: { strata: Stratum[]; from: number | null; to: number | null }) => {
    const result = compareStratified(built.strata);
    const enough = result.difference !== null && result.comparedGames.exposed >= MIN_GAMES_EACH_SIDE && result.comparedGames.other >= MIN_GAMES_EACH_SIDE;
    if (enough && result.se !== null) {
      const d = result.difference!;
      const se = result.se;
      intervals.set(id, (z) => ({ low: Math.max(-1, d - z * se), high: Math.min(1, d + z * se) }));
    }
    comparisons.push({ id, kind, method: "mantel-haenszel", playerId, teammateId: null, result, tested: enough, untestedReason: enough ? null : "too-few-games", from: built.from, to: built.to });
  };

  for (const playerId of ids) {
    const mine = games.filter((g) => g.playerId === playerId);
    if (mine.length === 0) continue;
    // A game with members on both sides is neither "with teammates" nor "alone".
    addStratified(
      "with-team",
      `with-team:${playerId}`,
      playerId,
      stratify(mine, (g) => (g.opponents.size > 0 ? null : g.teammates.size > 0 ? "exposed" : "other"), roleStratum, (g) => g.win, (g) => g.gameCreation),
    );
    comparisons.push(...teammateComparisons(playerId, mine, ids, intervals));
  }

  const team = teamGamesOf(games);
  const since = input.now - RECENT_DAYS * DAY_MS;
  if (team.length > 0) {
    addStratified(
      "team-recent",
      "team-recent",
      null,
      stratify(team, (t) => (t.gameCreation >= since ? "exposed" : "other"), (t) => String(t.queueId), (t) => t.win, (t) => t.gameCreation),
    );
  }

  const q = benjaminiHochberg(comparisons.map((c) => (c.tested ? c.result.pValue : null)));
  const tested = comparisons.filter((c) => c.tested).length;
  const isFinding = (c: (typeof comparisons)[number], qValue: number | null) =>
    c.tested && qValue !== null && qValue <= FALSE_DISCOVERY_RATE && Math.abs(c.result.difference!) >= MIN_FINDING_DIFFERENCE && (c.result.low! > 0 || c.result.high! < 0);
  const findingsCount = comparisons.filter((c, i) => isFinding(c, q[i] ?? null)).length;
  // Benjamini–Yekutieli: the findings' intervals at level 1 − R·q/m, so their stated confidence
  // allows for their having been picked out of m comparisons.
  const zFindings = findingsCount ? twoSidedZ((findingsCount * FALSE_DISCOVERY_RATE) / tested) : Z_95;
  const all: InsightComparison[] = comparisons.map((c, i) => {
    const qValue = q[i] ?? null;
    const finding = isFinding(c, qValue);
    const at = intervals.get(c.id);
    const shown = !c.tested || !at ? null : finding ? { ...at(Math.max(Z_95, zFindings)), adjusted: true } : { low: c.result.low!, high: c.result.high!, adjusted: false };
    return { ...c, qValue, finding, shown };
  });
  const strongestFirst = (a: InsightComparison, b: InsightComparison) =>
    Number(b.finding) - Number(a.finding) || Number(b.tested) - Number(a.tested) || (a.qValue ?? 2) - (b.qValue ?? 2) || Math.abs(b.result.difference ?? 0) - Math.abs(a.result.difference ?? 0) || a.id.localeCompare(b.id);
  all.sort(strongestFirst);
  // What a lone finding needs: p ≤ q/m after the adjustment.
  const zLone = tested ? twoSidedZ(FALSE_DISCOVERY_RATE / tested) : Z_95;
  const margins = all
    .filter((c) => c.tested && intervals.has(c.id))
    .map((c) => {
      const r = intervals.get(c.id)!(zLone);
      return (r.high - r.low) / 2;
    })
    .sort((a, b) => a - b);
  const median = margins.length ? (margins.length % 2 ? margins[(margins.length - 1) / 2]! : (margins[margins.length / 2 - 1]! + margins[margins.length / 2]!) / 2) : null;
  const times = games.map((g) => g.gameCreation);
  return {
    season: input.season,
    members: new Set(games.map((g) => g.playerId)).size,
    memberGames: games.length,
    matches: new Set(games.map((g) => g.matchId)).size,
    teamGames: team.length,
    comparisons: all,
    tested,
    findings: all.filter((c) => c.finding),
    typicalMargin: median === null ? null : Math.max(MIN_FINDING_DIFFERENCE, median),
    excluded,
    from: times.length ? Math.min(...times) : null,
    to: times.length ? Math.max(...times) : null,
  };
}

/** For the page: a teammate finding and its mirror (the same pair seen from the other member), as one item. */
export function pairedFindings(findings: readonly InsightComparison[]): Array<{ lead: InsightComparison; mirror: InsightComparison | null }> {
  const used = new Set<string>();
  const out: Array<{ lead: InsightComparison; mirror: InsightComparison | null }> = [];
  for (const f of findings) {
    if (used.has(f.id)) continue;
    used.add(f.id);
    if (f.kind !== "with-teammate") {
      out.push({ lead: f, mirror: null });
      continue;
    }
    const mirrorId = `with-teammate:${f.teammateId}:${f.playerId}`;
    const mirror = findings.find((x) => x.id === mirrorId) ?? null;
    if (mirror) used.add(mirror.id);
    out.push({ lead: f, mirror });
  }
  return out;
}
