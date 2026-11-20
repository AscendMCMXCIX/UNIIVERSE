import { chooseSeason, seasonLabel } from "@/domain/season";
import { LEADERBOARD_QUEUES } from "@/domain/leaderboards";
import { mainRoleOf, rankRecentBoard, recentEntry, RECENT_PROVISIONAL_GAMES, RECENT_WINDOW_DAYS, RECENT_WINDOW_GAMES, shownValue, type RecentGap } from "@/domain/leaderboard-recent";
import { buildRecords, CHAMPION_GAME_MILESTONES, KDA_RECORD_MIN_TAKEDOWNS, MASTERY_MILESTONES, RECORD_MIN_GAME_S, shownRecordValue, type ChampionMilestone, type RecordMark, type SeasonRecordId } from "@/domain/leaderboard-records";
import type { GameRole } from "@/domain/season-stats";
import { formatCompactCount, formatCount, formatDate, formatDayMonth, formatNumber } from "@/lib/format";
import type { LeaderboardData, LeaderboardPlayer } from "./service";

/*
  What Team Leaderboards show (docs/LEADERBOARDS_MODEL.md, docs/TEAM_LEADERBOARDS.md): one page,
  built from the cached team data in a few milliseconds, with only display fields sent to the
  browser. Its parts, all from the one load (service.ts), none with a query of its own:
    Recent form              one board: each member's latest 20 Summoner's Rift games from the
                             last 60 days, ranked by win rate (domain/leaderboard-recent);
    Season records and       one season's single-game records, multikills and milestones, which
    achievements             reward playing more (domain/leaderboard-records). The season (the
                             current one unless the address names another) is theirs alone.
  Every linked account counts, a game seen from two of them once (service.ts).
*/

export interface BoardPlayer {
  id: string;
  name: string;
  /** Their profile, for members; null on the public boards, which link to no profile. */
  profileHref: string | null;
  avatarUrl: string | null;
  look: LeaderboardPlayer["look"];
}

export interface FormRow {
  playerId: string;
  /** The place among full windows (shared places repeat: 1, 2, 2, 4); null for a provisional row. */
  place: number | null;
  /** Shares its place with another member ("2="). */
  tied: boolean;
  status: "established" | "provisional";
  games: number;
  wins: number;
  losses: number;
  /** The win rate in whole points, as shown. */
  winRate: number;
  /** "12 Oct – 2 Nov": the first and last game of the window. */
  dates: string;
  role: { role: GameRole; games: number } | null;
  /** "1 win behind Ash", "Win your next game to draw level with Ash", "Provisional · 14 of 20 games". */
  note: string | null;
  /** The note in parts for the board's short gap (D5); the sentence stays, read out and as the row's tooltip. */
  gap: RecentGap | null;
  you: boolean;
}

export interface FormView {
  rows: FormRow[];
  /** Fewer than 10 recent games: the board's last group, with the games still needed. */
  notEnough: Array<{ playerId: string; games: number; needed: number; lastGame: string | null }>;
  window: { games: number; provisionalFrom: number; days: number };
}

export interface RecordView {
  id: SeasonRecordId;
  label: string;
  definition: string;
  /** What counts, in a few words on the record's row ("15+ min games"); null when the name says it all. Display only (RECORD_QUALIFIERS). */
  qualifier: string | null;
  holder: RecordHolder | null;
  /** The viewer's own best, when they have one and do not hold the record. */
  yours: RecordHolder | null;
}

export interface RecordHolder {
  playerId: string;
  value: string;
  unit: string;
  championId: string | null;
  role: GameRole | null;
  /** "18/2/9" for a single game. */
  kda: string | null;
  /** The game's date, or the streak's last win. */
  when: string | null;
  /**
   * Opens the game over the board (`/leaderboards?match=…`, the season kept): a docked Peek on wider
   * screens, the window on phones (PLAN S6c, UD.L3); null on the public boards and for the streak.
   */
  href: string | null;
  /** That game: the holder's, read through Match History's own actions (the profile's checks), and the way to it in their Match History. */
  game: { matchId: string; historyHref: string } | null;
}

