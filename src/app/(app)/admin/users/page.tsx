import { getAppDb } from "@/server/bootstrap";
import { getSession } from "@/server/auth/session";
import { listUsers } from "@/server/repositories/users";
import { getOrCreateTeam, listPlayers } from "@/server/repositories/team";
import { UsersPanel } from "@/components/admin/users-panel";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const db = await getAppDb();
  const [session, team, users] = await Promise.all([getSession(), getOrCreateTeam(db), listUsers(db)]);
  const players = await listPlayers(db, team.id, { includeArchived: true });
  return (
    <UsersPanel
      users={users.map((u) => ({ id: u.id, username: u.username, displayName: u.displayName, role: u.role, draftLead: u.draftLead, playerId: u.playerId, playerName: u.playerName, hasPassword: u.hasPassword, isActive: u.isActive, setupComplete: u.setupCompletedAt !== null, lastLoginAt: u.lastLoginAt?.toISOString() ?? null }))}
      players={players.filter((p) => !p.archivedAt).map((p) => ({ id: p.id, displayName: p.displayName, claimed: users.some((u) => u.playerId === p.id) }))}
      currentUserId={session?.userId ?? null}
    />
  );
}
