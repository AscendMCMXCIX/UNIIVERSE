import { cache } from "react";
import type { Db } from "@/server/db/types";
import type { Session } from "@/server/auth/permissions";
import { canEditPlayer, canManageRiotAccounts, hasPermission } from "@/server/auth/permissions";
import { defaultPlatform } from "@/server/auth/signup";
import { isSeasonMode, seasonModeInfo } from "@/domain/season-stats";
import { legalRolesFor, poolFor } from "@/domain/roster";
import { listChampions } from "@/server/repositories/champions";
import { profileVersion } from "@/server/repositories/team";
import { getPlayerOverview } from "@/server/players/overview";
import { getMatchHistory } from "@/server/players/match-history";
import { MatchHistoryView } from "@/components/match-history/match-history-view";
import { loadProfileHeader, type ProfileHeaderData } from "@/server/players/profile-header";
import { loadPickerChampions } from "@/server/champions/picker";
import { listAccountsForPlayer } from "@/server/accounts/repository";
import { getPlayerDataReport } from "@/server/proficiency/provenance";
import { PROFICIENCY_HELP, SeasonSummary } from "@/components/players/player-overview";
import { AllChampions } from "@/components/players/all-champions";
import { InfoTip } from "@/components/ui/info-tip";
import type { PoolStats } from "@/components/profile/pool-stats";
import type { OverviewCard } from "@/server/players/overview";
import { seasonLabel } from "@/domain/season";
import { ProfileHeader } from "@/components/players/profile-header";
import { ProfileTabs } from "@/components/players/profile-tabs";
import { ProfileEditor } from "@/components/profile/profile-editor";
import { RiotAccountsPanel } from "@/components/team/riot-accounts-panel";
import { PlayerDataPanel } from "@/components/team/player-data-panel";
import { ErrorBoundary } from "@/components/error-boundary";
import type { PortraitChampion } from "@/components/champion-portrait";

/*
  THE player profile, the same for My Profile (/overview) and every teammate (/players/[id]):
  an identity header and its sections.

    Overview            season performance with filters, then the Primary Role and Off Roles
                        with their champion pools: one card per champion (order, proficiency,
                        games, win rate, KDA), edited in place by the owner or an admin
    All Champions       every champion played, outside the pools too: search, sort, filters
    Solo Queue Blocks   your private Solo/Duo journal (your own profile only; never a teammate's)
    Match History       the Riot games stored for the linked accounts, a page at a time
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
}

const championMap = async (db: Db): Promise<Record<string, PortraitChampion>> => Object.fromEntries((await listChampions(db)).map((c) => [c.id, { id: c.id, name: c.name, portraitUrl: c.portraitUrl }]));

/** One header load per request, shared by the layout and the tab page. */
export const profileHeader = cache((db: Db, playerId: string) => loadProfileHeader(db, playerId));

export async function ProfileFrame({ db, header, session, basePath, children }: { db: Db; header: ProfileHeaderData; session: Session | null; basePath: string; children: React.ReactNode }) {
  const self = session?.playerId === header.player.id;
  const editable = canEditPlayer(session, header.player.id);
  // The Customise dialog searches every champion (portraits only; cached list).
  const champions = editable ? Object.values(await championMap(db)) : [];
  return (
    <div className="mx-auto max-w-[var(--content-max)] space-y-4" data-testid="player-profile">
      {/* The section bar belongs to the profile card: tucked right under it. */}
      <div className="space-y-1.5">
        <ProfileHeader data={header} self={self} editable={editable} champions={champions} />
        <ProfileTabs basePath={basePath} showBlocks={self && basePath === "/overview"} />
      </div>
      {children}
    </div>
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
      mastery: c.mastery?.points ?? null,
    };
  }
  return out;
}

/**
 * Overview: season performance (with its filters), then the player's roles and champion pools,
 * each champion once, with its statistics in that role; the owner and admins edit them in place.
 */
