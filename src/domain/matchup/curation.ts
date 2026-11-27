import type { Role } from "@/domain/roles";
import type { MatchupNote, NoteFreshness } from "./notes";

/*
  MATCHUP INTEL's curation queue (Admin → Platform Settings → Matchup notes; docs/MATCHUP_INTEL.md,
  "Curation"): which notes to write or re-check first, from how often the team's members met each
  lane opponent and each pairing this season (server/matchup/queue.ts) and each note's state now.
  Pure, tested in curation.test.ts. Admin only: champion names and counts, never whose games.

  Sections, in order:
  1. Needs re-review: published notes not re-checked (stale) or hidden (Riot changed a champion, or
     four patches old), the most met first.
  2. Not written yet: opponents by role, then pairings, the most met first, each without a live
     note (a draft counts as written, and says so).
  3. Published and fresh, the most met first.
*/

/** One count of the members' meetings: a pairing (championId set) or an opponent in a role (championId null). */
export interface MeetCount {
  role: Role;
  championId: string | null;
  opponentId: string;
  games: number;
  /** The latest game's start, ms. */
  last: number;
  withTimeline: number;
}

export interface QueueEntry {
  key: string;
  role: Role;
  scope: "opponent" | "pair";
  championId: string | null;
  opponentId: string;
  /** The members' games of it this season (0 where the team has not met it). */
  games: number;
  last: number | null;
  withTimeline: number;
  /** The live note for it, with its state now; null for none. */
  note: { note: MatchupNote; freshness: NoteFreshness } | null;
}

export interface CurationQueue {
  needsReview: QueueEntry[];
  notWritten: QueueEntry[];
  fresh: QueueEntry[];
  drafts: QueueEntry[];
}

export const keyOf = (scope: "opponent" | "pair", role: string, opponentId: string, championId: string | null) => `${scope}|${role}|${opponentId}|${scope === "pair" ? (championId ?? "") : ""}`;

/** The queue from the meetings and the notes (every live note, with its freshness). */
export function curationQueue(meets: readonly MeetCount[], notes: ReadonlyArray<{ note: MatchupNote; freshness: NoteFreshness }>, role: Role | null = null): CurationQueue {
  const live = new Map(notes.filter((n) => n.note.status !== "retired").map((n) => [keyOf(n.note.scope, n.note.role, n.note.opponentId, n.note.championId), n]));
  const entries = new Map<string, QueueEntry>();
  for (const m of meets) {
    // A champion is picked once in a draft game: a "pairing" of one champion with itself is a record's error, never a lane to write about.
    if (m.championId && m.championId === m.opponentId) continue;
    const scope = m.championId ? "pair" : "opponent";
    const key = keyOf(scope, m.role, m.opponentId, m.championId);
    entries.set(key, { key, role: m.role, scope, championId: m.championId, opponentId: m.opponentId, games: m.games, last: m.last, withTimeline: m.withTimeline, note: live.get(key) ?? null });
  }
  for (const [key, n] of live) if (!entries.has(key)) entries.set(key, { key, role: n.note.role, scope: n.note.scope, championId: n.note.championId, opponentId: n.note.opponentId, games: 0, last: null, withTimeline: 0, note: n });
  const all = [...entries.values()].filter((e) => !role || e.role === role);
  const byGames = (a: QueueEntry, b: QueueEntry) => b.games - a.games || (b.last ?? 0) - (a.last ?? 0) || a.key.localeCompare(b.key);
  const published = (e: QueueEntry) => e.note?.note.status === "published";
  return {
    needsReview: all.filter((e) => published(e) && e.note!.freshness.state !== "fresh").sort(byGames),
    notWritten: all.filter((e) => !e.note && e.games > 0).sort((a, b) => (a.scope === b.scope ? byGames(a, b) : a.scope === "opponent" ? -1 : 1)),
    fresh: all.filter((e) => published(e) && e.note!.freshness.state === "fresh").sort(byGames),
    drafts: all.filter((e) => e.note?.note.status === "draft").sort(byGames),
  };
}
