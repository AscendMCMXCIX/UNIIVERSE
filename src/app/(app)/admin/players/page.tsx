import { ROLES, type Role } from "@/domain/roles";
import { getAppDb } from "@/server/bootstrap";
import { describeAccess } from "@/server/auth/session";
import { getCurrentLineup, getOrCreateTeam, listPlayers } from "@/server/repositories/team";
import { listInvites, listUsers } from "@/server/repositories/users";
import { accountStatesForPlayers } from "@/server/proficiency/provenance";
import { AddPlayerAccount } from "@/components/admin/add-player-account";
import { PlayersAdminPanel, type OpenInviteRow, type PlayerAdminRow } from "@/components/admin/players-admin-panel";

export const dynamic = "force-dynamic";

export default async function AdminPlayersPage() {
  const db = await getAppDb();
  const team = await getOrCreateTeam(db);
  const [players, lineup, users, invites] = await Promise.all([listPlayers(db, team.id, { includeArchived: true }), getCurrentLineup(db, team.id), listUsers(db), listInvites(db)]);
  const riot = await accountStatesForPlayers(db, players.map((p) => p.id), !!process.env.RIOT_API_KEY);
  const userByPlayer = new Map(users.filter((u) => u.playerId).map((u) => [u.playerId!, u]));
  const inviteByUser = new Map(invites.filter((i) => i.userId).map((i) => [i.userId!, i]));
  const rows: PlayerAdminRow[] = players.map((p) => {
    const u = userByPlayer.get(p.id);
    const inv = u ? inviteByUser.get(u.id) : null;
    return {
      id: p.id,
      displayName: p.displayName,
      riotId: p.riotId,
      primaryRole: p.primaryRole,
      secondaryRole: p.secondaryRole,
      group: p.group,
      archived: !!p.archivedAt,
      lineupRole: (ROLES.find((r) => lineup.slots[r] === p.id) as Role | undefined) ?? null,
      account: !u ? { state: "none" } : !u.setupCompletedAt ? { state: "pending", userId: u.id, username: u.username, inviteToken: inv?.token ?? null, inviteExpiresAt: inv?.expiresAt.toISOString() ?? null } : { state: "active", userId: u.id, username: u.username, access: describeAccess(u) },
      riot: riot[p.id] ?? { state: "none", label: "no account linked" },
    };
  });
  const openInvites: OpenInviteRow[] = invites.map((i) => ({ id: i.id, token: i.token, username: i.username, playerName: i.playerName, role: i.role, expiresAt: i.expiresAt.toISOString() }));
  return (
    <div className="space-y-5">
      <AddPlayerAccount />
      <PlayersAdminPanel players={rows} invites={openInvites} />
    </div>
  );
}
