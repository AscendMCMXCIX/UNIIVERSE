import Link from "next/link";
import { getSession } from "@/server/auth/session";
import { getAppDb } from "@/server/bootstrap";
import { getOrCreateTeam } from "@/server/repositories/team";
import { getActiveBlock, getBlock, getDashboard, getRankedProfile, getStatistics, listBlocks, listImportableMatches, listTaggedTeammateIds } from "@/server/ranked/repository";
import { loadJournalLookups } from "@/server/ranked/page-data";
import { CurrentBlockPanel } from "@/components/ranked/current-block-panel";
import { JournalDashboardTiles } from "@/components/ranked/dashboard";
import { FocusPanel } from "@/components/ranked/focus-panel";
import { ImportPanel } from "@/components/ranked/import-panel";
import { JournalNeedsProfile } from "@/components/ranked/needs-profile";
import { StatisticsPanel } from "@/components/ranked/statistics-panel";
import { BlockHistoryList } from "@/components/ranked/block-history";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

/**
 * Solo Queue Blocks: a private Solo/Duo journal. Everything on this page belongs to the signed-in
 * player (the owner comes from the session, never from the URL), so no other member can reach it.
 */
export default async function RankedPage({ searchParams }: { searchParams: Promise<{ with?: string; add?: string }> }) {
  const session = await getSession();
  if (!session?.playerId) return <JournalNeedsProfile />;
  const owner = session.playerId;
  const { with: withParam, add } = await searchParams;
  const filter = withParam === "solo" ? "solo" : withParam && /^[0-9a-f-]{36}$/i.test(withParam) ? withParam : "all";
  const db = await getAppDb();
  const [team, profile, active, dashboard, stats, recentBlocks, taggedIds] = await Promise.all([
    getOrCreateTeam(db),
    getRankedProfile(db, owner),
    getActiveBlock(db, owner),
    getDashboard(db, owner),
    getStatistics(db, owner, filter === "all" ? {} : { teammate: filter }),
    listBlocks(db, owner, { limit: 5 }),
    listTaggedTeammateIds(db, owner),
  ]);
  const activeDetail = active ? await getBlock(db, owner, active.id) : null;
  const lookups = await loadJournalLookups(db, team.id, owner, [...taggedIds, filter !== "all" && filter !== "solo" ? filter : null]);
  const importable = lookups.accountState === "none" ? [] : await listImportableMatches(db, owner, 10);
  const lastBlock = recentBlocks.find((b) => b.status === "completed") ?? null;
  // Filter chips list only teammates who appear in the journal; the entry form offers the whole roster.
  const taggedTeammates = taggedIds.map((id) => ({ id, displayName: lookups.teammateNames[id] ?? "former teammate" }));

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-fg">
            Solo Queue Blocks <Badge tone="neutral">Private</Badge>
          </h1>
          <p className="text-sm text-fg-muted">Log each Solo/Duo game in about thirty seconds, in blocks of up to six. Only you can see this; it never feeds the team&apos;s drafting data.</p>
        </div>
        <Link href="/blocks/history" className="text-sm text-accent hover:underline">
          All blocks →
        </Link>
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <CurrentBlockPanel active={activeDetail} lastBlock={active ? null : lastBlock} lookups={lookups} startAdding={add === "1"} />
        <ImportPanel matches={importable} lookups={lookups} accountState={lookups.accountState} />
      </div>
      <JournalDashboardTiles dashboard={dashboard} />
      <FocusPanel profile={profile} lookups={lookups} />
      <StatisticsPanel stats={stats} lookups={lookups} teammates={taggedTeammates} filter={filter} />
      {recentBlocks.length > 0 ? (
        <Panel>
          <PanelHeader title="Recent blocks" subtitle="Each block keeps its games; open one to review or edit them." actions={<Link href="/blocks/history" className="text-xs text-accent hover:underline">All blocks →</Link>} />
          <PanelBody>
            <BlockHistoryList blocks={recentBlocks} />
          </PanelBody>
        </Panel>
      ) : null}
    </div>
  );
}
