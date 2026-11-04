import type { Db } from "@/server/db/types";
import type { Session } from "@/server/auth/permissions";
import { canEditPlayer, hasPermission } from "@/server/auth/permissions";
import { isGameRole, isSeasonMode, seasonModeInfo } from "@/domain/season-stats";
import { profileVersion } from "@/server/repositories/team";
import { getPlayerOverview } from "@/server/players/overview";
import { getPlayerMatchups } from "@/server/players/matchups";
import { type ProfileHeaderData } from "@/server/players/profile-header";
import { loadPickerChampions } from "@/server/champions/picker";
import { getMatchSyncStatus } from "@/server/accounts/refresh";
import { dataStatus } from "@/domain/data-status";
import { SeasonSummary, refinementLabel } from "@/components/players/player-overview";
import { seasonLabel } from "@/domain/season";
import { ProfilePools } from "./profile-pools";
import { FirstRole } from "@/components/profile/first-role";
import { loadRankHistory } from "@/server/accounts/rank-history";
import { RankedProgress, type RankedProgressHref } from "@/components/players/ranked-progress";
import { isRankView, type RankView } from "@/domain/rank-timeline";
import { RecentFormStrip } from "@/components/players/recent-form";
import { FORM_MIN_GAMES } from "@/domain/recent-form";
import type { PoolStats } from "@/components/profile/pool-stats";
import type { OverviewCard } from "@/server/players/overview";
import { championMap, IdentitySync, refreshFor, type ProfileSearch } from "./profile-sections";

/* The player profile's Overview tab (components/players/profile-sections.tsx has the frame shared by every tab). */

/** The pool rows' statistics, per role and champion, from the overview's per-role cards. */
function poolStats(cards: OverviewCard[]): PoolStats {
  const out: PoolStats = {};
  for (const c of cards) {
    (out[c.role] ??= {})[c.championId] = {
      games: c.selected.games,
      winRate: c.selected.winRate,
      kdaRatio: c.performance.kdaRatio,
      perfectKda: c.performance.perfectKda,
      csPerMinute: c.performance.csPerMinute,
      visionPerGame: c.performance.visionPerGame,
      mastery: c.mastery?.points ?? null,
    };
  }
  return out;
}

/**
 * Overview: season performance (with its filters), then the player's roles and champion pools,
 * each champion once, with its statistics in that role; the owner and admins edit them in place.
 */
export async function ProfileOverviewTab(props: { db: Db; header: ProfileHeaderData; session: Session | null; basePath: string; search: ProfileSearch }) {
  return (
    <>
      <IdentitySync header={props.header} />
      <ProfileOverviewTabBody {...props} />
    </>
  );
}

