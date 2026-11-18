import { calendarDay, formatDate } from "@/lib/format";
import { rankCode, type RankQueue } from "@/domain/rank-progress";

/*
  The rank beside each player of a completed game. Riot's match records (MATCH-V5) hold no rank,
  so each rank shown is a reading, and it says how it relates to the game:
  - before: a linked account's last rank recorded before the game began (its rank history, which
    account sync writes whenever the account's rank or record changes);
  - after: read within AROUND_GAME_HOURS after the game ended (players are checked when the game
    is collected, server/players/participant-ranks.ts);
  - later / earlier: read after that, or before the game began: the player's rank then, not at the
    time of the game.
  "before" and "after" are shown as the rank around the game; the others are marked.

  Where a reading comes from, the newest winning unless a linked account's history covers the game:
  - a check: Riot's LEAGUE-V4 entries, read in full, by a linked account's sync or by a check of a
    game's players. Both ranked queues are known, so a queue without an entry is known to be
    unranked at that time;
  - a sighting: the Solo/Duo tier the retired Draft scouting or ranked ladder last saw (migration
    0048). It knows one queue, never "unranked", and the first check replaces it.
*/

/** One ranked queue as read: its tier (with division and LP), or no entry in that queue. */
export type QueueRank = { tier: string; division: string | null; leaguePoints: number | null } | "unranked";

export interface RankReading {
  /** When it was read (ms since 1970). */
  at: number;
  /** check: every ranked queue was read; sighting: one queue seen in passing. */
  kind: "check" | "sighting";
  /** Null: not read (a sighting's Flex). A check's null counts as unranked. */
  solo: QueueRank | null;
  flex: QueueRank | null;
  /** A linked account's last rank recorded before the game it was read for (its rank history). */
  beforeGame?: boolean;
}

/** When a game was played (ms since 1970), to read a rank against. */
export interface GameTime {
  start: number;
  end: number;
}

/** How a reading relates to its game (see the top of this file). */
export type RankTiming = "before" | "after" | "later" | "earlier";

/** A check this recent is current: an older one, or none, is asked for again when the match is opened. */
export const RANK_FRESH_DAYS = 3;
/** A reading this soon after a game ended is the rank around the game (a game's players are checked when it is collected). */
export const AROUND_GAME_HOURS = 24;
/** Games this recent have their players checked after they are collected, so a reading from before such a game is asked for again. */
export const RANK_ENRICH_DAYS = 7;
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

/** Whether a reading is the rank around the game: a linked account's last one before it, or a check soon after it. */
export const aroundGame = (timing: RankTiming | null): boolean => timing === "before" || timing === "after";

/** What a match window shows for one player. */
export interface ParticipantRank {
  /** ranked: a tier in a ranked queue; unranked: a check found no ranked entry; unknown: nothing read. */
  state: "ranked" | "unranked" | "unknown";
  /** The queue shown: the match's own ranked queue when the player has a rank there, else the other. */
  queue: RankQueue | null;
  tier: string | null;
  /** Null for apex tiers (Riot reports "I" for them). */
  division: string | null;
  leaguePoints: number | null;
  /** When it was read (ISO); null when unknown. */
  asOf: string | null;
  kind: RankReading["kind"] | null;
  /** Worth asking Riot again: no check within RANK_FRESH_DAYS, or none since a game of the last RANK_ENRICH_DAYS ended. */
  stale: boolean;
  /** How the reading relates to the game it is shown for; null without a game, or when nothing was read. */
  timing: RankTiming | null;
  /** The game's end (ms since 1970) when a game was given, to say how long after it the rank was read. */
  gameEnd: number | null;
}

export const UNKNOWN_RANK: ParticipantRank = { state: "unknown", queue: null, tier: null, division: null, leaguePoints: null, asOf: null, kind: null, stale: true, timing: null, gameEnd: null };

const APEX = new Set(["MASTER", "GRANDMASTER", "CHALLENGER"]);

/** The ranked queue a match is shown in: Flex for a Ranked Flex game, Solo/Duo for every other. */
export function matchRankQueue(queueId: number | null): RankQueue {
  return queueId === 440 ? "flex" : "solo";
}

/** How a reading relates to a game (see RankTiming). */
export function rankTiming(reading: Pick<RankReading, "at" | "beforeGame">, game: GameTime): RankTiming {
  if (reading.beforeGame) return "before";
  if (reading.at < game.start) return "earlier";
  return reading.at - game.end <= AROUND_GAME_HOURS * HOUR_MS ? "after" : "later";
}

/**
 * The reading shown for one player, in the queue that suits the match (see ParticipantRank): for a
 * game, a linked account's rank recorded before it when its history covers the game, otherwise the
 * newest reading.
 */
