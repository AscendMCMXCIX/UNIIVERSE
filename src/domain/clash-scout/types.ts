/*
  CLASH SCOUT: the shapes of a scouting session. A draft lives in the browser until a member saves
  it; a saved scout is a historical snapshot of what the two Clash screenshots showed then (it is
  never refreshed from newer data). Screenshots themselves are never part of either.
*/

export const SCOUT_SLOTS = 5;

/** Which of Clash's two scouting screens an image shows. */
export type ScreenshotKind = "ranked" | "mastery";

/** How sure the recognition is about one value: "manual" when a member typed or chose it. */
export type Certainty = "high" | "low" | "manual";

export interface RankInfo {
  /** IRON … CHALLENGER, or UNRANKED. */
  tier: string;
  /** I–IV (null for Master and above, or when not shown). */
  division: string | null;
  lp: number | null;
}

/** One champion line of the ranked screen. Every figure is exactly what the screenshot showed, or null. */
export interface RankedChampion {
  championId: string | null;
  games: number | null;
  /** Percent, 0–100. */
  winRate: number | null;
  kda: number | null;
  certainty: Certainty;
}

/** One champion line of the mastery screen. */
export interface MasteryChampion {
  championId: string | null;
  level: number | null;
  points: number | null;
  certainty: Certainty;
}

/**
 * Whether the account behind a name is known. Only "verified" means Riot confirmed the full Riot
 * ID (game name and tag) the team entered or confirmed, and only then are a Riot ID, a PUUID and a
 * direct OP.GG profile kept. A name alone is never treated as an account.
 */
export type Verification = "unverified" | "verified";

export interface ScoutPlayer {
  /** 0–4, the column in the Clash screens (left to right). */
  slot: number;
  /** The name exactly as recognised or corrected (any script). */
  name: string;
  nameCertainty: Certainty;
  rank: RankInfo | null;
  ranked: RankedChampion[];
  mastery: MasteryChampion[];
  verification: Verification;
  /** "GameName#TAG" as Riot returned it: only when verified. */
  riotId: string | null;
  /** Riot's stable account id: only when verified. Lets a later scout recognise the same account. */
  puuid: string | null;
  /** The server's signature on a verification it made (drafts only; checked on save, never stored). */
  proof?: string | null;
}

export interface ScoutTournament {
  /** e.g. "Ionia Cup", when the team typed or the screenshot showed it. */
  name: string | null;
  /** e.g. "Day 2". */
  day: string | null;
}

/** Everything a scout holds, draft or saved. */
export interface ScoutContent {
  opponentName: string;
  opponentCertainty: Certainty;
  /** Riot platform id ("oc1", "euw1"…): the server the opponents play on. */
  platform: string;
  tournament: ScoutTournament;
  players: ScoutPlayer[];
}

export function emptyPlayer(slot: number): ScoutPlayer {
  return { slot, name: "", nameCertainty: "manual", rank: null, ranked: [], mastery: [], verification: "unverified", riotId: null, puuid: null };
}

export function emptyContent(platform: string): ScoutContent {
  return { opponentName: "", opponentCertainty: "manual", platform, tournament: { name: null, day: null }, players: Array.from({ length: SCOUT_SLOTS }, (_, i) => emptyPlayer(i)) };
}
