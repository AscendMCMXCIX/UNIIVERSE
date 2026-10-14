"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MAX_BLOCK_SIZE, MIN_BLOCK_SIZE } from "@/domain/ranked-improvement";
import {
  addRankedGameAction,
  finishRankedBlockAction,
  setRankedBlockSizeAction,
  startRankedBlockAction,
} from "@/server/actions/ranked";
import type {
  RankedBlockView,
  RankedGameView,
} from "@/server/ranked/repository";
import { toast } from "@/components/ui/toast";
import { Badge } from "@/components/ui/badge";
import { ChampionPortrait } from "@/components/champion-portrait";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

const SIZE_SUGGESTIONS = [3, 5, 10] as const;

/** How many games: typed or tapped, never prefilled. */
export function BlockSizeInput({
  value,
  onChange,
  id = "block-size",
}: {
  value: string;
  onChange: (v: string) => void;
  id?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={MIN_BLOCK_SIZE}
        max={MAX_BLOCK_SIZE}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Games"
        aria-label="Games in this block"
        className="w-24"
        data-testid="block-size"
      />
      {SIZE_SUGGESTIONS.map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(String(n))}
          aria-pressed={value === String(n)}
          className={cn(
            "min-h-10 rounded-full border px-3 text-sm tabular-nums transition-colors md:min-h-8",
            value === String(n)
              ? "border-accent bg-accent/15 text-fg"
              : "border-border text-fg-muted hover:border-border-strong hover:text-fg",
          )}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

const sizeOf = (v: string): number | null => {
  const n = Number(v);
  return Number.isInteger(n) && n >= MIN_BLOCK_SIZE && n <= MAX_BLOCK_SIZE
    ? n
    : null;
};

/**
 * The working surface: the block in progress (its planned size, the games logged so far and the
 * quick entry form), or the choice of the next block's size. A block completes itself at the size
 * chosen, may be finished early, and its size can change while it runs.
 */
export function CurrentBlockPanel({
  active,
  lastBlock,
  lookups,
  startAdding = false,
}: CurrentBlockPanelProps) {
  const router = useRouter();
  // "Add game" on My Profile links here with ?add=1: the form is open straight away.
  const [adding, setAdding] = React.useState(startAdding);
  const [busy, setBusy] = React.useState(false);
  const [finishing, setFinishing] = React.useState(false);
  const [size, setSize] = React.useState("");
  const [resizing, setResizing] = React.useState(false);
  const block = active?.block ?? null;
  const games = active?.games ?? [];

  const run = async (
    fn: () => Promise<
      { ok: true; data: unknown } | { ok: false; error: string }
    >,
    done?: (data: unknown) => void,
  ) => {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (!res.ok)
      return void toast.error("That did not work", { description: res.error });
    done?.(res.data);
    router.refresh();
  };

  if (!block) {
    const n = sizeOf(size);
    return (
      <Panel id="add-game" className="scroll-mt-20" data-testid="start-block">
        <PanelHeader
          title={lastBlock ? "START THE NEXT BLOCK" : "START YOUR FIRST BLOCK"}
          subtitle={
            lastBlock
              ? `${lastBlock.label} ${lastBlock.state === "completed-early" ? `was completed early at ${lastBlock.games} of ${lastBlock.plannedGames}` : `finished at ${lastBlock.games} game${lastBlock.games === 1 ? "" : "s"}`} · ${lastBlock.wins}W ${lastBlock.losses}L.`
              : "A block is a short run of Solo/Duo games you review together. Choose how many."
          }
        />
        <PanelBody className="space-y-3">
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (n)
                void run(
                  () => startRankedBlockAction(n),
                  () => setAdding(startAdding),
                );
            }}
          >
            <div>
              <label
                htmlFor="block-size"
                className="mb-1.5 block text-xs font-medium text-fg-muted"
              >
                How many games in this block?
              </label>
              <BlockSizeInput value={size} onChange={setSize} />
            </div>
            <Button
              type="submit"
              variant="primary"
              disabled={busy || !n}
              data-testid="start-block-submit"
            >
              Start block{n ? ` of ${n}` : ""}
            </Button>
          </form>
          {size && !n ? (
            <p className="text-xs text-warn">
              Choose between {MIN_BLOCK_SIZE} and {MAX_BLOCK_SIZE} games.
            </p>
          ) : null}
          {lastBlock ? (
            <p className="text-xs text-fg-subtle">
              <Link
                href={`/overview/blocks/${lastBlock.id}`}
                className="text-accent hover:underline"
              >
                Review {lastBlock.label}
              </Link>{" "}
              or see{" "}
              <Link
                href="/overview/blocks/history"
                className="text-accent hover:underline"
              >
                all blocks
              </Link>
              .
            </p>
          ) : null}
        </PanelBody>
      </Panel>
    );
  }

  const wins = games.filter((g) => g.result === "win").length;
  const progress = `${games.length} of ${block.plannedGames} games logged`;
  const newSize = sizeOf(size);
  return (
    <Panel id="add-game" className="scroll-mt-20" data-testid="current-block">
      <PanelHeader
        title={`${block.label} · IN PROGRESS`}
        subtitle={`${progress}. It completes at ${block.plannedGames}; finish early any time.`}
        actions={
          <>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setSize(String(block.plannedGames));
                setResizing((r) => !r);
              }}
              aria-expanded={resizing}
              data-testid="change-size"
            >
              Change size
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy || games.length === 0}
              onClick={() => setFinishing(true)}
              data-testid="finish-early"
            >
              Finish early
            </Button>
            {!adding ? (
              <Button
                size="sm"
                variant="primary"
                disabled={busy}
                onClick={() => setAdding(true)}
                data-testid="add-manually"
              >
                + Add manually
              </Button>
            ) : null}
          </>
        }
      />
      <ConfirmDialog
        open={finishing}
        tone="primary"
        title={`Finish ${block.label} early?`}
        description={`It ends at ${games.length} of ${block.plannedGames} game${block.plannedGames === 1 ? "" : "s"} (${wins}W ${games.length - wins}L) and is kept as completed early. Your next block starts when you choose its size.`}
        confirmLabel="Finish early"
        busy={busy}
        onCancel={() => setFinishing(false)}
        onConfirm={() =>
          run(
            () => finishRankedBlockAction(block.id),
            () => setFinishing(false),
          )
        }
      />
      <PanelBody className="space-y-3">
        {resizing ? (
          <form
            className="rise-in flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-border p-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (newSize)
                void run(
                  () => setRankedBlockSizeAction(block.id, newSize),
                  () => setResizing(false),
                );
            }}
          >
            <div>
              <label
                htmlFor="resize-block"
                className="mb-1.5 block text-xs font-medium text-fg-muted"
              >
                Games in {block.label} (at least{" "}
                {Math.max(games.length, MIN_BLOCK_SIZE)})
              </label>
              <BlockSizeInput
                id="resize-block"
                value={size}
                onChange={setSize}
              />
            </div>
            <Button
              type="submit"
              size="sm"
              variant="primary"
              disabled={busy || !newSize || newSize < games.length}
            >
              Save size
            </Button>
          </form>
        ) : null}
        <div className="space-y-2">
          <ol
            className={cn(
              "grid gap-1.5 sm:gap-2",
              block.plannedGames <= 6
                ? "grid-cols-6"
                : "grid-cols-5 sm:grid-cols-10",
            )}
            aria-label={progress}
            data-testid="block-slots"
          >
            {Array.from({ length: block.plannedGames }, (_, i) => {
              const g = games[i];
              const champion = g
                ? (lookups.championsById[g.championId] ?? {
                    id: g.championId,
                    name: g.championId,
                    portraitUrl: "",
                  })
                : null;
              return (
                <li
                  key={i}
                  className={cn(
                    "flex aspect-square flex-col items-center justify-center gap-0.5 rounded-xl border p-1 text-xs",
                    g
                      ? g.result === "win"
                        ? "border-blue/50 bg-blue/10"
                        : "border-red/50 bg-red/10"
                      : "border-dashed border-border text-fg-subtle",
                  )}
                >
                  {g && champion ? (
                    <>
                      <ChampionPortrait champion={champion} size="xs" />
                      <span
                        className={cn(
                          "font-semibold",
                          g.result === "win" ? "text-blue" : "text-red",
                        )}
                      >
                        {g.result === "win" ? "W" : "L"}
                      </span>
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
            <Badge tone="blue">{wins}W</Badge>
            <Badge tone="red">{games.length - wins}L</Badge>
          </div>
        </div>
        {adding ? (
          <div className="rounded-md border border-accent/40 bg-bg-elevated p-3">
            <div className="mb-2 text-xs font-medium text-fg-muted">
              New game in {block.label}
            </div>
            <GameForm
              lookups={lookups}
              submitLabel="Save game"
              autoFocus
              onCancel={() => setAdding(false)}
              onSubmit={async (values) => {
                const res = await addRankedGameAction(toActionInput(values));
                if (!res.ok) return res.error;
                setAdding(false);
                if (res.data.blockCompleted)
                  toast.success(`${res.data.block.label} complete`, {
                    description: `${res.data.block.games} games (${res.data.block.wins}W ${res.data.block.losses}L). Choose the next block's size whenever you are ready.`,
                  });
                else toast.success("Game saved.");
                router.refresh();
                return null;
              }}
            />
          </div>
        ) : null}
        <GameList
          games={games}
          lookups={lookups}
          emptyText="No games in this block yet. Log one from Recent games or add it manually."
        />
      </PanelBody>
    </Panel>
  );
}