export function participantRank(readings: readonly RankReading[], queueId: number | null, now = Date.now(), game: GameTime | null = null): ParticipantRank {
  const newest = [...readings].sort((a, b) => b.at - a.at);
  const reading = (game ? newest.find((r) => r.beforeGame) : undefined) ?? newest.find((r) => !r.beforeGame);
  if (!reading) return UNKNOWN_RANK;
  // A linked account's history is not a check: whether to ask Riot again goes by the newest reading.
  const latest = newest.find((r) => !r.beforeGame);
  const check = newest.find((r) => r.kind === "check" && !r.beforeGame);
  const missedRecentGame = !!game && !reading.beforeGame && now - game.end < RANK_ENRICH_DAYS * DAY_MS && (latest?.at ?? 0) < game.end;
  const stale = !check || now - check.at > RANK_FRESH_DAYS * DAY_MS || missedRecentGame;
  const asOf = new Date(reading.at).toISOString();
  const timing = game ? rankTiming(reading, game) : null;
  const gameEnd = game ? game.end : null;
  const want = matchRankQueue(queueId);
  const other: RankQueue = want === "solo" ? "flex" : "solo";
  const rankIn = (q: RankQueue) => {
    const v = reading[q];
    return v && v !== "unranked" && v.tier !== "UNRANKED" ? v : null;
  };
  const queue = rankIn(want) ? want : rankIn(other) ? other : null;
  if (queue) {
    const v = rankIn(queue)!;
    return { state: "ranked", queue, tier: v.tier, division: APEX.has(v.tier) ? null : v.division, leaguePoints: v.leaguePoints, asOf, kind: reading.kind, stale, timing, gameEnd };
  }
  // Unranked only on a check's word: a sighting never recorded the absence of a rank.
  if (reading.kind === "check") return { state: "unranked", queue: null, tier: null, division: null, leaguePoints: null, asOf, kind: "check", stale, timing, gameEnd };
  return { ...UNKNOWN_RANK, stale };
}

const TIER_SHORT: Record<string, string> = { IRON: "Iron", BRONZE: "Bronze", SILVER: "Silver", GOLD: "Gold", PLATINUM: "Plat", EMERALD: "Emerald", DIAMOND: "Diamond", MASTER: "Master", GRANDMASTER: "GM", CHALLENGER: "Chall" };
const DIVISION: Record<string, string> = { I: "1", II: "2", III: "3", IV: "4" };
const QUEUE_NAME: Record<RankQueue, string> = { solo: "Ranked Solo/Duo", flex: "Ranked Flex" };
const QUEUE_MARK: Record<RankQueue, string> = { solo: "Solo", flex: "Flex" };
const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

/** Older than this, a rank shows when it was read on the badge itself, not only on hover. */
export const RANK_AGE_SHOWN_DAYS = 30;

export interface RankBadgeLabel {
  /** "Gold 2", "GM", "Plat 4 · Aug", "Unranked", "—". */
  text: string;
  /** "Flex" or "Solo" when the rank shown is not in the match's own queue (see matchRankQueue). */
  queueMark: string | null;
  /** What a screen reader says: the queue, the rank in full and when it was read. */
  spoken: string;
  /** The whole statement, on hover. */
  title: string;
  /** Whether it is the rank around the game (aroundGame); null without a game or a reading. */
  aroundGame: boolean | null;
}

/** "40 min", "5 h", "1 day", "9 days": how long after a game a rank was read. */
function gap(ms: number): string {
  if (ms < HOUR_MS) return `${Math.max(1, Math.round(ms / 60_000))} min`;
  if (ms < DAY_MS) return `${Math.round(ms / HOUR_MS)} h`;
  const days = Math.round(ms / DAY_MS);
  return days === 1 ? "1 day" : `${days} days`;
}

/** When a rank was read, said against its game: "checked 40 min after this game", "the last rank recorded before this game". */
function readWhen(rank: ParticipantRank, at: Date | null): string {
  const read = rank.kind === "sighting" ? "last seen" : "checked";
  const date = at && calendarDay(at) ? ` ${formatDate(at)}` : "";
  if (!at || rank.timing === null || rank.gameEnd === null) return `${read}${date}`;
  const since = at.getTime() - rank.gameEnd;
  if (rank.timing === "before") return "the last rank recorded before this game";
  if (rank.timing === "after") return `${read} ${gap(Math.max(0, since))} after this game`;
  if (rank.timing === "later") return `${read}${date}, ${gap(since)} after this game`;
  return `${read}${date}, before this game`;
}

/**
 * The badge for one player's rank in a game's scoreboard. A rank read over 30 days ago carries its
 * month (and the year when it differs), so its age shows without hovering, on phones too; one not
 * read around the game says so (aroundGame false, marked by the badge).
 */
