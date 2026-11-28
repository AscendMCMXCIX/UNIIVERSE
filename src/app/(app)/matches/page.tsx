import { redirect } from "next/navigation";
import { getAppDb } from "@/server/bootstrap";
import { hasPermission } from "@/server/auth/session";
import { requirePageAccess } from "@/server/auth/page-access";
import { listChampions } from "@/server/repositories/champions";
import { getOrCreateTeam } from "@/server/repositories/team";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { InfoTip } from "@/components/ui/info-tip";
import { loadPlayedTogether, type PlayedTogether } from "@/server/matches/played-together";
import { togetherCompositions } from "@/server/matches/compositions";
import { togetherScores } from "@/server/matches/together-scores";
import { listTeamBookmarks, sharedGameRows, type TeamBookmark } from "@/server/matches/links";
import type { Session } from "@/server/auth/permissions";
import { filterTogether, summariseTogether } from "@/domain/played-together";
import { seasonLabel, seasonOfGame } from "@/domain/season";
import { chooseSeason, FIRST_SEASON, isOfferedSeason, offeredCurrentSeason, offeredSeasons } from "@/domain/season";
import { currentSeason } from "@/server/accounts/sync";
import { PlayedTogetherView, TOGETHER_QUEUES, type TogetherFilters, type TogetherListGame } from "@/components/matches/played-together";
import { encountersRedirect } from "@/lib/nav";
import { teamFreshness } from "@/server/ops/freshness";
import { FreshnessWatcher } from "@/components/ui/freshness-watcher";
import { cookies } from "next/headers";
import { LIST_PER_COOKIES, LIST_PER_MAX, pageHolding, readListPer } from "@/lib/list-per";
import { rowsPerPageCap } from "@/server/demo/test-hooks";
import { WS_COLUMN } from "@/components/ui/workspace-classes";
import { togetherEntry } from "@/domain/played-together";

export const dynamic = "force-dynamic";

const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

/**
 * Team → Matches: the team's Riot games played together, from Season 2026 on (the offered seasons,
 * domain/season): earlier games never reach this page's lists, counts, bookmarks or season choice.
 * The players someone keeps meeting (Encounters) are in each profile's Match History; the old
 * Encounters address opens your own.
 */
export default async function MatchesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const db = await getAppDb();
  const [team, session] = await Promise.all([getOrCreateTeam(db), requirePageAccess("view-matches")]);
  if (str(sp.view) === "encounters") redirect(session.playerId ? encountersRedirect(sp) : "/matches");
  // Both tabs show teammates' Riot games: the same right as their statistics.
  if (!hasPermission(session, "view-teammate-stats")) {
    return (
      <div className="mx-auto max-w-[var(--content-wide)] space-y-5">
        <PageHeader title="Matches" description="The team's games played together." sectionNamed />
        <EmptyState title="Team matches show teammates' games" className="max-w-[var(--content-max)]" testId="matches-no-stats">
          They are part of teammates&apos; statistics, which this account does not include. An administrator can change that.
        </EmptyState>
      </div>
    );
  }
  return <PlayedTogetherPage db={db} teamId={team.id} sp={sp} session={session} />;
}

/** What the games on this page prove and do not prove: the detail behind (i) beside the summary. */
const TOGETHER_CAVEAT =
  `Games where two or more members were on the same team, from ${seasonLabel(FIRST_SEASON)}. Riot doesn't say who queued together, so not necessarily a party.`;

/**
 * Games with two or more members that this page cannot list (which side each member was on is not
 * known): said behind the scope line's (i), with the rule, as the list's own line used to say them.
 */
function leftOutNotes(data: Pick<PlayedTogether, "unknownSide" | "unavailableSide">): string[] {
  const notes: string[] = [];
  if (data.unknownSide) notes.push("Some games aren't shown yet: they appear once their details load.");
  if (data.unavailableSide) notes.push(`${data.unavailableSide} older game${data.unavailableSide === 1 ? "" : "s"} can't be shown: Riot no longer has ${data.unavailableSide === 1 ? "its" : "their"} details (the results still count on profiles).`);
  return notes;
}

