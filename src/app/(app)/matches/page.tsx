import { getAppDb } from "@/server/bootstrap";
import { hasPermission } from "@/server/auth/session";
import { requirePageAccess } from "@/server/auth/page-access";
import { listChampions } from "@/server/repositories/champions";
import { getOrCreateTeam } from "@/server/repositories/team";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { TabLinks } from "@/components/ui/tab-links";
import { loadPlayedTogether, type PlayedTogether } from "@/server/matches/played-together";
import { compositionOf, loadCompositionParticipants, teamMembersByPuuid, type Composition } from "@/server/matches/compositions";
import { platformOfMatchId } from "@/domain/opgg";
import { listTeamBookmarks, sharedGameRows, type TeamBookmark } from "@/server/matches/links";
import type { Session } from "@/server/auth/permissions";
import { filterTogether, pairsOf, summariseTogether } from "@/domain/played-together";
import { seasonLabel, seasonOfGame } from "@/domain/season";
import { currentSeason } from "@/server/accounts/sync";
import { PlayedTogetherView, TOGETHER_QUEUES, type TogetherFilters, type TogetherListGame } from "@/components/matches/played-together";
import { EncountersView, type EncounterFilters } from "@/components/matches/encounters-view";
import type { EncounterInsightView } from "@/components/matches/encounter-browser";
import { encounterSummaries, loadEncounters } from "@/server/matches/encounters";
import { encounterInsights, listEncounters, type EncounterSort, type EncounterView } from "@/domain/encounters";

export const dynamic = "force-dynamic";

const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

/** Team → Matches: the team's Riot games played together (the default tab) and the players met repeatedly (Encounters). */
export default async function MatchesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const db = await getAppDb();
  const [team, session] = await Promise.all([getOrCreateTeam(db), requirePageAccess("view-matches")]);
  // Both tabs show teammates' Riot games: the same right as their statistics.
  if (!hasPermission(session, "view-teammate-stats")) {
    return (
      <div className="mx-auto max-w-[var(--content-max)] space-y-5">
        <PageHeader title="Matches" description="The team's games played together and the players you meet again." />
        <EmptyState title="Team matches show teammates' games" testId="matches-no-stats">
          They are part of teammates&apos; statistics, which this account does not include. An admin can change that in Admin → People.
        </EmptyState>
      </div>
    );
  }
  if (str(sp.view) === "encounters") return <EncountersPage db={db} teamId={team.id} sp={sp} />;
  return <PlayedTogetherPage db={db} teamId={team.id} sp={sp} session={session} />;
}

/** Played together (the default) and Encounters. */
function MatchesTabs({ view, togetherCount }: { view: "together" | "encounters"; togetherCount?: number }) {
  return (
    <TabLinks
      label="Match records"
      testId="matches-tabs"
      items={[
        { href: "/matches", label: "Played together", active: view === "together", count: togetherCount, testId: "matches-tab-together" },
        { href: "/matches?view=encounters", label: "Encounters", active: view === "encounters", testId: "matches-tab-encounters" },
      ]}
    />
  );
}

