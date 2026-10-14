import Link from "next/link";
import { getSession } from "@/server/auth/session";
import { getAppDb } from "@/server/bootstrap";
import { getOrCreateTeam } from "@/server/repositories/team";
import { getActiveBlock, getBlock, getRankedProfile, listBlocks, listImportableMatches } from "@/server/ranked/repository";
import { loadJournalLookups } from "@/server/ranked/page-data";
import { CurrentBlockPanel } from "@/components/ranked/current-block-panel";
import { FocusPanel } from "@/components/ranked/focus-panel";
import { ImportPanel } from "@/components/ranked/import-panel";
import { JournalNeedsProfile } from "@/components/ranked/needs-profile";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

/**
 * Solo Queue Blocks: a private Solo/Duo journal, one section of My Profile. Ranked focus first,
 * then the block in progress (or the size of the next one) beside the recent games to log. The
 * history is its own page. Everything here belongs to the signed-in player (the owner comes from
 * the session, never from the URL), so no other member can reach it.
 */
export default async function RankedPage({ searchParams }: { searchParams: Promise<{ add?: string }> }) {
  const session = await getSession();
  if (!session?.playerId) return <JournalNeedsProfile />;
  const owner = session.playerId;
  const { add } = await searchParams;
  const db = await getAppDb();
  const [team, profile, active, recentBlocks] = await Promise.all([getOrCreateTeam(db), getRankedProfile(db, owner), getActiveBlock(db, owner), listBlocks(db, owner, { limit: 1 })]);
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
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <CurrentBlockPanel active={activeDetail} lastBlock={lastBlock} lookups={lookups} startAdding={add === "1"} />
        <ImportPanel matches={importable} lookups={lookups} accountState={lookups.accountState} blockActive={!!active} />
      </div>
    </div>
  );
}
