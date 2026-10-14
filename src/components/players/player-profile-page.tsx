import Link from "next/link";
import { NotebookPen, Plus } from "lucide-react";
import type { Db } from "@/server/db/types";
import type { Session } from "@/server/auth/permissions";
import { canEditPlayer, hasPermission } from "@/server/auth/permissions";
import { canManageRiotAccounts } from "@/server/auth/permissions";
import { defaultPlatform } from "@/server/auth/signup";
import { isSeasonMode } from "@/domain/season-stats";
import { legalRolesFor } from "@/domain/roster";
import { BLOCK_SIZE } from "@/domain/ranked-improvement";
import { listChampions } from "@/server/repositories/champions";
import { profileVersion } from "@/server/repositories/team";
import { getPlayerOverview } from "@/server/players/overview";
import type { ProfileHeaderData } from "@/server/players/profile-header";
import { loadPickerChampions } from "@/server/champions/picker";
import { listAccountsForPlayer } from "@/server/accounts/repository";
import { getActiveBlock, listBlocks } from "@/server/ranked/repository";
import { getPlayerDataReport } from "@/server/proficiency/provenance";
import { ChampionPools, SeasonSummary } from "@/components/players/player-overview";
import { ProfileHeader } from "@/components/players/profile-header";
import { ProfileEditor } from "@/components/profile/profile-editor";
import { RiotAccountsPanel } from "@/components/team/riot-accounts-panel";
import { PlayerDataPanel } from "@/components/team/player-data-panel";
import { ErrorBoundary } from "@/components/error-boundary";
import { CardStyleEditor } from "@/components/players/card-style-editor";
import { featurableChampions, featuredChampion, isCardAccent } from "@/domain/player-card";
import { buttonClass } from "@/components/ui/button";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import type { PortraitChampion } from "@/components/champion-portrait";

export interface ProfileSearch {
  season?: string;
  mode?: string;
  others?: string;
  detail?: string;
}

/**
 * THE player profile, the same for My Profile and every teammate: identity, season performance,
 * champion pools with each champion's statistics beside it, linked Riot accounts and (for the
 * owner only) the private Solo Queue Blocks. Editing is in place for the owner of the profile
 * (or an admin); everyone else sees the same layout read-only. Season statistics of teammates
 * need the "view teammate statistics" permission.
 */
export async function PlayerProfilePage({ db, header, session, basePath, search }: { db: Db; header: ProfileHeaderData; session: Session | null; basePath: string; search: ProfileSearch }) {
  const player = header.player;
  const self = session?.playerId === player.id;
  const editable = canEditPlayer(session, player.id);
  const showStats = self || hasPermission(session, "view-teammate-stats");
  const riotConfigured = !!process.env.RIOT_API_KEY;
  const wantDetail = showStats && search.detail === "1";
  const [champions, picker, overview, accounts, active, blocks, report] = await Promise.all([
    listChampions(db),
    editable ? loadPickerChampions(db) : Promise.resolve([]),
    getPlayerOverview(db, player, { season: Number(search.season) || null, mode: isSeasonMode(search.mode) ? search.mode : "all", riotConfigured, includeOthers: search.others === "1" }),
    listAccountsForPlayer(db, player.id),
    self ? getActiveBlock(db, player.id) : Promise.resolve(null),
    self ? listBlocks(db, player.id, { limit: 1 }) : Promise.resolve([]),
    wantDetail
      ? getPlayerDataReport(db, player, { riotConfigured }).catch((err: Error) => {
          console.error(JSON.stringify({ level: "error", event: "player.report.failed", error: err.message }));
          return null;
        })
      : Promise.resolve(null),
  ]);
  const championsById: Record<string, PortraitChampion> = Object.fromEntries(champions.map((c) => [c.id, { id: c.id, name: c.name, portraitUrl: c.portraitUrl }]));
  const lastBlock = blocks.find((b) => b.status === "completed") ?? null;
  const editor = editable ? (
    <ProfileEditor
      playerId={player.id}
      initial={{ primaryRole: player.primaryRole, secondaryRole: player.secondaryRole, primaryPool: player.primaryPool, secondaryPool: player.secondaryPool, additionalRoles: player.additionalRoles }}
      version={profileVersion(player)}
      champions={picker.length ? picker : champions.map((c) => ({ id: c.id, name: c.name, portraitUrl: c.portraitUrl }))}
      editable
    />
  ) : null;
  const detailHref = `${basePath}?${new URLSearchParams({ ...(search.season ? { season: search.season } : {}), ...(search.mode ? { mode: search.mode } : {}), detail: wantDetail ? "0" : "1" }).toString()}#proficiency`;

  return (
    <div className="mx-auto max-w-5xl space-y-6" data-testid="player-profile">
      <ProfileHeader data={header} self={self} />
      {showStats ? <SeasonSummary data={overview} basePath={basePath} /> : null}
      <div className={self ? "grid gap-5 lg:grid-cols-[minmax(0,1fr)_17rem]" : ""}>
        <ChampionPools data={overview} roles={legalRolesFor(player)} championsById={championsById} basePath={basePath} showStats={showStats} editor={editor} selfView={self} name={player.displayName} />
        {self ? (
          <aside className="space-y-3">
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
          </aside>
        ) : null}
      </div>
      {editable ? (
        <details className="group rounded-2xl border border-border bg-surface" data-testid="card-style-panel">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 px-4 text-sm font-medium text-fg hover:text-accent">
            Team card style
            <span className="text-xs font-normal text-fg-subtle">Featured champion and accent</span>
          </summary>
          <div className="border-t border-border p-4">
            <CardStyleEditor playerId={player.id} champions={featurableChampions(player).map((id) => championsById[id] ?? { id, name: id, portraitUrl: "" })} featured={featuredChampion(player)} accent={isCardAccent(player.cardAccent) ? player.cardAccent : "default"} />
          </div>
        </details>
      ) : null}
      <RiotAccountsPanel playerId={player.id} accounts={accounts} riotConfigured={riotConfigured} defaultPlatform={defaultPlatform()} editable={canManageRiotAccounts(session, player.id)} title="Riot accounts" />
      {showStats ? (
        <section id="proficiency" className="rounded-xl border border-border bg-surface">
          <Link href={detailHref} scroll={false} className="flex min-h-12 items-center justify-between gap-2 px-4 py-2 text-sm font-medium text-fg-muted hover:text-fg" data-testid="proficiency-detail-toggle">
            How proficiency is measured (every champion)
            <span className="text-xs font-normal text-fg-subtle">{wantDetail ? "Hide" : "Show"}</span>
          </Link>
          {report ? (
            <div className="border-t border-border p-3">
              <ErrorBoundary label="Riot data">
                <PlayerDataPanel report={report} championsById={championsById} admin={hasPermission(session, "manage-data")} playerName={player.displayName} selfView={self} showAccounts={false} />
              </ErrorBoundary>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
