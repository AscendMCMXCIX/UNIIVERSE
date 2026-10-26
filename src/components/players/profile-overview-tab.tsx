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
import { PROFICIENCY_HELP, SeasonSummary, refinementLabel } from "@/components/players/player-overview";
import { InfoTip } from "@/components/ui/info-tip";
import { seasonLabel } from "@/domain/season";
import { ProfilePools } from "./profile-pools";
import { FirstRole } from "@/components/profile/first-role";
import { loadRankHistory } from "@/server/accounts/rank-history";
import { RankedProgress } from "@/components/players/ranked-progress";
import { cn } from "@/lib/cn";
import { RecentFormStrip } from "@/components/players/recent-form";
import { FORM_MIN_GAMES } from "@/domain/recent-form";
import type { PoolStats } from "@/components/profile/pool-stats";
import type { OverviewCard } from "@/server/players/overview";
import { championMap, IdentitySync, refreshFor, type ProfileSearch } from "./profile-sections";

/* The player profile's Overview tab (components/players/profile-sections.tsx has the frame shared by every tab). */

/** The pool cards' statistics, per role and champion, from the overview's per-role cards. */
function poolStats(cards: OverviewCard[]): PoolStats {
  const out: PoolStats = {};
  for (const c of cards) {
    (out[c.role] ??= {})[c.championId] = {
      tier: c.tier,
      tierLabel: c.tierLabel,
      tierWhy: c.tierWhy,
      evidence: c.evidence,
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
  const rankHref = (change: { rq?: "solo" | "flex"; ra?: string | null }) => {
    const q = new URLSearchParams(Object.entries(search).filter((e): e is [string, string] => typeof e[1] === "string" && !!e[1]));
    if (change.rq === defaultQueue) q.delete("rq");
    else if (change.rq) q.set("rq", change.rq);
    if (change.ra) q.set("ra", change.ra);
    else if (change.ra === null) q.delete("ra");
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
    ? dataStatus({ accounts: overview.accounts.map((a) => a.sync), checkedAt: sync.checkedAt, attemptedAt: sync.attemptedAt, newestGameAt: sync.newestGameAt, season: overview.completeness, multikills: m, details: { games: perf.games, detailed: perf.detailedGames }, unknownRole: overview.summary.unknownRole })
    : null;
  // The pools' heading (Edit sits at the end of its line) and what the figures on the cards count.
  const poolsHeading = (
    <h2 id="champion-pools" className="flex items-center gap-1.5 text-lg font-semibold text-fg">
      Roles &amp; champion pools {showStats ? <InfoTip text={PROFICIENCY_HELP} label="How proficiency is rated" /> : null}
    </h2>
  );
  const poolsIntro = (
    <p className="text-sm text-fg-muted">
      {self ? "The roles and champions you play, in your order of preference." : `The roles and champions ${player.displayName} plays, in their order of preference.`}
      {showStats ? (
        <span className="text-xs text-fg-subtle" data-testid="pool-scope">
          {" "}
          Figures: games played in that role · {scope}
        </span>
      ) : null}
    </p>
  );
  return (
    <div className="space-y-5">
      {showStats ? (
        <>
          <SeasonSummary data={overview} basePath={basePath} championsById={championsById} status={status} refresh={refreshFor(session, player.id, sync, m.games - m.counted - m.unavailable > 0)} />
          {/* Rank and recent form share one row on wide screens, as equals in height. The ranked card
              keeps the wider column in every state: its chart's space is kept even without a line
              to draw, so switching queue or account never resizes it. */}
          <div className={cn("grid grid-cols-[minmax(0,1fr)] items-stretch gap-4", rankHistory.accounts.length && overview.form.season.games >= FORM_MIN_GAMES ? "xl:grid-cols-[minmax(0,1.65fr)_minmax(19rem,1fr)]" : "")} data-testid="profile-progress">
            {rankHistory.accounts.length ? <RankedProgress accounts={rankHistory.accounts} queue={rankQueue} accountId={search.ra ?? null} href={rankHref} now={rankHistory.readAt} /> : null}
            <RecentFormStrip form={overview.form} championsById={championsById} historyHref={`${basePath}/matches`} narrowed={refinementLabel(overview, (id) => championsById[id]?.name ?? id)} />
          </div>
        </>
      ) : <p className="rounded-panel border border-border bg-surface p-4 text-sm text-fg-muted">Season statistics of teammates are not part of your access; their roles and champions are below.</p>}
      {/* The section's border turns to the accent while its pools are being edited. */}
      <section aria-labelledby="champion-pools" className="space-y-4 rounded-card border border-border bg-surface/60 p-4 transition-colors duration-150 has-[[data-editing]]:border-accent/50 sm:p-5" data-testid="champion-pools">
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
            scope={{ topChampions: overview.topChampions, season: overview.season, seasons: overview.seasons, currentSeason: overview.currentSeason, mode: overview.mode, filter: overview.filter, accountOptions: overview.accountOptions }}
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
    </div>
  );
}
