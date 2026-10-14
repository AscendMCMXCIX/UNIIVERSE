"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Flag, Pencil, Plus, Target } from "lucide-react";
import { MAX_BLOCK_SIZE, MIN_BLOCK_SIZE, blockProgressText, targetReached, type BlockTarget } from "@/domain/ranked-improvement";
import { addRankedGameAction, finishRankedBlockAction, setRankedBlockSizeAction, startRankedBlockAction } from "@/server/actions/ranked";
import type { RankedBlockView, RankedGameView } from "@/server/ranked/repository";
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
  /** The active block with its games, or null when the last block is finished (or none exists). */
  active: { block: RankedBlockView; games: RankedGameView[] } | null;
  /** The most recent block when none is active, so its result stays visible. */
  lastBlock: RankedBlockView | null;
  lookups: JournalLookups;
}

const SIZE_SUGGESTIONS = [3, 5, 10] as const;
/** Games shown per page in the block's list (newest first); the rest are a click away. */
export const GAMES_PER_PAGE = 5;

/**
 * How many games: typed or tapped, never prefilled. With `allowOpen`, "No target" is a choice too
 * (the value "open").
 */
export function BlockSizeInput({ value, onChange, id = "block-size", allowOpen = false }: { value: string; onChange: (v: string) => void; id?: string; allowOpen?: boolean }) {
  const chip = (v: string, label: React.ReactNode, testId?: string) => (
    <button
      key={v}
      type="button"
      onClick={() => onChange(v)}
      aria-pressed={value === v}
      className={cn("min-h-10 rounded-full border px-3 text-sm tabular-nums transition-colors md:min-h-8", value === v ? "border-accent bg-accent/15 text-fg" : "border-border text-fg-muted hover:border-border-strong hover:text-fg")}
      data-testid={testId}
    >
      {label}
    </button>
  );
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Input id={id} type="number" inputMode="numeric" min={MIN_BLOCK_SIZE} max={MAX_BLOCK_SIZE} value={value === "open" ? "" : value} onChange={(e) => onChange(e.target.value)} placeholder="Games" aria-label="Games planned for this block" className="w-24" data-testid="block-size" />
      {SIZE_SUGGESTIONS.map((n) => chip(String(n), n))}
      {allowOpen ? chip("open", "No target", "block-open") : null}
    </div>
  );
}

/** The typed value as a target: a whole number in range, "open", or null (not valid yet). */
export function targetOf(v: string): BlockTarget | null {
  if (v === "open") return "open";
  const n = Number(v);
  return v.trim() !== "" && Number.isInteger(n) && n >= MIN_BLOCK_SIZE && n <= MAX_BLOCK_SIZE ? n : null;
}

const targetText = (t: BlockTarget) => (t === "open" ? "with no target" : `of ${t}`);

type ActionResult = { ok: true; data: unknown } | { ok: false; error: string };

function useRun() {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const run = async (fn: () => Promise<ActionResult>, done?: (data: unknown) => void) => {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (!res.ok) return void toast.error("That did not work", { description: res.error });
    done?.(res.data);
    router.refresh();
  };
  return { busy, run };
}

