import { benjaminiHochberg, compareStratified, Z_95, type StratifiedComparison, type Stratum } from "./stats/inference";
import { fitLogistic, pointsFor, type GroupedRow } from "./stats/logistic";
import { MIN_VALID_DURATION_S, SEASON_MODES } from "./season-stats";
import { seasonOfGame } from "./season";

/*
  TEAM INSIGHTS: what the team's own games say about playing together, and which of it is more
  than chance (docs/TEAM_INSIGHTS.md).

  Three questions, each answered by comparing a member's record in two kinds of game:
  - With teammates or alone: games with at least one other member on their side, against games
    with no other member in the game at all.
  - With one teammate: among a member's games with teammates, the association of each teammate
    being on their side with the result, every other teammate's presence held fixed (a logistic
    regression, domain/stats/logistic.ts). Comparing within games with teammates keeps "playing
    with the team" apart from "playing with this person", and holding the others fixed keeps one
    strong teammate from making everyone else look weak by their absence.
  - The team lately: games with two or more members on one side in the last 30 days, against the
    same kind of game earlier in the season.

  Rules, the same for every comparison:
  - Like with like: a member's games are only compared within the same game mode (queue) and the
    same role (Riot's position for that game). A difference made only by playing other roles or
    other modes in one kind of game disappears (Mantel–Haenszel, domain/stats/inference.ts; the
    regression has one intercept per mode and role).
  - One person is one member: several linked accounts in one game count once; a member seen on
    both sides of one game (two of their accounts against each other) is left out of that game.
  - Who was in a game is read from the stored match record (every player's account), not from
    the other members' own histories, so a teammate whose history does not reach back that far
    is still found. A game without its stored record is left out and counted.
  - Supported Summoner's Rift queues of the season only; remakes (under five minutes) and games
    without a result are left out, as everywhere else in UNIIVERSE.
  - A comparison is tested only with at least MIN_GAMES_EACH_SIDE comparable games on each side.
    Every tested comparison counts towards the multiple-comparison adjustment (Benjamini–Hochberg
    at a 5% false discovery rate), and a finding must also differ by at least five points.
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

export interface InsightComparison {
  /** Stable key: "with-team:<player>", "with-teammate:<player>:<teammate>", "team-recent". */
  id: string;
  kind: ComparisonKind;
  /**
   * How the difference was formed: Mantel–Haenszel within mode and role (with-team, team-recent),
   * or the regression with the other teammates held fixed (with-teammate). Either way `difference`,
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
  /** Why it was not tested, when it was not. */
  untestedReason: "too-few-games" | "inseparable" | null;
  /** Benjamini–Hochberg adjusted p-value among every tested comparison; null when not tested. */
  qValue: number | null;
  /** Tested, adjusted value within the false discovery rate, and a difference of five points or more. */
  finding: boolean;
  /** The first and last game the comparison used (any side), ms. */
  from: number | null;
  to: number | null;
}

export interface ExcludedGames {
  /** A member's games outside the season, outside the supported queues, remakes or without a result. */
  ineligible: number;
  /** Eligible games whose stored match record has no entry for the member (no record stored yet). */
  noRecord: number;
  /** Games where one member's accounts were on both sides. */
  bothSides: number;
}

export interface TeamInsights {
  season: number;
  /** Members whose games were read. */
  members: number;
  /** One per member per game: the games every comparison draws from. */
  memberGames: number;
  /** Games with two or more members on one side (each side of a match once). */
  teamGames: number;
  /** Every comparison that could be formed, tested or not, findings first. */
  comparisons: InsightComparison[];
  /** How many were tested (the adjustment's count). */
  tested: number;
  /** The findings, strongest evidence first. */
  findings: InsightComparison[];
  /**
   * The median half-width (points, 0–1) of the tested comparisons' 95% intervals: about how large a
   * difference has to be before these games can tell it from chance. Null when nothing was tested.
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
 * stored records' presences. Pure; the input order does not matter.
 */
export function memberGamesOf(games: readonly InsightGame[], presences: readonly InsightPresence[], season: number): { games: MemberGame[]; excluded: ExcludedGames } {
  const excluded: ExcludedGames = { ineligible: 0, noRecord: 0, bothSides: 0 };
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
      excluded.noRecord += 1;
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
    if (g.teammates.size === 0) continue;
    const key = `${g.matchId}|${g.teamId}`;
    if (!out.has(key)) out.set(key, { matchId: g.matchId, teamId: g.teamId, queueId: g.queueId, win: g.win, gameCreation: g.gameCreation });
  }
  return [...out.values()];
}

