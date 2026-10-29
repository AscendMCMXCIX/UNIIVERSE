import { parseMultikills } from "./multikills";
import { canonicalPatch, comparePatches, publicPatchName } from "./patch";
import { MAX_VALID_DURATION_S, performanceOfGames, recordOf, type SeasonGame } from "./season-stats";

/*
  MATCH HISTORY REFINE: what Match History adds to the profile's filters (season, game mode, role,
  champions and account, shared with the Overview): the result, the patch, the days played, a team
  member with or against the player, and the games with a multikill or a personal best. They are
  applied to the stored games before the list is paged (server/players/match-history), each one a
  plain address parameter; one that cannot be read narrows nothing. And playing sessions: the games
  played in one sitting, told apart by the time between them, with the record of each sitting.

  Nothing here guesses: a game without a recorded result is neither a win nor a loss, a game
  without multikill counts has none to show, and a team member is with or against the player only
  as the stored game record places them (server/players/history-members).
*/

export type ResultChoice = "win" | "loss";
export type HighlightChoice = "double" | "triple" | "quadra" | "penta" | "best";
export type MemberSide = "with" | "against";

/** The highlights offered, smallest multikill first. "best": a figure above every earlier comparable game (domain/match-analysis). */
export const HIGHLIGHTS: ReadonlyArray<{ key: HighlightChoice; label: string }> = [
  { key: "double", label: "A multikill" },
  { key: "triple", label: "Triple kill or more" },
  { key: "quadra", label: "Quadra kill or more" },
  { key: "penta", label: "Pentakill" },
  { key: "best", label: "A personal best" },
];

const SIZE: Record<Exclude<HighlightChoice, "best">, number> = { double: 2, triple: 3, quadra: 4, penta: 5 };

export interface HistoryRefine {
  result: ResultChoice | null;
  /** A patch as stored ("16.20"); the address may name it by its public name too ("26.20"). */
  patch: string | null;
  /** Calendar days in the installation's time zone (lib/format isoDay), both included. */
  from: string | null;
  to: string | null;
  /** A team member's profile id, or "any" member, on the player's side or the other. */
  member: { side: MemberSide; id: string } | null;
  highlight: HighlightChoice | null;
  /** The list grouped into playing sessions (the order stays newest first). */
  sessions: boolean;
}

export const NO_REFINE: HistoryRefine = { result: null, patch: null, from: null, to: null, member: null, highlight: null, sessions: false };

/** The address parameters Refine reads. */
export interface RefineParams {
  result?: string;
  patch?: string;
  from?: string;
  to?: string;
  with?: string;
  against?: string;
  hl?: string;
  group?: string;
}

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "2026-10-21" when it names a real calendar day; null otherwise. */
export function readDay(value: string | undefined): string | null {
  const m = value ? DAY.exec(value.trim()) : null;
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d ? m[0] : null;
}

