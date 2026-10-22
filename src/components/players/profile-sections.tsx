import { cache } from "react";
import { redirect } from "next/navigation";
import type { Db } from "@/server/db/types";
import type { Session } from "@/server/auth/permissions";
import { canEditPlayer, canManageRiotAccounts, hasPermission } from "@/server/auth/permissions";
import { defaultPlatform } from "@/server/auth/signup";
import { isGameRole, isSeasonMode, seasonModeInfo } from "@/domain/season-stats";
import { legalRolesFor, poolFor } from "@/domain/roster";
import { listChampions } from "@/server/repositories/champions";
import { profileVersion } from "@/server/repositories/team";
import { getPlayerOverview } from "@/server/players/overview";
import { getMatchHistory } from "@/server/players/match-history";
import { MatchHistoryView } from "@/components/match-history/match-history-view";
import { EncountersView, type EncountersData } from "@/components/match-history/encounters-view";
import { loadEncounterPage, loadGamesBySeason, modeCounts } from "@/server/players/encounters";
import { encounterListChoice } from "@/domain/encounters";
import { currentSeason } from "@/server/accounts/sync";
import { getPlayerMatchups } from "@/server/players/matchups";
import { loadProfileHeader, type ProfileHeaderData } from "@/server/players/profile-header";
import { loadPickerChampions } from "@/server/champions/picker";
import { listAccountsForPlayer } from "@/server/accounts/repository";
import { getMatchSyncStatus } from "@/server/accounts/refresh";
import { dataStatus } from "@/domain/data-status";
import { describeAccountSync, syncRefreshInterval } from "@/domain/account-status";
import { DataStatusBar } from "@/components/ui/data-status";
import { AutoRefresh } from "@/components/ui/auto-refresh";
import { getPlayerDataReport } from "@/server/proficiency/provenance";
import { PROFICIENCY_HELP, SeasonSummary, refinementLabel } from "@/components/players/player-overview";
import { AllChampions } from "@/components/players/all-champions";
import { InfoTip } from "@/components/ui/info-tip";
import type { PoolStats } from "@/components/profile/pool-stats";
import type { OverviewCard } from "@/server/players/overview";
import { chooseSeason, offeredSeasons, seasonLabel } from "@/domain/season";
import { ProfileHeader } from "@/components/players/profile-header";
import { ProfileIdentityProvider, ProfileIdentitySync, type HeaderIdentity } from "@/components/players/profile-identity";
import { cardArt, featurableChampions, isCardAccent } from "@/domain/player-card";
import { cardLookFor } from "@/domain/card-style";
import { ProfileTabs } from "@/components/players/profile-tabs";
import { ProfilePools } from "./profile-pools";
import { FirstRole } from "@/components/profile/first-role";
import { RiotAccountsPanel } from "@/components/team/riot-accounts-panel";
import { PlayerDataPanel } from "@/components/team/player-data-panel";
import { ErrorBoundary } from "@/components/error-boundary";
import { loadRankHistory } from "@/server/accounts/rank-history";
import { RankedProgress } from "@/components/players/ranked-progress";
import { cn } from "@/lib/cn";
import { RecentFormStrip } from "@/components/players/recent-form";
import { FORM_MIN_GAMES } from "@/domain/recent-form";
import type { PortraitChampion } from "@/components/champion-portrait";

/*
  THE player profile, the same for My Profile (/overview) and every teammate (/players/[id]):
  an identity header and its sections.

    Overview            season performance with filters, then the Primary Role and Off Roles
                        with their champion pools: one card per champion (order, proficiency,
                        games, win rate, KDA), edited in place by the owner or an admin
    All Champions       every champion played, outside the pools too: search, sort, filters; a
                        champion opens its window (Overview, and Matchups: one lane opponent at a
                        time, the lane from timelines, the games)
    Match History       the Riot games stored for the linked accounts, a page at a time
    Solo Queue Blocks   your private Solo/Duo journal (your own profile only; never a teammate's)
    Riot Accounts       linked accounts, Main and Alt, sync state

  Everyone sees the same layout; editing appears only for whoever may edit. Teammates' season
  statistics need the "view teammate statistics" permission.
*/

