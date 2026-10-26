import { calendarDay, formatDate, formatDayMonth } from "@/lib/format";
import type { RankQueue } from "@/domain/rank-progress";

/*
  The rank beside each player in a match window: their current or last-checked official rank,
  never their rank at the time of the match. Riot's match records (MATCH-V5) hold no rank, so the
  rank someone had when a game was played is not known for anyone here, and nothing claims it.

  Where a rank comes from (server/players/participant-ranks.ts), the newest reading winning:
  - a check: Riot's LEAGUE-V4 entries, read in full, by a linked account's sync or by a lookup when
    a member opened one of the player's matches. Both ranked queues are known, so a queue without
    an entry is known to be unranked at that time;
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
}

/** A check this recent is current: an older one, or none, is asked for again when the match is opened. */
export const RANK_FRESH_DAYS = 3;
const DAY_MS = 86_400_000;

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
  /** No check within RANK_FRESH_DAYS: worth asking Riot again. */
  stale: boolean;
}

export const UNKNOWN_RANK: ParticipantRank = { state: "unknown", queue: null, tier: null, division: null, leaguePoints: null, asOf: null, kind: null, stale: true };

const APEX = new Set(["MASTER", "GRANDMASTER", "CHALLENGER"]);

/** The ranked queue a match is shown in: Flex for a Ranked Flex game, Solo/Duo for every other. */
export function matchRankQueue(queueId: number | null): RankQueue {
  return queueId === 440 ? "flex" : "solo";
}

/** The newest of a player's readings, in the queue that suits the match (see ParticipantRank). */
export function participantRank(readings: readonly RankReading[], queueId: number | null, now = Date.now()): ParticipantRank {
  const newest = [...readings].sort((a, b) => b.at - a.at);
  const reading = newest[0];
  if (!reading) return UNKNOWN_RANK;
  const check = newest.find((r) => r.kind === "check");
  const stale = !check || now - check.at > RANK_FRESH_DAYS * DAY_MS;
  const asOf = new Date(reading.at).toISOString();
  const want = matchRankQueue(queueId);
  const other: RankQueue = want === "solo" ? "flex" : "solo";
  const rankIn = (q: RankQueue) => {
    const v = reading[q];
    return v && v !== "unranked" && v.tier !== "UNRANKED" ? v : null;
  };
  const queue = rankIn(want) ? want : rankIn(other) ? other : null;
  if (queue) {
    const v = rankIn(queue)!;
    return { state: "ranked", queue, tier: v.tier, division: APEX.has(v.tier) ? null : v.division, leaguePoints: v.leaguePoints, asOf, kind: reading.kind, stale };
  }
  // Unranked only on a check's word: a sighting never recorded the absence of a rank.
  if (reading.kind === "check") return { state: "unranked", queue: null, tier: null, division: null, leaguePoints: null, asOf, kind: "check", stale };
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
}

/**
 * The badge for one player's rank in a match window. A rank read over 30 days ago carries its
 * month (and the year when it differs), so its age shows without hovering, on phones too.
 */
export function rankBadgeLabel(rank: ParticipantRank, queueId: number | null, now = new Date()): RankBadgeLabel {
  if (rank.state === "unknown") return { text: "—", queueMark: null, spoken: "Rank not available", title: "Rank not available: not read from Riot" };
  const at = rank.asOf ? new Date(rank.asOf) : null;
  const day = at ? calendarDay(at) : null;
  const read = rank.kind === "sighting" ? "last seen" : "checked";
  const when = at && day ? `${read} ${formatDate(at)}` : read;
  if (rank.state === "unranked") {
    const spoken = `Unranked: no Ranked Solo/Duo or Flex entry when ${when}`;
    return { text: "Unranked", queueMark: null, spoken, title: spoken };
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
    title: `${spoken}. Their rank then, not at the time of this match`,
  };
}

const TIER_LETTERS: Record<string, string> = { IRON: "I", BRONZE: "B", SILVER: "S", GOLD: "G", PLATINUM: "P", EMERALD: "E", DIAMOND: "D", MASTER: "M", GRANDMASTER: "GM", CHALLENGER: "C" };

export interface RankShortLabel {
  /** "E2", "D4", "GM", "Unr"; null when nothing is known (the card shows nothing). */
  text: string | null;
  /** The ranked tier, for its colour; null when unranked or unknown. */
  tier: string | null;
  /** "f" (Flex) or "s" (Solo/Duo) when the rank shown is from the other ranked queue than the match's own (matchRankQueue). */
  queueMark: "f" | "s" | null;
  /** Read over RANK_AGE_SHOWN_DAYS ago: drawn quieter, its date on hover. */
  old: boolean;
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
  if (rank.state === "unknown") return { text: null, tier: null, queueMark: null, old: false, spoken: null, title: "Rank not available yet: not read from Riot" };
  const at = rank.asOf ? new Date(rank.asOf).getTime() : null;
  const old = at !== null && now.getTime() - at > RANK_AGE_SHOWN_DAYS * DAY_MS;
  if (rank.state === "unranked") return { text: "Unr", tier: null, queueMark: null, old, spoken: "unranked", title: full.title };
  const tier = rank.tier!;
  const division = rank.division ? (DIVISION[rank.division] ?? rank.division) : "";
  const queue = rank.queue ?? "solo";
  const other = queue !== matchRankQueue(queueId);
  const words = `${TIER_SHORT[tier] ?? titleCase(tier)}${division ? ` ${division}` : ""}`;
  return {
    text: `${TIER_LETTERS[tier] ?? tier.charAt(0)}${division}`,
    tier,
    queueMark: other ? (queue === "flex" ? "f" : "s") : null,
    old,
    spoken: other ? `${words} in ${queue === "flex" ? "Flex" : "Solo/Duo"}` : words,
    title: full.title,
  };
}

/**
 * When a match's ranks were checked, for the note under the scoreboard: "today", "22 Oct",
 * "20–24 Oct", "28 Sep–2 Oct" (with years when they differ from this one); null when none was.
 */
export function rankChecksWhen(ranks: readonly ParticipantRank[], now = new Date()): string | null {
  const times = ranks.filter((r) => r.kind === "check" && r.asOf).map((r) => new Date(r.asOf!).getTime());
  if (!times.length) return null;
  const first = Math.min(...times);
  const last = Math.max(...times);
  const today = formatDate(now);
  if (formatDate(first) === today && formatDate(last) === today) return "today";
  const thisYear = calendarDay(now)?.year;
  const show = (t: number) => (calendarDay(t)?.year === thisYear ? formatDayMonth(t) : formatDate(t));
  if (formatDate(first) === formatDate(last)) return show(last);
  const [a, b] = [calendarDay(first)!, calendarDay(last)!];
  return a.month === b.month && a.year === b.year ? `${a.day}–${show(last)}` : `${show(first)}–${show(last)}`;
}
