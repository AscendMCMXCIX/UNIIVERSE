"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BLOCK_SIZE } from "@/domain/ranked-improvement";
import { addRankedGameAction, finishRankedBlockAction, startRankedBlockAction } from "@/server/actions/ranked";
import type { RankedBlockView, RankedGameView } from "@/server/ranked/repository";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { GameForm, toActionInput } from "./game-form";
import { GameList } from "./game-card";
import type { JournalLookups } from "./types";

export interface CurrentBlockPanelProps {
  /** The active block with its games, or null when the last block is finished (or none exists). */
  active: { block: RankedBlockView; games: RankedGameView[] } | null;
  /** The most recent block when none is active, so its result stays visible. */
  lastBlock: RankedBlockView | null;
  lookups: JournalLookups;
}

/**
 * The working surface: the block in progress, its games, and the quick entry form. The sixth
 * game completes the block; "Finish block" closes a shorter one; "Start next block" opens the
 * next number. Adding a game with no active block simply starts one.
 */
export function CurrentBlockPanel({ active, lastBlock, lookups }: CurrentBlockPanelProps) {
  const router = useRouter();
  const [adding, setAdding] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const block = active?.block ?? null;
  const games = active?.games ?? [];

  const run = async (fn: () => Promise<{ ok: true; data: unknown } | { ok: false; error: string }>, done?: (data: unknown) => void) => {
    setBusy(true);
    setMessage(null);
    const res = await fn();
    setBusy(false);
    if (!res.ok) return setMessage({ tone: "bad", text: res.error });
    done?.(res.data);
    router.refresh();
  };

  const progress = block ? `${games.length} of ${BLOCK_SIZE} games` : null;

  return (
    <Panel>
      <PanelHeader
        title={block ? `${block.label} · IN PROGRESS` : lastBlock ? `${lastBlock.label} · FINISHED` : "YOUR FIRST BLOCK"}
        subtitle={block ? `${progress}. The block completes itself at ${BLOCK_SIZE} games, or finish it early.` : lastBlock ? `${lastBlock.games} game${lastBlock.games === 1 ? "" : "s"} · ${lastBlock.wins}W ${lastBlock.losses}L. Start the next block when you are ready; adding a game also starts one.` : "Blocks of up to six Solo/Duo games keep reflection short and regular. Add your first game to begin."}
        actions={
          <>
            {block ? (
              <Button size="sm" variant="outline" disabled={busy || games.length === 0} onClick={() => confirm(`Finish ${block.label} at ${games.length} game${games.length === 1 ? "" : "s"}?`) && run(() => finishRankedBlockAction(block.id))}>
                Finish block
              </Button>
            ) : (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => startRankedBlockAction())}>
                Start next block
              </Button>
            )}
            {!adding ? (
              <Button size="sm" variant="primary" disabled={busy} onClick={() => setAdding(true)}>
                + Add game
              </Button>
            ) : null}
          </>
        }
      />
      <PanelBody className="space-y-3">
        {block ? (
          <div className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
            <div className="flex gap-1" aria-label={progress ?? undefined} role="img">
              {Array.from({ length: BLOCK_SIZE }, (_, i) => {
                const g = games[i];
                return <span key={i} className={`h-2.5 w-6 rounded-sm ${g ? (g.result === "win" ? "bg-blue" : "bg-red") : "bg-surface-3"}`} />;
              })}
            </div>
            <span>{progress}</span>
            <Badge tone="blue">{games.filter((g) => g.result === "win").length}W</Badge>
            <Badge tone="red">{games.filter((g) => g.result === "loss").length}L</Badge>
          </div>
        ) : null}
        {message ? (
          <p className={`text-sm ${message.tone === "good" ? "text-good" : "text-bad"}`} role="status">
            {message.text}
          </p>
        ) : null}
        {adding ? (
          <div className="rounded-md border border-accent/40 bg-bg-elevated p-3">
            <div className="mb-2 text-xs font-medium text-fg-muted">{block ? `New game in ${block.label}` : "New game (starts the next block)"}</div>
            <GameForm
              lookups={lookups}
              submitLabel="Save game"
              autoFocus
              onCancel={() => setAdding(false)}
              onSubmit={async (values) => {
                const res = await addRankedGameAction(toActionInput(values));
                if (!res.ok) return res.error;
                setAdding(false);
                setMessage(res.data.blockCompleted ? { tone: "good", text: `${res.data.block.label} complete at ${BLOCK_SIZE} games (${res.data.block.wins}W ${res.data.block.losses}L). Start the next block whenever you are ready.` } : { tone: "good", text: "Game saved." });
                router.refresh();
                return null;
              }}
            />
          </div>
        ) : null}
        <GameList games={games} lookups={lookups} emptyText={block ? "No games in this block yet." : lastBlock ? "" : "Nothing logged yet. The form takes about thirty seconds."} />
        {!block && lastBlock ? (
          <p className="text-xs text-fg-subtle">
            <Link href={`/overview/blocks/${lastBlock.id}`} className="text-accent hover:underline">
              Review {lastBlock.label}
            </Link>{" "}
            or see <Link href="/overview/blocks/history" className="text-accent hover:underline">all blocks</Link>.
          </p>
        ) : null}
      </PanelBody>
    </Panel>
  );
}
