import { seasonLabel } from "@/domain/season";
import {
  buildBoard,
  chaseText,
  DEFAULT_LEADERBOARD_QUEUE,
  formatMetric,
  gamesInScope,
  isLeaderboardCategory,
  isLeaderboardQueue,
  isLeaderboardRole,
  LEADERBOARD_CATEGORIES,
  LEADERBOARD_QUEUES,
  METRIC_BY_ID,
  METRICS,
  metricsFor,
  type Board,
  type LeaderboardCategory,
  type LeaderboardQueue,
  type MetricDef,
  type PlayerData,
} from "@/domain/leaderboards";
import type { GameRole } from "@/domain/season-stats";
import type { LeaderboardData, LeaderboardPlayer } from "./service";

/*
  What the Leaderboards page shows for one set of filters, computed from the cached data in a
  few milliseconds: the selected metric's board, every metric of the category with its leader
  and your place, where you rank best overall, the team's record holders and your personal
  bests. Only display fields travel to the browser.
*/

export interface LeaderboardFilters {
  season: number;
  queue: LeaderboardQueue;
  role: GameRole | null;
  lineupOnly: boolean;
  category: LeaderboardCategory;
  metricId: string;
  /** The Highlights landing: one tile per headline statistic instead of a single board. */
  highlights: boolean;
}

export function parseFilters(params: Record<string, string | string[] | undefined>, data: Pick<LeaderboardData, "currentSeason" | "seasons">): LeaderboardFilters {
  const one = (k: string) => (Array.isArray(params[k]) ? params[k]![0] : params[k]);
  const season = Number(one("season"));
  // "highlights" is the name shown for the first category (its key stays "overview" for old links).
  const rawCategory = one("category") === "highlights" ? "overview" : one("category");
  const category = isLeaderboardCategory(rawCategory) ? (rawCategory as LeaderboardCategory) : "overview";
  const metricParam = one("metric");
  const role = isLeaderboardRole(one("role")) ? (one("role") as GameRole) : null;
  // A metric from another category (a stale link) falls back to the category's first metric.
  const inCategory = metricsFor(category, role);
  const metricId = metricParam && METRIC_BY_ID.get(metricParam)?.category === category ? metricParam : inCategory[0]!.id;
  return {
    season: data.seasons.includes(season) ? season : data.currentSeason,
    queue: isLeaderboardQueue(one("queue")) ? (one("queue") as LeaderboardQueue) : DEFAULT_LEADERBOARD_QUEUE,
    role,
    lineupOnly: one("lineup") === "1",
    category,
    metricId,
    highlights: category === "overview" && !(metricParam && METRIC_BY_ID.get(metricParam)?.category === "overview"),
  };
}

export interface ViewPlayer {
  id: string;
  name: string;
  avatarUrl: string | null;
  look: LeaderboardPlayer["look"];
  art: LeaderboardPlayer["art"];
  role: LeaderboardPlayer["primaryRole"];
  rank: LeaderboardPlayer["rank"];
}

export interface ViewEntry {
  playerId: string;
  rank: number;
  valueText: string;
  sampleText: string;
  chase: string | null;
  championId: string | null;
  when: string | null;
  note: string | null;
  /** Length of the gap bar: this value against the leader's (1 = the leader), for a quick visual. */
  bar: number;
}

export interface MetricSummary {
  id: string;
  label: string;
  kind: MetricDef["kind"];
  leader: { playerId: string; valueText: string } | null;
  /** Your place on this metric (null when you are not ranked or not a player). */
  yours: { rank: number; of: number } | null;
}

/** One Highlights tile: the statistic, its leader and the runner-up. */
export interface HighlightTile {
  metricId: string;
  category: LeaderboardCategory;
  label: string;
  leader: { playerId: string; valueText: string; sampleText: string } | null;
  runnerUp: { playerId: string; valueText: string } | null;
  yours: { rank: number; of: number } | null;
}

