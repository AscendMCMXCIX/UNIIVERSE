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
import { getPlayerMatchups } from "@/server/players/matchups";
import { loadProfileHeader, type ProfileHeaderData } from "@/server/players/profile-header";
import { loadPickerChampions } from "@/server/champions/picker";
import { listAccountsForPlayer } from "@/server/accounts/repository";
import { getMatchSyncStatus } from "@/server/accounts/refresh";
import { getPlayerDataReport } from "@/server/proficiency/provenance";
import { PROFICIENCY_HELP, SeasonSummary } from "@/components/players/player-overview";
import { AllChampions } from "@/components/players/all-champions";
import { InfoTip } from "@/components/ui/info-tip";
import type { PoolStats } from "@/components/profile/pool-stats";
import type { OverviewCard } from "@/server/players/overview";
import { seasonLabel } from "@/domain/season";
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
  const [overview, championsById, picker, rankHistory] = await Promise.all([
    getPlayerOverview(db, player, { season: Number(search.season) || null, mode: isSeasonMode(search.mode) ? search.mode : "all", role: search.role ?? null, scope: search.scope ?? null, championId: search.champion ?? null, accountId: search.account ?? null, riotConfigured: !!process.env.RIOT_API_KEY }),
    championMap(db),
    editable ? loadPickerChampions(db) : Promise.resolve([]),
    // Rank history is part of the player's statistics: the same access rule.
    showStats ? loadRankHistory(db, player.id) : Promise.resolve({ accounts: [], readAt: 0 }),
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
  return (
    <div className="space-y-5">
      {showStats ? (
        <>
          <SeasonSummary data={overview} basePath={basePath} championsById={championsById} />
          {/* Rank and recent form share one row on wide screens, as equals in height. The ranked card
              takes the wider column only once it has a line to draw; with a single reading the two
              split the row evenly, so neither reserves room it cannot fill. */}
          <div className={cn("grid grid-cols-[minmax(0,1fr)] items-stretch gap-4", rankHistory.accounts.length && overview.form.season.games >= FORM_MIN_GAMES ? "xl:grid-cols-2 xl:has-[[data-testid=ranked-chart]]:grid-cols-[minmax(0,1.65fr)_minmax(19rem,1fr)]" : "")} data-testid="profile-progress">
            {rankHistory.accounts.length ? <RankedProgress accounts={rankHistory.accounts} queue={rankQueue} accountId={search.ra ?? null} href={rankHref} now={rankHistory.readAt} /> : null}
            <RecentFormStrip form={overview.form} championsById={championsById} historyHref={`${basePath}/matches`} />
          </div>
        </>
      ) : <p className="rounded-panel border border-border bg-surface p-4 text-sm text-fg-muted">Season statistics of teammates are not part of your access; their roles and champions are below.</p>}
      <section aria-labelledby="champion-pools" className="space-y-3 rounded-card border border-border bg-surface/60 p-4" data-testid="champion-pools">
        {/* One heading line and one line of context: the pools themselves start right below. */}
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <h2 id="champion-pools" className="flex items-center gap-1.5 text-lg font-semibold text-fg">
            Roles &amp; champion pools {showStats ? <InfoTip text={PROFICIENCY_HELP} label="How proficiency is rated" /> : null}
          </h2>
          <p className="text-sm text-fg-muted">
            {self ? "The roles and champions you play, in your order of preference." : `The roles and champions ${player.displayName} plays, in their order of preference.`}
            {showStats ? (
              <span className="text-xs text-fg-subtle" data-testid="pool-scope">
                {" "}
                Games played in that role · {scope}
              </span>
            ) : null}
          </p>
        </div>
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
            }}
            scope={{ topChampions: overview.topChampions, season: overview.season, seasons: overview.seasons, currentSeason: overview.currentSeason, mode: overview.mode, filter: overview.filter, accountOptions: overview.accountOptions }}
            detail={detail}
            championsById={championsById}
            playerId={player.id}
            inspect={showStats}
          />
        </div>
        ) : (
          <FirstRole playerId={player.id} name={player.displayName} self={self} editable={editable} />
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
  const [overview, championsById] = await Promise.all([
    getPlayerOverview(db, player, { season: Number(search.season) || null, mode: isSeasonMode(search.mode) ? search.mode : "all", role: search.role ?? null, accountId: search.account ?? null, riotConfigured: !!process.env.RIOT_API_KEY }),
    championMap(db),
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
  return <AllChampions data={overview} basePath={`${basePath}/champions`} championsById={championsById} playerId={player.id} detail={detail} />;
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
}

/** Match History: the player's stored Riot games, a page at a time; details open on top. */
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
  const [data, championsById, syncStatus] = await Promise.all([
    getMatchHistory(db, player.id, { season: Number(search.season) || null, mode: isSeasonMode(search.mode) ? search.mode : "all", role: search.role ?? null, scope: search.scope ?? null, championId: search.champion ?? null, accountId: search.account ?? null, page: Number(search.page) || 1, per: Number(search.per) || undefined }, self, (r) => (legalRolesFor(player).includes(r) ? poolFor(player, r) : [])),
    championMap(db),
    getMatchSyncStatus(db, player.id),
  ]);
  return <MatchHistoryView data={data} championsById={championsById} basePath={`${basePath}/matches`} playerId={player.id} sync={{ status: syncStatus, canRefresh: self || canManageRiotAccounts(session, player.id) }} />;
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
