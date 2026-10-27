import { categoryLabel, type CategoryKey } from "./categories";
import { areaCounts, FOLLOWED_FROM, isExecution, type ReviewStatus } from "./reviews";

/*
  Ranked sessions: a sitting of Solo/Duo games played with one objective in mind (the evolution of
  Solo Queue Blocks; the same rows). A session can have a game target or end on its second loss,
  and the player ends it whenever they like. Games join it by themselves once the account sync
  stores them, so nothing has to be logged by hand, and the rules below decide which session a
  game belongs to without guessing:

    - a game belongs to a session when it finished after the session started and began before the
      session ended (or before now, while it runs), on the session's account when it follows one;
    - a game that fits two sessions (it was still being played when one ended and the next began)
      goes to the earlier one and is marked for the player to confirm, never moved silently;
    - a session with no game for SESSION_IDLE_HOURS ends by itself at its last activity, so a
      session left open yesterday does not swallow today's games; a game synced late still joins
      the session it was played in;
    - under the two-loss rule a session ends with its second loss, at the end of that game.
*/

export const SESSION_IDLE_HOURS = 12;
export const SESSION_IDLE_MS = SESSION_IDLE_HOURS * 3_600_000;
/** Ended sessions still collect late games for this long after they ended (Riot sync can lag). */
export const LATE_GAME_DAYS = 3;
export const SOLO_DUO_QUEUE = 420;

export interface SessionWindow {
  id: string;
  startedAt: number;
  /** Null while the session runs. */
  endedAt: number | null;
  /** The session's start, its latest game's end, or the player's latest action in it. */
  lastActivityAt: number;
  rule: "target" | "two-losses";
  /** Losses the session already has. */
  losses: number;
  /** The linked account it follows; null for any of the player's accounts. */
  accountId: string | null;
}

export interface CandidateGame {
  matchId: string;
  accountId: string;
  /** When the game started and ended (ms). */
  start: number;
  end: number;
  win: boolean;
}

export interface AssociationPlan {
  assign: Array<{ matchId: string; sessionId: string; ambiguousWith: string | null }>;
  /** Sessions that end now: idle (at their last activity) or on their second loss (at that game's end). */
  end: Array<{ sessionId: string; at: number; reason: "idle" | "two-losses" }>;
}

/**
 * Which session each new game joins, and which sessions end, given the player's recent sessions and
 * their stored Solo/Duo games not yet in any session. Pure: the repository applies the plan.
 */
export function planAssociation(sessions: readonly SessionWindow[], games: readonly CandidateGame[], now: number): AssociationPlan {
  const state = [...sessions].sort((a, b) => a.startedAt - b.startedAt).map((s) => ({ ...s }));
  const plan: AssociationPlan = { assign: [], end: [] };
  const endIdle = (s: (typeof state)[number], before: number) => {
    if (s.endedAt === null && before - s.lastActivityAt > SESSION_IDLE_MS) {
      s.endedAt = s.lastActivityAt;
      plan.end.push({ sessionId: s.id, at: s.endedAt, reason: "idle" });
    }
  };
  for (const g of [...games].sort((a, b) => a.start - b.start || a.matchId.localeCompare(b.matchId))) {
    for (const s of state) endIdle(s, g.start);
    const fits = state.filter((s) => (!s.accountId || s.accountId === g.accountId) && g.end > s.startedAt && g.start < (s.endedAt ?? now));
    if (fits.length === 0) continue;
    const [target, other] = fits;
    plan.assign.push({ matchId: g.matchId, sessionId: target!.id, ambiguousWith: other?.id ?? null });
    target!.lastActivityAt = Math.max(target!.lastActivityAt, g.end);
    if (!g.win) target!.losses += 1;
    if (target!.rule === "two-losses" && target!.losses >= 2 && target!.endedAt === null) {
      target!.endedAt = g.end;
      plan.end.push({ sessionId: target!.id, at: g.end, reason: "two-losses" });
    }
  }
  for (const s of state) endIdle(s, now);
  return plan;
}

/** True while a running session has been idle long enough to end (checked on every read too). */
export function isIdle(lastActivityAt: number, now: number): boolean {
  return now - lastActivityAt > SESSION_IDLE_MS;
}

