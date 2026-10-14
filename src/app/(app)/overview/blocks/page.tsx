import Link from "next/link";
import { getSession } from "@/server/auth/session";
import { getAppDb } from "@/server/bootstrap";
import { getOrCreateTeam } from "@/server/repositories/team";
import { getActiveBlock, getBlock, getRankedProfile, listBlocks, listImportableMatches } from "@/server/ranked/repository";
import { loadJournalLookups } from "@/server/ranked/page-data";
import { AddGamePanel, CurrentBlockPanel } from "@/components/ranked/current-block-panel";
import { BlockHistoryList } from "@/components/ranked/block-history";
import { FocusPanel } from "@/components/ranked/focus-panel";
import { ImportPanel } from "@/components/ranked/import-panel";
import { JournalNeedsProfile } from "@/components/ranked/needs-profile";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

/**
 * Solo Queue Blocks: a private Solo/Duo journal, one section of My Profile. In working order:
 * the ranked focus; the block in progress (its target, progress and games, a page at a time)
 * beside Add a game (recent Riot games and manual entry, sticky on wide screens so the next game
 * is always one tap away); then the latest blocks, with the full history on its own page.
 * Everything here belongs to the signed-in player (the owner comes from the session, never from
 * the URL), so no other member can reach it.
 */
export default async function RankedPage({ searchParams }: { searchParams: Promise<{ add?: string }> }) {
  const session = await getSession();
  if (!session?.playerId) return <JournalNeedsProfile />;
  const owner = session.playerId;
  const { add } = await searchParams;
  const db = await getAppDb();
  const [team, profile, active, recentBlocks] = await Promise.all([getOrCreateTeam(db), getRankedProfile(db, owner), getActiveBlock(db, owner), listBlocks(db, owner, { limit: 4 })]);
  const activeDetail = active ? await getBlock(db, owner, active.id) : null;
  const lookups = await loadJournalLookups(db, team.id, owner, (activeDetail?.games ?? []).flatMap((g) => [...g.playedWith.map((p) => p.playerId), ...g.notPlayedWith]));
  const importable = lookups.accountState === "none" ? [] : await listImportableMatches(db, owner, 6);
  const lastBlock = active ? null : (recentBlocks[0] ?? null);

  return (
    <div className="space-y-4">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-fg-muted">
        <Badge tone="neutral">Private</Badge> Only you can see your blocks; they never feed the team&apos;s drafting data.
        <Link href="/overview/blocks/history" className="ml-auto text-accent hover:underline" data-testid="block-history-link">
          Block history →
        </Link>
      </p>
      <FocusPanel profile={profile} lookups={lookups} />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <CurrentBlockPanel active={activeDetail} lastBlock={lastBlock} lookups={lookups} />
        <div className="lg:sticky lg:top-4">
          <AddGamePanel blockLabel={active?.label ?? null} lookups={lookups} startAdding={add === "1"} recent={<ImportPanel matches={importable} lookups={lookups} accountState={lookups.accountState} blockActive={!!active} />} />
        </div>
      </div>
      <section className="space-y-2" aria-labelledby="latest-blocks" data-testid="latest-blocks">
        <h2 id="latest-blocks" className="text-base font-semibold text-fg">
          Latest blocks
        </h2>
        <BlockHistoryList blocks={recentBlocks.filter((b) => b.status === "completed").slice(0, 3)} emptyText="Finished blocks appear here." />
      </section>
    </div>
  );
}
