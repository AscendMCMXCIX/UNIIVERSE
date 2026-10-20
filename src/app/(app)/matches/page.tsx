import { getAppDb } from "@/server/bootstrap";
import { hasPermission } from "@/server/auth/session";
import { requirePageAccess } from "@/server/auth/page-access";
import { listChampions } from "@/server/repositories/champions";
import { getOrCreateTeam } from "@/server/repositories/team";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { InfoTip } from "@/components/ui/info-tip";
import { TabLinks } from "@/components/ui/tab-links";
import { loadPlayedTogether, type PlayedTogether } from "@/server/matches/played-together";
import { compositionOf, loadCompositionParticipants, teamMembersByPuuid, type Composition } from "@/server/matches/compositions";
import { platformOfMatchId } from "@/domain/opgg";
import { knownRiotIds } from "@/server/players/riot-names";
import { listTeamBookmarks, sharedGameRows, type TeamBookmark } from "@/server/matches/links";
import type { Session } from "@/server/auth/permissions";
import { filterTogether, summariseTogether } from "@/domain/played-together";
import { seasonLabel, seasonOfGame } from "@/domain/season";
import { chooseSeason, isOfferedSeason, offeredCurrentSeason, offeredSeasons } from "@/domain/season";
import { currentSeason } from "@/server/accounts/sync";
import { PlayedTogetherView, TOGETHER_QUEUES, type TogetherFilters, type TogetherListGame } from "@/components/matches/played-together";
import { EncountersView, type EncounterFilters } from "@/components/matches/encounters-view";
import type { EncounterInsightView } from "@/components/matches/encounter-browser";
import { encounterSummaries, loadEncounters } from "@/server/matches/encounters";
import { encounterInsights, listEncounters, type EncounterSort, type EncounterView } from "@/domain/encounters";

export const dynamic = "force-dynamic";

const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

/**
 * Team → Matches: the team's Riot games played together (the default tab) and the players met
 * repeatedly (Encounters), from Season 2026 on (the offered seasons, domain/season): earlier games
 * never reach this page's lists, counts, bookmarks or season choice.
 */
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

/**
 * Played together (the default) and Encounters. Switching keeps what both tabs share: the season,
 * the game mode and one chosen member (Played with ⇄ Team member), so a tab change never resets them.
 */
function MatchesTabs({ view, togetherCount, shared }: { view: "together" | "encounters"; togetherCount?: number; shared: { season: number | null; queue: string; member: string | null } }) {
  const carry = (q: URLSearchParams, memberKey: "with" | "member") => {
    if (shared.season !== null) q.set("season", String(shared.season));
    if (shared.queue !== "all") q.set("queue", shared.queue);
    if (shared.member) q.set(memberKey, shared.member);
    return q.toString();
  };
  const together = carry(new URLSearchParams(), "with");
  return (
    <TabLinks
      label="Match records"
      testId="matches-tabs"
      items={[
        { href: together ? `/matches?${together}` : "/matches", label: "Played together", active: view === "together", count: togetherCount, testId: "matches-tab-together" },
        { href: `/matches?${carry(new URLSearchParams({ view: "encounters" }), "member")}`, label: "Encounters", active: view === "encounters", testId: "matches-tab-encounters" },
      ]}
    />
  );
}

/** What the games on this page prove and do not prove: the detail behind (i) beside the summary. */
const TOGETHER_CAVEAT =
  "Riot games in which two or more team members were on the same team, found in their synced match histories (no extra Riot requests). Riot's match data does not say who queued together, so these are games played together, not confirmed premade parties. Several linked accounts of one player count as one member; members on opposite sides are never counted as teammates. From Season 2026 on.";
const ENCOUNTER_CAVEAT =
  "From the stored records of team members' synced Riot games (no extra Riot requests). An ally was on the member's team, an opponent on the other team. Historical encounters only: not parties, friendships or every game they played. A player is recognised by their Riot account, not their name (the latest Riot ID is shown). Team totals count each game once, however many members were in it; each member's figures count their own games, across all their linked accounts. Games that were not recorded are not included, so a missing game is not proof two players never met. From Season 2026 on.";