async function PlayedTogetherPage({ db, teamId, sp, session }: { db: Awaited<ReturnType<typeof getAppDb>>; teamId: string; sp: Record<string, string | string[] | undefined>; session: Session }) {
  const [data, champions, bookmarks] = await Promise.all([loadPlayedTogether(db, teamId), listChampions(db), listTeamBookmarks(db, teamId)]);
  const queue = str(sp.queue) in TOGETHER_QUEUES ? str(sp.queue) : "all";
  // The current season by default (from the current patch); earlier seasons, or all of them, on request.
  const seasonNow = await currentSeason(db);
  const seasons = [...new Set([seasonNow, ...data.games.map((g) => g.season).filter((s): s is number => s !== null)])].sort((a, b) => b - a);
  const season: number | "all" = str(sp.season) === "all" ? "all" : seasons.includes(Number(str(sp.season))) ? Number(str(sp.season)) : seasonNow;
  const min = Math.min(5, Math.max(2, Number(str(sp.min)) || 2));
  const saved = str(sp.saved) === "1";
  // "Played with": every chosen member on the same side (?with=a,b; the older ?player=a still works).
  const chosen = [...new Set([...str(sp.with).split(","), str(sp.player)].map((id) => id.trim()).filter((id) => id && data.players[id]))];
  const limit = Math.min(500, Math.max(20, Number(str(sp.limit)) || 20));
  const filters: TogetherFilters = { season, queue, min, with: chosen, limit, saved };

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
      season: seasonOfGame(r.patch, Number(r.gameCreation)),
      durationS: r.durationS,
      win: r.win,
      teamId: r.teamId ?? 0,
      members: [{ matchId: r.matchId, playerId: r.playerId!, teamId: r.teamId, queueId: r.queueId, gameCreation: Number(r.gameCreation), durationS: r.durationS, win: r.win, championId: r.championId!, role: r.role, kills: r.kills, deaths: r.deaths, assists: r.assists, cs: r.cs, damage: r.damage, vision: r.vision }],
      opponents: [],
      bookmark: { on: true, canRemove: canRemove(markOf.get(r.matchId.toUpperCase())!) },
      sharedBy: r.playerId,
    }));
    pool = [...data.games.filter((g) => markOf.has(g.matchId.toUpperCase())).map(withMark), ...sharedGames].sort((a, b) => b.gameCreation - a.gameCreation);
  } else pool = data.games.map(withMark);
  const savedCount = data.games.filter((g) => markOf.has(g.matchId.toUpperCase())).length + shares.length;
  const seasonFilter = season === "all" ? null : season;
  const all = filterTogether(pool, { season: seasonFilter, queues: TOGETHER_QUEUES[queue]!.queues, minMembers: saved ? 1 : min, playerIds: chosen });
  // "Played together most" follows the season and game mode chosen.
  const pairs = pairsOf(filterTogether(data.games, { season: seasonFilter, queues: TOGETHER_QUEUES[queue]!.queues, minMembers: 2 }));
  const summary = chosen.length ? summariseTogether(all, chosen) : null;
  const href = (change: Partial<TogetherFilters>) => {
    const n = { ...filters, ...change };
    const q = new URLSearchParams();
    if (n.season !== seasonNow) q.set("season", String(n.season));
    if (n.saved) q.set("saved", "1");
    if (n.queue !== "all") q.set("queue", n.queue);
    if (n.min !== 2 && !n.saved) q.set("min", String(n.min));
    if (n.with.length) q.set("with", n.with.join(","));
    if (n.limit !== 20) q.set("limit", String(n.limit));
    const query = q.toString();
    return query ? `/matches?${query}` : "/matches";
  };
  // An empty season: where the same filters do find games (e.g. Ranked Flex last season).
  const elsewhere =
    all.length === 0 && season !== "all" && !saved
      ? seasons
          .filter((s) => s !== season)
          .map((s) => ({ season: s, games: filterTogether(pool, { season: s, queues: TOGETHER_QUEUES[queue]!.queues, minMembers: min, playerIds: chosen }).length }))
          .filter((e) => e.games > 0)
      : [];
  // Both teams of the games on screen only: the participants reduced to five fields in the
  // database, and team members found in one query (see server/matches/compositions).
  const shown = all.slice(0, limit);
  const parts = await loadCompositionParticipants(db, shown.map((g) => g.matchId));
  const members = await teamMembersByPuuid(db, teamId, [...parts.values()].flat().map((x) => x.puuid));
  const teams: Record<string, Composition | null> = {};
  for (const g of shown) {
    const ps = parts.get(g.matchId);
    teams[g.matchId] = ps ? compositionOf(ps, members, (puuid) => !!session.playerId && members.get(puuid)?.id === session.playerId, g.teamId, platformOfMatchId(g.matchId)) : null;
  }
  const wins = all.filter((g) => g.win).length;
  const decided = all.filter((g) => g.win !== null).length;
  return (
    <div className="mx-auto max-w-[var(--content-max)] space-y-5">
      <PageHeader title="Matches" description={`Played together: ${all.length} game${all.length === 1 ? "" : "s"}${decided ? ` · ${wins}W ${decided - wins}L` : ""} with two or more team members on the same team · ${season === "all" ? "all seasons" : seasonLabel(season)}.`} />
      <MatchesTabs view="together" togetherCount={data.games.length} />
      <PlayedTogetherView data={data} pairs={pairs} seasons={seasons} currentSeason={seasonNow} shown={shown} teams={teams} total={all.length} filters={filters} summary={summary} savedCount={savedCount} champions={Object.fromEntries(champions.map((c) => [c.id, { id: c.id, name: c.name, portraitUrl: c.portraitUrl }]))} href={href} elsewhere={elsewhere} />
    </div>
  );
}

