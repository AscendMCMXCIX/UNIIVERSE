import { ROLES, type Role } from "@/domain/roles";
import { requirePageAccess } from "@/server/auth/page-access";
import { getAppDb } from "@/server/bootstrap";
import { hasPermission } from "@/server/auth/session";
import { listAccountViews } from "@/server/auth/account-admin";
import { getCurrentLineup, getOrCreateTeam, listPlayers } from "@/server/repositories/team";
import { listPermissionPresets } from "@/server/repositories/permissions";
import { accountStatesForPlayers } from "@/server/proficiency/provenance";
import { AddPlayerAccount } from "@/components/admin/add-player-account";
import { PeoplePanel, type PlayerAdminRow } from "@/components/admin/people-panel";

export const dynamic = "force-dynamic";

/** People & Access → Accounts: find a person, see their account, Riot and access state, and act on it. */
export default async function AdminPeoplePage() {
  const session = await requirePageAccess("manage-users", "manage-players");
  const db = await getAppDb();
  const team = await getOrCreateTeam(db);
  const canManageAccounts = hasPermission(session, "manage-users");
  const [players, lineup, accounts, presets] = await Promise.all([listPlayers(db, team.id, { includeArchived: true, includeSetupPending: true }), getCurrentLineup(db, team.id), listAccountViews(db), canManageAccounts ? listPermissionPresets(db) : Promise.resolve([])]);
  const riot = await accountStatesForPlayers(db, players.map((p) => p.id), !!process.env.RIOT_API_KEY);
  const accountByPlayer = new Map(accounts.filter((a) => a.playerId).map((a) => [a.playerId!, a]));
  const rows: PlayerAdminRow[] = players.map((p) => ({
    id: p.id,
    displayName: p.displayName,
    riotId: p.riotId,
    primaryRole: p.primaryRole,
    secondaryRole: p.secondaryRole,
    group: p.group,
    archived: !!p.archivedAt,
    lineupRole: (ROLES.find((r) => lineup.slots[r] === p.id) as Role | undefined) ?? null,
    account: accountByPlayer.get(p.id) ?? null,
    riot: riot[p.id] ?? { state: "none", label: "no account linked" },
  }));
  return (
    <div className="space-y-5">
      {canManageAccounts ? <AddPlayerAccount /> : null}
      <PeoplePanel players={rows} adminAccounts={accounts.filter((a) => !a.playerId)} presets={presets} currentUserId={session.userId} canManageAccounts={canManageAccounts} canManageRoster={hasPermission(session, "manage-players")} />
    </div>
  );
}
