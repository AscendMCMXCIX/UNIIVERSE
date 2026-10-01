import Link from "next/link";
import { Plus } from "lucide-react";
import { ROLES, type Role } from "@/domain/roles";
import { getAppDb } from "@/server/bootstrap";
import { getSession, hasPermission } from "@/server/auth/session";
import { listChampions } from "@/server/repositories/champions";
import { getCurrentLineup, getOrCreateTeam, listPlayers } from "@/server/repositories/team";
import { PlayerCard } from "@/components/team/player-card";
import { Button } from "@/components/ui/button";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";

export const dynamic = "force-dynamic";

export default async function PlayersPage({ searchParams }: { searchParams: Promise<{ archived?: string }> }) {
  const { archived } = await searchParams;
  const db = await getAppDb();
  const [team, session, champions] = await Promise.all([getOrCreateTeam(db), getSession(), listChampions(db)]);
  const [players, lineup] = await Promise.all([listPlayers(db, team.id, { includeArchived: true }), getCurrentLineup(db, team.id)]);
  const championsById = Object.fromEntries(champions.map((c) => [c.id, { id: c.id, name: c.name, portraitUrl: c.portraitUrl }]));
  const showArchived = archived === "1";
  const visible = players.filter((p) => (showArchived ? true : !p.archivedAt));
  const activeRoleOf = (playerId: string): Role | null => ROLES.find((r) => lineup.slots[r] === playerId) ?? null;
  const editable = hasPermission(session, "manage-players");

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-bold">Players</h1>
          <p className="text-sm text-fg-muted">Every saved profile, whether or not they are in the active lineup.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={showArchived ? "/players" : "/players?archived=1"}>
            <Button variant="ghost">{showArchived ? "Hide archived" : "Show archived"}</Button>
          </Link>
          {editable ? (
            <Link href="/players/new">
              <Button variant="primary">
                <Plus className="h-4 w-4" /> New player
              </Button>
            </Link>
          ) : null}
        </div>
      </div>
      <Panel>
        <PanelHeader title="ALL PLAYERS" subtitle={`${visible.length} shown`} />
        <PanelBody className="grid gap-3 md:grid-cols-2">
          {visible.length === 0 ? <p className="text-sm text-fg-muted">No players yet. Add your first player.</p> : null}
          {visible.map((p) => (
            <PlayerCard key={p.id} player={p} championsById={championsById} activeRole={activeRoleOf(p.id)} canEdit={editable} />
          ))}
        </PanelBody>
      </Panel>
    </div>
  );
}