export function rankBadgeLabel(rank: ParticipantRank, queueId: number | null, now = new Date()): RankBadgeLabel {
  if (rank.state === "unknown") return { text: "—", queueMark: null, spoken: "Rank not available", title: "Rank not available: not read from Riot", aroundGame: null };
  const at = rank.asOf ? new Date(rank.asOf) : null;
  const day = at ? calendarDay(at) : null;
  const when = readWhen(rank, at);
  const around = rank.timing === null ? null : aroundGame(rank.timing);
  // Said once, after the statement: a rank read away from the game is the player's rank then.
  const then = around === null ? ". Their rank then, not at the time of this match" : around ? "" : ": their rank then, not at the time of this game";
  if (rank.state === "unranked") {
    const spoken = rank.timing === "before" ? "Unranked before this game: no Ranked Solo/Duo or Flex entry recorded" : `Unranked: no Ranked Solo/Duo or Flex entry when ${when}`;
    return { text: "Unranked", queueMark: null, spoken, title: around === false ? `${spoken}${then}` : spoken, aroundGame: around };
  }
  const tier = rank.tier!;
  const base = `${TIER_SHORT[tier] ?? titleCase(tier)}${rank.division ? ` ${DIVISION[rank.division] ?? rank.division}` : ""}`;
  const old = !!at && now.getTime() - at.getTime() > RANK_AGE_SHOWN_DAYS * DAY_MS;
  const sameYear = day?.year === calendarDay(now)?.year;
  const queue = rank.queue ?? "solo";
  const full = `${titleCase(tier)}${rank.division ? ` ${rank.division}` : ""}${rank.leaguePoints !== null ? `, ${rank.leaguePoints} LP` : ""}`;
  const spoken = `${QUEUE_NAME[queue]}: ${full}, ${when}`;
  return {
    text: old && day ? `${base} · ${day.month}${sameYear ? "" : ` ${day.year}`}` : base,
    queueMark: queue === matchRankQueue(queueId) ? null : QUEUE_MARK[queue],
    spoken,
    title: `${spoken}${then}`,
    aroundGame: around,
  };
}


export interface RankShortLabel {
  /** "E2", "D4", "GM", "Unr"; null when nothing is known (the card shows nothing). */
  text: string | null;
  /** The ranked tier, for its colour; null when unranked or unknown. */
  tier: string | null;
  /** "f" (Flex) or "s" (Solo/Duo) when the rank shown is from the other ranked queue than the match's own (matchRankQueue). */
  queueMark: "f" | "s" | null;
  /** Read over RANK_AGE_SHOWN_DAYS ago: drawn quieter, its date on hover. */
  old: boolean;
  /** Whether it is the rank around the game; one read later or earlier is drawn quieter too. Null without a game. */
  aroundGame: boolean | null;
  /** A few words for screen readers in the card's description: "Emerald 2", "Emerald 2 in Flex", "unranked". */
  spoken: string | null;
  /** The whole statement on hover: the queue, the rank in full and when it was read, never the rank at the time of the match. */
  title: string;
}

/**
 * An opponent's rank as the collapsed match card shows it: the tier's letter and division ("E2",
 * "P1"; "M", "GM", "C" for the apex tiers), marked when it comes from the other ranked queue, and
 * "Unr" when a check found no ranked entry. Nothing at all when nothing was read: the match window
 * checks it when opened.
 */
export function rankShortLabel(rank: ParticipantRank, queueId: number | null, now = new Date()): RankShortLabel {
  const full = rankBadgeLabel(rank, queueId, now);
  if (rank.state === "unknown") return { text: null, tier: null, queueMark: null, old: false, aroundGame: null, spoken: null, title: "Rank not available yet: not read from Riot" };
  const at = rank.asOf ? new Date(rank.asOf).getTime() : null;
  const old = at !== null && now.getTime() - at > RANK_AGE_SHOWN_DAYS * DAY_MS;
  if (rank.state === "unranked") return { text: "Unr", tier: null, queueMark: null, old, aroundGame: full.aroundGame, spoken: "unranked", title: full.title };
  const tier = rank.tier!;
  const division = rank.division ? (DIVISION[rank.division] ?? rank.division) : "";
  const queue = rank.queue ?? "solo";
  const other = queue !== matchRankQueue(queueId);
  const words = `${TIER_SHORT[tier] ?? titleCase(tier)}${division ? ` ${division}` : ""}`;
  return {
    text: rankCode(tier, rank.division),
    tier,
    queueMark: other ? (queue === "flex" ? "f" : "s") : null,
    old,
    aroundGame: full.aroundGame,
    spoken: other ? `${words} in ${queue === "flex" ? "Flex" : "Solo/Duo"}` : words,
    title: full.title,
  };
}

/** For the note under a scoreboard: how many of its ranks are the ones around the game, and how many were read away from it. */
export function rankTimingCounts(ranks: readonly ParticipantRank[]): { around: number; away: number } {
  let around = 0;
  let away = 0;
  for (const r of ranks) {
    if (r.state === "unknown" || r.timing === null) continue;
    if (aroundGame(r.timing)) around++;
    else away++;
  }
  return { around, away };
}
