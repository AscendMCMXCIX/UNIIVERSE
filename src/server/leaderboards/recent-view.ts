import { chooseSeason, seasonLabel } from "@/domain/season";
import { isActivePlayer, lastCountedGame } from "@/domain/leaderboards";
import { mainRoleOf, rankRecentBoard, recentEntry, RECENT_WINDOW_DAYS, RECENT_WINDOW_GAMES, shownValue, type RecentGap } from "@/domain/leaderboard-recent";
import { buildMultikillBoard, buildRecords, CHAMPION_GAME_MILESTONES, KDA_RECORD_MIN_TAKEDOWNS, MASTERY_MILESTONES, RECORD_MIN_GAME_S, shownRecordValue, type ChampionMilestone, type RecordMark, type SeasonRecordId } from "@/domain/leaderboard-records";
import type { GameRole } from "@/domain/season-stats";
import { ROLE_LABELS } from "@/domain/roles";
import { CHAMPION_PRIOR_GAMES, MULTIKILL_CUSHION, MULTIKILL_KEYS, MULTIKILL_RANKED_GAMES, MULTIKILL_WEIGHTS, mostPlayedRole, shownScore, type ComparisonBasis, type CountingRule, type MultikillBaseline, type MultikillKey, type RankedScore } from "@/domain/multikill-score";
import { formatCompactCount, formatCount, formatDate, formatDayMonth, formatNumber, formatOrdinal, percent } from "@/lib/format";
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

  Who is shown (25 Nov 2026, the owner's rule): only active players, with a counted game AND a
  successful data update in the last 30 days (domain/leaderboards, isActivePlayer), on every board
  alike, worked out here from the request's `now` (boardContext), so a returning player shows again
  by themselves. Each board's own qualification applies on top, and a player below it is simply not
  listed there (no "not enough games" groups, no provisional rows, no empty rows): Recent form lists
  full windows of 20 games, the multikills 20 or more games with counts. The records and milestones
  are the active players' own (a record held by an inactive player moves while they are away and
  comes back with them). The multikill comparison, and its team-wide fallback, still read every
  member's games: the season's statistics stay season-based; only what is shown follows the rule.
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
  /** The place among the full windows shown (shared places repeat: 1, 2, 2, 4). */
  place: number;
  /** Shares its place with another member ("2="). */
  tied: boolean;
  /** Always a full window: a shorter one is not listed (the 30-day rule's page, 25 Nov 2026). */
  status: "established";
  games: number;
  wins: number;
  losses: number;
  /** The win rate in whole points, as shown. */
  winRate: number;
  /** "12 Oct – 2 Nov": the first and last game of the window. */
  dates: string;
  role: { role: GameRole; games: number } | null;
  /** "1 win behind Ash", "Win your next game to draw level with Ash". */
  note: string | null;
  /** The note in parts for the board's short gap (D5); the sentence stays, read out and as the row's tooltip. */
  gap: RecentGap | null;
  you: boolean;
}

export interface FormView {
  /** Active players with a full window of 20 games, ranked; nobody else is listed (no provisional or "not enough" groups). */
  rows: FormRow[];
  window: { games: number; days: number };
}

export interface RecordView {
  id: SeasonRecordId;
  label: string;
  /** The label in a few words for the desktop board's two-line cell ("Damage per min"); `label` stays its accessible name. Display only (RECORD_SHORT). */
  short: string;
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
  multikills: MultikillsView;
  /** Which games the multikills come from, when not every game carries them. */
  multikillNote: string | null;
  /** The same in a few words, shown on the board's foot: "From 255 of 277 games". */
  multikillShort: string | null;
  /** The milestones the board shows: the most meaningful first, each shown player's best before anyone's second (MILESTONES_SHOWN at most). */
  milestones: MilestonesView;
}

/** One champion milestone as the board shows it. */
export interface MilestoneItem {
  playerId: string;
  kind: "games" | "mastery";
  championId: string;
  /** The figure alone for the chip ("486K", "29") and its unit ("mastery", "games"). */
  short: string;
  unit: string;
  /** In words, read out ("486K mastery points", "29 games this season") and its milestone ("500K+", "25+ games"). */
  value: string;
  milestone: string;
  /** 1–3: the milestone's step (100K/500K/1M points, 25/50/100 games): the chip's rarity colour. */
  tier: number;
}

