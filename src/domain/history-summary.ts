import { recentForm, FORM_RECENT, type FormGame, type RecentForm } from "./recent-form";

/*
  MATCH HISTORY SUMMARY: the strip above Match History, over the games its filters list. The win
  rate, KDA and CS/min use the same rules as the Overview's Recent form (domain/recent-form), so
  the two never disagree; what the strip adds belongs to a list of games: the current streak, the
  champions played most in the recent games and the kill participation over them.
*/

export interface HistorySummaryGame extends FormGame {
  /** The kills of the player's team in this game; null when not recorded. */
  teamKills?: number | null;
}

export interface HistorySummary {
  form: RecentForm;
  /** The run of identical results up to the newest game; null without a result. */
  streak: { win: boolean; games: number } | null;
  /** The champions played most in the recent games (at most three), with their record. */
  mostPlayed: Array<{ championId: string; games: number; wins: number }>;
  /** Kills and assists over the team's kills in the recent games that carry both. */
  killParticipation: { value: number | null; games: number };
}

/** The newest games' run of one result: "3 wins in a row". */
export function streakOf(games: readonly Pick<FormGame, "win" | "gameCreation" | "matchId">[]): HistorySummary["streak"] {
  const decided = games.filter((g) => g.win !== null).sort((a, b) => b.gameCreation - a.gameCreation || (a.matchId < b.matchId ? 1 : -1));
  if (!decided.length) return null;
  const first = !!decided[0]!.win;
  let n = 0;
  while (n < decided.length && !!decided[n]!.win === first) n += 1;
  return { win: first, games: n };
}

export function mostPlayedOf(games: readonly Pick<FormGame, "championId" | "win">[], limit = 3): HistorySummary["mostPlayed"] {
  const by = new Map<string, { games: number; wins: number }>();
  for (const g of games) {
    const c = by.get(g.championId) ?? { games: 0, wins: 0 };
    c.games += 1;
    if (g.win) c.wins += 1;
    by.set(g.championId, c);
  }
  return [...by.entries()]
    .map(([championId, c]) => ({ championId, ...c }))
    .sort((a, b) => b.games - a.games || b.wins - a.wins || a.championId.localeCompare(b.championId))
    .slice(0, limit);
}

/** Total kills and assists over total team kills (never an average of each game's share). */
export function killParticipationOf(games: readonly Pick<HistorySummaryGame, "kills" | "assists" | "teamKills">[]): HistorySummary["killParticipation"] {
  let takedowns = 0;
  let teamKills = 0;
  let n = 0;
  for (const g of games) {
    if (typeof g.kills !== "number" || typeof g.assists !== "number" || g.kills < 0 || typeof g.teamKills !== "number" || g.teamKills <= 0) continue;
    takedowns += g.kills + g.assists;
    teamKills += g.teamKills;
    n += 1;
  }
  return { value: n ? Math.min(1, takedowns / teamKills) : null, games: n };
}

export function historySummary(games: readonly HistorySummaryGame[]): HistorySummary {
  const form = recentForm(games);
  const recentIds = new Set(form.last.slice(0, FORM_RECENT).map((g) => g.matchId));
  const recent = games.filter((g) => recentIds.has(g.matchId));
  return { form, streak: streakOf(games), mostPlayed: mostPlayedOf(recent), killParticipation: killParticipationOf(recent) };
}
