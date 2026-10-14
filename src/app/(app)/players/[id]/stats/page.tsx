import { notFound } from "next/navigation";
import { getAppDb } from "@/server/bootstrap";
import { getSession, hasPermission } from "@/server/auth/session";
import { requirePageAccess } from "@/server/auth/page-access";
import { isSeasonMode } from "@/domain/season-stats";
import { listChampions } from "@/server/repositories/champions";
import { getPlayer } from "@/server/repositories/team";
import { getPlayerOverview } from "@/server/players/overview";
import { getPlayerDataReport } from "@/server/proficiency/provenance";
import { PlayerOverview } from "@/components/players/player-overview";
import { PlayerDataPanel } from "@/components/team/player-data-panel";
import { ErrorBoundary } from "@/components/error-boundary";
import type { PortraitChampion } from "@/components/champion-portrait";

export const dynamic = "force-dynamic";

/** Season statistics tab: the same view as My Overview, plus the proficiency detail on demand. */
export default async function PlayerStatsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ season?: string; mode?: string; others?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const session = await getSession();
  const self = session?.playerId === id;
  if (!self) await requirePageAccess("view-teammate-stats");
  const db = await getAppDb();
  const [player, champions] = await Promise.all([getPlayer(db, id), listChampions(db)]);
  if (!player) notFound();
  const riotConfigured = !!process.env.RIOT_API_KEY;
  const [overview, report] = await Promise.all([
    getPlayerOverview(db, player, { season: Number(sp.season) || null, mode: isSeasonMode(sp.mode) ? sp.mode : "all", riotConfigured, includeOthers: sp.others === "1" }),
    getPlayerDataReport(db, player, { riotConfigured }).catch((err: Error) => {
      console.error(JSON.stringify({ level: "error", event: "player.report.failed", error: err.message }));
      return null;
    }),
  ]);
  const championsById: Record<string, PortraitChampion> = Object.fromEntries(champions.map((c) => [c.id, { id: c.id, name: c.name, portraitUrl: c.portraitUrl }]));
  return (
    <div className="space-y-5">
      <PlayerOverview data={overview} player={player} championsById={championsById} basePath={`/players/${player.id}/stats`} selfView={self} editHref={null} />
      {report ? (
        <details className="group rounded-xl border border-border bg-surface">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 px-4 py-2 text-sm font-medium text-fg-muted hover:text-fg">
            How proficiency is measured (every champion)
            <span className="text-xs font-normal text-fg-subtle group-open:hidden">Show</span>
            <span className="hidden text-xs font-normal text-fg-subtle group-open:inline">Hide</span>
          </summary>
          <div className="border-t border-border p-3">
            <ErrorBoundary label="Riot data">
              <PlayerDataPanel report={report} championsById={championsById} admin={hasPermission(session, "manage-data")} playerName={player.displayName} selfView={self} showAccounts={false} />
            </ErrorBoundary>
          </div>
        </details>
      ) : null}
    </div>
  );
}