async function ProfileOverviewTabBody({ db, header, session, basePath, search }: { db: Db; header: ProfileHeaderData; session: Session | null; basePath: string; search: ProfileSearch }) {
  const player = header.player;
  const self = session?.playerId === player.id;
  const editable = canEditPlayer(session, player.id);
  const showStats = self || hasPermission(session, "view-teammate-stats");
  const [overview, championsById, picker, rankHistory, sync] = await Promise.all([
    getPlayerOverview(db, player, { season: Number(search.season) || null, mode: isSeasonMode(search.mode) ? search.mode : "all", role: search.role ?? null, scope: search.scope ?? null, championId: search.champion ?? null, accountId: search.account ?? null, riotConfigured: !!process.env.RIOT_API_KEY }),
    championMap(db),
    editable ? loadPickerChampions(db) : Promise.resolve([]),
    // Rank history is part of the player's statistics: the same access rule.
    showStats ? loadRankHistory(db, player.id) : Promise.resolve({ accounts: [], readAt: 0 }),
    // When the accounts were last read and the newest game: the page's one status line (two small queries).
    showStats ? getMatchSyncStatus(db, player.id) : Promise.resolve(null),
  ]);
  // A pool champion's window (the same one as All Champions): its lane data in this page's scope.
  const detail =
    showStats && search.champ
      ? await getPlayerMatchups(db, player.id, { account: overview.filter.accountId ?? "all", season: overview.season, mode: overview.mode, champion: search.champ, vs: search.vs ?? null, role: isGameRole(search.crole) ? search.crole : null, exact: true })
      : null;
  // Ranked progress opens on the queue the header's rank comes from (Solo/Duo unless only Flex is ranked).
  const defaultQueue = header.rank?.queue === "flex" ? "flex" : "solo";
  const rankQueue = search.rq === "flex" || search.rq === "solo" ? search.rq : defaultQueue;
  const rankView: RankView = isRankView(search.rv) ? search.rv : "year";
  const rankHref: RankedProgressHref = (change) => {
    const q = new URLSearchParams(Object.entries(search).filter((e): e is [string, string] => typeof e[1] === "string" && !!e[1]));
    if (change.rq === defaultQueue) q.delete("rq");
    else if (change.rq) q.set("rq", change.rq);
    if (change.ra) q.set("ra", change.ra);
    else if (change.ra === null) q.delete("ra");
    if (change.rv === "year") q.delete("rv");
    else if (change.rv) q.set("rv", change.rv);
    const query = q.toString();
    return `${basePath}${query ? `?${query}` : ""}#ranked-progress`;
  };
  const scope = `${seasonLabel(overview.season)} · ${seasonModeInfo(overview.mode).label}${overview.accounts.length > 1 ? ` · all ${overview.accounts.length} accounts` : ""}`;
  // The page's one status: the accounts, the season's completeness and every figure below that
  // comes from only some of the games (multikills, game details), instead of a mark beside each.
  // Season performance shows it as one ⓘ beside its Refresh, under its heading.
  const perf = overview.summary.performance;
  const m = overview.summary.multikills;
  const status = sync
    ? dataStatus({ accounts: overview.accounts.map((a) => a.sync), checkedAt: sync.checkedAt, attemptedAt: sync.attemptedAt, newestGameAt: sync.newestGameAt, season: overview.completeness, multikills: m, details: { games: perf.games, detailed: perf.detailedGames, unavailable: perf.unavailableGames }, unknownRole: overview.summary.unknownRole })
    : null;
  // The pools' heading (Edit sits at the end of its line) and what the figures on the cards count.
  const poolsHeading = (
    <h2 id="champion-pools" className="text-base font-semibold text-fg">
      Roles &amp; champion pools
    </h2>
  );
  const poolsIntro = (
    <p className="text-xs text-fg-subtle">
      {self ? "Your roles and champions, in your order of preference." : `${player.displayName}'s roles and champions, in their order of preference.`}
      {showStats ? <span data-testid="pool-scope"> Figures: games in that role · {scope}</span> : null}
    </p>
  );
  // The pools (the player's own choice of roles and champions, in order), with each champion's
  // figures in that role over the page's games; the owner and admins edit them in place.
  const pools = (
    // The section's border turns to the accent while its pools are being edited.
    <section aria-labelledby="champion-pools" className="space-y-3 rounded-card border border-border bg-surface p-3 panel-depth transition-colors duration-150 has-[[data-editing]]:border-accent/50 sm:p-4" data-testid="champion-pools">
      {player.primaryRole ? (
        <div data-testid={editable ? "pool-editor" : "pool-cards"}>
          <ProfilePools
            editor={{
              playerId: player.id,
              initial: { primaryRole: player.primaryRole, secondaryRole: player.secondaryRole, primaryPool: player.primaryPool, secondaryPool: player.secondaryPool, additionalRoles: player.additionalRoles },
              version: profileVersion(player),
              champions: picker.length ? picker : Object.values(championsById),
              editable,
              stats: showStats ? poolStats(overview.cards) : undefined,
              heading: poolsHeading,
              intro: poolsIntro,
            }}
            // Without statistics access the champion window never opens, so its figures and the Riot IDs of
            // the account filter stay on the server.
            scope={{ topChampions: showStats ? overview.topChampions : [], season: overview.season, seasons: overview.seasons, currentSeason: overview.currentSeason, mode: overview.mode, filter: overview.filter, accountOptions: showStats ? overview.accountOptions : [] }}
            detail={detail}
            championsById={championsById}
            playerId={player.id}
            inspect={showStats}
          />
        </div>
      ) : (
        <>
          <div className="space-y-1">
            {poolsHeading}
            {poolsIntro}
          </div>
          <FirstRole playerId={player.id} name={player.displayName} self={self} editable={editable} />
        </>
      )}
      {showStats && !overview.hasHistory ? <p className="text-xs text-fg-muted">{overview.accounts.length === 0 ? "No Riot account linked: games and win rates appear once an account is linked and synced." : "No stored games yet: figures appear after the first account sync, a few minutes after linking; this page updates by itself."}</p> : null}
    </section>
  );
  if (!showStats)
    return (
      <div className="space-y-4">
        <p className="rounded-panel border border-border bg-surface p-4 text-sm text-fg-muted">Season statistics of teammates are not part of your access; their roles and champions are below.</p>
        {pools}
      </div>
    );
  return (
    <SeasonSummary
      data={overview}
      basePath={basePath}
      championsById={championsById}
      status={status}
      refresh={refreshFor(session, player.id, sync, m.games - m.counted - m.unavailable > 0)}
      form={overview.form.season.games >= FORM_MIN_GAMES ? <RecentFormStrip form={overview.form} championsById={championsById} historyHref={`${basePath}/matches`} narrowed={refinementLabel(overview, (id) => championsById[id]?.name ?? id)} /> : null}
      ranked={rankHistory.accounts.length ? <RankedProgress accounts={rankHistory.accounts} queue={rankQueue} view={rankView} accountId={search.ra ?? null} href={rankHref} now={rankHistory.readAt} /> : null}
      pools={pools}
    />
  );
}
