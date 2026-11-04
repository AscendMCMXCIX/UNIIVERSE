import type { Db } from "@/server/db/types";
import type { Session } from "@/server/auth/permissions";
import { canManageRiotAccounts, hasPermission } from "@/server/auth/permissions";
import { defaultPlatform } from "@/server/auth/signup";
import { type ProfileHeaderData } from "@/server/players/profile-header";
import { listAccountsForPlayer } from "@/server/accounts/repository";
import { getMatchSyncStatus } from "@/server/accounts/refresh";
import { dataStatus } from "@/domain/data-status";
import { describeAccountSync } from "@/domain/account-status";
import { getPlayerDataReport } from "@/server/proficiency/provenance";
import { RiotAccountsPanel } from "@/components/team/riot-accounts-panel";
import { PlayerDataPanel } from "@/components/team/player-data-panel";
import { ErrorBoundary } from "@/components/error-boundary";
import type { PortraitChampion } from "@/components/champion-portrait";
import { championMap, IdentitySync, refreshFor } from "./profile-sections";

/* The player profile's Riot Accounts tab (components/players/profile-sections.tsx has the frame shared by every tab). */

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
  const [accounts, sync, report, championsById] = await Promise.all([
    listAccountsForPlayer(db, player.id),
    getMatchSyncStatus(db, player.id),
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
      <RiotAccountsPanel
        playerId={player.id}
        accounts={accounts}
        riotConfigured={riotConfigured}
        defaultPlatform={defaultPlatform()}
        editable={canManageRiotAccounts(session, player.id)}
        title="Riot accounts"
        status={dataStatus({ accounts: accounts.map((a) => describeAccountSync({ syncStatus: a.syncStatus, syncError: a.syncError, lastSyncAt: a.lastSyncAt, puuid: a.puuid, resolveAttempts: a.resolveAttempts, history: a.historyBackfill, riotConfigured })), checkedAt: sync.checkedAt, attemptedAt: sync.attemptedAt, newestGameAt: sync.newestGameAt })}
        refresh={refreshFor(session, player.id, sync)}
      />
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