export async function ProfileOverviewTab({ db, header, session, basePath, search }: { db: Db; header: ProfileHeaderData; session: Session | null; basePath: string; search: ProfileSearch }) {
  const player = header.player;
  const self = session?.playerId === player.id;
  const editable = canEditPlayer(session, player.id);
  const showStats = self || hasPermission(session, "view-teammate-stats");
  const [overview, championsById, picker] = await Promise.all([
    getPlayerOverview(db, player, { season: Number(search.season) || null, mode: isSeasonMode(search.mode) ? search.mode : "all", role: search.role ?? null, scope: search.scope ?? null, championId: search.champion ?? null, accountId: search.account ?? null, riotConfigured: !!process.env.RIOT_API_KEY }),
    championMap(db),
    editable ? loadPickerChampions(db) : Promise.resolve([]),
  ]);
  const scope = `${seasonLabel(overview.season)} · ${seasonModeInfo(overview.mode).label}${overview.accounts.length > 1 ? ` · all ${overview.accounts.length} accounts` : ""}`;
  return (
    <div className="space-y-6">
      {showStats ? <SeasonSummary data={overview} basePath={basePath} championsById={championsById} /> : <p className="rounded-xl border border-border bg-surface p-4 text-sm text-fg-muted">Season statistics of teammates are not part of your access; their roles and champions are below.</p>}
      <section aria-labelledby="champion-pools" className="space-y-4 rounded-2xl border border-border bg-surface/60 p-4 sm:p-5" data-testid="champion-pools">
        <div>
          <h2 id="champion-pools" className="flex items-center gap-1.5 text-lg font-semibold text-fg">
            Roles &amp; champion pools {showStats ? <InfoTip text={PROFICIENCY_HELP} label="How proficiency is rated" /> : null}
          </h2>
          <p className="text-sm text-fg-muted">
            {self ? "The champions UNIIVERSE drafts for you, in your order of preference." : `The champions UNIIVERSE drafts for ${player.displayName}, in their order of preference.`}
            {showStats ? ` Statistics: games played in that role · ${scope}.` : ""}
          </p>
        </div>
        <div data-testid={editable ? "pool-editor" : "pool-cards"}>
          <ProfileEditor
            playerId={player.id}
            initial={{ primaryRole: player.primaryRole, secondaryRole: player.secondaryRole, primaryPool: player.primaryPool, secondaryPool: player.secondaryPool, additionalRoles: player.additionalRoles }}
            version={profileVersion(player)}
            champions={picker.length ? picker : Object.values(championsById)}
            editable={editable}
            stats={showStats ? poolStats(overview.cards) : undefined}
          />
        </div>
        {showStats && !overview.hasHistory ? <p className="text-xs text-fg-muted">{overview.accounts.length === 0 ? "No Riot account linked: games and win rates appear once an account is linked and synced." : "No stored games yet: figures appear after the first account sync, a few minutes after linking; this page updates by itself."}</p> : null}
      </section>
    </div>
  );
}

/** All Champions: every champion played in the filtered games, pools or not, to search and sort. */
export async function ProfileChampionsTab({ db, header, session, basePath, search }: { db: Db; header: ProfileHeaderData; session: Session | null; basePath: string; search: ProfileSearch }) {
  const player = header.player;
  const self = session?.playerId === player.id;
  if (!self && !hasPermission(session, "view-teammate-stats")) return <p className="rounded-xl border border-border bg-surface p-4 text-sm text-fg-muted">Teammates&apos; champion statistics are not part of your access.</p>;
  const [overview, championsById] = await Promise.all([
    getPlayerOverview(db, player, { season: Number(search.season) || null, mode: isSeasonMode(search.mode) ? search.mode : "all", role: search.role ?? null, accountId: search.account ?? null, riotConfigured: !!process.env.RIOT_API_KEY }),
    championMap(db),
  ]);
  return <AllChampions data={overview} basePath={`${basePath}/champions`} championsById={championsById} />;
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
export async function ProfileMatchesTab({ db, header, session, basePath, search }: { db: Db; header: ProfileHeaderData; session: Session | null; basePath: string; search: MatchSearch }) {
  const player = header.player;
  const self = session?.playerId === player.id;
  if (!self && !hasPermission(session, "view-teammate-stats")) return <p className="rounded-xl border border-border bg-surface p-4 text-sm text-fg-muted">Teammates&apos; match histories are not part of your access.</p>;
  const [data, championsById] = await Promise.all([
    getMatchHistory(db, player.id, { season: Number(search.season) || null, mode: isSeasonMode(search.mode) ? search.mode : "all", role: search.role ?? null, scope: search.scope ?? null, championId: search.champion ?? null, accountId: search.account ?? null, page: Number(search.page) || 1, per: Number(search.per) || undefined }, self, (r) => (legalRolesFor(player).includes(r) ? poolFor(player, r) : [])),
    championMap(db),
  ]);
  return <MatchHistoryView data={data} championsById={championsById} basePath={`${basePath}/matches`} playerId={player.id} />;
}

/** Riot Accounts: linked accounts and their sync state; data diagnostics for data admins only. */
export async function ProfileAccountsTab({ db, header, session }: { db: Db; header: ProfileHeaderData; session: Session | null }) {
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
        <details className="group rounded-2xl border border-border bg-surface" data-testid="data-diagnostics">
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