export interface LeaderboardView {
  filters: LeaderboardFilters;
  highlights: HighlightTile[];
  scopeLabel: string;
  seasons: Array<{ value: number; label: string }>;
  currentSeason: number;
  categories: Array<{ key: LeaderboardCategory; label: string }>;
  metrics: MetricSummary[];
  board: {
    id: string;
    label: string;
    kind: MetricDef["kind"];
    definition: string;
    unit: string;
    source: MetricDef["source"];
    lowerIsBetter: boolean;
    ranked: ViewEntry[];
    unranked: Array<{ playerId: string; progress: string }>;
    noData: string[];
    minGames: number;
    /** A note when the metric's data only exists on newer games. */
    dataNote: string | null;
  };
  you: { playerId: string; rank: number | null; of: number; chase: string | null; status: string; valueText: string | null; leader: { playerId: string; valueText: string } | null } | null;
  /** The metrics before and after this one in the category (quick stepping through boards). */
  neighbours: { previous: { id: string; label: string } | null; next: { id: string; label: string } | null; position: number; count: number };
  strengths: Array<{ metricId: string; category: LeaderboardCategory; label: string; rank: number; of: number; valueText: string }>;
  recordHolders: Array<{ metricId: string; category: LeaderboardCategory; label: string; playerId: string; valueText: string; championId: string | null }>;
  personalBests: Array<{ metricId: string; label: string; yoursText: string | null; teamText: string | null; holderId: string | null; championId: string | null; when: string | null }>;
  players: Record<string, ViewPlayer>;
  playerCount: number;
  gamesInScope: number;
  lastUpdated: string | null;
  extraSince: string | null;
}

const dateText = (ms: number | undefined) => (ms ? new Date(ms).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : null);

function entryOf(board: Board, i: number): ViewEntry {
  const e = board.ranked[i]!;
  const m = board.metric;
  const sample = m.source === "mastery" ? (m.id === "mastery-total" ? `${e.sample} champions` : "") : m.kind === "record" && m.id !== "win-streak" ? `best of ${e.sample} games` : `${e.sample} game${e.sample === 1 ? "" : "s"}`;
  const lead = board.ranked[0]!.value;
  // Lower is better: the leader's (smallest) value over this one; otherwise this one over the leader's.
  const bar = m.lowerIsBetter ? (e.value > 0 ? lead / e.value : 1) : lead > 0 ? e.value / lead : 0;
  return {
    playerId: e.playerId,
    rank: e.rank,
    valueText: formatMetric(m, e.value),
    sampleText: sample,
    chase: chaseText(m, e),
    championId: e.context?.championId ?? null,
    when: dateText(e.context?.gameCreation),
    note: e.context?.note ?? null,
    bar: Math.max(0, Math.min(1, Number.isFinite(bar) ? bar : 0)),
  };
}

const HIGHLIGHTS = ["penta-kills", "max-vision", "cs-per-minute", "win-streak", "max-kills", "kill-participation"];
/** The ten statistics on the Highlights landing, one per tile, across the categories. */
export const HIGHLIGHT_TILES = ["win-rate", "kda", "kill-participation", "damage-per-minute", "cs-per-minute", "vision-per-minute", "objective-damage", "best-champion-win-rate", "max-kills", "win-streak"];
const PERSONAL_BESTS = ["max-kills", "max-assists", "max-kda", "max-vision", "max-cs-per-minute", "max-damage", "max-gold", "win-streak"];