/**
 * One member's teammates, compared at once: among their games with teammates (and no member
 * against them), a logistic regression of the result on one intercept per game mode and role and
 * one indicator per teammate with enough games both with and without them. Teammates below the
 * minimum are listed, untested, with their raw records.
 */
function teammateComparisons(playerId: string, mine: readonly MemberGame[], ids: readonly string[]): Array<Omit<InsightComparison, "qValue" | "finding">> {
  const teamGames = mine.filter((g) => g.teammates.size > 0 && g.opponents.size === 0);
  const mates = ids.filter((id) => id !== playerId && teamGames.some((g) => g.teammates.has(id)));
  if (mates.length === 0) return [];
  // Strata where the result varies: a stratum of only wins (or only losses) says nothing about
  // who made the difference, and would have no finite intercept.
  const outcomes = new Map<string, Set<boolean>>();
  for (const g of teamGames) outcomes.set(roleStratum(g), (outcomes.get(roleStratum(g)) ?? new Set<boolean>()).add(g.win));
  const informative = teamGames.filter((g) => outcomes.get(roleStratum(g))!.size === 2);
  const counts = (games: readonly MemberGame[], id: string) => {
    const withIt = games.filter((g) => g.teammates.has(id));
    return { with: withIt.length, withWins: withIt.filter((g) => g.win).length, without: games.length - withIt.length, withoutWins: games.filter((g) => !g.teammates.has(id) && g.win).length };
  };
  const candidates = mates.filter((id) => {
    const c = counts(informative, id);
    return c.with >= MIN_GAMES_EACH_SIDE && c.without >= MIN_GAMES_EACH_SIDE;
  });

  const strataKeys = [...new Set(informative.map(roleStratum))].sort();
  const fit = candidates.length ? fitGrouped(informative, strataKeys, candidates) : null;
  const span = (games: readonly MemberGame[]) => (games.length ? { from: Math.min(...games.map((g) => g.gameCreation)), to: Math.max(...games.map((g) => g.gameCreation)) } : { from: null, to: null });
  const { from, to } = span(teamGames);

  return mates.map((teammateId) => {
    const raw = counts(teamGames, teammateId);
    const inModel = counts(informative, teammateId);
    const base: StratifiedComparison = {
      exposed: { wins: raw.withWins, games: raw.with },
      other: { wins: raw.withoutWins, games: raw.without },
      informativeStrata: 0,
      comparedGames: { exposed: inModel.with, other: inModel.without },
      difference: null,
      low: null,
      high: null,
      pValue: null,
    };
    const common = { id: `with-teammate:${playerId}:${teammateId}`, kind: "with-teammate" as const, method: "logistic" as const, playerId, teammateId, from, to };
    const j = candidates.indexOf(teammateId);
    if (j === -1) return { ...common, result: base, tested: false, untestedReason: "too-few-games" as const };
    const coefficient = fit?.coefficients[strataKeys.length + j];
    const se = fit?.standardErrors[strataKeys.length + j];
    if (!fit || coefficient === undefined || se === undefined || !Number.isFinite(coefficient) || Math.abs(coefficient) > 10) {
      return { ...common, result: base, tested: false, untestedReason: "inseparable" as const };
    }
    // The fitted log-odds of each game with this teammate, without their coefficient.
    const without = informative.filter((g) => g.teammates.has(teammateId)).map((g) => linear(fit.coefficients, strataKeys, candidates, g) - coefficient);
    const result: StratifiedComparison = {
      ...base,
      informativeStrata: new Set(informative.filter((g) => g.teammates.has(teammateId)).map(roleStratum)).size,
      difference: pointsFor(without, coefficient),
      low: pointsFor(without, coefficient - Z_95 * se),
      high: pointsFor(without, coefficient + Z_95 * se),
      pValue: fit.pValues[strataKeys.length + j]!,
    };
    return { ...common, result, tested: true, untestedReason: null };
  });
}

