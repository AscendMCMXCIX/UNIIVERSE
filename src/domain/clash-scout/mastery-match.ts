import { formatCount, formatDayMonth } from "@/lib/format";
import { formatMastery } from "./mastery-input";

/*
  WHO IS BEHIND A NAME, BY CHAMPION MASTERY: how what a Clash screen showed (or a tester entered)
  compares with what is known of an account, as plain facts and a category, never a percentage.
  The same rules serve Clash Scout's candidates and the Testing Lab (server/clash/identify.ts).

  The facts the rules rest on (Riot's, not estimates):
  - Mastery points never go down, and neither does the total mastery score (the sum of all
    champion levels).
  - The client's mastery screen shows a player's five champions with the most points, most first.

  So, for each champion shown with points, against an account's figures from another time:
  - figures from later must be at least the points shown (less only within the screen's rounding),
    figures from earlier at most;
  - growth is expected, and nobody can know how much: only growth no amount of play could produce
    in the time between (more than SAME_DAY_GROWTH, plus MAX_DAILY_GROWTH a day after the first)
    contradicts; anything else is "grew by N in D days";
  - a champion shown with points that the account has never played (absent from Riot's full list)
    contradicts it;
  - another champion of the account with clearly more points than the fifth shown (beyond the
    growth possible since) would have been one of the five: that contradicts it;
  - when the date of the screen is unknown, growth of any size is possible and only figures that
    went down contradict.

  The two growth bounds are loose on purpose: they reject the impossible, not the unusual. They are
  measured against blind tests (docs/CLASH_SCOUT.md, "Testing Lab"), not tuned to a guess.

  Categories, per account:
    strong     nothing contradicts it and at least STRONG_MIN champions with points agree;
    partial    nothing contradicts it and at least two agree;
    differs    something contradicts it, or fewer than two agree;
    unscored   nothing known to compare (no mastery for the account).
  And per player, over all its candidates: verified (Riot confirmed an exact Riot ID), strong (one
  strong account), ambiguous (several strong, or several partial and none strong), partial (one
  partial), differs, unscored, not-discovered (no account at all), not-enough (fewer than two
  champions with points to compare).

  A strong match is a statistical match, never a verified identity.
*/

export const STRONG_MIN = 4;
/** More than a day's play could add to one champion: loose on purpose (about 30 games). */
export const SAME_DAY_GROWTH = 40_000;
/** More than a day's play could add to one champion, for each further day. */
export const MAX_DAILY_GROWTH = 60_000;
/** Levels the total mastery score could plausibly gain within a day, and for each further day. */
export const SAME_DAY_SCORE_GROWTH = 30;
export const DAILY_SCORE_GROWTH = 30;

const DAY = 86_400_000;

/** One champion as a screen showed it or a tester entered it. */
export interface ShownChampion {
  championId: string;
  /** Null: the champion is known to be shown, its points are not. */
  points: number | null;
  /** The figure stands for points ± precision. */
  precision: number;
}

export interface ShownPlayer {
  champions: ShownChampion[];
  /** The total mastery score shown, when known. */
  totalScore: number | null;
  /** When the screen was taken (ms), or null when not known. */
  capturedAt: number | null;
}

/** What is known of an account's mastery at one time. */
export interface MasterySnapshot {
  champions: Array<{ championId: string; points: number; precision?: number }>;
  /**
   * full: Riot's whole list for the account (a champion absent has never been played);
   * top: a screen's five champions with the most points (an earlier scout).
   */
  coverage: "full" | "top";
  totalScore: number | null;
  capturedAt: number;
  /** Where it came from, in words: "Riot, now", "your scout of Night Owls (1 Oct)". */
  label: string;
}

export type Strength = "strong" | "partial" | "differs" | "unscored";

export type ChampionVerdict = "same" | "grew" | "lower" | "too-fast" | "never-played" | "plays" | "unknown" | "not-in-top";

export interface ChampionComparison {
  championId: string;
  shown: number | null;
  shownText: string | null;
  known: number | null;
  verdict: ChampionVerdict;
  /** Points between the two in the direction of time (positive: grew). */
  change: number | null;
}

