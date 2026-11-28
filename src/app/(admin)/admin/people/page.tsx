import { ROLES, type Role } from "@/domain/roles";
import { requirePageAccess } from "@/server/auth/page-access";
import { getAppDb } from "@/server/bootstrap";
import { hasPermission } from "@/server/auth/session";
import { isOwner } from "@/server/auth/permissions";
import { listAccountViews } from "@/server/auth/account-admin";
import { getCurrentLineup, getOrCreateTeam, listProfilesForAdmin } from "@/server/repositories/team";
import { listPermissionPresets } from "@/server/repositories/permissions";
import { accountStatesForPlayers } from "@/server/proficiency/provenance";
import { AddPlayerAccount } from "@/components/admin/add-player-account";
import { PeoplePanel, type PlayerAdminRow } from "@/components/admin/people-panel";
import { accountForBrowser, listAccountsForPlayers } from "@/server/accounts/repository";
import { loadSocialLinks } from "@/server/repositories/profile";
import { visibleSocialLinks } from "@/domain/social-links";
import { WS_COLUMN } from "@/components/ui/workspace-classes";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

/**
 * Users & Permissions → Accounts: every account and profile, whatever its state (awaiting first login,
 * setup incomplete, deactivated, personal use, archived): the list is built from the stored rows,
 * not from the player directory, which only holds set-up team members.
 */
export default async function AdminPeoplePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePageAccess("manage-users");
  const db = await getAppDb();
  const team = await getOrCreateTeam(db);
  const canManageAccounts = hasPermission(session, "manage-users");
  const [players, lineup, accounts, presets] = await Promise.all([listProfilesForAdmin(db, team.id), getCurrentLineup(db, team.id), listAccountViews(db), canManageAccounts ? listPermissionPresets(db) : Promise.resolve([])]);
  const ids = players.map((p) => p.id);
  const [riot, riotAccounts, links] = await Promise.all([accountStatesForPlayers(db, ids, !!process.env.RIOT_API_KEY), listAccountsForPlayers(db, ids), loadSocialLinks(db, ids)]);
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;
  const accountByPlayer = new Map(accounts.filter((a) => a.playerId).map((a) => [a.playerId!, a]));
  const rows: PlayerAdminRow[] = players.map((p) => ({
    id: p.id,
    displayName: p.displayName,
    riotId: p.riotId,
    primaryRole: p.primaryRole,
    secondaryRole: p.secondaryRole,
    group: p.group,
    teamMember: p.teamMember,
    archived: p.archived,
    lineupRole: (ROLES.find((r) => lineup.slots[r] === p.id) as Role | undefined) ?? null,
    account: accountByPlayer.get(p.id) ?? null,
    riot: riot[p.id] ?? { state: "none", label: "no account linked" },
    // Never the PUUID: it stays on the server (docs/RIOT_COMPLIANCE.md); the panel only needs to know one is known.
    riotAccounts: riotAccounts.filter((r) => r.playerId === p.id).map(accountForBrowser),
    // Only what they show publicly: a link they keep to themselves is theirs alone, even here.
    publicLinks: visibleSocialLinks(links.get(p.id)).map((l) => ({ kind: l.kind, label: l.label, text: l.text })),
  }));
  return (
    // A flex column on a desktop window (WS_COLUMN): the list's card reaches the frame's foot, its pager there. No stack margin
    // there: the erasure result's window after the section (closed, drawn nowhere) would leave the section 20px short of the foot.
    <div className={cn("space-y-5 ws-host:space-y-0", WS_COLUMN)}>
      <PeoplePanel addAccount={canManageAccounts ? <AddPlayerAccount /> : null} initial={{ person: one(sp.person), status: one(sp.status), q: one(sp.q) }} riotConfigured={!!process.env.RIOT_API_KEY} players={rows} adminAccounts={accounts.filter((a) => !a.playerId)} presets={presets} currentUserId={session.userId} viewerIsOwner={isOwner(session)} canManageAccounts={canManageAccounts} canManageRoster={hasPermission(session, "manage-players")} />
    </div>
  );
}
