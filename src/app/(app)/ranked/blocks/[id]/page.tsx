import Link from "next/link";
import { notFound } from "next/navigation";
import { BLOCK_SIZE, summariseGames } from "@/domain/ranked-improvement";
import { getSession } from "@/server/auth/session";
import { getAppDb } from "@/server/bootstrap";
import { getOrCreateTeam } from "@/server/repositories/team";
import { getBlock } from "@/server/ranked/repository";
import { loadJournalLookups } from "@/server/ranked/page-data";
import { GameList } from "@/components/ranked/game-card";
import { JournalNeedsProfile } from "@/components/ranked/needs-profile";
import { Badge } from "@/components/ui/badge";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { formatDate, percent } from "@/lib/format";

export const dynamic = "force-dynamic";

/** One block and its games. A block that is not the owner's is simply not found. */
export default async function RankedBlockPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.playerId) return <JournalNeedsProfile />;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = await getAppDb();
  const detail = await getBlock(db, session.playerId, id);
  if (!detail) notFound();
  const team = await getOrCreateTeam(db);
  const lookups = await loadJournalLookups(db, team.id, session.playerId, detail.games.map((g) => g.teammatePlayerId));
  const summary = summariseGames(detail.games);
  const { block } = detail;
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-wrap gap-3 text-xs">
        <Link href="/ranked" className="text-accent hover:underline">
          ← My Ranked
        </Link>
        <Link href="/ranked/history" className="text-accent hover:underline">
          Block history
        </Link>
      </div>
      <Panel>
        <PanelHeader
          title={
            <span className="inline-flex flex-wrap items-center gap-2">
              {block.label} <Badge tone={block.status === "active" ? "accent" : "neutral"}>{block.status === "active" ? "In progress" : "Finished"}</Badge>
            </span>
          }
          subtitle={`${block.games} of ${BLOCK_SIZE} games · ${block.wins}W ${block.losses}L${summary.winRate !== null ? ` (${percent(summary.winRate, 0)})` : ""} · started ${formatDate(block.startedAt)}${block.completedAt ? `, finished ${formatDate(block.completedAt)}` : ""}${summary.mostCommonMistake ? ` · most common mistake: ${summary.mostCommonMistake.label}` : ""}`}
        />
        <PanelBody>
          <GameList games={detail.games} lookups={lookups} emptyText="This block has no games." />
        </PanelBody>
      </Panel>
    </div>
  );
}