/** The header's one line: what is counted, with the caveat behind (i). */
function Summary({ children, caveat, label }: { children: React.ReactNode; caveat: string; label: string }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5" data-testid="matches-summary">
      <span>{children}</span>
      <InfoTip text={caveat} label={label} />
    </span>
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

async function PlayedTogetherPage({ db, teamId, sp, session }: { db: Awaited<ReturnType<typeof getAppDb>>; teamId: string; sp: Record<string, string | string[] | undefined>; session: Session }) {
  const [data, champions, bookmarks, seasonNow] = await Promise.all([loadPlayedTogether(db, teamId), listChampions(db), listTeamBookmarks(db, teamId), currentSeason(db)]);
  // Season 2026 on only: every count, list and choice below starts from these games.
  const games = data.games.filter((g) => isOfferedSeason(g.season, seasonNow));
  const queue = str(sp.queue) in TOGETHER_QUEUES ? str(sp.queue) : "all";
  const seasons = offeredSeasons(seasonNow, games.map((g) => g.season));
  const current = offeredCurrentSeason(seasonNow);
  const season = chooseSeason(str(sp.season), seasons, seasonNow);
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
  // Members' own shared games (a few rows), read on every visit: their season decides whether they count here.
  const sharedRows = await sharedGameRows(db, shares.map((b) => ({ riotMatchId: b.riotMatchId, playerId: b.playerId })));
  const sharedGames: TogetherListGame[] = sharedRows
    .map((r) => ({
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
    }))
    .filter((g) => isOfferedSeason(g.season, seasonNow));
  const bookmarkedTogether = games.filter((g) => markOf.has(g.matchId.toUpperCase()));
  const pool: TogetherListGame[] = saved ? [...bookmarkedTogether.map(withMark), ...sharedGames].sort((a, b) => b.gameCreation - a.gameCreation) : games.map(withMark);
  const savedCount = bookmarkedTogether.length + sharedGames.length;
  const all = filterTogether(pool, { season, queues: TOGETHER_QUEUES[queue]!.queues, minMembers: saved ? 1 : min, playerIds: chosen });
  const summary = chosen.length ? summariseTogether(all, chosen) : null;
  const href = (change: Partial<TogetherFilters>) => {
    const n = { ...filters, ...change };
    const q = new URLSearchParams();
    if (n.season !== current) q.set("season", String(n.season));
    if (n.saved) q.set("saved", "1");
    if (n.queue !== "all") q.set("queue", n.queue);
    if (n.min !== 2 && !n.saved) q.set("min", String(n.min));
    if (n.with.length) q.set("with", n.with.join(","));
    if (n.limit !== 20) q.set("limit", String(n.limit));
    const query = q.toString();
    return query ? `/matches?${query}` : "/matches";
  };
  // An empty season: where the same filters do find games (another season from 2026 on).
  const elsewhere =
    all.length === 0 && !saved
      ? seasons
          .filter((s) => s !== season)
          .map((s) => ({ season: s, games: filterTogether(pool, { season: s, queues: TOGETHER_QUEUES[queue]!.queues, minMembers: min, playerIds: chosen }).length }))
          .filter((e) => e.games > 0)
      : [];
  // Both teams of the games on screen only: the participants reduced to five fields in the
  // database, and team members found in one query (see server/matches/compositions).
  const shown = all.slice(0, limit);
  const parts = await loadCompositionParticipants(db, shown.map((g) => g.matchId));
  const puuids = [...parts.values()].flat().map((x) => x.puuid);
  // Players who renamed since a game on screen are linked by their newer Riot ID.
  const [members, known] = await Promise.all([teamMembersByPuuid(db, teamId, puuids), knownRiotIds(db, puuids, Math.min(...shown.map((g) => g.gameCreation)))]);
  const teams: Record<string, Composition | null> = {};
  for (const g of shown) {
    const ps = parts.get(g.matchId);
    teams[g.matchId] = ps ? compositionOf(ps, members, (puuid) => !!session.playerId && members.get(puuid)?.id === session.playerId, g.teamId, platformOfMatchId(g.matchId), known) : null;
  }
  const wins = all.filter((g) => g.win).length;
  const decided = all.filter((g) => g.win !== null).length;
  return (
    <div className="mx-auto max-w-[var(--content-max)] space-y-4">
      <PageHeader
        title="Matches"
        description={
          <Summary caveat={TOGETHER_CAVEAT} label="How games played together are found">
            {seasonLabel(season)} · {plural(all.length, "game", "games")} {saved ? "bookmarked" : "played together"}
            {decided ? ` · ${wins}W ${decided - wins}L` : ""}
          </Summary>
        }
      />
      <MatchesTabs view="together" togetherCount={games.length} shared={{ season: season === current ? null : season, queue, member: chosen.length === 1 ? chosen[0]! : null }} />
      <PlayedTogetherView data={data} seasons={seasons} currentSeason={current} shown={shown} teams={teams} total={all.length} filters={filters} summary={summary} savedCount={savedCount} champions={Object.fromEntries(champions.map((c) => [c.id, { id: c.id, name: c.name, portraitUrl: c.portraitUrl }]))} href={href} elsewhere={elsewhere} />
    </div>
  );
}

/**
 * Encounters: players met repeatedly in the members' recorded games (see server/matches/encounters
 * and domain/encounters). The team's encounter rows are loaded once and cached; every filter here
 * is applied to them in memory, from Season 2026 on.
 */
async function EncountersPage({ db, teamId, sp }: { db: Awaited<ReturnType<typeof getAppDb>>; teamId: string; sp: Record<string, string | string[] | undefined> }) {
  const [data, champions, seasonNow] = await Promise.all([loadEncounters(db, teamId), listChampions(db), currentSeason(db)]);
  const seasons = offeredSeasons(seasonNow, data.rows.map((r) => r.season));
  const current = offeredCurrentSeason(seasonNow);
  const view: EncounterView = str(sp.rel) === "opponents" || str(sp.rel) === "shared" ? (str(sp.rel) as EncounterView) : "allies";
  const member = data.members[str(sp.member)] ? str(sp.member) : null;
  const account = member && data.members[member]!.accounts.some((a) => a.id === str(sp.account)) ? str(sp.account) : null;
  const sort: EncounterSort = str(sp.sort) === "best" || str(sp.sort) === "worst" ? (str(sp.sort) as EncounterSort) : "games";
  const filters: EncounterFilters = {
    view: member && view === "shared" ? "allies" : view,
    member,
    account,
    season: chooseSeason(str(sp.season), seasons, seasonNow),
    queue: str(sp.queue) in TOGETHER_QUEUES ? str(sp.queue) : "all",
    min: [3, 5].includes(Number(str(sp.min))) ? Number(str(sp.min)) : 2,
    sort: view === "shared" ? "games" : sort,
    q: str(sp.q).slice(0, 40),
    limit: Math.min(300, Math.max(30, Number(str(sp.limit)) || 30)),
  };
  const filterArgs = { season: filters.season, queues: TOGETHER_QUEUES[filters.queue]!.queues, playerId: filters.member, accountId: filters.account };
  // The chosen season is always one from 2026 on, so it leaves earlier rows out; the cached rows
  // are passed as they are, which keeps their cached summaries (encounterSummaries).
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
    if (n.season !== current) q.set("season", String(n.season));
    if (n.queue !== "all") q.set("queue", n.queue);
    if (n.min !== 2) q.set("min", String(n.min));
    if (n.sort !== "games" && n.view !== "shared") q.set("sort", n.sort);
    if (n.q) q.set("q", n.q);
    if (n.limit !== 30) q.set("limit", String(n.limit));
    return `/matches?${q.toString()}`;
  };
  const counted = filters.view === "allies" ? plural(all.length, "frequent ally", "frequent allies") : filters.view === "opponents" ? plural(all.length, "frequent opponent", "frequent opponents") : `${plural(all.length, "player", "players")} met by several members`;
  return (
    <div className="mx-auto max-w-[var(--content-max)] space-y-4">
      <PageHeader
        title="Matches"
        description={
          <Summary caveat={ENCOUNTER_CAVEAT} label="How encounters are counted">
            {seasonLabel(filters.season)} · {counted}
            {filters.member ? ` · ${data.members[filters.member]!.name}` : ""}
          </Summary>
        }
      />
      <MatchesTabs view="encounters" shared={{ season: filters.season === current ? null : filters.season, queue: filters.queue, member: filters.member }} />
      <EncountersView filters={filters} href={href} members={data.members} seasons={seasons} currentSeason={current} list={all.slice(0, filters.limit)} total={all.length} insights={insightViews} champions={Object.fromEntries(champions.map((c) => [c.id, { id: c.id, name: c.name, portraitUrl: c.portraitUrl }]))} filterArgs={filterArgs} />
    </div>
  );
}