export interface MilestonesView {
  items: MilestoneItem[];
  /** Milestones of the shown players beyond these (on their profiles). */
  more: number;
}

/** The multikill board (domain/multikill-score): the score's ranking of the active players with 20 or more games with counts. */
export interface MultikillsView {
  rows: MultikillRow[];
  /** What the score is, under the heading: ranked relative to the champions and roles played, or (the fallback) to the team's own games. */
  basis: string;
  /** The board's one ⓘ: what earns points and what the score compares, in plain words. */
  explain: string;
  /** "same-games": compared with the other players in the same games; "team": with the team's own games, not by champion or role. */
  source: "same-games" | "team";
  /** Where the typical results come from and how many games they hold (the breakdown's source line). */
  sourceText: string;
  /** How Riot's counters are read (the breakdown's limits, and the board's data-counting-rule): nested or separate, shown by the stored games or assumed. */
  rule: CountingRule;
  ruleShown: boolean;
  ruleText: string;
  /** Games with counts for a place on the board (20); the provisional band (10–19) is kept in the model but not listed. */
  rankedFrom: number;
}

/** A member's most-played role over the games behind their score (domain/multikill-score, mostPlayedRole): context only. */
export interface MultikillRole {
  kind: "role" | "split" | "unknown";
  /** The role, or the roles sharing the most games (Top-to-Support order); none when unknown. */
  roles: GameRole[];
  /** What the icon says ("Most played: Top, 85% of 60 games", "Split: Top and Mid, 45% each", "Role unknown: …"). */
  label: string;
  /** Every position played, most games first, then the games without one: "Top — 85% (51 games)". */
  rows: Array<{ role: GameRole | null; label: string; share: string; games: string; text: string }>;
}

export interface MultikillRow {
  playerId: string;
  /** The place among the ranked players shown (shared places repeat: 1, 2, 2, 4). */
  place: number;
  tied: boolean;
  /** Always ranked (20+ games with counts): provisional players and those with too few games are not listed. */
  status: "ranked";
  /** The score in whole points ("124"). */
  score: string;
  /** Each multikill once, at its largest (what the board shows and the score counts). */
  counts: { double: number; triple: number; quadra: number; penta: number };
  /** Riot's own counters added up, for the record (the profiles show these; nested counters count a pentakill's smaller kills too). */
  riot: { double: number; triple: number; quadra: number; penta: number };
  /** Games with counts (the score's games) / this season. */
  counted: number;
  games: number;
  /** The games column ("46"): games with counts; `gamesSpoken` says so in words, with the season's games when some have none. */
  gamesText: string;
  gamesSpoken: string;
  role: MultikillRole;
  /** The Score button's breakdown: every number from the score itself, formatted here. */
  breakdown: MultikillBreakdown;
  you: boolean;
}

/** The Score breakdown (the shared breakdown popover): what made the score, from scoreMember's own parts. */
export interface MultikillBreakdown {
  score: string;
  /** "1st of 6", "Tied for 2nd of 6". */
  place: string;
  /** "46 games with multikill counts". */
  games: string;
  /** When some season games carry no counts: "4 of 50 season games have no multikill counts and are left out, never counted as zero." */
  coverage: string | null;
  role: MultikillRole;
  /** The most-played champions, with the position played on them (a champion on two positions twice): at most BREAKDOWN_CHAMPIONS. */
  champions: Array<{ championId: string; role: GameRole | null; games: string }>;
  /** Each kind, double to penta: made (each once, at its largest), its points each, and its points ("27 × 2 = 54"). */
  kinds: Array<{ key: MultikillKey; label: string; made: string; weight: string; points: string }>;
  /** The final line's terms, exactly as shown: 100 × (earned + cushion) ÷ (expected + cushion) = score. `expected` has the decimals that reproduce the score (one, rarely more). */
  calculation: { earned: string; expected: string; cushion: string; score: string };
  /** How the games were compared, the levels used (only those with games). */
  comparison: Array<{ basis: Exclude<ComparisonBasis, "none">; label: string; games: string }>;
  /** True on the team-wide fallback: the score is not champion- or role-adjusted (said in words). */
  notAdjusted: boolean;
  /** "±9": the score's spread by chance alone at these games. */
  chance: string;
}