export interface ProfileSearch {
  season?: string;
  mode?: string;
  /** Statistics filters (Overview): role played, scope (all | pool | champion), champion, account. */
  role?: string;
  scope?: string;
  champion?: string;
  account?: string;
  /** Ranked progress: queue (solo | flex) and account. */
  rq?: string;
  ra?: string;
  /** The champion window: All Champions keys it on `champion`; Overview's pools on `champ` (where `champion` is a filter). Then the role it was opened in, view, opponent. */
  champ?: string;
  crole?: string;
  tab?: string;
  vs?: string;
}

const championMap = async (db: Db): Promise<Record<string, PortraitChampion>> => Object.fromEntries((await listChampions(db)).map((c) => [c.id, { id: c.id, name: c.name, portraitUrl: c.portraitUrl }]));

/** One header load per request, shared by the layout and the tab page. */
export const profileHeader = cache((db: Db, playerId: string) => loadProfileHeader(db, playerId));

/** The display-only identity the header shows (sent to the browser with every tab; see profile-identity.tsx). */
export function headerIdentity(h: ProfileHeaderData): HeaderIdentity {
  const p = h.player;
  return {
    playerId: p.id,
    displayName: p.displayName,
    avatarUrl: h.avatarUrl,
    art: cardArt(p),
    accent: isCardAccent(p.cardAccent) ? p.cardAccent : "default",
    look: cardLookFor(p),
    primaryRole: p.primaryRole ?? null,
    offRoles: [...(p.secondaryRole ? [p.secondaryRole] : []), ...p.additionalRoles.map((a) => a.role)],
    archived: !!p.archivedAt,
    setupPending: p.setupPending,
    lineupRole: h.lineupRole,
    rank: h.rank ? { tier: h.rank.tier, division: h.rank.division, leaguePoints: h.rank.leaguePoints, wins: h.rank.wins, losses: h.rank.losses, queue: h.rank.queue, asOf: h.rank.asOf } : null,
    featurable: featurableChampions(p),
    social: h.social,
  };
}

/** Every tab renders this: the header then shows this tab's (fresh) identity even when the layout was reused. */
function IdentitySync({ header }: { header: ProfileHeaderData }) {
  return <ProfileIdentitySync identity={headerIdentity(header)} />;
}

export async function ProfileFrame({ db, header, session, basePath, children }: { db: Db; header: ProfileHeaderData; session: Session | null; basePath: string; children: React.ReactNode }) {
  const self = session?.playerId === header.player.id;
  const editable = canEditPlayer(session, header.player.id);
  // The Customise dialog searches every champion (portraits only; cached list).
  const champions = editable ? Object.values(await championMap(db)) : [];
  return (
    <ProfileIdentityProvider initial={headerIdentity(header)}>
    <div className="mx-auto max-w-[var(--content-max)] space-y-4" data-testid="player-profile">
      {/* The section bar belongs to the profile card: tucked right under it. */}
      <div className="space-y-1.5">
        <ProfileHeader identity={headerIdentity(header)} self={self} editable={editable} champions={champions} />
        <ProfileTabs basePath={basePath} showBlocks={self && basePath === "/overview"} />
      </div>
      {children}
    </div>
    </ProfileIdentityProvider>
  );
}

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
    ? dataStatus({ accounts: overview.accounts.map((a) => a.sync), checkedAt: sync.checkedAt, newestGameAt: sync.newestGameAt, season: overview.completeness, multikills: m, details: { games: perf.games, detailed: perf.detailedGames }, unknownRole: overview.summary.unknownRole })
    : null;
  const refreshEvery = syncRefreshInterval(overview.accounts.map((a) => a.sync.state));
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
          <AutoRefresh active={refreshEvery !== null} intervalMs={refreshEvery ?? undefined} />
          <SeasonSummary data={overview} basePath={basePath} championsById={championsById} status={status} refresh={self || canManageRiotAccounts(session, player.id) ? { playerId: player.id, multikillsPending: m.games - m.counted - m.unavailable > 0 } : null} />
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

/** All Champions: every champion played in the filtered games, pools or not, to search and sort. */
export async function ProfileChampionsTab(props: { db: Db; header: ProfileHeaderData; session: Session | null; basePath: string; search: ProfileSearch }) {
  return (
    <>
      <IdentitySync header={props.header} />
      <ProfileChampionsTabBody {...props} />
    </>
  );
}

