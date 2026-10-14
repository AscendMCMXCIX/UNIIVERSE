import Link from "next/link";
import { getSession } from "@/server/auth/session";
import { getAppDb } from "@/server/bootstrap";
import { listBlocks } from "@/server/ranked/repository";
import { BlockHistoryList } from "@/components/ranked/block-history";
import { JournalNeedsProfile } from "@/components/ranked/needs-profile";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";

export const dynamic = "force-dynamic";
const PAGE = 20;

/** Every block the owner has started, newest first, twenty per page. */
export default async function RankedHistoryPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const session = await getSession();
  if (!session?.playerId) return <JournalNeedsProfile />;
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);
  const db = await getAppDb();
  const blocks = await listBlocks(db, session.playerId, { limit: PAGE + 1, offset: (page - 1) * PAGE });
  const hasMore = blocks.length > PAGE;
  return (
    <div className="space-y-4">
      <Link href="/overview/blocks" className="text-xs text-accent hover:underline">
        ← Solo Queue Blocks
      </Link>
      <Panel>
        <PanelHeader title="Block history" subtitle="Blocks are numbered in the order you started them; a block keeps the games it had when it was finished." />
        <PanelBody className="space-y-3">
          <BlockHistoryList blocks={blocks.slice(0, PAGE)} emptyText="No blocks yet. Start one in Solo Queue Blocks: choose how many games it has." />
          {page > 1 || hasMore ? (
            <div className="flex items-center justify-between text-xs">
              {page > 1 ? (
                <Link href={`/overview/blocks/history?page=${page - 1}`} className="text-accent hover:underline">
                  ← Newer
                </Link>
              ) : (
                <span />
              )}
              <span className="text-fg-subtle">Page {page}</span>
              {hasMore ? (
                <Link href={`/overview/blocks/history?page=${page + 1}`} className="text-accent hover:underline">
                  Older →
                </Link>
              ) : (
                <span />
              )}
            </div>
          ) : null}
        </PanelBody>
      </Panel>
    </div>
  );
}