/** The page: Recent form and the season's records and achievements, every active player once in `players`. */
export interface LeaderboardsView {
  form: FormView;
  records: RecordsView;
  /** The active players (shown on the boards): nobody else's name reaches the page. */
  players: Record<string, BoardPlayer>;
  /** Active players: a counted game and a successful data update in the last 30 days. */
  playerCount: number;
  /** Every member with a player profile (the empty page tells "no members yet" from "nobody active"). */
  memberCount: number;
  viewer: string | null;
  lastUpdated: string | null;
}

export interface RecentViewOptions {
  /** The members' boards or the public ones; every link keeps to it. */
  basePath?: string;
  /** The multikill score's comparison for the records' season (multikill-baseline.ts); without it (or under 1,000 games) the team's own games. */
  multikillBaseline?: MultikillBaseline | null;
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

/** The milestones the board shows (two columns of four on the desktop board); the rest are on the players' profiles. */
const MILESTONES_SHOWN = 8;
/** The most-played champions the Score breakdown lists. */
const BREAKDOWN_CHAMPIONS = 4;

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

/**
 * Each record in a few words, for the desktop board's two-line cells (two columns of cells under
 * Recent form, 18–27rem each: "Most damage per minute" and its qualifier took three lines there).
 * Display only: the full label stays each cell's accessible name and its phone layout's words.
 */
export const RECORD_SHORT: Readonly<Record<SeasonRecordId, string>> = {
  kills: "Most kills",
  assists: "Most assists",
  "damage-per-minute": "Damage per min",
  "cs-per-minute": "CS per min",
  "vision-per-minute": "Vision per min",
  kda: "Best KDA",
  "win-streak": "Win streak",
};

/**
 * The milestones the board shows, from the shown players' own: the most meaningful first (the
 * highest step: 1M mastery or 100 games on one champion, then 500K or 50, then 100K or 25; within a
 * step this season's games before all-time mastery, the season being the board's; then the furthest
 * past the step), each player's best before anyone's second, so one player with many never fills
 * the board; at most MILESTONES_SHOWN, the rest counted (on the profiles).
 */
function pickMilestones(games: readonly ChampionMilestone[], mastery: readonly ChampionMilestone[]): MilestonesView {
  const item = (c: ChampionMilestone, kind: MilestoneItem["kind"]) => {
    const steps = kind === "games" ? CHAMPION_GAME_MILESTONES : MASTERY_MILESTONES;
    const tier = (steps as readonly number[]).indexOf(c.milestone) + 1;
    const view: MilestoneItem =
      kind === "games"
        ? { playerId: c.playerId, kind, championId: c.championId, short: formatCount(c.value), unit: c.value === 1 ? "game" : "games", value: `${formatCount(c.value)} games this season`, milestone: `${c.milestone}+ games`, tier }
        : { playerId: c.playerId, kind, championId: c.championId, short: formatCompactCount(c.value), unit: "mastery", value: `${formatCompactCount(c.value)} mastery points`, milestone: c.milestone >= 1_000_000 ? "1M+" : `${formatCount(c.milestone / 1000)}K+`, tier };
    return { view, past: c.value / c.milestone };
  };
  const all = [...games.map((c) => item(c, "games")), ...mastery.map((c) => item(c, "mastery"))];
  const season = (x: { view: MilestoneItem }) => (x.view.kind === "games" ? 0 : 1);
  const byMeaning = (a: (typeof all)[number], b: (typeof all)[number]) => b.view.tier - a.view.tier || season(a) - season(b) || b.past - a.past || a.view.playerId.localeCompare(b.view.playerId) || a.view.championId.localeCompare(b.view.championId);
  all.sort(byMeaning);
  // Each player's best first (in that order), then their next ones, round by round.
  const rounds = new Map<string, number>();
  const ranked = all.map((x) => {
    const round = rounds.get(x.view.playerId) ?? 0;
    rounds.set(x.view.playerId, round + 1);
    return { ...x, round };
  });
  ranked.sort((a, b) => a.round - b.round || byMeaning(a, b));
  return { items: ranked.slice(0, MILESTONES_SHOWN).map((x) => x.view), more: Math.max(0, ranked.length - MILESTONES_SHOWN) };
}
const kdaText = (m: RecordMark) => (m.game && m.game.kills !== null && m.game.deaths !== null && m.game.assists !== null ? `${m.game.kills}/${m.game.deaths}/${m.game.assists}` : null);

/** What every part of the page shares: the members as the boards show them, each one's games, the viewer. */
interface BoardContext {
  multikillBaseline: MultikillBaseline | null;
  names: Map<string, string>;
  /** Every member: the multikill comparison's team-wide fallback reads their games, whoever is shown. */
  allIds: string[];
  /** The active players, in the members' order: every board shows these alone. */
  ids: string[];
  byPlayer: Map<string, LeaderboardData["games"]>;
  players: Record<string, BoardPlayer>;
  viewer: string | null;
  basePath: string;
  profiles: boolean;
  now: Date;
}

/**
 * Who the boards show and what they share. Active players only (domain/leaderboards, isActivePlayer:
 * a counted game and a successful data update within the last 30 days of `now`, the request's own
 * time, never the clock here), so each entry point (the page, and Recent form or the records alone
 * for the production probe) shows the same players.
 */
function boardContext(data: LeaderboardData, viewerPlayerId: string | null, options: RecentViewOptions): BoardContext {
  const { basePath = "/leaderboards", profiles = true, now = new Date() } = options;
  const names = new Map(data.players.map((p) => [p.id, p.name]));
  const allIds = data.players.map((p) => p.id);
  const byPlayer = new Map<string, LeaderboardData["games"]>(allIds.map((id) => [id, []]));
  for (const g of data.games) byPlayer.get(g.playerId)?.push(g);
  const active = data.players.filter((p) => isActivePlayer({ lastGameAt: lastCountedGame(byPlayer.get(p.id)!, now), lastSyncedAt: p.lastSyncedAt }, now));
  const ids = active.map((p) => p.id);
  const players = Object.fromEntries(active.map((p) => [p.id, { id: p.id, name: p.name, profileHref: profiles ? `/players/${p.id}` : null, avatarUrl: p.avatarUrl, look: p.look }]));
  return { multikillBaseline: options.multikillBaseline ?? null, names, allIds, ids, byPlayer, players, viewer: viewerPlayerId && ids.includes(viewerPlayerId) ? viewerPlayerId : null, basePath, profiles, now };
}

/**
 * The whole page from one load of the team's data: Recent form and the season's records and
 * achievements, both at once (each a few milliseconds of memory work; neither reads anything).
 */
export function buildLeaderboardsView(data: LeaderboardData, request: { season?: string | number | null }, viewerPlayerId: string | null, options: RecentViewOptions = {}): LeaderboardsView {
  const ctx = boardContext(data, viewerPlayerId, options);
  return { form: formView(data, ctx), records: recordsView(data, request.season ?? null, ctx), players: ctx.players, playerCount: ctx.ids.length, memberCount: data.players.length, viewer: ctx.viewer, lastUpdated: data.lastUpdated };
}

/** Recent form alone (the production probe times each part of the page). */
export function buildFormView(data: LeaderboardData, viewerPlayerId: string | null, options: RecentViewOptions = {}): FormView {
  return formView(data, boardContext(data, viewerPlayerId, options));
}

/** The season's records and achievements alone (the production probe times each part of the page). */
export function buildRecordsView(data: LeaderboardData, request: { season?: string | number | null }, viewerPlayerId: string | null, options: RecentViewOptions = {}): RecordsView {
  return recordsView(data, request.season ?? null, boardContext(data, viewerPlayerId, options));
}

/** Recent form: the active players with a full window of 20 games, ranked among themselves (a shorter window is not listed). */
function formView(data: LeaderboardData, ctx: BoardContext): FormView {
  const { names, ids, byPlayer, viewer, now } = ctx;
  const scope = { board: "overall" as const, mode: "all" as const, now };
  const entries = ids.map((id) => recentEntry(id, byPlayer.get(id)!, scope));
  const board = rankRecentBoard(entries, "overall", "winRate", names, viewer);
  const primary = new Map(data.players.map((p) => [p.id, p.primaryRole as GameRole | null]));
  // Full windows only (their places count among them alone, so nothing is skipped): a provisional window is not listed.
  const rows: FormRow[] = board.rows.flatMap((r) =>
    r.rank === null
      ? []
      : [
          {
            playerId: r.entry.playerId,
            place: r.rank,
            tied: r.tied,
            status: "established" as const,
            games: r.entry.games,
            wins: r.entry.wins,
            losses: r.entry.losses,
            winRate: shownValue("winRate", r.entry.figures.winRate!.value!),
            dates: r.entry.from !== null && r.entry.to !== null ? `${formatDayMonth(r.entry.from)} – ${formatDayMonth(r.entry.to)}` : "",
            role: mainRoleOf(r.entry, primary.get(r.entry.playerId) ?? null),
            note: r.note,
            gap: r.gap,
            you: r.entry.playerId === viewer,
          },
        ],
  );
  return { rows, window: { games: RECENT_WINDOW_GAMES, days: RECENT_WINDOW_DAYS } };
}

/** The season the records, the multikills and the champion games show for this address (the current one unless it names another offered season). */
export function recordsSeason(data: Pick<LeaderboardData, "seasons" | "currentSeason">, request: { season?: string | number | null }): number {
  return chooseSeason(request.season ?? null, data.seasons, data.currentSeason);
}

function recordsView(data: LeaderboardData, requested: string | number | null, ctx: BoardContext): RecordsView {
  const { ids, viewer, basePath, profiles } = ctx;
  const season = recordsSeason(data, { season: requested });
  // The active players' own records and milestones: a record held by someone away moves while they are, and comes back with them.
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
    return { id: r.def.id, label: r.def.label, short: RECORD_SHORT[r.def.id], definition: r.def.definition, qualifier: RECORD_QUALIFIERS[r.def.id], holder: r.holder ? holderOf(r.holder, r.def) : null, yours: mine && !holdsIt ? holderOf(mine, r.def) : null };
  });
  const multikills = multikillsView(data, season, ctx);
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
    milestones: pickMilestones(result.championGames, result.mastery),
  };
}

