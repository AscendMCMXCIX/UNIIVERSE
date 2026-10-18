import type { SeasonGame } from "./season-stats";

/*
  PATTERNS: a player's own trends, for their eyes only (My Profile and Solo Queue Blocks), from the
  games UNIIVERSE already stores. Never shown to teammates, never fed into drafting or rankings.

  Each figure compares the player's last PATTERN_RECENT games with the PATTERN_BEFORE games before
  them, each over the games that carry it, with both sample sizes and date ranges said out loud.
  A figure is left out when either side has fewer than PATTERN_MIN_GAMES games with it. The words
  are neutral ("higher", "lower", "about the same"), never a verdict: whether fewer deaths or more
  damage is good depends on the game. Champion form lists the champions played at least
  PATTERN_MIN_CHAMPION times in the recent games, with their record there.
*/

export const PATTERN_RECENT = 20;
export const PATTERN_BEFORE = 40;
export const PATTERN_MIN_GAMES = 10;
export const PATTERN_MIN_CHAMPION = 4;

export type PatternKey = "cs" | "deaths" | "kda" | "damage";

/** What counts as a clear difference, per figure (below it: "about the same"). */
export const PATTERN_GAP: Record<PatternKey, { absolute?: number; relative?: number }> = {
  cs: { absolute: 0.4 },
  deaths: { absolute: 0.7 },
  kda: { relative: 0.15 },
  damage: { relative: 0.1 },
};

export interface PatternWindow {
  games: number;
  /** Epoch ms of the oldest and newest game in the window. */
  from: number;
  to: number;
}

export interface FigurePattern {
  key: PatternKey;
  label: string;
  unit: string;
  recent: { value: number; games: number };
  before: { value: number; games: number };
  direction: "higher" | "lower" | "same";
}

export interface ChampionForm {
  championId: string;
  games: number;
  wins: number;
  /** The same champion in the games before, when played there at least PATTERN_MIN_CHAMPION times. */
  before: { games: number; wins: number } | null;
}

export interface Patterns {
  recent: PatternWindow | null;
  before: PatternWindow | null;
  figures: FigurePattern[];
  champions: ChampionForm[];
  /** Figures left out for want of games, by label (said, never silently dropped). */
  omitted: string[];
}

const LABELS: Record<PatternKey, { label: string; unit: string }> = {
  cs: { label: "CS per minute", unit: "" },
  deaths: { label: "Deaths per game", unit: "" },
  kda: { label: "KDA", unit: "" },
  damage: { label: "Damage per minute", unit: "" },
};

const known = (v: number | null | undefined): v is number => typeof v === "number" && v >= 0;
const minutes = (g: SeasonGame) => (known(g.gameDuration) && g.gameDuration > 0 ? g.gameDuration / 60 : null);

/** One figure over a set of games (each over the games that carry it), and how many carried it. */
function figure(key: PatternKey, games: readonly SeasonGame[]): { value: number; games: number } | null {
  switch (key) {
    case "cs": {
      const list = games.filter((g) => known(g.cs) && minutes(g));
      const mins = list.reduce((s, g) => s + minutes(g)!, 0);
      return list.length && mins > 0 ? { value: list.reduce((s, g) => s + g.cs!, 0) / mins, games: list.length } : null;
    }
    case "damage": {
      const list = games.filter((g) => known(g.damage) && minutes(g));
      const mins = list.reduce((s, g) => s + minutes(g)!, 0);
      return list.length && mins > 0 ? { value: list.reduce((s, g) => s + g.damage!, 0) / mins, games: list.length } : null;
    }
    case "deaths": {
      const list = games.filter((g) => known(g.deaths));
      return list.length ? { value: list.reduce((s, g) => s + g.deaths!, 0) / list.length, games: list.length } : null;
    }
    case "kda": {
      const list = games.filter((g) => known(g.kills) && known(g.deaths) && known(g.assists));
      if (!list.length) return null;
      const ka = list.reduce((s, g) => s + g.kills! + g.assists!, 0);
      const d = list.reduce((s, g) => s + g.deaths!, 0);
      // As everywhere else: total (kills + assists) over total deaths; no deaths at all counts each game as one.
      return { value: ka / Math.max(d, 1), games: list.length };
    }
  }
}

