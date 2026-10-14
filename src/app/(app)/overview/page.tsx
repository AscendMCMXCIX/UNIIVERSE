import Link from "next/link";
import { getAppDb } from "@/server/bootstrap";
import { getSession } from "@/server/auth/session";
import { isSeasonMode } from "@/domain/season-stats";
import { listChampions } from "@/server/repositories/champions";
import { getPlayer } from "@/server/repositories/team";
import { getPlayerOverview } from "@/server/players/overview";
import { PlayerOverview } from "@/components/players/player-overview";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";

export const dynamic = "force-dynamic";

/** MY OVERVIEW: the signed-in player's own season statistics, champion pools and proficiency. */
export default async function OverviewPage({ searchParams }: { searchParams: Promise<{ season?: string; mode?: string; others?: string }> }) {
  const sp = await searchParams;
  const session = await getSession();
  const db = await getAppDb();
  const player = session?.playerId ? await getPlayer(db, session.playerId) : null;
  if (!player) {
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <div>
          <h1 className="text-xl font-bold">My Overview</h1>
          <p className="text-sm text-fg-muted">Your roles, rank, champion pools and this season&apos;s statistics.</p>
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
  const overview = await getPlayerOverview(db, player, { season: Number(sp.season) || null, mode: isSeasonMode(sp.mode) ? sp.mode : "all", riotConfigured: !!process.env.RIOT_API_KEY, includeOthers: sp.others === "1" });
  const championsById = Object.fromEntries(champions.map((c) => [c.id, { id: c.id, name: c.name, portraitUrl: c.portraitUrl }]));
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold">My Overview</h1>
          <p className="text-sm text-fg-muted">Your roles, champion pools, mastery and this season&apos;s games from your linked Riot accounts. Teammates see the same figures on your profile; your Solo Queue Blocks notes stay private.</p>
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
