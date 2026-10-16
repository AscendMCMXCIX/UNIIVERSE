import Link from "next/link";
import { getSession } from "@/server/auth/session";
import { getAppDb } from "@/server/bootstrap";
import { getOrCreateTeam } from "@/server/repositories/team";
import { getActiveBlock, getBlock, getRankedProfile, listBlocks, listImportableMatches } from "@/server/ranked/repository";
import { loadJournalLookups } from "@/server/ranked/page-data";
import { AddGamePanel, BlockGamesPanel, CurrentBlockPanel } from "@/components/ranked/current-block-panel";
import { blockLabel } from "@/domain/ranked-improvement";
import { BlockHistoryList } from "@/components/ranked/block-history";
import { FocusPanel } from "@/components/ranked/focus-panel";
import { ImportPanel } from "@/components/ranked/import-panel";
import { JournalNeedsProfile } from "@/components/ranked/needs-profile";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

/** Finished blocks listed here; the rest are on the history page, a page at a time. */
const HISTORY = 5;

/**
 * Solo Queue Blocks: a private Solo/Duo journal, one section of My Profile, laid out in working
 * order: the current block (its rule, focus, wins and losses, games and next action); Quick Add
 * (recent Riot games and manual entry, beside the block on wide screens); the block's games; then
 * previous blocks; then the ranked focus editor (the block shows the focus it is played with).
 * Everything here belongs to the signed-in player (the owner comes from the session, never from
 * the URL), so no other member can reach it.
 */
export default async function RankedPage({ searchParams }: { searchParams: Promise<{ add?: string }> }) {
  const session = await getSession();
  if (!session?.playerId) return <JournalNeedsProfile />;
  const owner = session.playerId;
  const { add } = await searchParams;
  const db = await getAppDb();
  const [team, profile, active, recentBlocks] = await Promise.all([getOrCreateTeam(db), getRankedProfile(db, owner), getActiveBlock(db, owner), listBlocks(db, owner, { limit: HISTORY + 1 })]);
  const activeDetail = active ? await getBlock(db, owner, active.id) : null;
  const lookups = await loadJournalLookups(db, team.id, owner, (activeDetail?.games ?? []).flatMap((g) => [...g.playedWith.map((p) => p.playerId), ...g.notPlayedWith]));
  const importable = lookups.accountState === "none" ? [] : await listImportableMatches(db, owner, 6);
  const finished = recentBlocks.filter((b) => b.status === "completed");
  const lastBlock = active ? null : (finished[0] ?? null);
  const nextLabel = blockLabel((recentBlocks[0]?.number ?? 0) + 1);

  return (
    <div className="space-y-4">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-fg-muted">
        <Badge tone="neutral">Private</Badge> Only you can see your blocks; they never feed the team&apos;s drafting data.
      </p>
      {/* Working order: the current block, Quick Add, the block's games, then previous blocks.
          Wide screens: Quick Add beside the block; the ranked focus editor below, full width. */}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="min-w-0 lg:col-start-1 lg:row-start-1">
          <CurrentBlockPanel active={activeDetail} lastBlock={lastBlock} nextLabel={nextLabel} lookups={lookups} />
        </div>
        <div className="min-w-0 lg:col-start-2 lg:row-start-1">
          <AddGamePanel blockLabel={active?.label ?? null} nextLabel={nextLabel} lookups={lookups} startAdding={add === "1"} recent={<ImportPanel matches={importable} lookups={lookups} accountState={lookups.accountState} />} />
        </div>
        <div className="min-w-0 lg:col-start-1 lg:row-start-2">
          <BlockGamesPanel active={activeDetail} lookups={lookups} />
        </div>
        <section className="min-w-0 space-y-2 lg:col-start-1 lg:row-start-3" aria-labelledby="latest-blocks" data-testid="latest-blocks">
          <div className="flex items-center justify-between gap-2">
            <h2 id="latest-blocks" className="text-base font-semibold text-fg">
              Previous blocks
            </h2>
            <Link href="/overview/blocks/history" className="text-sm text-accent hover:underline" data-testid="block-history-link">
              All blocks →
            </Link>
          </div>
          <div className="rounded-card border border-border bg-surface px-3">
            <BlockHistoryList blocks={finished.slice(0, HISTORY)} emptyText="Finished blocks appear here." />
          </div>
        </section>
        <div id="ranked-focus" className="min-w-0 scroll-mt-20 lg:col-span-2 lg:row-start-4">
          <FocusPanel profile={profile} lookups={lookups} />
        </div>
      </div>
    </div>
  );
}