/** The header's one line: what is counted and the record, with the caveat (and any games left out) behind (i). */
function Summary({ scope, record, caveat, notes = [], label }: { scope: string; record: string | null; caveat: string; notes?: string[]; label: string }) {
  // The (i) ends the line, in its flow, as one unbreakable piece with what comes last: the record
  // ("7W 5L") when there is one, else the last word. Where the line does not fit, it breaks before
  // that piece, so the (i) never takes a line alone.
  const cut = scope.lastIndexOf(" ") + 1;
  const [lead, last] = record ? [`${scope} · `, record] : [scope.slice(0, cut), scope.slice(cut)];
  return (
    <span data-testid="matches-summary">
      {lead}
      <span className="whitespace-nowrap">
        {last}{" "}
        <span className="ml-0.5 inline-flex align-middle">
          <InfoTip
            text={
              notes.length ? (
                <>
                  <span className="block">{caveat}</span>
                  {notes.map((n) => (
                    <span key={n} className="mt-1.5 block" data-testid="matches-left-out">
                      {n}
                    </span>
                  ))}
                </>
              ) : (
                caveat
              )
            }
            label={label}
          />
        </span>
      </span>
    </span>
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

async function PlayedTogetherPage({ db, teamId, sp, session }: { db: Awaited<ReturnType<typeof getAppDb>>; teamId: string; sp: Record<string, string | string[] | undefined>; session: Session }) {
  const [data, champions, bookmarks, seasonNow, version] = await Promise.all([loadPlayedTogether(db, teamId), listChampions(db), listTeamBookmarks(db, teamId), currentSeason(db), teamFreshness(db)]);
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
  // The one-screen workspace's pages (docs/RESPONSIVE.md, "One-screen desktop pages", Team Matches): `per` games a page, its
  // row budget, from the address, else the list's cookie (its last budget, for the first paint); the flow, which shows the
  // first `limit` and Show more, drops it once it knows (TogetherWorkspace).
  const jar = await cookies();
  const askedPer = Math.round(Number(str(sp.per)));
  const keptPer = askedPer >= 1 || str(sp.limit) ? null : readListPer(jar.get(LIST_PER_COOKIES.together)?.value);
  const per = askedPer >= 1 ? Math.min(LIST_PER_MAX, askedPer) : keptPer;
  const filters: TogetherFilters = { season, queue, min, with: chosen, limit, saved, per, page: 1 };

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
    // Another choice starts again at the list's first page (the workspace's page size kept).
    const n = { ...filters, page: 1, ...change };
    const q = new URLSearchParams();
    if (n.season !== current) q.set("season", String(n.season));
    if (n.saved) q.set("saved", "1");
    if (n.queue !== "all") q.set("queue", n.queue);
    if (n.min !== 2 && !n.saved) q.set("min", String(n.min));
    if (n.with.length) q.set("with", n.with.join(","));
    if (n.limit !== 20) q.set("limit", String(n.limit));
    if (n.per) {
      q.set("per", String(n.per));
      if (n.page > 1) q.set("page", String(n.page));
    }
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
  // Both teams of the games on screen only, one composition per listed side (a game with members
  // on both sides is listed once per side, each marking its own): server/matches/compositions. And
  // each member's performance score and place, each shown game scored once: server/matches/together-scores.
  const pages = per ? Math.max(1, Math.ceil(all.length / per)) : 1;
  // A link to a game (?match=) opens with the list on its page, the game window's Previous, Next and place in the list with
  // it: where the address names no page, or a page that does not hold it (a link copied at another page size, a page size
  // the workspace wrote while the game was open off its page). The flow (no `per`) lists its first `limit`, as it always has.
  const askedPage = Math.max(1, Math.round(Number(str(sp.page))) || 1);
  const linkedPage = per ? pageHolding(all.map((g) => g.matchId), str(sp.match) || null, per, str(sp.page) ? askedPage : null) : null;
  filters.page = per ? Math.min(pages, linkedPage ?? askedPage) : 1;
  const offset = per ? (filters.page - 1) * per : 0;
  const shown = per ? all.slice(offset, offset + per) : all.slice(0, limit);
  // The games either side of the page (the game window's Previous and Next go on across the pages).
  const neighbour = (g: TogetherListGame | undefined) => (g ? { entry: togetherEntry(g.matchId, g.teamId), matchId: g.matchId, playerId: g.members[0]!.playerId, said: `${g.win === null ? "Game" : g.win ? "Victory" : "Defeat"} on ${champions.find((c) => c.id === g.members[0]!.championId)?.name ?? g.members[0]!.championId}` } : null);
  const paging = { per, page: filters.page, pages, offset, perFrom: askedPer >= 1 ? ("address" as const) : keptPer ? ("cookie" as const) : ("default" as const), cap: rowsPerPageCap(jar), before: per ? neighbour(all[offset - 1]) : null, after: per ? neighbour(all[offset + per]) : null };
  const [teams, scores] = await Promise.all([togetherCompositions(db, teamId, shown, session.playerId ?? null), togetherScores(db, teamId, shown)]);
  const wins = all.filter((g) => g.win).length;
  const decided = all.filter((g) => g.win !== null).length;
  return (
    // Team's one width (SECTION_HUBS), centred as every page is, so its tabs line up with each of its sections at every window size.
    <div className={`mx-auto max-w-[var(--content-wide)] space-y-4 ${WS_COLUMN}`}>
      <FreshnessWatcher scope={{ kind: "team" }} version={version} />
      <PageHeader
        sectionNamed
        title="Matches"
        description={
          <Summary
            scope={`${seasonLabel(season)} · ${plural(all.length, "game", "games")} ${saved ? "bookmarked" : "played together"}`}
            record={decided ? `${wins}W ${decided - wins}L` : null}
            caveat={TOGETHER_CAVEAT}
            notes={leftOutNotes(data)}
            label="How games played together are found"
          />
        }
      />
      <PlayedTogetherView data={data} seasons={seasons} currentSeason={current} shown={shown} teams={teams} scores={scores} total={all.length} filters={filters} summary={summary} savedCount={savedCount} champions={Object.fromEntries(champions.map((c) => [c.id, { id: c.id, name: c.name, portraitUrl: c.portraitUrl }]))} href={href} elsewhere={elsewhere} paging={paging} />
    </div>
  );
}
