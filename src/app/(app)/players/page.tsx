import Link from "next/link";
import { ROLES, type Role } from "@/domain/roles";
import { getAppDb } from "@/server/bootstrap";
import { hasPermission } from "@/server/auth/session";
import { requirePageAccess } from "@/server/auth/page-access";
import { listChampions } from "@/server/repositories/champions";
import { getCurrentLineup, getOrCreateTeam, listPlayers } from "@/server/repositories/team";
import { accountStatesForPlayers } from "@/server/proficiency/provenance";
import { listAccountsForPlayers } from "@/server/accounts/repository";
import { avatarUrlsByPlayer } from "@/server/repositories/profile";
import { rankView } from "@/server/players/overview";
import { PlayersDirectory } from "@/components/players/players-directory";
import { and, eq, isNotNull } from "drizzle-orm";
import { users } from "@/server/db/schema";
import { buttonClass } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";

export const dynamic = "force-dynamic";

/** PLAYERS: one directory of everyone active in UNIIVERSE, lineup first. Account administration lives in Admin. */
export default async function PlayersPage({ searchParams }: { searchParams: Promise<{ archived?: string }> }) {
  const { archived } = await searchParams;
  const db = await getAppDb();
  const [team, session, champions] = await Promise.all([getOrCreateTeam(db), requirePageAccess("view-players"), listChampions(db)]);
  const admin = hasPermission(session, "manage-players");
  const showArchived = admin && archived === "1";
  const [players, lineup, avatars] = await Promise.all([listPlayers(db, team.id, { includeArchived: showArchived }), getCurrentLineup(db, team.id), avatarUrlsByPlayer(db)]);
  const [riot, accounts] = await Promise.all([accountStatesForPlayers(db, players.map((p) => p.id), !!process.env.RIOT_API_KEY), listAccountsForPlayers(db, players.map((p) => p.id))]);
  const championsById = Object.fromEntries(champions.map((c) => [c.id, { id: c.id, name: c.name, portraitUrl: c.portraitUrl }]));
  const lineupRoleOf = (playerId: string): Role | null => ROLES.find((r) => lineup.slots[r] === playerId) ?? null;
  const rankOf = (playerId: string): string | null => {
    const mine = accounts.filter((a) => a.playerId === playerId);
    const ranked = (mine.find((a) => a.label === "main" && a.tier) ?? mine.find((a) => a.tier)) ?? null;
    const r = ranked ? rankView(ranked) : null;
    return r ? r.text.split(" · ").slice(0, 2).join(" · ") : null;
  };
  // Deactivated accounts are hidden like archived players (an admin sees them under "Show archived").
  const deactivated = new Set((await db.select({ playerId: users.playerId }).from(users).where(and(eq(users.isActive, false), isNotNull(users.playerId)))).map((u) => u.playerId));
  // Lineup players first in role order, then everyone else alphabetically.
  const ordered = [...players].sort((a, b) => {
    const ra = lineupRoleOf(a.id);
    const rb = lineupRoleOf(b.id);
    if (ra && rb) return ROLES.indexOf(ra) - ROLES.indexOf(rb);
    if (ra || rb) return ra ? -1 : 1;
    return a.displayName.localeCompare(b.displayName);
  });
  // Your own profile is managed at My Profile: teammates only here (an admin managing players sees everyone).
  const visible = (showArchived ? ordered : ordered.filter((p) => !deactivated.has(p.id))).filter((p) => admin || p.id !== session.playerId);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Players"
        description="Everyone in UNIIVERSE. Search by name or Riot ID, filter by role, and open a profile for pools, Riot accounts and season statistics."
        actions={
          admin ? (
            <Link href={showArchived ? "/players" : "/players?archived=1"} className={buttonClass("ghost")}>
              {showArchived ? "Hide archived and deactivated" : "Show archived and deactivated"}
            </Link>
          ) : null
        }
      />
      {session.playerId && !admin ? (
        <p className="text-sm text-fg-muted">
          Looking for yourself?{" "}
          <Link href="/overview" className="text-accent hover:underline">
            Open My Profile →
          </Link>
        </p>
      ) : null}
      <PlayersDirectory
        championsById={championsById}
        entries={visible.map((p) => ({ player: p, lineupRole: lineupRoleOf(p.id), isYou: session.playerId === p.id, riot: riot[p.id] ?? null, avatarUrl: avatars[p.id] ?? null, rank: rankOf(p.id), riotIds: accounts.filter((a) => a.playerId === p.id).map((a) => a.riotId) }))}
      />
    </div>
  );
}
