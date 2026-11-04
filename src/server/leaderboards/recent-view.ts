import { chooseSeason, seasonLabel } from "@/domain/season";
import { LEADERBOARD_QUEUES } from "@/domain/leaderboards";
import { mainRoleOf, rankRecentBoard, recentEntry, RECENT_PROVISIONAL_GAMES, RECENT_WINDOW_DAYS, RECENT_WINDOW_GAMES, shownValue } from "@/domain/leaderboard-recent";
import { buildRecords, CHAMPION_GAME_MILESTONES, MASTERY_MILESTONES, shownRecordValue, type ChampionMilestone, type RecordMark, type SeasonRecordId } from "@/domain/leaderboard-records";
import type { GameRole } from "@/domain/season-stats";
import { formatCompactCount, formatCount, formatDate, formatDayMonth, formatNumber } from "@/lib/format";
import type { LeaderboardData, LeaderboardPlayer } from "./service";

/*
  What the proposed Leaderboards show (docs/LEADERBOARDS_MODEL.md, the owner's decision in
  docs/TEAM_LEADERBOARDS.md → "Recent form"): two views of the cached team data, computed in a few
  milliseconds, with only display fields sent to the browser.
    Recent form              one board: each member's latest 20 Summoner's Rift games from the
                             last 60 days, ranked by win rate (domain/leaderboard-recent);
    Records & achievements   one season's single-game records, multikills and milestones, which
                             reward playing more (domain/leaderboard-records).
  Every linked account counts, a game seen from two of them once (service.ts).
*/

export type LeaderboardTab = "form" | "records";

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
  you: boolean;
}

export interface FormView {
  rows: FormRow[];
  /** Fewer than 10 recent games: listed below the board with the games still needed. */
  notEnough: Array<{ playerId: string; games: number; needed: number; lastGame: string | null }>;
  window: { games: number; provisionalFrom: number; days: number };
}

export interface RecordView {
  id: SeasonRecordId;
  label: string;
  definition: string;
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
  /** Opens the game in the holder's Match History; null on the public boards and for the streak. */
  href: string | null;
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
  /** Members with a champion milestone, the best first: games on one champion this season, and all-time mastery. */
  championGames: MilestoneGroup[];
  mastery: MilestoneGroup[];
}

/** One member's champion milestones: the best few, and how many more there are (the rest are on their profile). */
export interface MilestoneGroup {
  playerId: string;
  items: Array<{ championId: string; value: string; milestone: string; tier: number }>;
  more: number;
}