/** Wins and losses in order, one mark per game: squares up to the target, a wrapping strip beyond. */
function ProgressStrip({ block, games, lookups }: { block: RankedBlockView; games: RankedGameView[]; lookups: JournalLookups }) {
  const planned = block.plannedGames;
  const slots = planned !== null && planned <= 20 ? Math.max(planned, games.length) : games.length;
  if (slots === 0) return <p className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-sm text-fg-subtle">No games yet. Log your first one from Add a game.</p>;
  const big = slots > 10;
  return (
    <ol className={cn("grid gap-1.5", big ? "grid-cols-[repeat(auto-fill,minmax(2.25rem,1fr))]" : "grid-cols-5 sm:grid-cols-10")} aria-label={blockProgressText(games.length, planned)} data-testid="block-slots">
      {Array.from({ length: slots }, (_, i) => {
        const g = games[i];
        const champion = g ? (lookups.championsById[g.championId] ?? { id: g.championId, name: g.championId, portraitUrl: "" }) : null;
        const extra = planned !== null && i >= planned;
        return (
          <li
            key={i}
            title={g ? `Game ${i + 1}: ${champion!.name}, ${g.result === "win" ? "win" : "loss"}${extra ? " (past the target)" : ""}` : `Game ${i + 1}`}
            className={cn("flex aspect-square flex-col items-center justify-center gap-0.5 rounded-lg border text-[11px]", g ? (g.result === "win" ? "border-blue/50 bg-blue/10" : "border-red/50 bg-red/10") : "border-dashed border-border text-fg-subtle", extra && "ring-1 ring-accent/50")}
          >
            {g && champion ? (
              big ? (
                <span className={cn("font-semibold", g.result === "win" ? "text-blue" : "text-red")}>{g.result === "win" ? "W" : "L"}</span>
              ) : (
                <>
                  <ChampionPortrait champion={champion} size="xs" />
                  <span className={cn("font-semibold", g.result === "win" ? "text-blue" : "text-red")}>{g.result === "win" ? "W" : "L"}</span>
                </>
              )
            ) : (
              <span className="tabular-nums">{i + 1}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The block in progress: its target (a plan, never a limit), progress, and the games in it
 * (newest first, a page at a time, so a long block never pushes the page down). Reaching the
 * target offers to finish the block; playing on simply adds to it. With no block running, the
 * choice of the next block's target.
 */
export function CurrentBlockPanel({ active, lastBlock, lookups }: CurrentBlockPanelProps) {
  const { busy, run } = useRun();
  const [finishing, setFinishing] = React.useState(false);
  const [size, setSize] = React.useState("");
  const [resizing, setResizing] = React.useState(false);
  const [page, setPage] = React.useState(0);
  const block = active?.block ?? null;
  const games = active?.games ?? [];

  if (!block) {
    const t = targetOf(size);
    return (
      <Panel className="scroll-mt-20" data-testid="start-block">
        <PanelHeader
          title={lastBlock ? "START THE NEXT BLOCK" : "START YOUR FIRST BLOCK"}
          subtitle={lastBlock ? `${lastBlock.label} ${lastBlock.state === "completed-early" ? `was finished early at ${blockProgressText(lastBlock.games, lastBlock.plannedGames)}` : `finished at ${lastBlock.games} game${lastBlock.games === 1 ? "" : "s"}`} · ${lastBlock.wins}W ${lastBlock.losses}L.` : "A block is a run of Solo/Duo games you review together. Plan a number of games, or none."}
        />
        <PanelBody className="space-y-3">
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (t !== null) void run(() => startRankedBlockAction(t));
            }}
          >
            <div>
              <label htmlFor="block-size" className="mb-1.5 block text-xs font-medium text-fg-muted">
                How many games do you plan? (You can change it or play on later.)
              </label>
              <BlockSizeInput value={size} onChange={setSize} allowOpen />
            </div>
            <Button type="submit" variant="primary" disabled={busy || t === null} data-testid="start-block-submit">
              Start block{t !== null ? ` ${targetText(t)}` : ""}
            </Button>
          </form>
          {size && t === null ? <p className="text-xs text-warn">Choose between {MIN_BLOCK_SIZE} and {MAX_BLOCK_SIZE} games, or No target.</p> : null}
          {lastBlock ? (
            <p className="text-xs text-fg-subtle">
              <Link href={`/overview/blocks/${lastBlock.id}`} className="text-accent hover:underline">
                Review {lastBlock.label}
              </Link>
            </p>
          ) : null}
        </PanelBody>
      </Panel>
    );
  }

  const wins = games.filter((g) => g.result === "win").length;
  const reached = targetReached(games.length, block.plannedGames);
  const newTarget = targetOf(size);
  // Newest first, a page at a time.
  const newestFirst = games.map((g, i) => ({ g, n: i + 1 })).reverse();
  const pages = Math.max(1, Math.ceil(newestFirst.length / GAMES_PER_PAGE));
  const current = Math.min(page, pages - 1);
  const shown = newestFirst.slice(current * GAMES_PER_PAGE, (current + 1) * GAMES_PER_PAGE);
  return (
    <Panel className="scroll-mt-20" data-testid="current-block">
      <PanelHeader
        title={`${block.label} · IN PROGRESS`}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span data-testid="block-progress">{blockProgressText(games.length, block.plannedGames)}</span>
            <Badge tone="blue">{wins}W</Badge>
            <Badge tone="red">{games.length - wins}L</Badge>
          </span>
        }
        actions={
          <>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setSize(block.plannedGames === null ? "open" : String(block.plannedGames));
                setResizing((r) => !r);
              }}
              aria-expanded={resizing}
              data-testid="change-size"
            >
              <Target className="h-4 w-4" /> Target
            </Button>
            <Button size="sm" variant={reached ? "primary" : "outline"} disabled={busy || games.length === 0} onClick={() => setFinishing(true)} data-testid="finish-early">
              <Flag className="h-4 w-4" /> Finish block
            </Button>
          </>
        }
      />
      <ConfirmDialog
        open={finishing}
        tone="primary"
        title={`Finish ${block.label}?`}
        description={`It ends at ${games.length} game${games.length === 1 ? "" : "s"} (${wins}W ${games.length - wins}L)${block.plannedGames !== null && games.length < block.plannedGames ? `, before its target of ${block.plannedGames}, and is kept as finished early` : ""}. Every game and note stays in Block history.`}
        confirmLabel="Finish block"
        busy={busy}
        onCancel={() => setFinishing(false)}
        onConfirm={() => run(() => finishRankedBlockAction(block.id), () => setFinishing(false))}
      />
      <PanelBody className="space-y-3">
        {resizing ? (
          <form
            className="rise-in flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-border p-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (newTarget !== null) void run(() => setRankedBlockSizeAction(block.id, newTarget), () => setResizing(false));
            }}
          >
            <div>
              <label htmlFor="resize-block" className="mb-1.5 block text-xs font-medium text-fg-muted">
                Target for {block.label} (any number; logged games always stay)
              </label>
              <BlockSizeInput id="resize-block" value={size} onChange={setSize} allowOpen />
            </div>
            <Button type="submit" size="sm" variant="primary" disabled={busy || newTarget === null} data-testid="save-target">
              Save target
            </Button>
          </form>
        ) : null}
        {reached ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-accent/40 bg-accent/10 px-3 py-2 text-sm" data-testid="target-reached">
            <span>
              <strong className="font-semibold">Target reached.</strong> Finish the block, or keep playing: new games still go into {block.label}.
            </span>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => setRankedBlockSizeAction(block.id, Math.max(games.length, block.plannedGames ?? 0) + 3))} data-testid="extend-block">
              <Plus className="h-4 w-4" /> 3 more
            </Button>
          </div>
        ) : null}
        <ProgressStrip block={block} games={games} lookups={lookups} />
        <div className="space-y-2" data-testid="block-games">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-fg">Games in this block</h3>
            {pages > 1 ? (
              <span className="flex items-center gap-1 text-xs text-fg-subtle" data-testid="block-games-pages">
                <Button size="sm" variant="ghost" disabled={current === 0} onClick={() => setPage(current - 1)} aria-label="Newer games">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                {current * GAMES_PER_PAGE + 1}–{Math.min(newestFirst.length, (current + 1) * GAMES_PER_PAGE)} of {newestFirst.length}
                <Button size="sm" variant="ghost" disabled={current >= pages - 1} onClick={() => setPage(current + 1)} aria-label="Older games">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </span>
            ) : null}
          </div>
          <GameList games={shown.map((x) => x.g)} numbers={shown.map((x) => x.n)} lookups={lookups} emptyText="No games in this block yet." />
        </div>
      </PanelBody>
    </Panel>
  );
}