/**
 * Encounters: players met repeatedly in the members' recorded games (see server/matches/encounters
 * and domain/encounters). The team's encounter rows are loaded once and cached; every filter here
 * is applied to them in memory.
 */
async function EncountersPage({ db, teamId, sp }: { db: Awaited<ReturnType<typeof getAppDb>>; teamId: string; sp: Record<string, string | string[] | undefined> }) {
  const [data, champions, seasonNow] = await Promise.all([loadEncounters(db, teamId), listChampions(db), currentSeason(db)]);
  const seasons = [...new Set([seasonNow, ...data.rows.map((r) => r.season)])].sort((a, b) => b - a);
  const view: EncounterView = str(sp.rel) === "opponents" || str(sp.rel) === "shared" ? (str(sp.rel) as EncounterView) : "allies";
  const member = data.members[str(sp.member)] ? str(sp.member) : null;
  const account = member && data.members[member]!.accounts.some((a) => a.id === str(sp.account)) ? str(sp.account) : null;
  const sort: EncounterSort = str(sp.sort) === "best" || str(sp.sort) === "worst" ? (str(sp.sort) as EncounterSort) : "games";
  const filters: EncounterFilters = {
    view: member && view === "shared" ? "allies" : view,
    member,
    account,
    season: str(sp.season) === "all" ? "all" : seasons.includes(Number(str(sp.season))) ? Number(str(sp.season)) : seasonNow,
    queue: str(sp.queue) in TOGETHER_QUEUES ? str(sp.queue) : "all",
    min: [3, 5].includes(Number(str(sp.min))) ? Number(str(sp.min)) : 2,
    sort: view === "shared" ? "games" : sort,
    q: str(sp.q).slice(0, 40),
    limit: Math.min(300, Math.max(30, Number(str(sp.limit)) || 30)),
  };
  const filterArgs = { season: filters.season === "all" ? null : filters.season, queues: TOGETHER_QUEUES[filters.queue]!.queues, playerId: filters.member, accountId: filters.account };
  const summaries = encounterSummaries(data.rows, filterArgs);
  const all = listEncounters(summaries, { view: filters.view, min: filters.min, sort: filters.sort, query: filters.q });
  // The few observations worth a line, only when enough games stand behind them (none while searching).
  const { insights } = filters.q ? { insights: [] } : encounterInsights(summaries);
  const insightViews: EncounterInsightView[] = insights.map((i) => ({ kind: i.kind, label: i.label, key: i.summary.key, name: i.summary.name, record: i.record, relation: i.kind.endsWith("ally") ? "ally" : "opponent" }));
  const href = (change: Partial<EncounterFilters>) => {
    const n = { ...filters, ...change };
    const q = new URLSearchParams({ view: "encounters" });
    if (n.view !== "allies") q.set("rel", n.view);
    if (n.member) q.set("member", n.member);
    if (n.member && n.account) q.set("account", n.account);
    if (n.season !== seasonNow) q.set("season", String(n.season));
    if (n.queue !== "all") q.set("queue", n.queue);
    if (n.min !== 2) q.set("min", String(n.min));
    if (n.sort !== "games" && n.view !== "shared") q.set("sort", n.sort);
    if (n.q) q.set("q", n.q);
    if (n.limit !== 30) q.set("limit", String(n.limit));
    return `/matches?${q.toString()}`;
  };
  return (
    <div className="mx-auto max-w-[var(--content-max)] space-y-5">
      <PageHeader title="Matches" description={`Encounters: players team members keep meeting in their recorded games · ${filters.season === "all" ? "all seasons" : seasonLabel(filters.season)}.`} />
      <MatchesTabs view="encounters" />
      <EncountersView filters={filters} href={href} members={data.members} seasons={seasons} currentSeason={seasonNow} list={all.slice(0, filters.limit)} total={all.length} insights={insightViews} memberGames={data.memberGames} champions={Object.fromEntries(champions.map((c) => [c.id, { id: c.id, name: c.name, portraitUrl: c.portraitUrl }]))} filterArgs={filterArgs} />
    </div>
  );
}