export interface RecordsView {
  season: number;
  seasonLabel: string;
  seasons: Array<{ value: number; label: string; href: string }>;
  games: number;
  records: RecordView[];
  multikills: Array<{ playerId: string; penta: number; quadra: number; triple: number }>;
  /** Which games the multikills come from, when not every game carries them. */
  multikillNote: string | null;
  /** The same in a few words, shown on the board's line (the sentence is behind its ⓘ): "255 of 277 games". */
  multikillShort: string | null;
  /** Members with a champion milestone, the best first: games on one champion this season, and all-time mastery. */
  championGames: MilestoneGroup[];
  mastery: MilestoneGroup[];
}

/** One member's champion milestones: the best few, and how many more there are (the rest are on their profile). */
export interface MilestoneGroup {
  playerId: string;
  /** `value` in words ("486K points", "29 games"); `short` the figure alone for a chip ("486K", "29"). */
  items: Array<{ championId: string; value: string; short: string; milestone: string; tier: number }>;
  more: number;
}

/** The page: Recent form and the season's records and achievements, side by side, every member once in `players`. */
export interface LeaderboardsView {
  form: FormView;
  records: RecordsView;
  players: Record<string, BoardPlayer>;
  playerCount: number;
  viewer: string | null;
  lastUpdated: string | null;
}

export interface RecentViewOptions {
  /** The members' boards or the public ones; every link keeps to it. */
  basePath?: string;
  /** Links to profiles and games (members only). */
  profiles?: boolean;
  now?: Date;
}

/**
 * The page's address: the records' season when it is not the current one (Recent form takes none).
 * Records & achievements was a view of its own until 19 Nov 2026 (`?view=records`); that address
 * still opens this page, at the records (RetiredViewLanding).
 */
export function leaderboardsHref(season: number | null, options: Pick<RecentViewOptions, "basePath"> = {}): string {
  return `${options.basePath ?? "/leaderboards"}${season ? `?season=${season}` : ""}`;
}

/** What the address asks of the page: the records' season. A retired `view` asks nothing of the server. */
export function parseLeaderboardsQuery(params: Record<string, string | string[] | undefined>): { season: string | null } {
  const season = Array.isArray(params.season) ? params.season[0] : params.season;
  return { season: season ?? null };
}

const SUPPORTED = new Set<number>(LEADERBOARD_QUEUES.all.queues);
/** Champions shown per member under a milestone; the rest are counted. */
const MILESTONES_SHOWN = 3;

/**
 * What each season record counts, in a few words on its row (display only: the rules, and each
 * record's whole definition in the book's one ⓘ, are domain/leaderboard-records'): the per-minute
 * records' games of 15 minutes or more, the KDA record's 10 takedowns, the streak's order. Kills and
 * assists need none: their names say it all.
 */
export const RECORD_QUALIFIERS: Readonly<Record<SeasonRecordId, string | null>> = {
  kills: null,
  assists: null,
  "damage-per-minute": `to champions · ${formatCount(RECORD_MIN_GAME_S / 60)}+ min games`,
  "cs-per-minute": `${formatCount(RECORD_MIN_GAME_S / 60)}+ min games`,
  "vision-per-minute": `${formatCount(RECORD_MIN_GAME_S / 60)}+ min games`,
  kda: `${formatCount(KDA_RECORD_MIN_TAKEDOWNS)}+ takedowns`,
  "win-streak": "in game order",
};

/** Milestones (already sorted best first) by member: each member's best few, members in the order of their best. */
function groupMilestones(list: readonly ChampionMilestone[], steps: readonly number[], text: (c: ChampionMilestone) => { value: string; short: string; milestone: string }): MilestoneGroup[] {
  const groups = new Map<string, MilestoneGroup>();
  for (const c of list) {
    const g = groups.get(c.playerId) ?? { playerId: c.playerId, items: [], more: 0 };
    if (g.items.length < MILESTONES_SHOWN) g.items.push({ championId: c.championId, ...text(c), tier: steps.indexOf(c.milestone) + 1 });
    else g.more += 1;
    groups.set(c.playerId, g);
  }
  return [...groups.values()];
}
const kdaText = (m: RecordMark) => (m.game && m.game.kills !== null && m.game.deaths !== null && m.game.assists !== null ? `${m.game.kills}/${m.game.deaths}/${m.game.assists}` : null);

