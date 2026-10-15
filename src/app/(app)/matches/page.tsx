import Link from "next/link";
import { COMPETITION_MODES, competitionModeLabel, isCompetitionMode } from "@/domain/competition";
import { ROLES } from "@/domain/roles";
import { canStartNextGame, describeSeries, seriesLabel } from "@/domain/series";
import { getAppDb } from "@/server/bootstrap";
import { hasPermission } from "@/server/auth/session";
import { requirePageAccess } from "@/server/auth/page-access";
import { listChampions } from "@/server/repositories/champions";
import { ChampionFilter } from "@/components/champions/champion-filter";
import { getBranding } from "@/server/repositories/branding";
import { getOrCreateTeam } from "@/server/repositories/team";
import { listPlayers } from "@/server/repositories/team";
import { listMatches, matchFilterOptions, matchSummary, type MatchResult, type MatchRow } from "@/server/matches/repository";
import { listSeries, type SeriesRecord } from "@/server/series/repository";
import { ChampionPortrait } from "@/components/champion-portrait";
import { SeriesControls } from "@/components/matches/series-controls";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClass } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { MatchActions } from "@/components/matches/match-actions";
import { inArray } from "drizzle-orm";
import { drafts } from "@/server/db/schema";
import { EmptyState } from "@/components/ui/empty-state";
import { TabLinks } from "@/components/ui/tab-links";
import { Link2, Swords } from "lucide-react";
import { formatDate } from "@/lib/format";
import { loadPlayedTogether, type PlayedTogether } from "@/server/matches/played-together";
import { listTeamBookmarks, sharedGameRows, type TeamBookmark } from "@/server/matches/links";
import type { Session } from "@/server/auth/permissions";
import { filterTogether, summariseTogether } from "@/domain/played-together";
import { PlayedTogetherView, TOGETHER_QUEUES, type TogetherFilters, type TogetherListGame } from "@/components/matches/played-together";

export const dynamic = "force-dynamic";

const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

/** Where the drafted archive lives now that Played together is the default tab. */
const DRAFTED = "/matches?view=drafted";

/**
 * Which tab a URL opens: Played together by default; the drafted archive with ?view=drafted, or
 * for an older bookmark that carries one of the archive's own filters (?mode=, ?result=, …).
 */
function resolveView(sp: Record<string, string | string[] | undefined>): "together" | "drafted" {
  const view = str(sp.view);
  if (view === "drafted") return "drafted";
  if (view === "together") return "together";
  return ["mode", "result", "opponent", "patch", "champion"].some((k) => str(sp[k])) ? "drafted" : "together";
}

type Group = { kind: "series"; series: SeriesRecord; games: MatchRow[] } | { kind: "single"; match: MatchRow };

/** Newest first; games of one series stay together under their series header. */
function groupMatches(rows: MatchRow[], seriesById: Map<string, SeriesRecord>): Group[] {
  const groups: Group[] = [];
  const seen = new Map<string, Group & { kind: "series" }>();
  for (const m of rows) {
    const s = m.seriesId ? seriesById.get(m.seriesId) : null;
    if (!s) {
      groups.push({ kind: "single", match: m });
      continue;
    }
    let g = seen.get(s.id);
    if (!g) {
      g = { kind: "series", series: s, games: [] };
      seen.set(s.id, g);
      groups.push(g);
    }
    g.games.push(m);
  }
  for (const g of groups) if (g.kind === "series") g.games.sort((a, b) => a.gameNumber - b.gameNumber);
  return groups;
}

