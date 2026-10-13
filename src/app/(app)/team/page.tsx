import { getAppDb } from "@/server/bootstrap";
import { canEditPlayer, getSession, hasPermission } from "@/server/auth/session";
import { listChampions } from "@/server/repositories/champions";
import { getOrCreateTeam, listLineupPresets } from "@/server/repositories/team";
import { candidatesFor, getTeamOverview } from "@/server/team/overview";
import { LineupOverview, type LineupRowView } from "@/components/team/lineup-overview";
import { LineupPresets } from "@/components/team/lineup-presets";
import { MobileSection } from "@/components/ui/mobile-section";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";

export const dynamic = "force-dynamic";

/** TEAM: our current main lineup. Roster administration lives under Players; settings under Admin. */
export default async function TeamPage() {
  const db = await getAppDb();
  const [team, session, champions] = await Promise.all([getOrCreateTeam(db), getSession(), listChampions(db)]);
  const canManageLineup = hasPermission(session, "manage-lineup");
  const [overview, presets] = await Promise.all([getTeamOverview(db, team.id), canManageLineup ? listLineupPresets(db, team.id) : Promise.resolve(null)]);
  const championsById = new Map(champions.map((c) => [c.id, c]));
  const rows: LineupRowView[] = overview.rows.map((r) => ({
    role: r.role,
    player: r.player ? { id: r.player.id, displayName: r.player.displayName } : null,
    profileRole: r.profileRole,
    substitute: r.substitute,
    pool: r.pool.map((c) => ({ championId: c.championId, name: championsById.get(c.championId)?.name ?? c.championId, portraitUrl: championsById.get(c.championId)?.portraitUrl ?? "", recentGames: c.recent.games, recentWinRate: c.recent.winRate, tier: c.tier, tierLabel: c.tierLabel })),
    candidates: candidatesFor(r.role, overview, true).map((p) => ({ id: p.id, displayName: p.displayName, group: p.group, fit: p.primaryRole === r.role ? ("primary" as const) : ("secondary" as const) })),
  }));
  const editablePlayerIds = overview.rows.map((r) => r.player?.id).filter((id): id is string => !!id && canEditPlayer(session, id));
  const playerNames = Object.fromEntries([...overview.main, ...overview.other].map((p) => [p.id, p.displayName]));
  const presetView = (p: NonNullable<typeof presets>["saved"][number]) => ({ id: p.id, name: p.name, slots: p.slots, lastUsedAt: p.lastUsedAt?.toISOString() ?? null });

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <h1 className="text-xl font-bold">Team</h1>
        <p className="text-sm text-fg-muted">Our current main lineup: who plays each role and what they bring to it. Everyone in UNIIVERSE is under Players.</p>
      </div>
      <Panel>
        <PanelHeader title="CURRENT LINEUP" subtitle="The five players UNIIVERSE drafts for. Only Main players are offered here; substitutes come through the substitution option." />
        <PanelBody>
          <LineupOverview rows={rows} complete={overview.complete} canManageLineup={canManageLineup} editablePlayerIds={editablePlayerIds} viewerPlayerId={session?.playerId ?? null} />
        </PanelBody>
      </Panel>
      {presets ? (
        <MobileSection title="Saved lineups" openFrom="xl">
          <LineupPresets saved={presets.saved.map(presetView)} recent={presets.recent.map(presetView)} playerNames={playerNames} canEdit currentComplete={overview.complete} />
        </MobileSection>
      ) : null}
    </div>
  );
}