/** What every part of the page shares: the members as the boards show them, each one's games, the viewer. */
interface BoardContext {
  names: Map<string, string>;
  ids: string[];
  byPlayer: Map<string, LeaderboardData["games"]>;
  players: Record<string, BoardPlayer>;
  viewer: string | null;
  basePath: string;
  profiles: boolean;
  now: Date;
}

function boardContext(data: LeaderboardData, viewerPlayerId: string | null, options: RecentViewOptions): BoardContext {
  const { basePath = "/leaderboards", profiles = true, now = new Date() } = options;
  const names = new Map(data.players.map((p) => [p.id, p.name]));
  const ids = data.players.map((p) => p.id);
  const byPlayer = new Map<string, LeaderboardData["games"]>(ids.map((id) => [id, []]));
  for (const g of data.games) byPlayer.get(g.playerId)?.push(g);
  const players = Object.fromEntries(data.players.map((p) => [p.id, { id: p.id, name: p.name, profileHref: profiles ? `/players/${p.id}` : null, avatarUrl: p.avatarUrl, look: p.look }]));
  return { names, ids, byPlayer, players, viewer: viewerPlayerId && names.has(viewerPlayerId) ? viewerPlayerId : null, basePath, profiles, now };
}

/**
 * The whole page from one load of the team's data: Recent form and the season's records and
 * achievements, both at once (each a few milliseconds of memory work; neither reads anything).
 */
export function buildLeaderboardsView(data: LeaderboardData, request: { season?: string | number | null }, viewerPlayerId: string | null, options: RecentViewOptions = {}): LeaderboardsView {
  const ctx = boardContext(data, viewerPlayerId, options);
  return { form: formView(data, ctx), records: recordsView(data, request.season ?? null, ctx), players: ctx.players, playerCount: data.players.length, viewer: ctx.viewer, lastUpdated: data.lastUpdated };
}

/** Recent form alone (the production probe times each part of the page). */
export function buildFormView(data: LeaderboardData, viewerPlayerId: string | null, options: RecentViewOptions = {}): FormView {
  return formView(data, boardContext(data, viewerPlayerId, options));
}

/** The season's records and achievements alone (the production probe times each part of the page). */
export function buildRecordsView(data: LeaderboardData, request: { season?: string | number | null }, viewerPlayerId: string | null, options: RecentViewOptions = {}): RecordsView {
  return recordsView(data, request.season ?? null, boardContext(data, viewerPlayerId, options));
}

function formView(data: LeaderboardData, ctx: BoardContext): FormView {
  const { names, ids, byPlayer, viewer, now } = ctx;
  const scope = { board: "overall" as const, mode: "all" as const, now };
  const entries = ids.map((id) => recentEntry(id, byPlayer.get(id)!, scope));
  const board = rankRecentBoard(entries, "overall", "winRate", names);
  const primary = new Map(data.players.map((p) => [p.id, p.primaryRole as GameRole | null]));
  const rows: FormRow[] = board.rows.map((r) => ({
    playerId: r.entry.playerId,
    place: r.rank,
    tied: r.tied,
    status: r.rank === null ? "provisional" : "established",
    games: r.entry.games,
    wins: r.entry.wins,
    losses: r.entry.losses,
    winRate: shownValue("winRate", r.entry.figures.winRate!.value!),
    dates: r.entry.from !== null && r.entry.to !== null ? `${formatDayMonth(r.entry.from)} – ${formatDayMonth(r.entry.to)}` : "",
    role: mainRoleOf(r.entry, primary.get(r.entry.playerId) ?? null),
    note: r.note,
    gap: r.gap,
    you: r.entry.playerId === viewer,
  }));
  // The last supported game of a member in the board's last group, whenever it was (it may be older than 60 days).
  const lastGame = (id: string) => byPlayer.get(id)!.reduce<number | null>((m, g) => (g.queueId !== null && SUPPORTED.has(g.queueId) && (m === null || g.gameCreation > m) ? g.gameCreation : m), null);
  const notEnough = board.notEnough
    .map(({ entry, needed }) => ({ playerId: entry.playerId, games: entry.games, needed, last: lastGame(entry.playerId) }))
    .sort((a, b) => b.games - a.games || (b.last ?? 0) - (a.last ?? 0) || (names.get(a.playerId) ?? "").localeCompare(names.get(b.playerId) ?? ""))
    .map(({ last, ...n }) => ({ ...n, lastGame: last === null ? null : formatDate(last) }));
  return { rows, notEnough, window: { games: RECENT_WINDOW_GAMES, provisionalFrom: RECENT_PROVISIONAL_GAMES, days: RECENT_WINDOW_DAYS } };
}

