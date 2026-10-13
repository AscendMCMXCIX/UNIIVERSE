import Link from "next/link";
import { getAppDb } from "@/server/bootstrap";
import { getSession } from "@/server/auth/session";
import { isGameMode, parsePatchWindow } from "@/domain/player-stats";
import { listChampions } from "@/server/repositories/champions";
import { getPlayer } from "@/server/repositories/team";
import { getPlayerOverview } from "@/server/players/overview";
import { PlayerOverview } from "@/components/players/player-overview";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";

export const dynamic = "force-dynamic";

/** PLAYER OVERVIEW: the signed-in player's own quick reference and champion pool statistics. */
export default async function OverviewPage({ searchParams }: { searchParams: Promise<{ mode?: string; window?: string; others?: string }> }) {
  const sp = await searchParams;
  const session = await getSession();
  const db = await getAppDb();
  const player = session?.playerId ? await getPlayer(db, session.playerId) : null;
  if (!player) {
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <div>
          <h1 className="text-xl font-bold">Player Overview</h1>
          <p className="text-sm text-fg-muted">Your roles, rank, recent ranked results and champion pool statistics.</p>
        </div>
        <Panel>
          <PanelHeader title="NO PLAYER PROFILE YET" subtitle="The overview belongs to a player profile." />
          <PanelBody className="text-sm text-fg">
            Complete yours under{" "}
            <Link href="/me" className="text-accent hover:underline">
              My profile
            </Link>
            , then come back here.
          </PanelBody>
        </Panel>
      </div>
    );
  }
  const champions = await listChampions(db);
  const overview = await getPlayerOverview(db, player, { mode: isGameMode(sp.mode) ? sp.mode : "ranked", window: parsePatchWindow(sp.window), riotConfigured: !!process.env.RIOT_API_KEY, includeOthers: sp.others === "1" });
  const championsById = Object.fromEntries(champions.map((c) => [c.id, { id: c.id, name: c.name, portraitUrl: c.portraitUrl }]));
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold">Player Overview</h1>
          <p className="text-sm text-fg-muted">Your roles, rank, recent ranked results and champion pool statistics, from your linked Riot accounts.</p>
        </div>
        <Link href={`/players/${player.id}`} className="text-sm text-accent hover:underline">
          Full profile →
        </Link>
      </div>
      <PlayerOverview data={overview} player={player} championsById={championsById} basePath="/overview" selfView editHref={`/players/${player.id}/edit#pools`} />
      <Panel>
        <PanelHeader title="SOLO QUEUE BLOCKS" subtitle="Optional: a private improvement journal in blocks of Solo/Duo games, with your own notes and focus." />
        <PanelBody>
          <Link href="/overview/blocks" className="text-sm text-accent hover:underline">
            Open Solo Queue Blocks →
          </Link>
        </PanelBody>
      </Panel>
    </div>
  );
}