async function ProfileChampionsTabBody({ db, header, session, basePath, search }: { db: Db; header: ProfileHeaderData; session: Session | null; basePath: string; search: ProfileSearch }) {
  const player = header.player;
  const self = session?.playerId === player.id;
  if (!self && !hasPermission(session, "view-teammate-stats")) return <p className="rounded-panel border border-border bg-surface p-4 text-sm text-fg-muted">Teammates&apos; champion statistics are not part of your access.</p>;
  const [overview, championsById, sync] = await Promise.all([
    getPlayerOverview(db, player, { season: Number(search.season) || null, mode: isSeasonMode(search.mode) ? search.mode : "all", role: search.role ?? null, accountId: search.account ?? null, riotConfigured: !!process.env.RIOT_API_KEY }),
    championMap(db),
    getMatchSyncStatus(db, player.id),
  ]);
  // An old Matchups link without a champion opens the most played one.
  if (!search.champion && search.tab === "matchups" && overview.topChampions[0]) {
    const q = new URLSearchParams(Object.entries(search).filter((e): e is [string, string] => typeof e[1] === "string"));
    q.set("champion", overview.topChampions[0].championId);
    redirect(`${basePath}/champions?${q.toString()}`);
  }
  // The champion window's lane data, in the list's scope (all linked accounts unless one is chosen).
  const detail = search.champion
    ? await getPlayerMatchups(db, player.id, { account: overview.filter.accountId ?? "all", season: overview.season, mode: overview.mode, champion: search.champion, vs: search.vs ?? null, role: isGameRole(search.crole) ? search.crole : null, exact: true })
    : null;
  const m = overview.summary.multikills;
  const perf = overview.summary.performance;
  const status = dataStatus({ accounts: overview.accounts.map((a) => a.sync), checkedAt: sync.checkedAt, newestGameAt: sync.newestGameAt, season: overview.completeness, multikills: m, details: { games: perf.games, detailed: perf.detailedGames } });
  return (
    <div className="space-y-4">
      <DataStatusBar status={status} refresh={self || canManageRiotAccounts(session, player.id) ? { playerId: player.id, multikillsPending: m.games - m.counted - m.unavailable > 0 } : null} />
      <AllChampions data={overview} basePath={`${basePath}/champions`} championsById={championsById} playerId={player.id} detail={detail} />
    </div>
  );
}

export interface MatchSearch {
  season?: string;
  mode?: string;
  role?: string;
  scope?: string;
  champion?: string;
  account?: string;
  page?: string;
  per?: string;
  /** "encounters": the players met in the games, with their own choices (domain/encounters encounterListChoice). */
  view?: string;
  rel?: string;
  min?: string;
  sort?: string;
  q?: string;
  limit?: string;
}

/** Match History: the player's stored Riot games, a page at a time, or the players met in them (Encounters); details open on top. */
export async function ProfileMatchesTab(props: { db: Db; header: ProfileHeaderData; session: Session | null; basePath: string; search: MatchSearch }) {
  return (
    <>
      <IdentitySync header={props.header} />
      <ProfileMatchesTabBody {...props} />
    </>
  );
}

async function ProfileMatchesTabBody({ db, header, session, basePath, search }: { db: Db; header: ProfileHeaderData; session: Session | null; basePath: string; search: MatchSearch }) {
  const player = header.player;
  const self = session?.playerId === player.id;
  if (!self && !hasPermission(session, "view-teammate-stats")) return <p className="rounded-panel border border-border bg-surface p-4 text-sm text-fg-muted">Teammates&apos; match histories are not part of your access.</p>;
  if (search.view === "encounters") return <ProfileEncountersBody db={db} header={header} basePath={basePath} search={search} />;
  const [data, championsById, syncStatus, accounts] = await Promise.all([
    getMatchHistory(db, player.id, { season: Number(search.season) || null, mode: isSeasonMode(search.mode) ? search.mode : "all", role: search.role ?? null, scope: search.scope ?? null, championId: search.champion ?? null, accountId: search.account ?? null, page: Number(search.page) || 1, per: Number(search.per) || undefined }, self, (r) => (legalRolesFor(player).includes(r) ? poolFor(player, r) : [])),
    championMap(db),
    getMatchSyncStatus(db, player.id),
    listAccountsForPlayer(db, player.id),
  ]);
  const riotConfigured = !!process.env.RIOT_API_KEY;
  const status = dataStatus({
    accounts: accounts.map((a) => describeAccountSync({ syncStatus: a.syncStatus, syncError: a.syncError, lastSyncAt: a.lastSyncAt, puuid: a.puuid, resolveAttempts: a.resolveAttempts, history: a.historyBackfill, riotConfigured })),
    checkedAt: syncStatus.checkedAt,
    newestGameAt: syncStatus.newestGameAt,
    notes: data.missingOnPage > 0 ? [{ label: `Items and runes of ${data.missingOnPage} older game${data.missingOnPage === 1 ? "" : "s"} on this page are still being collected`, detail: "The account sync adds them; their results already count." }] : [],
  });
  return <MatchHistoryView data={data} championsById={championsById} basePath={`${basePath}/matches`} playerId={player.id} status={{ status, canRefresh: self || canManageRiotAccounts(session, player.id), multikillsPending: false }} />;
}