const KIND_LABELS: Record<MultikillKey, string> = { double: "Double kills", triple: "Triple kills", quadra: "Quadra kills", penta: "Pentakills" };
const gamesWord = (n: number) => `${formatCount(n)} game${n === 1 ? "" : "s"}`;
/** "Top", "Top and Mid", "Top, Mid and Bottom". */
const andList = (words: readonly string[]) => (words.length <= 1 ? (words[0] ?? "") : `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`);

/**
 * The expected points as the breakdown shows them: one decimal, or as many as it takes for the final
 * line to give the score shown (two or three in about one score in a hundred, more only where the
 * score is a hair from a half), so a reader's own arithmetic lands on it.
 */
export function expectedPointsText(earned: number, expected: number, shown: number): string {
  for (let digits = 1; digits <= 8; digits++) {
    const x = Number(expected.toFixed(digits));
    if (Math.round((100 * (earned + MULTIKILL_CUSHION)) / (x + MULTIKILL_CUSHION)) === shown) return formatNumber(x, digits);
  }
  return formatNumber(expected, 8);
}

/** A member's most-played role over the games behind their score, in words (context only: the score uses each game's own champion and role). */
function roleView(r: RankedScore): MultikillRole {
  const m = mostPlayedRole(r.played);
  const share = (games: number) => percent(m.total ? games / m.total : 0, 0);
  const rows = m.rows.map((row) => {
    const label = row.role ? ROLE_LABELS[row.role] : "Unknown";
    return { role: row.role, label, share: share(row.games), games: gamesWord(row.games), text: `${label} — ${share(row.games)} (${gamesWord(row.games)})` };
  });
  if (m.kind === "role") return { kind: "role", roles: [m.role], label: `Most played: ${ROLE_LABELS[m.role]}, ${share(m.games)} of ${gamesWord(m.total)}`, rows };
  if (m.kind === "split") return { kind: "split", roles: m.roles, label: `Split: ${andList(m.roles.map((x) => ROLE_LABELS[x]))}, ${share(m.games)} each`, rows };
  return { kind: "unknown", roles: [], label: "Role unknown: no position recorded in these games", rows };
}

