import Link from "next/link";
import { ROLES, type Role } from "@/domain/roles";
import { getAppDb } from "@/server/bootstrap";
import { hasPermission } from "@/server/auth/session";
import { requirePageAccess } from "@/server/auth/page-access";
import { switchViewAction } from "@/server/actions/view-mode";
import { listChampions } from "@/server/repositories/champions";
import { getCurrentLineup, getOrCreateTeam, listPlayers } from "@/server/repositories/team";
import { accountStatesForPlayers } from "@/server/proficiency/provenance";
import { PlayerSummaryCard } from "@/components/players/player-summary-card";
import { Button } from "@/components/ui/button";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";

export const dynamic = "force-dynamic";

/** PLAYERS: everyone in UNIIVERSE, Main and Other, each linking to a profile. Administration (accounts, password resets, archiving) lives in Admin Mode. */
export default async function PlayersPage({ searchParams }: { searchParams: Promise<{ archived?: string }> }) {
  const { archived } = await searchParams;
  const db = await getAppDb();
  const [team, session, champions] = await Promise.all([getOrCreateTeam(db), requirePageAccess("view-players"), listChampions(db)]);
  const admin = hasPermission(session, "manage-players");
  const showArchived = admin && archived === "1";
  const [players, lineup] = await Promise.all([listPlayers(db, team.id, { includeArchived: showArchived }), getCurrentLineup(db, team.id)]);
  const riot = await accountStatesForPlayers(db, players.map((p) => p.id), !!process.env.RIOT_API_KEY);
  const championsById = Object.fromEntries(champions.map((c) => [c.id, { id: c.id, name: c.name, portraitUrl: c.portraitUrl }]));
  const lineupRoleOf = (playerId: string): Role | null => ROLES.find((r) => lineup.slots[r] === playerId) ?? null;
  const groups = [
    { key: "main", title: "MAIN PLAYERS", subtitle: "The roster UNIIVERSE drafts for. The Team page shows which five hold the lineup right now.", empty: "No main players yet.", rows: players.filter((p) => p.group === "main") },
    { key: "other", title: "OTHER PLAYERS", subtitle: "Substitutes, stand-ins and friends. They join the lineup through the substitution option on the Team page.", empty: "No other players.", rows: players.filter((p) => p.group === "other") },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold">Players</h1>
          <p className="text-sm text-fg-muted">Everyone in UNIIVERSE. Open a profile for roles, champion pools, Riot accounts and ranked results.</p>
        </div>
        {admin ? (
          <div className="flex flex-wrap items-center gap-2">
            <Link href={showArchived ? "/players" : "/players?archived=1"}>
              <Button variant="ghost">{showArchived ? "Hide archived" : "Show archived"}</Button>
            </Link>
            <form action={switchViewAction}>
              <input type="hidden" name="mode" value="admin" />
              <Button type="submit" variant="outline" title="Add player accounts, password resets, Main/Other status and archiving are in Admin Mode">
                Manage players &amp; accounts →
              </Button>
            </form>
          </div>
        ) : null}
      </div>
      {groups.map((g) => (
        <Panel key={g.key} data-testid={`players-${g.key}`}>
          <PanelHeader title={g.title} subtitle={g.subtitle} actions={<span className="text-xs text-fg-subtle">{g.rows.length === 1 ? "1 player" : `${g.rows.length} players`}</span>} />
          <PanelBody className="grid gap-3 md:grid-cols-2">
            {g.rows.length === 0 ? <p className="text-sm text-fg-muted">{g.empty}</p> : null}
            {g.rows.map((p) => (
              <PlayerSummaryCard key={p.id} player={p} championsById={championsById} lineupRole={lineupRoleOf(p.id)} isYou={session?.playerId === p.id} riot={riot[p.id] ?? null} />
            ))}
          </PanelBody>
        </Panel>
      ))}
    </div>
  );
}