/**
 * Match History → Encounters: the players met in the player's games with the same season, game mode
 * and account choice as the games list. Two narrow reads, both counted in the database: the games
 * per season and queue (the choices), then one page of players (server/players/encounters).
 */
async function ProfileEncountersBody({ db, header, basePath, search }: { db: Db; header: ProfileHeaderData; basePath: string; search: MatchSearch }) {
  const player = header.player;
  const accounts = await listAccountsForPlayer(db, player.id);
  const ids = accounts.map((a) => a.id);
  const accountId = search.account && ids.includes(search.account) ? search.account : null;
  const [bySeason, seasonNow, championsById] = await Promise.all([loadGamesBySeason(db, ids, accountId), currentSeason(db), championMap(db)]);
  const seasons = offeredSeasons(seasonNow, bySeason.map((r) => r.season));
  const season = chooseSeason(search.season, seasons, seasonNow);
  const mode = isSeasonMode(search.mode) ? search.mode : "all";
  const choice = encounterListChoice(search);
  const page = await loadEncounterPage(db, { accountIds: accountId ? [accountId] : ids, season, mode }, choice);
  const data: EncountersData = {
    filter: { season, mode, role: null, scope: "all", championId: null, accountId },
    seasons,
    currentSeason: seasonNow,
    accountOptions: accounts.length > 1 ? accounts.map((a) => ({ id: a.id, riotId: a.riotId, label: a.label })) : [],
    accountsLinked: accounts.length,
    modes: modeCounts(bySeason, { season, mode, account: !!accountId }),
    choice,
    page,
  };
  return <EncountersView data={data} basePath={`${basePath}/matches`} playerId={player.id} playerName={player.displayName} championsById={championsById} />;
}

/** Riot Accounts: linked accounts and their sync state; data diagnostics for data admins only. */
export async function ProfileAccountsTab(props: { db: Db; header: ProfileHeaderData; session: Session | null }) {
  return (
    <>
      <IdentitySync header={props.header} />
      <ProfileAccountsTabBody {...props} />
    </>
  );
}

async function ProfileAccountsTabBody({ db, header, session }: { db: Db; header: ProfileHeaderData; session: Session | null }) {
  const player = header.player;
  const riotConfigured = !!process.env.RIOT_API_KEY;
  const dataAdmin = hasPermission(session, "manage-data");
  const [accounts, report, championsById] = await Promise.all([
    listAccountsForPlayer(db, player.id),
    dataAdmin
      ? getPlayerDataReport(db, player, { riotConfigured }).catch((err: Error) => {
          console.error(JSON.stringify({ level: "error", event: "player.report.failed", error: err.message }));
          return null;
        })
      : Promise.resolve(null),
    dataAdmin ? championMap(db) : Promise.resolve({} as Record<string, PortraitChampion>),
  ]);
  return (
    <div className="space-y-5">
      <RiotAccountsPanel playerId={player.id} accounts={accounts} riotConfigured={riotConfigured} defaultPlatform={defaultPlatform()} editable={canManageRiotAccounts(session, player.id)} title="Riot accounts" />
      {report ? (
        <details className="group rounded-card border border-border bg-surface" data-testid="data-diagnostics">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 px-4 text-sm font-medium text-fg-muted hover:text-fg">
            Data diagnostics
            <span className="text-xs font-normal text-fg-subtle">Admins: every champion&apos;s collected history and rating inputs</span>
          </summary>
          <div className="border-t border-border p-3">
            <ErrorBoundary label="Riot data">
              <PlayerDataPanel report={report} championsById={championsById} admin playerName={player.displayName} selfView={session?.playerId === player.id} showAccounts={false} />
            </ErrorBoundary>
          </div>
        </details>
      ) : null}
    </div>
  );
}