export interface Judgement {
  strength: Strength;
  /** Champions with points that agree (the same, or grown plausibly). */
  agreements: number;
  /** Champions with points that could be compared at all. */
  compared: number;
  contradictions: string[];
  /** What agrees, in a few words each. */
  facts: string[];
  perChampion: ChampionComparison[];
  /** Mean relative difference of the agreeing champions (0 = identical): a tie-break, never a score shown. */
  deviation: number;
  /** The figures it was judged on. */
  basis: string | null;
}

const growthBound = (days: number) => SAME_DAY_GROWTH + MAX_DAILY_GROWTH * Math.max(0, Math.ceil(days) - 1);
const scoreBound = (days: number) => SAME_DAY_SCORE_GROWTH + DAILY_SCORE_GROWTH * Math.max(0, Math.ceil(days) - 1);
const span = (days: number) => (days < 1 ? "the same day" : `${Math.round(days)} ${Math.round(days) === 1 ? "day" : "days"}`);

/** The account's figures against the screen's, champion by champion, then as a whole. */
export function judgeSnapshot(shown: ShownPlayer, snap: MasterySnapshot | null, championName: (id: string) => string): Judgement {
  const perChampion: ChampionComparison[] = [];
  const contradictions: string[] = [];
  const facts: string[] = [];
  if (!snap) return { strength: "unscored", agreements: 0, compared: 0, contradictions, facts: ["No mastery known for this account"], perChampion, deviation: Infinity, basis: null };

  // Direction of time: +1 when the account's figures are later than the screen, -1 earlier, 0 unknown.
  const dated = shown.capturedAt !== null;
  const days = dated ? Math.abs(snap.capturedAt - shown.capturedAt!) / DAY : Infinity;
  const later = !dated || snap.capturedAt >= shown.capturedAt!;
  const bound = dated ? growthBound(days) : Infinity;
  const known = new Map(snap.champions.map((c) => [c.championId, c]));
  const lowestOf = (list: Array<{ points: number; precision?: number }>) => Math.min(...list.map((c) => c.points + (c.precision ?? 0)));
  const shownWithPoints = shown.champions.filter((c) => c.points !== null);
  // The screen's five are a complete top five only when all five have points.
  const screenTopFive = shown.champions.length >= 5 && shownWithPoints.length >= 5;
  const snapTopFive = snap.coverage === "top" && snap.champions.length >= 5;

  let agreements = 0, compared = 0, deviation = 0;
  for (const c of shown.champions) {
    const name = championName(c.championId);
    const k = known.get(c.championId);
    const shownText = c.points === null ? null : formatMastery(c.points, c.precision);
    if (c.points === null) {
      // Champion only: is it one the account plays?
      if (k) perChampion.push({ championId: c.championId, shown: null, shownText, known: k.points, verdict: "plays", change: null });
      else if (snap.coverage === "full") {
        perChampion.push({ championId: c.championId, shown: null, shownText, known: 0, verdict: "never-played", change: null });
        contradictions.push(`${name} is shown, but the account has never played it`);
      } else perChampion.push({ championId: c.championId, shown: null, shownText, known: null, verdict: "unknown", change: null });
      continue;
    }
    const lo = c.points - c.precision, hi = c.points + c.precision;
    if (!k) {
      if (snap.coverage === "full") {
        compared++;
        perChampion.push({ championId: c.championId, shown: c.points, shownText, known: 0, verdict: "never-played", change: null });
        contradictions.push(`${name} shows ${shownText}, but the account has never played it`);
      } else if (snapTopFive && later && lo > lowestOf(snap.champions)) {
        // The later top five leaves out a champion that already had more than its fifth.
        compared++;
        perChampion.push({ championId: c.championId, shown: c.points, shownText, known: null, verdict: "not-in-top", change: null });
        contradictions.push(`${name} shows ${shownText}, yet is not in the account's later top five`);
      } else perChampion.push({ championId: c.championId, shown: c.points, shownText, known: null, verdict: "unknown", change: null });
      continue;
    }
    compared++;
    const klo = k.points - (k.precision ?? 0), khi = k.points + (k.precision ?? 0);
    // Growth from the earlier figure to the later one, allowing both roundings.
    const [earlyLo, earlyHi, lateLo, lateHi] = later ? [lo, hi, klo, khi] : [klo, khi, lo, hi];
    if (lateHi < earlyLo) {
      perChampion.push({ championId: c.championId, shown: c.points, shownText, known: k.points, verdict: "lower", change: k.points - c.points });
      contradictions.push(later ? `${name}: ${formatCount(k.points)} now, fewer than the ${shownText} shown (points never go down)` : `${name}: ${formatCount(k.points)} before, more than the ${shownText} shown now (points never go down)`);
      continue;
    }
    const grew = Math.max(0, lateLo - earlyHi);
    if (grew > bound) {
      perChampion.push({ championId: c.championId, shown: c.points, shownText, known: k.points, verdict: "too-fast", change: later ? k.points - c.points : c.points - k.points });
      contradictions.push(`${name}: ${formatCount(grew)} more in ${span(days)}, more than play could add`);
      continue;
    }
    agreements++;
    deviation += Math.abs(k.points - c.points) / Math.max(1, c.points);
    perChampion.push({ championId: c.championId, shown: c.points, shownText, known: k.points, verdict: grew > 0 ? "grew" : "same", change: later ? k.points - c.points : c.points - k.points });
  }

  // Another champion of the account that should have been one of the five shown.
  if (screenTopFive && (snap.coverage === "full" || snapTopFive)) {
    const fifth = lowestOf(shownWithPoints as Array<{ points: number; precision: number }>);
    const shownIds = new Set(shown.champions.map((c) => c.championId));
    for (const k of snap.champions) {
      if (shownIds.has(k.championId)) continue;
      const klo = k.points - (k.precision ?? 0);
      const intrudes = later ? dated && klo > fifth + bound : klo > fifth;
      if (intrudes) contradictions.push(`${championName(k.championId)} has ${formatCount(k.points)}${later ? " now" : " before"}: it would have been among the five shown`);
    }
  }

  // The total mastery score never goes down either.
  if (shown.totalScore !== null && snap.totalScore !== null) {
    const [early, late] = later ? [shown.totalScore, snap.totalScore] : [snap.totalScore, shown.totalScore];
    if (late < early) contradictions.push(`Total mastery ${formatCount(snap.totalScore)}${later ? " now" : " before"}, against ${formatCount(shown.totalScore)} shown (it never goes down)`);
    else if (dated && late - early > scoreBound(days)) contradictions.push(`Total mastery ${formatCount(late - early)} higher in ${span(days)}, more than play could add`);
    else facts.push(late === early ? `Total mastery ${formatCount(shown.totalScore)}, the same` : `Total mastery ${formatCount(late)}, up ${formatCount(late - early)}`);
  }

  const agreeing = perChampion.filter((p) => p.verdict === "same" || p.verdict === "grew");
  if (agreeing.length) {
    const same = agreeing.filter((p) => p.verdict === "same").length;
    facts.unshift(`${agreeing.length} of ${shownWithPoints.length} champions agree${same ? ` (${same} exactly)` : ""}${dated && days >= 1 ? ` over ${span(days)}` : ""}`);
  }
  const plays = perChampion.filter((p) => p.verdict === "plays").length;
  if (plays) facts.push(`Plays ${plays === 1 ? "the champion" : `${plays} of the champions`} shown without points`);

  const strength: Strength = contradictions.length || agreements < 2 ? "differs" : agreements >= STRONG_MIN ? "strong" : "partial";
  return { strength, agreements, compared, contradictions, facts, perChampion, deviation: agreements ? deviation / agreements : Infinity, basis: snap.label };
}

