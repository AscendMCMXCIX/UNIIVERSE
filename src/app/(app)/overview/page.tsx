import Link from "next/link";
import { NotebookPen, Pencil } from "lucide-react";
import { getAppDb } from "@/server/bootstrap";
import { getSession } from "@/server/auth/session";
import { isSeasonMode } from "@/domain/season-stats";
import { listChampions } from "@/server/repositories/champions";
import { getPlayerOverview } from "@/server/players/overview";
import { loadProfileHeader } from "@/server/players/profile-header";
import { PlayerOverview } from "@/components/players/player-overview";
import { ProfileHeader } from "@/components/players/profile-header";
import { buttonClass } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Panel, PanelBody } from "@/components/ui/panel";

export const dynamic = "force-dynamic";

/** MY OVERVIEW: your whole current season (or an earlier stored one), every supported game mode by default. */
export default async function OverviewPage({ searchParams }: { searchParams: Promise<{ season?: string; mode?: string; others?: string }> }) {
  const sp = await searchParams;
  const session = await getSession();
  const db = await getAppDb();
  const header = session?.playerId ? await loadProfileHeader(db, session.playerId) : null;
  if (!header) {
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <PageHeader title="My Overview" description="Your roles, rank, champion pools and this season's statistics." />
        <Panel>
          <PanelBody className="text-sm text-fg">
            This account has no player profile yet.{" "}
            <Link href="/me" className="text-accent underline underline-offset-2">
              Complete your profile
            </Link>{" "}
            and come back here.
          </PanelBody>
        </Panel>
      </div>
    );
  }
  const player = header.player;
  const [champions, overview] = await Promise.all([listChampions(db), getPlayerOverview(db, player, { season: Number(sp.season) || null, mode: isSeasonMode(sp.mode) ? sp.mode : "all", riotConfigured: !!process.env.RIOT_API_KEY, includeOthers: sp.others === "1" })]);
  const championsById = Object.fromEntries(champions.map((c) => [c.id, { id: c.id, name: c.name, portraitUrl: c.portraitUrl }]));
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <ProfileHeader data={header} self />
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/players/${player.id}`} className={buttonClass("outline")}>
          <Pencil className="h-4 w-4" /> Roles &amp; champions
        </Link>
        <Link href="/overview/blocks" className={buttonClass("ghost")}>
          <NotebookPen className="h-4 w-4" /> Solo Queue Blocks (private)
        </Link>
      </div>
      <PlayerOverview data={overview} player={player} championsById={championsById} basePath="/overview" selfView editHref={`/players/${player.id}`} />
    </div>
  );
}