export interface SummaryGame {
  championId: string;
  result: "win" | "loss";
  reviewStatus: ReviewStatus;
  execution: number | null;
  wentWell: string | null;
  wentWrong: string | null;
  learning: string;
  adjustment: string;
  playedAt: number;
}

export interface SessionSummary {
  games: number;
  wins: number;
  losses: number;
  champions: Array<{ championId: string; games: number; wins: number }>;
  reviews: { done: number; skipped: number; pending: number };
  /** Self-reported: reviews with a plan rating, and how many of them say "Mostly" or "Every time". */
  execution: { rated: number; followed: number; levels: [number, number, number, number] };
  wentWell: Array<{ key: CategoryKey; count: number }>;
  /** Hardest areas named in two games or more. */
  recurring: Array<{ key: CategoryKey; count: number }>;
  /** The player's own learning points, newest first (at most three). */
  learnings: string[];
  /** The latest adjustment the player wrote, to carry into the next game or session. */
  nextAdjustment: string | null;
  /** Suggestions drawn only from the games and the player's own reviews (never invented). */
  suggestions: string[];
}

/** A session's summary from its games and their reviews. */
export function summariseSession(games: readonly SummaryGame[], objectiveCategory: string | null): SessionSummary {
  const wins = games.filter((g) => g.result === "win").length;
  const byChampion = new Map<string, { games: number; wins: number }>();
  for (const g of games) {
    const e = byChampion.get(g.championId) ?? { games: 0, wins: 0 };
    e.games += 1;
    if (g.result === "win") e.wins += 1;
    byChampion.set(g.championId, e);
  }
  const reviewed = games.filter((g) => g.reviewStatus === "done");
  const levels: [number, number, number, number] = [0, 0, 0, 0];
  for (const g of reviewed) if (isExecution(g.execution)) levels[g.execution] += 1;
  const rated = levels.reduce((a, b) => a + b, 0);
  const followed = levels.slice(FOLLOWED_FROM).reduce((a, b) => a + b, 0);
  const newestFirst = [...reviewed].sort((a, b) => b.playedAt - a.playedAt);
  const recurring = areaCounts(reviewed.map((g) => g.wentWrong), 2);
  const summary: SessionSummary = {
    games: games.length,
    wins,
    losses: games.length - wins,
    champions: [...byChampion.entries()].map(([championId, e]) => ({ championId, ...e })).sort((a, b) => b.games - a.games || a.championId.localeCompare(b.championId)),
    reviews: { done: reviewed.length, skipped: games.filter((g) => g.reviewStatus === "skipped").length, pending: games.filter((g) => g.reviewStatus === "pending").length },
    execution: { rated, followed, levels },
    wentWell: areaCounts(reviewed.map((g) => g.wentWell)),
    recurring,
    learnings: newestFirst.map((g) => g.learning).filter(Boolean).slice(0, 3),
    nextAdjustment: newestFirst.find((g) => g.adjustment)?.adjustment ?? null,
    suggestions: [],
  };
  summary.suggestions = sessionSuggestions(summary, objectiveCategory);
  return summary;
}

/** Next-step suggestions, each tied to something the player recorded; none when nothing supports one. */
export function sessionSuggestions(s: SessionSummary, objectiveCategory: string | null): string[] {
  const out: string[] = [];
  if (s.games > 0 && s.reviews.done === 0) out.push("Review a game or two next time: this summary can only draw on your reviews.");
  if (s.execution.rated >= 2) {
    const share = s.execution.followed / s.execution.rated;
    if (share >= 0.75) out.push(`You followed your plan in ${s.execution.followed} of ${s.execution.rated} reviewed games. Keep the objective for another session to see if it holds, then consider marking it Improving.`);
    else if (share <= 0.25) out.push(`Your plan was hard to apply (followed in ${s.execution.followed} of ${s.execution.rated} reviewed games). A simpler If–Then plan for the same objective may help.`);
  }
  const other = s.recurring.find((r) => r.key !== objectiveCategory);
  if (other) out.push(`${categoryLabel(other.key)} was the hardest part in ${other.count} games. Consider adding it to your Development library.`);
  if (s.nextAdjustment) out.push(`Start the next session with your last adjustment: “${s.nextAdjustment}”`);
  return out;
}