/** Match archive: a record per completed game, grouped by series. Never used to train anything. */
export default async function MatchesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const db = await getAppDb();
  const [team, session, branding] = await Promise.all([getOrCreateTeam(db), requirePageAccess("view-matches"), getBranding(db)]);
  // Played together shows teammates' Riot games: the same right as their statistics.
  const canSeeTogether = hasPermission(session, "view-teammate-stats");
  if (canSeeTogether && resolveView(sp) === "together") return <PlayedTogetherPage db={db} teamId={team.id} sp={sp} session={session} />;
  const mode = str(sp.mode);
  const result = str(sp.result);
  const filters = {
    mode: isCompetitionMode(mode) ? mode : null,
    result: result === "win" || result === "loss" || result === "cancelled" || result === "none" ? (result as MatchResult | "none") : null,
    opponentName: str(sp.opponent) || null,
    patch: str(sp.patch) || null,
    championId: str(sp.champion) || null,
    playerId: str(sp.player) || null,
  };
  const limit = Math.min(500, Math.max(20, Number(str(sp.limit)) || 60));
  const [rowsPlus, champions, options, summary, players, allSeries] = await Promise.all([listMatches(db, team.id, { ...filters, limit: limit + 1 }), listChampions(db), matchFilterOptions(db, team.id), matchSummary(db, team.id), listPlayers(db, team.id), listSeries(db, team.id)]);
  const hasMore = rowsPlus.length > limit;
  const rows = rowsPlus.slice(0, limit);
  const moreHref = `/matches?${new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([, v]) => typeof v === "string" && v)), view: "drafted", limit: String(limit + 60) } as Record<string, string>).toString()}`;
  const seriesById = new Map(allSeries.map((s) => [s.id, s]));
  const byId = new Map(champions.map((c) => [c.id, { id: c.id, name: c.name, portraitUrl: c.portraitUrl }]));
  const champ = (id: string | null) => (id ? byId.get(id) ?? { id, name: id, portraitUrl: "" } : null);
  const active = Object.values(filters).some(Boolean);
  const canEdit = hasPermission(session, "manage-matches");
  const groups = groupMatches(rows, seriesById);

  // Who may edit which record: the draft's creator, or anyone allowed to manage every match.
  const draftIds = rows.map((m) => m.draftId).filter((id): id is string => !!id);
  const creators = draftIds.length ? await db.select({ id: drafts.id, createdByUserId: drafts.createdByUserId }).from(drafts).where(inArray(drafts.id, draftIds)) : [];
  const creatorOf = new Map(creators.map((d) => [d.id, d.createdByUserId]));
  const canEditMatch = (m: MatchRow) => canEdit || (!!m.draftId && !!session.userId && creatorOf.get(m.draftId) === session.userId);

  const gameCard = (m: MatchRow, inSeries: boolean) => {
    const picks = [...m.ourPicks].sort((a, b) => ROLES.indexOf(a.role ?? "TOP") - ROLES.indexOf(b.role ?? "TOP"));
    const title = inSeries ? `Game ${m.gameNumber}` : m.opponentName ? `vs ${m.opponentName}` : competitionModeLabel(m.mode);
    const resultTone = m.result === "win" ? "bg-good" : m.result === "loss" ? "bg-bad" : "bg-border-strong";
    return (
      <li key={m.id} className="relative flex flex-col gap-3 overflow-hidden rounded-panel border border-border bg-surface p-3 pl-5 transition-colors hover:border-border-strong sm:flex-row sm:items-center sm:gap-4" data-testid="match-card">
        <span className={`absolute inset-y-0 left-0 w-1.5 ${resultTone}`} aria-hidden />
        <div className="min-w-0 sm:w-56">
          <div className="flex items-center gap-2">
            <span className={m.result === "win" ? "text-sm font-bold text-good" : m.result === "loss" ? "text-sm font-bold text-bad" : "text-sm font-semibold text-fg-muted"}>{m.result === "win" ? "Victory" : m.result === "loss" ? "Defeat" : m.result === "cancelled" ? "Cancelled" : "No result"}</span>
            <span className="truncate text-sm font-semibold text-fg">{title}</span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-muted">
            <span>{formatDate(m.playedAt)}</span>
            {!inSeries ? <Badge tone="neutral">{competitionModeLabel(m.mode)}</Badge> : null}
            <Badge tone={m.side === "blue" ? "blue" : "red"}>{m.side === "blue" ? "Blue side" : "Red side"}</Badge>
            {m.durationSeconds ? <span>{Math.round(m.durationSeconds / 60)} min</span> : null}
          </div>
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="flex items-center gap-1">
            {picks.map((p) => (
              <ChampionPortrait key={p.index} champion={champ(p.championId)} size="sm" />
            ))}
          </div>
          <span className="text-xs font-semibold text-fg-subtle">VS</span>
          <div className="flex items-center gap-1">
            {m.enemyPicks.map((p) => (
              <ChampionPortrait key={p.index} champion={champ(p.championId)} size="sm" className="opacity-75" />
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 sm:shrink-0">
          {/* Not linked to its Riot game yet: the match page suggests candidates (a person confirms). */}
          {canEditMatch(m) && !m.riotMatchId && m.result !== "cancelled" ? (
            <Link href={`/matches/${m.id}#riot-link`} className="inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-xs font-medium text-accent hover:bg-accent/10 pointer-coarse:min-h-11" data-testid="match-find-riot">
              <Link2 className="h-3.5 w-3.5" aria-hidden /> Find Riot game
            </Link>
          ) : null}
          <MatchActions matchId={m.id} label={inSeries ? `game ${m.gameNumber}` : title} canEdit={canEditMatch(m)} />
        </div>
      </li>
    );
  };

  return (
    <div className="mx-auto max-w-[var(--content-max)] space-y-5">
      <PageHeader title="Matches" description={`${summary.total} game${summary.total === 1 ? "" : "s"} · ${summary.wins}W ${summary.losses}L recorded. Every completed draft is kept here with its playbook.`} />
      {canSeeTogether ? <MatchesTabs view="drafted" /> : null}

      <details className="group rounded-panel border border-border bg-surface" open={active}>
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 text-sm font-medium text-fg-muted hover:text-fg">
          <span>
            Filters{active ? ` · ${Object.values(filters).filter(Boolean).length} active` : ""}
          </span>
          <span className="text-xs font-normal text-fg-subtle group-open:hidden">Show</span>
          <span className="hidden text-xs font-normal text-fg-subtle group-open:inline">Hide</span>
        </summary>
        <form method="get" className="grid grid-cols-2 items-end gap-3 border-t border-border p-4 text-xs sm:flex sm:flex-wrap">
          <input type="hidden" name="view" value="drafted" />
          <Select name="mode" label="Competition" value={mode} options={COMPETITION_MODES.map((m) => [m, competitionModeLabel(m)])} />
          <Select name="result" label="Result" value={result} options={[["win", "Win"], ["loss", "Loss"], ["cancelled", "Cancelled"], ["none", "No result"]]} />
          <Select name="opponent" label="Opponent" value={filters.opponentName ?? ""} options={options.opponents.map((o) => [o, o])} />
          <Select name="patch" label="Patch" value={filters.patch ?? ""} options={options.patches.map((p) => [p, p])} />
          <Select name="player" label="Player" value={filters.playerId ?? ""} options={players.map((p) => [p.id, p.displayName])} />
          <div className="col-span-2 flex min-w-0 flex-col gap-0.5 sm:col-span-1 sm:w-52">
            <span className="text-fg-subtle">Our champion</span>
            <ChampionFilter name="champion" label="Our champion" value={filters.championId ? { scope: "champion", championId: filters.championId } : { scope: "all" }} champions={champions.map((c) => ({ id: c.id, name: c.name, portraitUrl: c.portraitUrl }))} testId="matches-champion" />
          </div>
          <div className="col-span-2 flex items-center gap-3 sm:col-span-1">
            <Button type="submit" size="sm" variant="outline">
              Apply
            </Button>
            {active ? (
              <Link href={DRAFTED} className="text-fg-subtle hover:text-fg">
                Clear
              </Link>
            ) : null}
          </div>
        </form>
      </details>

      {rows.length === 0 ? (
        active ? (
          <EmptyState compact title="No drafted match fits these filters." action={<Link href={DRAFTED} className="text-sm text-accent hover:underline">Clear the filters</Link>} testId="matches-empty" />
        ) : (
          <EmptyState icon={Swords} title="No drafted matches yet" action={<Link href="/draft" className={buttonClass("outline", "sm")}>Start a draft</Link>} testId="matches-empty">
            Every completed draft (not a theorycraft) is kept here with its playbook and result.
          </EmptyState>
        )
      ) : null}
      <div className="space-y-4" data-testid="match-history">
        {groups.map((g) =>
          g.kind === "single" ? (
            <ul key={g.match.id}>{gameCard(g.match, false)}</ul>
          ) : (
            <section key={g.series.id} className="space-y-2 rounded-card border border-border bg-bg-elevated/60 p-3">
              <header className="flex flex-wrap items-center gap-3 px-1">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">
                    {competitionModeLabel(g.series.mode)}
                    {g.series.eventName ? ` — ${g.series.eventName}` : ""} · {branding.shortName} vs {g.series.opponentName || "Unnamed opponent"}
                  </div>
                  <div className="text-xs text-fg-muted">
                    {seriesLabel(g.series.bestOf)} · {describeSeries({ ...g.series, ourName: branding.shortName, theirName: g.series.opponentName })} · {formatDate(g.series.createdAt)}
                  </div>
                </div>
                <Badge tone={g.series.status === "completed" ? (g.series.winner === "us" ? "good" : "bad") : g.series.status === "cancelled" ? "neutral" : "info"}>{g.series.status === "in_progress" ? "In progress" : g.series.status === "completed" ? (g.series.winner === "us" ? "Won" : "Lost") : "Cancelled"}</Badge>
                <span className="flex-1" />
                <SeriesControls seriesId={g.series.id} status={g.series.status} canStartNext={canStartNextGame(g.series)} canEdit={canEdit} />
              </header>
              <ul className="space-y-2">{g.games.map((m) => gameCard(m, true))}</ul>
            </section>
          ),
        )}
      </div>
      {hasMore ? (
        <Link href={moreHref} className={buttonClass("outline", "md", "w-full")}>
          Load more (newest {limit} shown)
        </Link>
      ) : null}
    </div>
  );
}

function Select({ name, label, value, options }: { name: string; label: string; value: string; options: Array<[string, string]> }) {
  return (
    <label className="flex min-w-0 flex-col gap-0.5">
      <span className="text-fg-subtle">{label}</span>
      <select name={name} defaultValue={value} className="h-11 w-full min-w-0 rounded-md border border-border bg-bg-elevated px-2 text-base sm:max-w-[180px] md:h-8 md:text-xs">
        <option value="">any</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * Played together (the default) and Drafted: two record types, one page. Members who may not see
 * teammates' Riot games have the drafted archive only, so they get no tabs at all.
 */
function MatchesTabs({ view, togetherCount }: { view: "drafted" | "together"; togetherCount?: number }) {
  return (
    <TabLinks
      label="Match records"
      testId="matches-tabs"
      items={[
        { href: "/matches", label: "Played together", active: view === "together", count: togetherCount, testId: "matches-tab-together" },
        { href: DRAFTED, label: "Drafted", active: view === "drafted", testId: "matches-tab-drafted" },
      ]}
    />
  );
}

async function PlayedTogetherPage({ db, teamId, sp, session }: { db: Awaited<ReturnType<typeof getAppDb>>; teamId: string; sp: Record<string, string | string[] | undefined>; session: Session }) {
  const [data, champions, bookmarks] = await Promise.all([loadPlayedTogether(db, teamId), listChampions(db), listTeamBookmarks(db, teamId)]);
  const queue = str(sp.queue) in TOGETHER_QUEUES ? str(sp.queue) : "all";
  const min = Math.min(5, Math.max(2, Number(str(sp.min)) || 2));
  const saved = str(sp.saved) === "1";
  // "Played with": every chosen member on the same side (?with=a,b; the older ?player=a still works).
  const chosen = [...new Set([...str(sp.with).split(","), str(sp.player)].map((id) => id.trim()).filter((id) => id && data.players[id]))];
  const limit = Math.min(500, Math.max(20, Number(str(sp.limit)) || 20));
  const filters: TogetherFilters = { queue, min, with: chosen, limit, saved };

  // Bookmarks: games played together (any member who sees them) and members' own shared games.
  const markOf = new Map(bookmarks.map((b) => [b.riotMatchId.toUpperCase(), b]));
  const manage = hasPermission(session, "manage-matches");
  const canRemove = (b: TeamBookmark) => manage || (b.playerId ? b.playerId === session.playerId : !!session.userId && b.createdByUserId === session.userId);
  const withMark = (g: PlayedTogether["games"][number]): TogetherListGame => {
    const b = markOf.get(g.matchId.toUpperCase());
    return { ...g, bookmark: b ? { on: true, canRemove: canRemove(b) } : { on: false, canRemove: true }, sharedBy: null };
  };
  const togetherIds = new Set(data.games.map((g) => g.matchId.toUpperCase()));
  const shares = bookmarks.filter((b): b is TeamBookmark & { playerId: string } => !!b.playerId && !togetherIds.has(b.riotMatchId.toUpperCase()) && !!data.players[b.playerId]);
  let pool: TogetherListGame[];
  if (saved) {
    const sharedRows = await sharedGameRows(db, shares.map((b) => ({ riotMatchId: b.riotMatchId, playerId: b.playerId })));
    const sharedGames: TogetherListGame[] = sharedRows.map((r) => ({
      matchId: r.matchId,
      gameCreation: Number(r.gameCreation),
      queueId: r.queueId,
      durationS: r.durationS,
      win: r.win,
      teamId: r.teamId ?? 0,
      members: [{ matchId: r.matchId, playerId: r.playerId!, teamId: r.teamId, queueId: r.queueId, gameCreation: Number(r.gameCreation), durationS: r.durationS, win: r.win, championId: r.championId!, role: r.role, kills: r.kills, deaths: r.deaths, assists: r.assists, cs: r.cs, damage: r.damage, vision: r.vision }],
      opponents: [],
      draftedMatchId: null,
      bookmark: { on: true, canRemove: canRemove(markOf.get(r.matchId.toUpperCase())!) },
      sharedBy: r.playerId,
    }));
    pool = [...data.games.filter((g) => markOf.has(g.matchId.toUpperCase())).map(withMark), ...sharedGames].sort((a, b) => b.gameCreation - a.gameCreation);
  } else pool = data.games.map(withMark);
  const savedCount = data.games.filter((g) => markOf.has(g.matchId.toUpperCase())).length + shares.length;
  const all = filterTogether(pool, { queues: TOGETHER_QUEUES[queue]!.queues, minMembers: saved ? 1 : min, playerIds: chosen });
  const summary = chosen.length ? summariseTogether(all, chosen) : null;
  const href = (change: Partial<TogetherFilters>) => {
    const n = { ...filters, ...change };
    const q = new URLSearchParams();
    if (n.saved) q.set("saved", "1");
    if (n.queue !== "all") q.set("queue", n.queue);
    if (n.min !== 2 && !n.saved) q.set("min", String(n.min));
    if (n.with.length) q.set("with", n.with.join(","));
    if (n.limit !== 20) q.set("limit", String(n.limit));
    const query = q.toString();
    return query ? `/matches?${query}` : "/matches";
  };
  const wins = all.filter((g) => g.win).length;
  const decided = all.filter((g) => g.win !== null).length;
  return (
    <div className="mx-auto max-w-[var(--content-max)] space-y-5">
      <PageHeader title="Matches" description={`Played together: ${all.length} game${all.length === 1 ? "" : "s"}${decided ? ` · ${wins}W ${decided - wins}L` : ""} with two or more team members on the same team.`} />
      <MatchesTabs view="together" togetherCount={data.games.length} />
      <PlayedTogetherView data={data} shown={all.slice(0, limit)} total={all.length} filters={filters} summary={summary} savedCount={savedCount} champions={Object.fromEntries(champions.map((c) => [c.id, { id: c.id, name: c.name, portraitUrl: c.portraitUrl }]))} href={href} />
    </div>
  );
}