function direction(key: PatternKey, recent: number, before: number): FigurePattern["direction"] {
  const gap = PATTERN_GAP[key];
  const diff = recent - before;
  const clear = gap.absolute !== undefined ? Math.abs(diff) >= gap.absolute : before > 0 ? Math.abs(diff) / before >= gap.relative! : diff !== 0;
  return !clear ? "same" : diff > 0 ? "higher" : "lower";
}

const windowOf = (games: readonly SeasonGame[]): PatternWindow | null => (games.length ? { games: games.length, from: Math.min(...games.map((g) => g.gameCreation)), to: Math.max(...games.map((g) => g.gameCreation)) } : null);

/** The player's patterns from their stored games (any order; remakes and undecided games are left out). */
export function personalPatterns(all: readonly SeasonGame[], options: { recent?: number; before?: number } = {}): Patterns {
  const recentN = options.recent ?? PATTERN_RECENT;
  const beforeN = options.before ?? PATTERN_BEFORE;
  // Newest first; a game stored on two linked accounts counts once.
  const seen = new Set<string>();
  const games = [...all]
    .filter((g) => g.win !== null)
    .sort((a, b) => b.gameCreation - a.gameCreation)
    .filter((g) => (seen.has(g.matchId) ? false : (seen.add(g.matchId), true)));
  const recent = games.slice(0, recentN);
  const before = games.slice(recentN, recentN + beforeN);
  const figures: FigurePattern[] = [];
  const omitted: string[] = [];
  for (const key of ["cs", "deaths", "kda", "damage"] as const) {
    const r = figure(key, recent);
    const b = figure(key, before);
    if (!r || !b || r.games < PATTERN_MIN_GAMES || b.games < PATTERN_MIN_GAMES) {
      omitted.push(LABELS[key].label);
      continue;
    }
    figures.push({ key, ...LABELS[key], recent: r, before: b, direction: direction(key, r.value, b.value) });
  }
  const champions: ChampionForm[] = [];
  if (recent.length >= PATTERN_MIN_GAMES) {
    const by = new Map<string, SeasonGame[]>();
    for (const g of recent) by.set(g.championId, [...(by.get(g.championId) ?? []), g]);
    for (const [championId, list] of by) {
      if (list.length < PATTERN_MIN_CHAMPION) continue;
      const earlier = before.filter((g) => g.championId === championId);
      champions.push({ championId, games: list.length, wins: list.filter((g) => g.win).length, before: earlier.length >= PATTERN_MIN_CHAMPION ? { games: earlier.length, wins: earlier.filter((g) => g.win).length } : null });
    }
    champions.sort((a, b) => b.games - a.games || a.championId.localeCompare(b.championId));
  }
  return { recent: windowOf(recent), before: windowOf(before), figures, champions: champions.slice(0, 3), omitted };
}

const fmt = (key: PatternKey, v: number) => (key === "damage" ? Math.round(v).toLocaleString("en") : key === "cs" || key === "deaths" ? v.toFixed(1) : v.toFixed(2));

/** One figure in plain, neutral words: "CS per minute: 7.4 over your last 20 games, 6.8 over the 40 before (higher)." */
export function patternSentence(p: FigurePattern, windows?: { recent: number; before: number }): string {
  const dir = p.direction === "same" ? "about the same" : p.direction;
  const recent = windows && p.recent.games < windows.recent ? `${p.recent.games} of your last ${windows.recent} games` : `your last ${p.recent.games} games`;
  const before = windows && p.before.games < windows.before ? `${p.before.games} of the ${windows.before} before` : `the ${p.before.games} before`;
  return `${p.label}: ${fmt(p.key, p.recent.value)} over ${recent}, ${fmt(p.key, p.before.value)} over ${before} (${dir}).`;
}

export const formatPatternValue = fmt;