function linear(beta: readonly number[], strataKeys: readonly string[], candidates: readonly string[], g: MemberGame): number {
  let eta = beta[strataKeys.indexOf(roleStratum(g))]!;
  candidates.forEach((id, j) => {
    if (g.teammates.has(id)) eta += beta[strataKeys.length + j]!;
  });
  return eta;
}

/** Groups the games by stratum and teammate pattern, and fits the regression. */
function fitGrouped(games: readonly MemberGame[], strataKeys: readonly string[], candidates: readonly string[]) {
  const rows = new Map<string, GroupedRow & { x: number[] }>();
  for (const g of games) {
    const x = [...strataKeys.map((k) => (k === roleStratum(g) ? 1 : 0)), ...candidates.map((id) => (g.teammates.has(id) ? 1 : 0))];
    const key = x.join("");
    const row = rows.get(key) ?? { x, wins: 0, games: 0 };
    row.games += 1;
    if (g.win) row.wins += 1;
    rows.set(key, row);
  }
  return fitLogistic([...rows.values()]);
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
  const comparisons: Array<Omit<InsightComparison, "qValue" | "finding">> = [];
  const addStratified = (kind: ComparisonKind, id: string, playerId: string | null, built: { strata: Stratum[]; from: number | null; to: number | null }) => {
    const result = compareStratified(built.strata);
    const enough = result.difference !== null && result.comparedGames.exposed >= MIN_GAMES_EACH_SIDE && result.comparedGames.other >= MIN_GAMES_EACH_SIDE;
    comparisons.push({ id, kind, method: "mantel-haenszel", playerId, teammateId: null, result, tested: enough, untestedReason: enough ? null : "too-few-games", from: built.from, to: built.to });
  };

  for (const playerId of ids) {
    const mine = games.filter((g) => g.playerId === playerId);
    if (mine.length === 0) continue;
    addStratified(
      "with-team",
      `with-team:${playerId}`,
      playerId,
      stratify(mine, (g) => (g.teammates.size > 0 ? "exposed" : g.opponents.size === 0 ? "other" : null), roleStratum, (g) => g.win, (g) => g.gameCreation),
    );
    comparisons.push(...teammateComparisons(playerId, mine, ids));
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
  const all: InsightComparison[] = comparisons.map((c, i) => {
    const qValue = q[i] ?? null;
    const finding = c.tested && qValue !== null && qValue <= FALSE_DISCOVERY_RATE && Math.abs(c.result.difference!) >= MIN_FINDING_DIFFERENCE;
    return { ...c, qValue, finding };
  });
  const strongestFirst = (a: InsightComparison, b: InsightComparison) =>
    Number(b.finding) - Number(a.finding) || Number(b.tested) - Number(a.tested) || (a.qValue ?? 2) - (b.qValue ?? 2) || Math.abs(b.result.difference ?? 0) - Math.abs(a.result.difference ?? 0) || a.id.localeCompare(b.id);
  all.sort(strongestFirst);
  const margins = all
    .filter((c) => c.tested)
    .map((c) => (c.result.high! - c.result.low!) / 2)
    .sort((a, b) => a - b);
  const median = margins.length ? (margins.length % 2 ? margins[(margins.length - 1) / 2]! : (margins[margins.length / 2 - 1]! + margins[margins.length / 2]!) / 2) : null;
  const times = games.map((g) => g.gameCreation);
  return {
    season: input.season,
    members: new Set(games.map((g) => g.playerId)).size,
    memberGames: games.length,
    teamGames: team.length,
    comparisons: all,
    tested: all.filter((c) => c.tested).length,
    findings: all.filter((c) => c.finding),
    typicalMargin: median,
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