const MEMBER = /^(any|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/** The choices an address names; anything missing or unreadable is left out. Days given the wrong way round are swapped. */
export function readRefine(sp: RefineParams): HistoryRefine {
  const patch = sp.patch && /^\d{1,3}\.\d{1,3}$/.test(sp.patch.trim()) ? canonicalPatch(sp.patch) : null;
  let from = readDay(sp.from);
  let to = readDay(sp.to);
  if (from && to && from > to) [from, to] = [to, from];
  const withId = sp.with && MEMBER.test(sp.with) ? sp.with.toLowerCase() : null;
  const againstId = sp.against && MEMBER.test(sp.against) ? sp.against.toLowerCase() : null;
  return {
    result: sp.result === "win" || sp.result === "loss" ? sp.result : null,
    patch,
    from,
    to,
    member: withId ? { side: "with", id: withId } : againstId ? { side: "against", id: againstId } : null,
    highlight: HIGHLIGHTS.find((h) => h.key === sp.hl)?.key ?? null,
    sessions: sp.group === "sessions",
  };
}

/** The address parameters of a choice (the reverse of readRefine). */
export function refineParams(r: HistoryRefine): Record<string, string> {
  const out: Record<string, string> = {};
  if (r.result) out.result = r.result;
  if (r.patch) out.patch = r.patch;
  if (r.from) out.from = r.from;
  if (r.to) out.to = r.to;
  if (r.member) out[r.member.side] = r.member.id;
  if (r.highlight) out.hl = r.highlight;
  if (r.sessions) out.group = "sessions";
  return out;
}

/** Whether any choice narrows the games (grouping into sessions does not). */
export const narrowsGames = (r: HistoryRefine) => !!(r.result || r.patch || r.from || r.to || r.member || r.highlight);

/** The team members in one game, by profile id, as its stored record places them. */
export interface MembersInGame {
  with: readonly string[];
  against: readonly string[];
}

/** The largest multikill a game's stored counts show (2 = double … 5 = penta); null for none or without counts. */
export function largestMultikillOf(stored: string | null | undefined): 2 | 3 | 4 | 5 | null {
  const m = parseMultikills(stored);
  if (!m) return null;
  return m.penta > 0 ? 5 : m.quadra > 0 ? 4 : m.triple > 0 ? 3 : m.double > 0 ? 2 : null;
}

export interface RefineContext<G> {
  /** A game's calendar day in the installation's time zone ("2026-10-21"). */
  dayOf: (ms: number) => string;
  /** The team members in each game, by match; a game without any is absent. */
  members: ReadonlyMap<string, MembersInGame>;
  /** Whether a game set a personal best; asked only when that highlight is chosen. */
  best: (g: G) => boolean;
}

/** The games that meet every choice. The order is kept. */
export function refineGames<G extends SeasonGame>(games: readonly G[], r: HistoryRefine, ctx: RefineContext<G>): G[] {
  if (!narrowsGames(r)) return [...games];
  return games.filter((g) => {
    if (r.result && (g.win === null || g.win !== (r.result === "win"))) return false;
    if (r.patch && (!g.patch || canonicalPatch(g.patch) !== r.patch)) return false;
    if (r.from || r.to) {
      const day = ctx.dayOf(g.gameCreation);
      if ((r.from && day < r.from) || (r.to && day > r.to)) return false;
    }
    if (r.member) {
      const inGame = ctx.members.get(g.matchId);
      const ids = inGame ? inGame[r.member.side] : [];
      if (r.member.id === "any" ? ids.length === 0 : !ids.includes(r.member.id)) return false;
    }
    if (r.highlight === "best") return ctx.best(g);
    if (r.highlight) return (largestMultikillOf(g.multikills) ?? 0) >= SIZE[r.highlight];
    return true;
  });
}

/** The patches of these games, newest first, with how many games each: the patch choice. */
export function patchOptions(games: ReadonlyArray<Pick<SeasonGame, "patch">>): Array<{ patch: string; label: string; games: number }> {
  const counts = new Map<string, number>();
  for (const g of games) {
    if (!g.patch || !/^\d+\.\d+$/.test(g.patch.trim())) continue;
    const p = canonicalPatch(g.patch);
    counts.set(p, (counts.get(p) ?? 0) + 1);
  }
  return [...counts]
    .sort((a, b) => comparePatches(b[0], a[0]))
    .map(([patch, games]) => ({ patch, label: publicPatchName(patch), games }));
}

/*
  PLAYING SESSIONS. Two games belong to the same sitting when the later one started less than
  SESSION_GAP_MINUTES after the earlier one ended (its start plus its length). The sittings are
  found from every stored game of the player, whatever the filters, so a game of another mode
  played in between keeps a sitting whole; each sitting's figures count only the games the list
  shows. A sitting is named by its first game.
*/

/** Games less than this many minutes apart (one's end to the next one's start) are one sitting. */
export const SESSION_GAP_MINUTES = 45;

const lengthMs = (seconds: number | null | undefined) => (typeof seconds === "number" && seconds > 0 && seconds <= MAX_VALID_DURATION_S ? seconds * 1000 : 0);

/** The sitting of every game, by match: the match id of the sitting's first game. */
export function sessionKeys(all: ReadonlyArray<Pick<SeasonGame, "matchId" | "gameCreation" | "gameDuration">>): Map<string, string> {
  const sorted = [...all].sort((a, b) => a.gameCreation - b.gameCreation || a.matchId.localeCompare(b.matchId));
  const out = new Map<string, string>();
  let key: string | null = null;
  let end = -Infinity;
  for (const g of sorted) {
    if (key === null || g.gameCreation - end >= SESSION_GAP_MINUTES * 60_000) key = g.matchId;
    out.set(g.matchId, key);
    end = Math.max(end, g.gameCreation + lengthMs(g.gameDuration));
  }
  return out;
}

export interface SessionSummary {
  key: string;
  /** The first listed game's start and the last one's end, epoch milliseconds. */
  start: number;
  end: number;
  games: number;
  wins: number;
  losses: number;
  /** (kills + assists) ÷ deaths over the games with figures (season-stats rules); null without any. */
  kda: number | null;
  perfect: boolean;
  csPerMinute: number | null;
  /** Minutes in game: the listed games' lengths added up. */
  minutes: number;
}

/** Each sitting's figures over the games listed (already filtered), by sitting. */
export function sessionSummaries(listed: readonly SeasonGame[], keys: ReadonlyMap<string, string>): Map<string, SessionSummary> {
  const groups = new Map<string, SeasonGame[]>();
  for (const g of listed) {
    const key = keys.get(g.matchId) ?? g.matchId;
    const group = groups.get(key);
    if (group) group.push(g);
    else groups.set(key, [g]);
  }
  const out = new Map<string, SessionSummary>();
  for (const [key, games] of groups) {
    const record = recordOf(games);
    const perf = performanceOfGames(games);
    out.set(key, {
      key,
      start: Math.min(...games.map((g) => g.gameCreation)),
      end: Math.max(...games.map((g) => g.gameCreation + lengthMs(g.gameDuration))),
      games: games.length,
      wins: record.wins,
      losses: record.losses,
      kda: perf.kdaRatio,
      perfect: perf.perfectKda,
      csPerMinute: perf.csPerMinute,
      minutes: games.reduce((n, g) => n + lengthMs(g.gameDuration) / 60_000, 0),
    });
  }
  return out;
}
