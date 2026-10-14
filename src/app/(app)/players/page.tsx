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
import { PlayerSummaryCard } from "@/components/players/player-summary-card";
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
  // Lineup players first in role order, then everyone else alphabetically.
  const ordered = [...players].sort((a, b) => {
    const ra = lineupRoleOf(a.id);
    const rb = lineupRoleOf(b.id);
    if (ra && rb) return ROLES.indexOf(ra) - ROLES.indexOf(rb);
    if (ra || rb) return ra ? -1 : 1;
    return a.displayName.localeCompare(b.displayName);
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Players"
        description={`Everyone in UNIIVERSE (${players.length}). Open a profile for roles, champion pools, Riot accounts and season statistics.`}
        actions={
          admin ? (
            <Link href={showArchived ? "/players" : "/players?archived=1"} className={buttonClass("ghost")}>
              {showArchived ? "Hide archived" : "Show archived"}
            </Link>
          ) : null
        }
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="players-directory">
        {ordered.length === 0 ? <p className="text-sm text-fg-muted">No players yet.</p> : null}
        {ordered.map((p) => (
          <PlayerSummaryCard key={p.id} player={p} championsById={championsById} lineupRole={lineupRoleOf(p.id)} isYou={session.playerId === p.id} riot={riot[p.id] ?? null} avatarUrl={avatars[p.id] ?? null} rank={rankOf(p.id)} />
        ))}
      </div>
    </div>
  );
}
