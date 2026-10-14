import { cache } from "react";
import type { Db } from "@/server/db/types";
import type { Session } from "@/server/auth/permissions";
import { canEditPlayer, canManageRiotAccounts, hasPermission } from "@/server/auth/permissions";
import { defaultPlatform } from "@/server/auth/signup";
import { isSeasonMode } from "@/domain/season-stats";
import { legalRolesFor } from "@/domain/roster";
import { listChampions } from "@/server/repositories/champions";
import { profileVersion } from "@/server/repositories/team";
import { getPlayerOverview } from "@/server/players/overview";
import { loadProfileHeader, type ProfileHeaderData } from "@/server/players/profile-header";
import { loadPickerChampions } from "@/server/champions/picker";
import { listAccountsForPlayer } from "@/server/accounts/repository";
import { getPlayerDataReport } from "@/server/proficiency/provenance";
import { ChampionPools, SeasonSummary } from "@/components/players/player-overview";
import { ProfileHeader } from "@/components/players/profile-header";
import { ProfileTabs } from "@/components/players/profile-tabs";
import { ProfileEditor } from "@/components/profile/profile-editor";
import { RiotAccountsPanel } from "@/components/team/riot-accounts-panel";
import { PlayerDataPanel } from "@/components/team/player-data-panel";
import { ErrorBoundary } from "@/components/error-boundary";
import { CardStyleEditor } from "@/components/players/card-style-editor";
import { featurableChampions, featuredChampion, isCardAccent } from "@/domain/player-card";
import type { PortraitChampion } from "@/components/champion-portrait";

/*
  THE player profile, the same for My Profile (/overview) and every teammate (/players/[id]):
  an identity header and three tabs.

    Overview            season performance with filters, the champions behind it
    Champions & Roles   roles and champion pools (editable in place for the owner or an admin),
                        each champion with its statistics in that role
    Riot Accounts       linked accounts, Main and Alt, sync state

  Everyone sees the same layout; editing appears only for whoever may edit. Teammates' season
  statistics need the "view teammate statistics" permission. Solo Queue Blocks is not part of a
  profile: it has its own page.
*/

export interface ProfileSearch {
  season?: string;
  mode?: string;
  others?: string;
}

/** One header load per request, shared by the layout and the tab page. */
export const profileHeader = cache((db: Db, playerId: string) => loadProfileHeader(db, playerId));

export function ProfileFrame({ header, session, basePath, children }: { header: ProfileHeaderData; session: Session | null; basePath: string; children: React.ReactNode }) {
  const self = session?.playerId === header.player.id;
  return (
    <div className="mx-auto max-w-6xl space-y-5" data-testid="player-profile">
      <ProfileHeader data={header} self={self} />
      <ProfileTabs basePath={basePath} />
      {children}
    </div>
  );
}

const championMap = async (db: Db): Promise<Record<string, PortraitChampion>> => Object.fromEntries((await listChampions(db)).map((c) => [c.id, { id: c.id, name: c.name, portraitUrl: c.portraitUrl }]));

/** Overview: season performance first. */
export async function ProfileOverviewTab({ db, header, session, basePath, search }: { db: Db; header: ProfileHeaderData; session: Session | null; basePath: string; search: ProfileSearch }) {
  const player = header.player;
  const self = session?.playerId === player.id;
  const showStats = self || hasPermission(session, "view-teammate-stats");
  if (!showStats) return <p className="rounded-xl border border-border bg-surface p-4 text-sm text-fg-muted">Season statistics of teammates are not part of your access. Their champions and roles are under Champions & Roles.</p>;
  const overview = await getPlayerOverview(db, player, { season: Number(search.season) || null, mode: isSeasonMode(search.mode) ? search.mode : "all", riotConfigured: !!process.env.RIOT_API_KEY, includeOthers: search.others === "1" });
  return <SeasonSummary data={overview} basePath={basePath} />;
}

/** Champions & Roles: pools by role with each champion's statistics; editing for the owner or an admin. */
export async function ProfileChampionsTab({ db, header, session, basePath, search }: { db: Db; header: ProfileHeaderData; session: Session | null; basePath: string; search: ProfileSearch }) {
  const player = header.player;
  const self = session?.playerId === player.id;
  const editable = canEditPlayer(session, player.id);
  const showStats = self || hasPermission(session, "view-teammate-stats");
  const [championsById, picker, overview] = await Promise.all([
    championMap(db),
    editable ? loadPickerChampions(db) : Promise.resolve([]),
    getPlayerOverview(db, player, { season: Number(search.season) || null, mode: isSeasonMode(search.mode) ? search.mode : "all", riotConfigured: !!process.env.RIOT_API_KEY, includeOthers: search.others === "1" }),
  ]);
  const editor = editable ? (
    <ProfileEditor
      playerId={player.id}
      initial={{ primaryRole: player.primaryRole, secondaryRole: player.secondaryRole, primaryPool: player.primaryPool, secondaryPool: player.secondaryPool, additionalRoles: player.additionalRoles }}
      version={profileVersion(player)}
      champions={picker.length ? picker : Object.values(championsById)}
      editable
    />
  ) : null;
  return (
    <div className="space-y-5">
      <ChampionPools data={overview} roles={legalRolesFor(player)} championsById={championsById} basePath={`${basePath}/champions`} showStats={showStats} editor={editor} selfView={self} name={player.displayName} />
      {editable ? (
        <details className="group rounded-2xl border border-border bg-surface" data-testid="card-style-panel">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 px-4 text-sm font-medium text-fg hover:text-accent">
            Team card style
            <span className="text-xs font-normal text-fg-subtle">Featured champion and accent</span>
          </summary>
          <div className="border-t border-border p-4">
            <CardStyleEditor playerId={player.id} champions={featurableChampions(player).map((id) => championsById[id] ?? { id, name: id, portraitUrl: "" })} featured={featuredChampion(player)} accent={isCardAccent(player.cardAccent) ? player.cardAccent : "default"} />
          </div>
        </details>
      ) : null}
    </div>
  );
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
