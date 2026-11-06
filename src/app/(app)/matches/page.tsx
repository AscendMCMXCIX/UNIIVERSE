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
import { listTeamBookmarks, sharedGameRows, type TeamBookmark } from "@/server/matches/links";
import type { Session } from "@/server/auth/permissions";
import { filterTogether, summariseTogether } from "@/domain/played-together";
import { seasonLabel, seasonOfGame } from "@/domain/season";
import { chooseSeason, isOfferedSeason, offeredCurrentSeason, offeredSeasons } from "@/domain/season";
import { currentSeason } from "@/server/accounts/sync";
import { PlayedTogetherView, TOGETHER_QUEUES, type TogetherFilters, type TogetherListGame } from "@/components/matches/played-together";
import { encountersRedirect } from "@/lib/nav";
import { teamFreshness } from "@/server/ops/freshness";
import { FreshnessWatcher } from "@/components/ui/freshness-watcher";

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
      <div className="mx-auto max-w-[var(--content-max)] space-y-5">
        <PageHeader title="Matches" description="The team's games played together." />
        <EmptyState title="Team matches show teammates' games" testId="matches-no-stats">
          They are part of teammates&apos; statistics, which this account does not include. An administrator can change that.
        </EmptyState>
      </div>
    );
  }
  return <PlayedTogetherPage db={db} teamId={team.id} sp={sp} session={session} />;
}

/** What the games on this page prove and do not prove: the detail behind (i) beside the summary. */
const TOGETHER_CAVEAT =
  "Riot games in which two or more team members were on the same team, found in their synced match histories (no extra Riot requests). Riot's match data does not say who queued together, so these are games played together, not confirmed premade parties. Several linked accounts of one player count as one member; members on opposite sides are never counted as teammates. From Season 2026 on.";

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
  // Both teams of the games on screen only, one composition per listed side (a game with members
  // on both sides is listed once per side, each marking its own): server/matches/compositions.
  const shown = all.slice(0, limit);
  const teams = await togetherCompositions(db, teamId, shown, session.playerId ?? null);
  const wins = all.filter((g) => g.win).length;
  const decided = all.filter((g) => g.win !== null).length;
  return (
    <div className="mx-auto max-w-[var(--content-max)] space-y-4">
      <FreshnessWatcher scope={{ kind: "team" }} version={version} />
      <PageHeader
        title="Matches"
        description={
          <Summary caveat={TOGETHER_CAVEAT} label="How games played together are found">
            {seasonLabel(season)} · {plural(all.length, "game", "games")} {saved ? "bookmarked" : "played together"}
            {decided ? ` · ${wins}W ${decided - wins}L` : ""}
          </Summary>
        }
      />
      <PlayedTogetherView data={data} seasons={seasons} currentSeason={current} shown={shown} teams={teams} total={all.length} filters={filters} summary={summary} savedCount={savedCount} champions={Object.fromEntries(champions.map((c) => [c.id, { id: c.id, name: c.name, portraitUrl: c.portraitUrl }]))} href={href} elsewhere={elsewhere} />
    </div>
  );
}