function recordsView(data: LeaderboardData, requested: string | number | null, ctx: BoardContext): RecordsView {
  const { names, ids, viewer, basePath, profiles } = ctx;
  const season = chooseSeason(requested, data.seasons, data.currentSeason);
  const result = buildRecords({ games: data.games, mastery: data.mastery, playerIds: ids, season });
  // (The holder's own Match History redirects to My Profile's, keeping the game.)
  // The board's own address with the game (`?match=`), so a link to it opens the board with the game over it.
  const board = leaderboardsHref(season === data.currentSeason ? null : season, { basePath });
  const gameHref = (m: RecordMark) => (profiles && m.game ? `${board}${board.includes("?") ? "&" : "?"}match=${encodeURIComponent(m.game.matchId)}` : null);
  const gameOf = (m: RecordMark) => (profiles && m.game ? { matchId: m.game.matchId, historyHref: `/players/${m.playerId}/matches?match=${encodeURIComponent(m.game.matchId)}` } : null);
  const holderOf = (m: RecordMark, def: (typeof result.records)[number]["def"]): RecordHolder => ({
    playerId: m.playerId,
    value: formatNumber(shownRecordValue(def, m.value), def.decimals),
    unit: def.unit,
    championId: m.game?.championId ?? null,
    role: m.game?.role ?? null,
    kda: kdaText(m),
    when: m.game ? formatDate(m.game.gameCreation) : m.endedAt !== null ? formatDate(m.endedAt) : null,
    href: gameHref(m),
    game: gameOf(m),
  });
  const records: RecordView[] = result.records.map((r) => {
    const mine = viewer ? r.bests[viewer] : undefined;
    const holdsIt = !!r.holder && r.holder.playerId === viewer;
    return { id: r.def.id, label: r.def.label, definition: r.def.definition, qualifier: RECORD_QUALIFIERS[r.def.id], holder: r.holder ? holderOf(r.holder, r.def) : null, yours: mine && !holdsIt ? holderOf(mine, r.def) : null };
  });
  const byName = (a: { playerId: string }, b: { playerId: string }) => (names.get(a.playerId) ?? "").localeCompare(names.get(b.playerId) ?? "");
  const multikills = [...result.multikills].sort((a, b) => b.penta - a.penta || b.quadra - a.quadra || b.triple - a.triple || byName(a, b));
  const multikillNote = result.games === 0 ? null : result.multikillGames === 0 ? "No multikill counts yet for this season's games; a game without them is never counted as zero." : result.multikillGames < result.games ? `Counted from ${formatCount(result.multikillGames)} of ${formatCount(result.games)} games this season; the rest are left out, never counted as zero.` : null;
  const multikillShort = !multikillNote ? null : result.multikillGames === 0 ? "None of this season's games yet" : `From ${formatCount(result.multikillGames)} of ${formatCount(result.games)} games`;
  return {
    season,
    seasonLabel: seasonLabel(season),
    seasons: data.seasons.map((s) => ({ value: s, label: seasonLabel(s), href: leaderboardsHref(s === data.currentSeason ? null : s, { basePath }) })),
    games: result.games,
    records,
    multikills,
    multikillNote,
    multikillShort,
    championGames: groupMilestones(result.championGames, CHAMPION_GAME_MILESTONES, (c) => ({ value: `${formatCount(c.value)} games`, short: formatCount(c.value), milestone: `${c.milestone}+ games` })),
    mastery: groupMilestones(result.mastery, MASTERY_MILESTONES, (c) => ({ value: `${formatCompactCount(c.value)} points`, short: formatCompactCount(c.value), milestone: c.milestone >= 1_000_000 ? "1M+" : `${formatCount(c.milestone / 1000)}K+` })),
  };
}
