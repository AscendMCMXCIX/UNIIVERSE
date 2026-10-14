import { blockProgressText } from "@/domain/ranked-improvement";
import Link from "next/link";
import { notFound } from "next/navigation";
import { blockStateLabel, summariseGames } from "@/domain/ranked-improvement";
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
  const lookups = await loadJournalLookups(db, team.id, session.playerId, detail.games.flatMap((g) => [...g.playedWith.map((p) => p.playerId), ...g.notPlayedWith]));
  const summary = summariseGames(detail.games);
  const { block } = detail;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 text-xs">
        <Link href="/overview/blocks" className="text-accent hover:underline">
          ← Solo Queue Blocks
        </Link>
        <Link href="/overview/blocks/history" className="text-accent hover:underline">
          Block history
        </Link>
      </div>
      <Panel>
        <PanelHeader
          title={
            <span className="inline-flex flex-wrap items-center gap-2">
              {block.label} <Badge tone={block.state === "active" ? "accent" : block.state === "completed-early" ? "warn" : "neutral"}>{blockStateLabel(block.state)}</Badge>
            </span>
          }
          subtitle={`${blockProgressText(block.games, block.plannedGames)} · ${block.wins}W ${block.losses}L${summary.winRate !== null ? ` (${percent(summary.winRate, 0)})` : ""} · started ${formatDate(block.startedAt)}${block.completedAt ? `, finished ${formatDate(block.completedAt)}` : ""}${summary.mostCommonMistake ? ` · most common mistake: ${summary.mostCommonMistake.label}` : ""}`}
        />
        <PanelBody className="space-y-3">
          {block.focus ? (
            <p className="rounded-lg bg-bg-elevated px-3 py-2 text-sm text-fg-muted">
              <span className="font-medium text-fg">Focus during this block:</span> {block.focus}
            </p>
          ) : null}
          <GameList games={detail.games} lookups={lookups} emptyText="This block has no games." />
        </PanelBody>
      </Panel>
    </div>
  );
}
