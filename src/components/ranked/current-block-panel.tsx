"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BLOCK_SIZE } from "@/domain/ranked-improvement";
import { addRankedGameAction, finishRankedBlockAction, startRankedBlockAction } from "@/server/actions/ranked";
import type { RankedBlockView, RankedGameView } from "@/server/ranked/repository";
import { toast } from "@/components/ui/toast";
import { Badge } from "@/components/ui/badge";
import { ChampionPortrait } from "@/components/champion-portrait";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { GameForm, toActionInput } from "./game-form";
import { GameList } from "./game-card";
import type { JournalLookups } from "./types";

export interface CurrentBlockPanelProps {
  /** Open the quick entry form on arrival (the Add game button on My Profile). */
  startAdding?: boolean;
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
export function CurrentBlockPanel({ active, lastBlock, lookups, startAdding = false }: CurrentBlockPanelProps) {
  const router = useRouter();
  // "Add game" on My Profile links here with ?add=1: the form is open straight away.
  const [adding, setAdding] = React.useState(startAdding);
  const [busy, setBusy] = React.useState(false);
  const [finishing, setFinishing] = React.useState(false);
  const block = active?.block ?? null;
  const games = active?.games ?? [];

  const run = async (fn: () => Promise<{ ok: true; data: unknown } | { ok: false; error: string }>, done?: (data: unknown) => void) => {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (!res.ok) return void toast.error("That did not work", { description: res.error });
    done?.(res.data);
    router.refresh();
  };

  const progress = block ? `${games.length} of ${BLOCK_SIZE} games` : null;

  return (
    <Panel id="add-game" className="scroll-mt-20">
      <PanelHeader
        title={block ? `${block.label} · IN PROGRESS` : lastBlock ? `${lastBlock.label} · FINISHED` : "YOUR FIRST BLOCK"}
        subtitle={block ? `${progress}. The block completes itself at ${BLOCK_SIZE} games, or finish it early.` : lastBlock ? `${lastBlock.games} game${lastBlock.games === 1 ? "" : "s"} · ${lastBlock.wins}W ${lastBlock.losses}L. Start the next block when you are ready; adding a game also starts one.` : "Blocks of up to six Solo/Duo games keep reflection short and regular. Add your first game to begin."}
        actions={
          <>
            {block ? (
              <Button size="sm" variant="outline" disabled={busy || games.length === 0} onClick={() => setFinishing(true)}>
                Finish block
              </Button>
            ) : (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => startRankedBlockAction())}>
                Start next block
              </Button>
            )}
            {!adding ? (
              <Button size="sm" variant="primary" disabled={busy} onClick={() => setAdding(true)}>
                + Add manually
              </Button>
            ) : null}
          </>
        }
      />
      {block ? (
        <ConfirmDialog
          open={finishing}
          tone="primary"
          title={`Finish ${block.label} now?`}
          description={`It ends at ${games.length} game${games.length === 1 ? "" : "s"} (${games.filter((g) => g.result === "win").length}W ${games.filter((g) => g.result === "loss").length}L). Your next game starts a new block.`}
          confirmLabel="Finish block"
          busy={busy}
          onCancel={() => setFinishing(false)}
          onConfirm={() => run(() => finishRankedBlockAction(block.id), () => setFinishing(false))}
        />
      ) : null}
      <PanelBody className="space-y-3">
        {block ? (
          <div className="space-y-2">
            <ol className="grid grid-cols-6 gap-1.5 sm:gap-2" aria-label={progress ?? undefined} data-testid="block-slots">
              {Array.from({ length: BLOCK_SIZE }, (_, i) => {
                const g = games[i];
                const champion = g ? (lookups.championsById[g.championId] ?? { id: g.championId, name: g.championId, portraitUrl: "" }) : null;
                return (
                  <li key={i} className={cn("flex aspect-[4/5] flex-col items-center justify-center gap-1 rounded-xl border p-1 text-xs", g ? (g.result === "win" ? "border-blue/50 bg-blue/10" : "border-red/50 bg-red/10") : "border-dashed border-border text-fg-subtle")}>
                    {g && champion ? (
                      <>
                        <ChampionPortrait champion={champion} size="sm" />
                        <span className={cn("font-semibold", g.result === "win" ? "text-blue" : "text-red")}>{g.result === "win" ? "W" : "L"}</span>
                      </>
                    ) : (
                      <span className="tabular-nums">{i + 1}</span>
                    )}
                  </li>
                );
              })}
            </ol>
            <div className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
              <span>{progress}</span>
              <Badge tone="blue">{games.filter((g) => g.result === "win").length}W</Badge>
              <Badge tone="red">{games.filter((g) => g.result === "loss").length}L</Badge>
            </div>
          </div>
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
                if (res.data.blockCompleted) toast.success(`${res.data.block.label} complete`, { description: `${BLOCK_SIZE} games (${res.data.block.wins}W ${res.data.block.losses}L). Start the next block whenever you are ready.` });
                else toast.success("Game saved.");
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