const BASIS_LABELS: Record<Exclude<ComparisonBasis, "none">, string> = {
  "champion-role": "By champion and role",
  role: `By role (champion under ${formatCount(CHAMPION_PRIOR_GAMES)} games)`,
  all: "All positions together",
  team: "The team's own games",
};

/**
 * The multikill board as the page shows it (docs/TEAM_LEADERBOARDS.md, "The multikill score"): the
 * active players with a place (20 or more games with counts), ranked among themselves, each with
 * their counts (each multikill once, at its largest: the score's own events; Riot's raw counters
 * stay on the profiles), their most-played role and the Score breakdown, all from scoreMember's
 * own parts (the page works nothing out again).
 */
function multikillsView(data: LeaderboardData, season: number, ctx: BoardContext): MultikillsView {
  const { names, allIds, ids, viewer } = ctx;
  // Every member's games feed the comparison's team-wide fallback; only the active players are scored, ranked and shown.
  const board = buildMultikillBoard({ games: data.games, playerIds: allIds, visible: ids, season, baseline: ctx.multikillBaseline, nameOf: (id) => names.get(id) ?? "" });
  const { baseline } = board;
  const source = baseline.source;
  const ranked = board.rows.filter((r) => r.status === "ranked" && r.score !== null && r.place !== null);
  const rows: MultikillRow[] = ranked.map((r) => {
    const shown = shownScore(r.score!);
    const partial = r.counted !== r.games;
    const role = roleView(r);
    const comparison = (["champion-role", "role", "all", "team"] as const).flatMap((basis) => (r.comparison[basis] > 0 ? [{ basis, label: BASIS_LABELS[basis], games: gamesWord(r.comparison[basis]) }] : []));
    const breakdown: MultikillBreakdown = {
      score: formatCount(shown),
      place: `${r.tied ? `Tied for ${formatOrdinal(r.place!)}` : formatOrdinal(r.place!)} of ${formatCount(ranked.length)}`,
      games: `${gamesWord(r.counted)} with multikill counts`,
      coverage: partial ? `${formatCount(r.games - r.counted)} of ${formatCount(r.games)} season games have no multikill counts and are left out, never counted as zero.` : null,
      role,
      champions: r.champions.slice(0, BREAKDOWN_CHAMPIONS).map((c) => ({ championId: c.championId, role: c.role, games: gamesWord(c.games) })),
      kinds: MULTIKILL_KEYS.map((k) => ({ key: k, label: KIND_LABELS[k], made: formatCount(r.events[k]), weight: formatCount(MULTIKILL_WEIGHTS[k]), points: formatCount(MULTIKILL_WEIGHTS[k] * r.events[k]) })),
      calculation: { earned: formatCount(r.points), expected: expectedPointsText(r.points, r.expectedPoints, shown), cushion: formatCount(MULTIKILL_CUSHION), score: formatCount(shown) },
      comparison,
      notAdjusted: source === "team",
      chance: `±${formatCount(Math.max(1, Math.round(r.chance ?? 0)))}`,
    };
    return {
      playerId: r.playerId,
      place: r.place!,
      tied: r.tied,
      status: "ranked",
      score: formatCount(shown),
      counts: { ...r.events },
      riot: { ...r.counts },
      counted: r.counted,
      games: r.games,
      gamesText: formatCount(r.counted),
      gamesSpoken: partial ? `${formatCount(r.counted)} of ${gamesWord(r.games)} with multikill counts` : `${gamesWord(r.counted)} with multikill counts`,
      role,
      breakdown,
      you: r.playerId === viewer,
    };
  });
  const ruleText = !baseline.reading.shown
    ? "Each multikill counts once, at its largest. Riot's counters are read as nested, the reading that can never count one twice."
    : baseline.reading.rule === "nested"
      ? "Each multikill counts once, at its largest: a pentakill is not also counted as a double, triple and quadra."
      : "Each multikill counts once, at its largest, as Riot's own counters already count them.";
  const sourceText =
    source === "same-games"
      ? `Typical results come from ${formatCount(baseline.all.games)} games of other players in the team's stored season matches, excluding team members — not every League player.`
      : `Typical results come from the team's own ${formatCount(baseline.all.games)} games with multikill counts, every position together: too few other players' games are stored for a champion and role comparison.`;
  return {
    rows,
    basis: source === "same-games" ? "Ranked by multikill performance relative to the champions and roles played." : "Ranked by multikill performance relative to the team's own games.",
    explain:
      source === "same-games"
        ? "Multikills earn 2–5 points. The score compares a player's points with typical results for their champions and roles, accounting for games played."
        : "Multikills earn 2–5 points. The score compares a player's points with the team's typical results, accounting for games played.",
    source,
    sourceText,
    rule: baseline.reading.rule,
    ruleShown: baseline.reading.shown,
    ruleText,
    rankedFrom: MULTIKILL_RANKED_GAMES,
  };
}

