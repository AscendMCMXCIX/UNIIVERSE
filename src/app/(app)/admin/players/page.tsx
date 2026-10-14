import { ROLES, type Role } from "@/domain/roles";
import { requirePageAccess } from "@/server/auth/page-access";
import { getAppDb } from "@/server/bootstrap";
import { getSession, hasPermission } from "@/server/auth/session";
import { listAccountViews } from "@/server/auth/account-admin";
import { getCurrentLineup, getOrCreateTeam, listPlayers } from "@/server/repositories/team";
import { accountStatesForPlayers } from "@/server/proficiency/provenance";
import { AddPlayerAccount } from "@/components/admin/add-player-account";
import { PlayersAdminPanel, type PlayerAdminRow } from "@/components/admin/players-admin-panel";

export const dynamic = "force-dynamic";

export default async function AdminPlayersPage() {
  await requirePageAccess("manage-users", "manage-players", "manage-lineup");
  const db = await getAppDb();
  const team = await getOrCreateTeam(db);
  const [session, players, lineup, accounts] = await Promise.all([getSession(), listPlayers(db, team.id, { includeArchived: true }), getCurrentLineup(db, team.id), listAccountViews(db)]);
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
      {hasPermission(session, "manage-users") ? <AddPlayerAccount /> : null}
      <PlayersAdminPanel players={rows} currentUserId={session?.userId ?? null} canManageAccounts={hasPermission(session, "manage-users")} canManageRoster={hasPermission(session, "manage-players")} />
    </div>
  );
}