/**
 * ADD A GAME: the recent Riot games (one tap each, passed in) and manual entry, side by side with
 * the block so logging the next game never needs scrolling. Without a block in progress, the first
 * game starts one with the target chosen in the form.
 */
export function AddGamePanel({ blockLabel, lookups, startAdding = false, recent }: { blockLabel: string | null; lookups: JournalLookups; startAdding?: boolean; recent: React.ReactNode }) {
  const router = useRouter();
  // "Add game" on My Profile links here with ?add=1: the form is open straight away.
  const [adding, setAdding] = React.useState(startAdding && !!blockLabel);
  return (
    <Panel id="add-game" className="scroll-mt-20" data-testid="add-game">
      <PanelHeader
        title="ADD A GAME"
        subtitle={blockLabel ? `Goes into ${blockLabel}.` : "Start a block first; then each game is one tap."}
        actions={
          blockLabel && !adding ? (
            <Button size="sm" variant="outline" onClick={() => setAdding(true)} data-testid="add-manually">
              <Pencil className="h-4 w-4" /> Add manually
            </Button>
          ) : null
        }
      />
      <PanelBody className="space-y-4">
        {adding && blockLabel ? (
          <div className="rounded-md border border-accent/40 bg-bg-elevated p-3">
            <div className="mb-2 text-xs font-medium text-fg-muted">New game in {blockLabel}</div>
            <GameForm
              lookups={lookups}
              submitLabel="Save game"
              autoFocus
              onCancel={() => setAdding(false)}
              onSubmit={async (values) => {
                const res = await addRankedGameAction(toActionInput(values));
                if (!res.ok) return res.error;
                setAdding(false);
                if (res.data.targetReached) toast.success(`Saved: ${res.data.block.label} has reached its target`, { description: `${res.data.block.games} games (${res.data.block.wins}W ${res.data.block.losses}L). Finish it, or keep playing.` });
                else toast.success("Game saved.");
                router.refresh();
                return null;
              }}
            />
          </div>
        ) : null}
        {recent}
      </PanelBody>
    </Panel>
  );
}