export interface RecentLeaderboardView {
  tab: LeaderboardTab;
  tabs: Record<LeaderboardTab, string>;
  form: FormView | null;
  records: RecordsView | null;
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

/** The address of a view of the boards: Recent form is the default (no `view`), Records & achievements takes the season. */
export function recentLeaderboardHref(change: { tab: LeaderboardTab; season?: number | null }, options: Pick<RecentViewOptions, "basePath"> = {}): string {
  const q = new URLSearchParams();
  if (change.tab === "records") {
    q.set("view", "records");
    if (change.season) q.set("season", String(change.season));
  }
  const s = q.toString();
  return `${options.basePath ?? "/leaderboards"}${s ? `?${s}` : ""}`;
}

export function parseLeaderboardTab(params: Record<string, string | string[] | undefined>): { tab: LeaderboardTab; season: string | null } {
  const one = (k: string) => (Array.isArray(params[k]) ? params[k]![0] : params[k]) ?? null;
  return { tab: one("view") === "records" ? "records" : "form", season: one("season") };
}

const SUPPORTED = new Set<number>(LEADERBOARD_QUEUES.all.queues);
/** Champions shown per member under a milestone; the rest are counted. */
const MILESTONES_SHOWN = 3;

/** Milestones (already sorted best first) by member: each member's best few, members in the order of their best. */
function groupMilestones(list: readonly ChampionMilestone[], steps: readonly number[], text: (c: ChampionMilestone) => { value: string; milestone: string }): MilestoneGroup[] {
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

export function buildRecentLeaderboardView(data: LeaderboardData, request: { tab: LeaderboardTab; season?: string | number | null }, viewerPlayerId: string | null, options: RecentViewOptions = {}): RecentLeaderboardView {
  const { basePath = "/leaderboards", profiles = true, now = new Date() } = options;
  const names = new Map(data.players.map((p) => [p.id, p.name]));
  const viewer = viewerPlayerId && names.has(viewerPlayerId) ? viewerPlayerId : null;
  const ids = data.players.map((p) => p.id);
  const byPlayer = new Map<string, LeaderboardData["games"]>(ids.map((id) => [id, []]));
  for (const g of data.games) byPlayer.get(g.playerId)?.push(g);
  const players = Object.fromEntries(data.players.map((p) => [p.id, { id: p.id, name: p.name, profileHref: profiles ? `/players/${p.id}` : null, avatarUrl: p.avatarUrl, look: p.look }]));
  const season = chooseSeason(request.season ?? null, data.seasons, data.currentSeason);
  const tabs = { form: recentLeaderboardHref({ tab: "form" }, { basePath }), records: recentLeaderboardHref({ tab: "records", season: season === data.currentSeason ? null : season }, { basePath }) };
  const base = { tab: request.tab, tabs, players, playerCount: data.players.length, viewer, lastUpdated: data.lastUpdated };

  if (request.tab === "form") {
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
      you: r.entry.playerId === viewer,
    }));
    // The last supported game of a member below the board, whenever it was (it may be older than 60 days).
    const lastGame = (id: string) => byPlayer.get(id)!.reduce<number | null>((m, g) => (g.queueId !== null && SUPPORTED.has(g.queueId) && (m === null || g.gameCreation > m) ? g.gameCreation : m), null);
    const notEnough = board.notEnough
      .map(({ entry, needed }) => ({ playerId: entry.playerId, games: entry.games, needed, last: lastGame(entry.playerId) }))
      .sort((a, b) => b.games - a.games || (b.last ?? 0) - (a.last ?? 0) || (names.get(a.playerId) ?? "").localeCompare(names.get(b.playerId) ?? ""))
      .map(({ last, ...n }) => ({ ...n, lastGame: last === null ? null : formatDate(last) }));
    return { ...base, form: { rows, notEnough, window: { games: RECENT_WINDOW_GAMES, provisionalFrom: RECENT_PROVISIONAL_GAMES, days: RECENT_WINDOW_DAYS } }, records: null };
  }

  const result = buildRecords({ games: data.games, mastery: data.mastery, playerIds: ids, season });
  const gameHref = (m: RecordMark) => (profiles && m.game ? `/players/${m.playerId}/matches?match=${encodeURIComponent(m.game.matchId)}` : null);
  const holderOf = (m: RecordMark, def: (typeof result.records)[number]["def"]): RecordHolder => ({
    playerId: m.playerId,
    value: formatNumber(shownRecordValue(def, m.value), def.decimals),
    unit: def.unit,
    championId: m.game?.championId ?? null,
    role: m.game?.role ?? null,
    kda: kdaText(m),
    when: m.game ? formatDate(m.game.gameCreation) : m.endedAt !== null ? formatDate(m.endedAt) : null,
    href: gameHref(m),
  });
  const records: RecordView[] = result.records.map((r) => {
    const mine = viewer ? r.bests[viewer] : undefined;
    const holdsIt = !!r.holder && r.holder.playerId === viewer;
    return { id: r.def.id, label: r.def.label, definition: r.def.definition, holder: r.holder ? holderOf(r.holder, r.def) : null, yours: mine && !holdsIt ? holderOf(mine, r.def) : null };
  });
  const byName = (a: { playerId: string }, b: { playerId: string }) => (names.get(a.playerId) ?? "").localeCompare(names.get(b.playerId) ?? "");
  const multikills = [...result.multikills].sort((a, b) => b.penta - a.penta || b.quadra - a.quadra || b.triple - a.triple || byName(a, b));
  const multikillNote = result.games === 0 ? null : result.multikillGames === 0 ? "Riot's multikill figures are kept on newly collected games: none of this season's games carry them yet." : result.multikillGames < result.games ? `From the ${formatCount(result.multikillGames)} of ${formatCount(result.games)} games this season that carry Riot's multikill figures; the others are left out, not counted as zero.` : null;
  return {
    ...base,
    form: null,
    records: {
      season,
      seasonLabel: seasonLabel(season),
      seasons: data.seasons.map((s) => ({ value: s, label: seasonLabel(s), href: recentLeaderboardHref({ tab: "records", season: s === data.currentSeason ? null : s }, { basePath }) })),
      games: result.games,
      records,
      multikills,
      multikillNote,
      championGames: groupMilestones(result.championGames, CHAMPION_GAME_MILESTONES, (c) => ({ value: `${formatCount(c.value)} games`, milestone: `${c.milestone}+ games` })),
      mastery: groupMilestones(result.mastery, MASTERY_MILESTONES, (c) => ({ value: `${formatCompactCount(c.value)} points`, milestone: c.milestone >= 1_000_000 ? "1M+" : `${formatCount(c.milestone / 1000)}K+` })),
    },
  };
}