/** An account judged on every snapshot known of it: the latest decides, any other may still contradict it. */
export function judgeAccount(shown: ShownPlayer, snapshots: MasterySnapshot[], championName: (id: string) => string): Judgement {
  if (!snapshots.length) return judgeSnapshot(shown, null, championName);
  const ordered = [...snapshots].sort((a, b) => b.capturedAt - a.capturedAt);
  const main = judgeSnapshot(shown, ordered[0]!, championName);
  const others = ordered.slice(1).map((s) => ({ s, j: judgeSnapshot(shown, s, championName) }));
  const extra = others.flatMap(({ s, j }) => j.contradictions.map((c) => `${c} (${s.label})`));
  if (!extra.length) return { ...main, facts: [...main.facts, ...others.filter(({ j }) => j.agreements).map(({ s, j }) => `Also agrees with ${s.label}: ${j.agreements} champions`)] };
  return { ...main, strength: "differs", contradictions: [...main.contradictions, ...extra] };
}

export type Outcome = "verified" | "strong" | "ambiguous" | "partial" | "differs" | "unscored" | "not-discovered" | "not-enough";

export const OUTCOME_LABEL: Record<Outcome, string> = {
  verified: "Verified identity",
  strong: "Strong statistical match",
  ambiguous: "Several plausible candidates",
  partial: "Partial match",
  differs: "Candidates found, mastery differs",
  unscored: "Candidates found, no mastery to compare",
  "not-discovered": "No candidate discovered",
  "not-enough": "Not enough information",
};

