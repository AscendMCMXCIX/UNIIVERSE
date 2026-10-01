import Link from "next/link";
import { Plus } from "lucide-react";
import { ROLES, type Role } from "@/domain/roles";
import { getAppDb } from "@/server/bootstrap";
import { getSession, hasPermission } from "@/server/auth/session";
import { listChampions } from "@/server/repositories/champions";
import { getCurrentLineup, getOrCreateTeam, listPlayers } from "@/server/repositories/team";
import { LineupBoard } from "@/components/team/lineup-board";
import { PlayerCard } from "@/components/team/player-card";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const db = await getAppDb();
  const [team, session, champions] = await Promise.all([getOrCreateTeam(db), getSession(), listChampions(db)]);
  const [players, lineup] = await Promise.all([listPlayers(db, team.id), getCurrentLineup(db, team.id)]);
  const championsById = Object.fromEntries(champions.map((c) => [c.id, { id: c.id, name: c.name, portraitUrl: c.portraitUrl }]));
  const editable = hasPermission(session, "manage-players");
  const activeRoleOf = (playerId: string): Role | null => ROLES.find((r) => lineup.slots[r] === playerId) ?? null;
  const main = players.filter((p) => p.group === "main");
  const other = players.filter((p) => p.group === "other");

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-bold">Team Setup</h1>
          <p className="text-sm text-fg-muted">Choose the five active players. Only they influence live recommendations.</p>
        </div>
        {editable ? (
          <Link href="/players/new">
            <Button variant="primary">
              <Plus className="h-4 w-4" /> New player
            </Button>
          </Link>
        ) : null}
      </div>

      <Panel>
        <PanelHeader title="ACTIVE LINEUP" subtitle="Starting assignment. UNIIVERSE may recommend legal role swaps during the draft." />
        <PanelBody>
          <LineupBoard players={players} slots={lineup.slots} championsById={championsById} canEdit={editable} />
        </PanelBody>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="MAIN PLAYERS" subtitle={`${main.length} regular members`} />
          <PanelBody className="grid gap-3">
            {main.length === 0 ? <p className="text-sm text-fg-muted">No main players yet.</p> : null}
            {main.map((p) => (
              <PlayerCard key={p.id} player={p} championsById={championsById} activeRole={activeRoleOf(p.id)} canEdit={editable} compact />
            ))}
          </PanelBody>
        </Panel>
        <Panel>
          <PanelHeader title="OTHER PLAYERS" subtitle={`${other.length} subs, stand-ins and friends`} />
          <PanelBody className="grid gap-3">
            {other.length === 0 ? <p className="text-sm text-fg-muted">No other players saved.</p> : null}
            {other.map((p) => (
              <PlayerCard key={p.id} player={p} championsById={championsById} activeRole={activeRoleOf(p.id)} canEdit={editable} compact />
            ))}
          </PanelBody>
        </Panel>
      </div>
    </div>
  );
}