export function buildLeaderboardView(data: LeaderboardData, filters: LeaderboardFilters, viewerPlayerId: string | null): LeaderboardView {
  const lineup = new Set(data.lineupIds);
  const players = data.players.filter((p) => !filters.lineupOnly || lineup.has(p.id));
  const scope = { season: filters.season, queue: filters.queue, role: filters.role };
  const inScope = gamesInScope(data.games, scope);
  const byPlayer = new Map<string, PlayerData>(players.map((p) => [p.id, { playerId: p.id, games: [], mastery: [] }]));
  for (const g of inScope) byPlayer.get(g.playerId)?.games.push(g);
  for (const m of data.mastery) byPlayer.get(m.playerId)?.mastery.push(m);
  const list = [...byPlayer.values()];
  const names = new Map(players.map((p) => [p.id, p.name]));
  const boards = new Map(METRICS.map((m) => [m.id, buildBoard(m, list, { role: filters.role }, names)]));
  const viewer = viewerPlayerId && byPlayer.has(viewerPlayerId) ? viewerPlayerId : null;

  const summary = (m: MetricDef): MetricSummary => {
    const b = boards.get(m.id)!;
    const lead = b.ranked[0];
    const mine = viewer ? b.ranked.find((r) => r.playerId === viewer) : undefined;
    return { id: m.id, label: m.label, kind: m.kind, leader: lead ? { playerId: lead.playerId, valueText: formatMetric(m, lead.value) } : null, yours: mine ? { rank: mine.rank, of: b.ranked.length } : null };
  };

  const board = boards.get(filters.metricId)!;
  const metric = board.metric;
  const anyExtra = list.some((p) => p.games.some((g) => g.extra));
  const anyDetails = list.some((p) => p.games.some((g) => g.teamKills !== null));
  const dataNote =
    metric.source === "extra"
      ? anyExtra
        ? `Counted from the games that carry this figure: it is kept from ${dateText(data.extraSince ?? undefined) ?? "recently"} on, so older games are not included (they are left out, not counted as zero).`
        : "This figure has only just started being kept: it fills in as new games are synced. Older games are left out, not counted as zero."
      : metric.source === "details"
        ? anyDetails
          ? "Uses the full match details stored for each game; games without them are left out."
          : "No stored match details in this scope yet."
        : metric.source === "mastery"
          ? "Riot's champion mastery, all-time on every linked account: not limited by the season, queue or role filters."
          : null;

  const myEntry = viewer ? board.ranked.find((r) => r.playerId === viewer) : undefined;
  const myUnranked = viewer ? board.unranked.find((u) => u.playerId === viewer) : undefined;
  const you = viewer
    ? {
        playerId: viewer,
        rank: myEntry?.rank ?? null,
        of: board.ranked.length,
        chase: myEntry ? chaseText(metric, myEntry) : null,
        valueText: myEntry ? formatMetric(metric, myEntry.value) : null,
        leader: board.ranked[0] ? { playerId: board.ranked[0].playerId, valueText: formatMetric(metric, board.ranked[0].value) } : null,
        status: myEntry ? (myEntry.rank === 1 ? "You lead this board." : `#${myEntry.rank} of ${board.ranked.length}`) : myUnranked ? `Not ranked yet: ${myUnranked.sample} of ${board.minGames} games needed.` : "No games for this metric in the selected scope.",
      }
    : null;

  const strengths = viewer
    ? METRICS.map((m) => ({ m, b: boards.get(m.id)! }))
        .map(({ m, b }) => ({ m, b, e: b.ranked.find((r) => r.playerId === viewer) }))
        .filter((x) => x.e && x.e.rank <= 3 && x.b.ranked.length >= 2)
        .sort((a, b) => a.e!.rank - b.e!.rank || b.b.ranked.length - a.b.ranked.length)
        .slice(0, 6)
        .map(({ m, b, e }) => ({ metricId: m.id, category: m.category, label: m.label, rank: e!.rank, of: b.ranked.length, valueText: formatMetric(m, e!.value) }))
    : [];

  const recordHolders = HIGHLIGHTS.map((id) => boards.get(id)!)
    .filter((b) => b.ranked[0] && b.ranked[0].value > 0)
    .map((b) => ({ metricId: b.metric.id, category: b.metric.category, label: b.metric.label, playerId: b.ranked[0]!.playerId, valueText: formatMetric(b.metric, b.ranked[0]!.value), championId: b.ranked[0]!.context?.championId ?? null }));

  const personalBests = viewer
    ? PERSONAL_BESTS.map((id) => boards.get(id)!).map((b) => {
        const mine = b.ranked.find((r) => r.playerId === viewer);
        const top = b.ranked[0];
        return { metricId: b.metric.id, label: b.metric.label, yoursText: mine ? formatMetric(b.metric, mine.value) : null, teamText: top ? formatMetric(b.metric, top.value) : null, holderId: top?.playerId ?? null, championId: mine?.context?.championId ?? null, when: dateText(mine?.context?.gameCreation) };
      })
    : [];

  const q = LEADERBOARD_QUEUES[filters.queue];
  const roleLabel = filters.role ? ` · ${{ TOP: "Top", JUNGLE: "Jungle", MID: "Mid", ADC: "Bottom", SUPPORT: "Support" }[filters.role]} games` : "";
  const highlights: HighlightTile[] = HIGHLIGHT_TILES.map((id) => boards.get(id)!).map((b) => {
    const [first, second] = b.ranked;
    const mine = viewer ? b.ranked.find((r) => r.playerId === viewer) : undefined;
    return {
      metricId: b.metric.id,
      category: b.metric.category,
      label: b.metric.label,
      leader: first ? { playerId: first.playerId, valueText: formatMetric(b.metric, first.value), sampleText: entryOf(b, 0).sampleText } : null,
      runnerUp: second ? { playerId: second.playerId, valueText: formatMetric(b.metric, second.value) } : null,
      yours: mine ? { rank: mine.rank, of: b.ranked.length } : null,
    };
  });

  return {
    filters,
    highlights,
    scopeLabel: `${seasonLabel(filters.season)} · ${q.label}${roleLabel}${filters.lineupOnly ? " · active lineup" : ""}`,
    seasons: data.seasons.map((s) => ({ value: s, label: seasonLabel(s) })),
    currentSeason: data.currentSeason,
    categories: LEADERBOARD_CATEGORIES.map((c) => ({ key: c.key, label: c.label })),
    metrics: metricsFor(filters.category, filters.role).map(summary),
    neighbours: neighbours(metricsFor(filters.category, filters.role), filters.metricId),
    board: {
      id: metric.id,
      label: metric.label,
      kind: metric.kind,
      definition: metric.definition,
      unit: metric.unit,
      source: metric.source,
      lowerIsBetter: !!metric.lowerIsBetter,
      ranked: board.ranked.map((_, i) => entryOf(board, i)),
      unranked: board.unranked.map((u) => ({ playerId: u.playerId, progress: `${u.sample} of ${u.needed} games` })),
      noData: board.noData,
      minGames: board.minGames,
      dataNote,
    },
    you,
    strengths,
    recordHolders,
    personalBests,
    players: Object.fromEntries(players.map((p) => [p.id, { id: p.id, name: p.name, avatarUrl: p.avatarUrl, look: p.look, art: p.art, role: p.primaryRole, rank: p.rank }])),
    playerCount: players.length,
    gamesInScope: inScope.length,
    lastUpdated: data.lastUpdated,
    extraSince: data.extraSince ? new Date(data.extraSince).toISOString() : null,
  };
}

function neighbours(list: MetricDef[], id: string): LeaderboardView["neighbours"] {
  const i = Math.max(0, list.findIndex((m) => m.id === id));
  const ref = (m: MetricDef | undefined) => (m ? { id: m.id, label: m.label } : null);
  return { previous: ref(list[i - 1]), next: ref(list[i + 1]), position: i + 1, count: list.length };
}

/** A query string for these filters, with changes (category switches keep the other filters). */
export function leaderboardHref(f: LeaderboardFilters, change: Partial<LeaderboardFilters> = {}): string {
  const n = { ...f, ...change };
  const q = new URLSearchParams();
  q.set("category", n.category === "overview" ? "highlights" : n.category);
  if (change.category && !change.metricId) {
    // A new category opens on its first metric (Highlights on its tiles).
  } else if (n.highlights && !change.metricId) {
    // Filters changed on the Highlights tiles: stay on the tiles.
  } else q.set("metric", n.metricId);
  q.set("season", String(n.season));
  if (n.queue !== DEFAULT_LEADERBOARD_QUEUE) q.set("queue", n.queue);
  if (n.role) q.set("role", n.role);
  if (n.lineupOnly) q.set("lineup", "1");
  return `/leaderboards?${q.toString()}`;
}