export interface Ranked<T> {
  candidate: T;
  judgement: Judgement;
  verified: boolean;
}

const STRENGTH_ORDER: Record<Strength, number> = { strong: 0, partial: 1, unscored: 2, differs: 3 };

/** Best first: verified, then by strength, fewer contradictions, more agreements, closer figures. */
export function rankJudged<T>(list: Array<Ranked<T>>, key: (c: T) => string): Array<Ranked<T>> {
  return [...list].sort(
    (a, b) =>
      Number(b.verified) - Number(a.verified) ||
      STRENGTH_ORDER[a.judgement.strength] - STRENGTH_ORDER[b.judgement.strength] ||
      a.judgement.contradictions.length - b.judgement.contradictions.length ||
      b.judgement.agreements - a.judgement.agreements ||
      a.judgement.deviation - b.judgement.deviation ||
      key(a.candidate).localeCompare(key(b.candidate)),
  );
}

/** What can be said of one player, from all its candidates (already ranked). */
export function decide<T>(shown: ShownPlayer, ranked: Array<Ranked<T>>): { outcome: Outcome; reasons: string[] } {
  const withPoints = shown.champions.filter((c) => c.points !== null).length;
  if (ranked.some((r) => r.verified)) return { outcome: "verified", reasons: ["Riot confirmed the exact Riot ID"] };
  if (!ranked.length) return { outcome: "not-discovered", reasons: ["No account known to UNIIVERSE has this name"] };
  if (withPoints < 2 && shown.totalScore === null) return { outcome: "not-enough", reasons: ["Fewer than two champions with points to compare"] };
  const strong = ranked.filter((r) => r.judgement.strength === "strong");
  const partial = ranked.filter((r) => r.judgement.strength === "partial");
  const unscored = ranked.filter((r) => r.judgement.strength === "unscored");
  if (strong.length === 1) {
    const reasons = [`Only one account agrees on ${strong[0]!.judgement.agreements} champions with nothing against it`];
    if (partial.length) reasons.push(`${partial.length === 1 ? "Another account agrees" : `${partial.length} other accounts agree`} in part`);
    return { outcome: "strong", reasons };
  }
  if (strong.length > 1) return { outcome: "ambiguous", reasons: [`${strong.length} accounts agree equally well: the mastery shown cannot tell them apart`] };
  if (partial.length > 1) return { outcome: "ambiguous", reasons: [`${partial.length} accounts agree in part, none strongly`] };
  if (partial.length === 1) return { outcome: unscored.length ? "unscored" : "partial", reasons: [`One account agrees on ${partial[0]!.judgement.agreements} champions, too few to call it a match`, ...(unscored.length ? [`${unscored.length} other candidate${unscored.length === 1 ? "" : "s"} could not be compared`] : [])] };
  if (unscored.length) return { outcome: "unscored", reasons: [`${unscored.length} candidate${unscored.length === 1 ? "" : "s"} could not be compared: no mastery known`] };
  return { outcome: "differs", reasons: ["Every candidate's mastery contradicts what was shown"] };
}

/** "your scout of Night Owls (1 Oct)". */
export const scoutLabel = (opponent: string, at: Date) => `your scout of ${opponent || "an opponent"} (${formatDayMonth(at)})`;
