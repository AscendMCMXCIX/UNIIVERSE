import Link from "next/link";
import { after } from "next/server";
import { NotebookPen, Plus } from "lucide-react";
import { getAppDb } from "@/server/bootstrap";
import { canEditPlayer, getSession } from "@/server/auth/session";
import { isSeasonMode } from "@/domain/season-stats";
import { BLOCK_SIZE } from "@/domain/ranked-improvement";
import { listChampions } from "@/server/repositories/champions";
import { getOrCreateTeam, profileVersion } from "@/server/repositories/team";
import { getPlayerOverview } from "@/server/players/overview";
import { refreshPlayerAccountsIfDue } from "@/server/accounts/kickoff";
import { loadProfileHeader } from "@/server/players/profile-header";
import { loadPickerChampions } from "@/server/champions/picker";
import { getActiveBlock, listBlocks } from "@/server/ranked/repository";
import { PlayerOverview } from "@/components/players/player-overview";
import { ProfileHeader } from "@/components/players/profile-header";
import { ProfileEditor } from "@/components/profile/profile-editor";
import { buttonClass } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";

export const dynamic = "force-dynamic";

/**
 * MY OVERVIEW, in three parts: what you choose (roles and champion pools, edited here with
 * autosave), your private Solo Queue Blocks, and what Riot measured (season performance for any
 * stored season and game mode).
 */
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
  // Your Riot data refreshes while you look at it (after the page is sent; never blocks it).
  after(() => refreshPlayerAccountsIfDue(db, player.id));
  const editable = canEditPlayer(session, player.id);
  const [team, champions, picker, overview, active, blocks] = await Promise.all([
    getOrCreateTeam(db),
    listChampions(db),
    editable ? loadPickerChampions(db) : Promise.resolve([]),
    getPlayerOverview(db, player, { season: Number(sp.season) || null, mode: isSeasonMode(sp.mode) ? sp.mode : "all", riotConfigured: !!process.env.RIOT_API_KEY, includeOthers: sp.others === "1" }),
    getActiveBlock(db, player.id),
    listBlocks(db, player.id, { limit: 1 }),
  ]);
  const championsById = Object.fromEntries(champions.map((c) => [c.id, { id: c.id, name: c.name, portraitUrl: c.portraitUrl }]));
  const lastBlock = blocks.find((b) => b.status === "completed") ?? null;
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <ProfileHeader data={header} self />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <Panel data-testid="my-roles">
          <PanelHeader title="My roles & champion pools" subtitle={editable ? "Your choices: the only champions UNIIVERSE drafts for you, in your order. Changes save automatically." : "Your choices: the only champions UNIIVERSE drafts for you."} />
          <PanelBody>
            <ProfileEditor
              playerId={player.id}
              initial={{ primaryRole: player.primaryRole, secondaryRole: player.secondaryRole, primaryPool: player.primaryPool, secondaryPool: player.secondaryPool }}
              version={profileVersion(player)}
              champions={picker.length ? picker : champions.map((c) => ({ id: c.id, name: c.name, portraitUrl: c.portraitUrl }))}
              limits={team.poolLimits}
              editable={editable}
            />
          </PanelBody>
        </Panel>
        <Panel data-testid="blocks-card">
          <PanelHeader title="Solo Queue Blocks" subtitle="Private: only you see these." />
          <PanelBody className="space-y-3">
            {active ? (
              <>
                <div>
                  <p className="text-sm text-fg-muted">Current block</p>
                  <p className="text-lg font-semibold text-fg">{active.label}</p>
                  <p className="text-sm text-fg-muted">
                    <span className="font-medium text-fg" data-testid="block-progress">
                      {active.games}/{BLOCK_SIZE}
                    </span>{" "}
                    games logged{active.games ? ` · ${active.wins}W ${active.losses}L` : ""}
                  </p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                    <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, (active.games / BLOCK_SIZE) * 100)}%` }} />
                  </div>
                </div>
                <Link href="/overview/blocks?add=1#add-game" className={buttonClass("primary", "md", "w-full")}>
                  <Plus className="h-4 w-4" /> Add game
                </Link>
              </>
            ) : (
              <>
                <p className="text-sm text-fg-muted">{lastBlock ? `Last block: ${lastBlock.label}, ${lastBlock.wins}W ${lastBlock.losses}L.` : "Log your Solo/Duo games in blocks of up to six, about 30 seconds each."}</p>
                <Link href="/overview/blocks" className={buttonClass("primary", "md", "w-full")}>
                  <Plus className="h-4 w-4" /> Start a block
                </Link>
              </>
            )}
            <Link href="/overview/blocks/history" className={buttonClass("ghost", "md", "w-full")}>
              <NotebookPen className="h-4 w-4" /> View blocks
            </Link>
          </PanelBody>
        </Panel>
      </div>
      <section aria-labelledby="season-performance" className="space-y-3">
        <div>
          <h2 id="season-performance" className="text-lg font-semibold text-fg">
            Season performance
          </h2>
          <p className="text-sm text-fg-muted">Measured from your linked Riot accounts; you cannot edit these numbers.</p>
        </div>
        <PlayerOverview data={overview} player={player} championsById={championsById} basePath="/overview" selfView editHref={null} poolTitle="Your pool champions this season" />
      </section>
    </div>
  );
}
