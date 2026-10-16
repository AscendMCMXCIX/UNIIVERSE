"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Flag, Pencil, Play, Plus, ShieldAlert, Target } from "lucide-react";
import { COMPLETION_RULES, LOSS_LIMIT, MAX_BLOCK_SIZE, MIN_BLOCK_SIZE, blockProgressText, blockStatusText, completionRuleLabel, targetReached, type BlockTarget, type CompletionRule } from "@/domain/ranked-improvement";
import { addRankedGameAction, finishRankedBlockAction, setRankedBlockSizeAction, startRankedBlockAction } from "@/server/actions/ranked";
import type { RankedBlockView, RankedGameView } from "@/server/ranked/repository";
import { toast } from "@/components/ui/toast";
import { Badge } from "@/components/ui/badge";
import { ChampionPortrait } from "@/components/champion-portrait";
import { cn } from "@/lib/cn";
import { Button, buttonClass } from "@/components/ui/button";
import { segmentClass, segmentedGroupClass } from "@/components/ui/segmented";
import { DeleteBlockButton } from "./delete-block";
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
  /** The label the next block will have ("BLOCK 004"), shown before it starts. */
  nextLabel: string;
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

/**
 * Wins and losses in order, one mark per game. With no target nothing more is drawn (no empty
 * slot hinting at a limit); with a target the player chose, its remaining slots are shown.
 */
function ProgressStrip({ block, games, lookups }: { block: RankedBlockView; games: RankedGameView[]; lookups: JournalLookups }) {
  const planned = block.plannedGames;
  const slots = Math.max(planned !== null && planned <= 40 ? planned : 0, games.length);
  if (slots === 0)
    return (
      <p className="rounded-panel border border-dashed border-border px-3 py-4 text-center text-sm text-fg-muted" data-testid="block-slots" data-empty="true">
        No games yet. Add your first game below, or import it from Match History.
      </p>
    );
  const big = slots > 10;
  return (
    <ol className={cn("grid gap-1.5", big ? "grid-cols-[repeat(auto-fill,minmax(2.25rem,1fr))]" : "grid-cols-5 sm:grid-cols-10")} aria-label={blockProgressText(games.length, planned)} data-testid="block-slots">
      {Array.from({ length: slots }, (_, i) => {
        const g = games[i];
        const champion = g ? (lookups.championsById[g.championId] ?? { id: g.championId, name: g.championId, portraitUrl: "" }) : null;
        const extra = planned !== null && i >= planned;
        const next = planned !== null && i === games.length;
        return (
          <li
            key={i}
            title={g ? `Game ${i + 1}: ${champion!.name}, ${g.result === "win" ? "win" : "loss"}${extra ? " (past the target)" : ""}` : next ? `Game ${i + 1}: next` : `Game ${i + 1}`}
            className={cn(
              "flex aspect-square flex-col items-center justify-center gap-0.5 rounded-lg border text-[11px]",
              g ? (g.result === "win" ? "border-blue/50 bg-blue/10" : "border-red/50 bg-red/10") : next ? "border-dashed border-accent/60 text-accent" : "border-dashed border-border text-fg-subtle",
              g && extra && "ring-1 ring-accent/50",
            )}
            data-next={next || undefined}
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

/** Set, change or clear a block's target: any number, or none. */
function TargetEditor({ block, onDone }: { block: RankedBlockView; onDone: () => void }) {
  const { busy, run } = useRun();
  const [size, setSize] = React.useState(block.plannedGames === null ? "" : String(block.plannedGames));
  const t = size === "" ? null : targetOf(size);
  return (
    <form
      className="rise-in flex flex-wrap items-end gap-2 rounded-panel border border-dashed border-border p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (t !== null) void run(() => setRankedBlockSizeAction(block.id, t), onDone);
      }}
    >
      <div>
        <label htmlFor="resize-block" className="mb-1.5 block text-xs font-medium text-fg-muted">
          Target for {block.label} (optional; logged games always stay)
        </label>
        <BlockSizeInput id="resize-block" value={size} onChange={setSize} allowOpen />
      </div>
      <Button type="submit" size="sm" variant="primary" disabled={busy || t === null} data-testid="save-target">
        Save target
      </Button>
      {size && t === null ? <p className="w-full text-xs text-warn">Choose between {MIN_BLOCK_SIZE} and {MAX_BLOCK_SIZE} games, or No target.</p> : null}
    </form>
  );
}

/** The two ways a block can end, chosen when it starts. */
function RulePicker({ rule, onChange }: { rule: CompletionRule; onChange: (r: CompletionRule) => void }) {
  return (
    <div role="radiogroup" aria-label="How this block ends" className={segmentedGroupClass()} data-testid="block-rule">
      {COMPLETION_RULES.map((r) => (
        <button key={r} type="button" role="radio" aria-checked={rule === r} onClick={() => onChange(r)} className={segmentClass(rule === r)} data-testid={`block-rule-${r}`}>
          {completionRuleLabel(r)}
        </button>
      ))}
    </div>
  );
}

const RULE_HELP: Record<CompletionRule, string> = {
  target: "Play as many games as you like; a target is optional and you finish the block yourself.",
  "two-losses": "The block ends by itself on its second loss (in total, not in a row). You can still finish it earlier.",
};

/** Two marks that fill as losses come in, for a block under the two-loss limit. */
function LossMarks({ losses }: { losses: number }) {
  return (
    <span className="inline-flex items-center gap-1" role="img" aria-label={`${Math.min(losses, LOSS_LIMIT)} of ${LOSS_LIMIT} losses`} data-testid="loss-marks">
      {Array.from({ length: LOSS_LIMIT }, (_, i) => (
        <span key={i} className={cn("h-2.5 w-2.5 rounded-full border", i < losses ? "border-red bg-red" : "border-border-strong")} />
      ))}
    </span>
  );
}

/**
 * The block in progress, as the top of the journal: its label and rule, the focus it is played
 * with, wins and losses, its games as a strip, and the next action. With no block running: the
 * last block's result and Start, with the choice of how the new block ends. Adding a game starts
 * a block too (with the same rule as the one before).
 */
export function CurrentBlockPanel({ active, lastBlock, nextLabel, lookups }: CurrentBlockPanelProps) {
  const { busy, run } = useRun();
  const [finishing, setFinishing] = React.useState(false);
  const [resizing, setResizing] = React.useState(false);
  const [rule, setRule] = React.useState<CompletionRule>(lastBlock?.completionRule ?? "target");
  const [size, setSize] = React.useState("open");
  const block = active?.block ?? null;
  const games = active?.games ?? [];

  if (!block) {
    const t = targetOf(size);
    return (
      <Panel className="scroll-mt-20" data-testid="start-block">
        <PanelHeader
          title={`${nextLabel} · not started`}
          subtitle={
            lastBlock
              ? `${lastBlock.label}: ${blockStatusText(lastBlock)} · ${blockProgressText(lastBlock.games, lastBlock.plannedGames)} · ${lastBlock.wins}W ${lastBlock.losses}L.`
              : "A block is a run of Solo/Duo games you review together. Choose how it ends, then log your games."
          }
        />
        <PanelBody className="space-y-3 text-sm">
          <div className="space-y-2">
            <p className="text-xs font-medium text-fg-muted">How this block ends</p>
            <RulePicker rule={rule} onChange={setRule} />
            <p className="text-xs text-fg-muted" data-testid="block-rule-help">
              {RULE_HELP[rule]}
            </p>
          </div>
          {rule === "target" ? (
            <div className="space-y-1.5">
              <label htmlFor="start-target" className="block text-xs font-medium text-fg-muted">
                Game target (optional)
              </label>
              <BlockSizeInput id="start-target" value={size} onChange={setSize} allowOpen />
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" disabled={busy || (rule === "target" && t === null)} onClick={() => void run(() => startRankedBlockAction(rule === "target" ? t : null, rule))} data-testid="start-block-submit">
              <Play className="h-4 w-4" /> Start block
            </Button>
            <span className="text-xs text-fg-muted">Logging a game also starts it.</span>
            {lastBlock ? (
              <Link href={`/overview/blocks/${lastBlock.id}`} className="text-xs text-accent hover:underline">
                Review {lastBlock.label}
              </Link>
            ) : null}
          </div>
        </PanelBody>
      </Panel>
    );
  }

  const wins = games.filter((g) => g.result === "win").length;
  const losses = games.length - wins;
  const twoLoss = block.completionRule === "two-losses";
  const reached = !twoLoss && targetReached(games.length, block.plannedGames);
  const featured = block.featuredChampionId ? (lookups.championsById[block.featuredChampionId] ?? { id: block.featuredChampionId, name: block.featuredChampionId, portraitUrl: "" }) : null;
  return (
    <Panel className="scroll-mt-20 overflow-hidden" data-testid="current-block">
      <div className="border-b border-border bg-gradient-to-r from-accent/10 via-transparent to-transparent px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-accent">Current block</p>
            <h2 className="flex flex-wrap items-center gap-2 text-xl font-semibold tracking-tight text-fg">
              {block.label} <Badge tone="accent">In progress</Badge>
            </h2>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-fg-muted" data-testid="block-rule-summary">
              <span className="inline-flex items-center gap-1.5">
                {twoLoss ? <ShieldAlert className="h-3.5 w-3.5 text-accent" aria-hidden /> : <Target className="h-3.5 w-3.5 text-accent" aria-hidden />}
                {twoLoss ? "Ends on the 2nd loss" : block.plannedGames === null ? "No target · you finish it" : `Target ${block.plannedGames} games`}
              </span>
              {twoLoss ? <LossMarks losses={losses} /> : null}
              <span data-testid="block-progress">· {blockProgressText(games.length, block.plannedGames)}</span>
            </p>
          </div>
          <div className="flex items-end gap-4 tabular-nums" aria-label={`${wins} wins, ${losses} losses`}>
            <span className="text-center leading-none">
              <span className="block text-2xl font-bold text-blue">{wins}</span>
              <span className="text-[11px] uppercase tracking-wide text-fg-subtle">Wins</span>
            </span>
            <span className="text-center leading-none">
              <span className="block text-2xl font-bold text-red">{losses}</span>
              <span className="text-[11px] uppercase tracking-wide text-fg-subtle">Losses</span>
            </span>
          </div>
        </div>
        {block.focus || featured ? (
          <p className="mt-2 flex flex-wrap items-center gap-2 text-sm" data-testid="block-focus">
            {featured ? <ChampionPortrait champion={featured} size="xs" /> : null}
            <span className="min-w-0 text-fg">
              <span className="text-fg-muted">Focus: </span>
              {block.focus || `${featured!.name}`}
            </span>
            <a href="#ranked-focus" className="text-xs text-accent hover:underline">
              Edit focus
            </a>
          </p>
        ) : null}
      </div>
      <ConfirmDialog
        open={finishing}
        tone="primary"
        title={`Finish ${block.label}?`}
        description={`It ends at ${games.length} game${games.length === 1 ? "" : "s"} (${wins}W ${losses}L)${!twoLoss && block.plannedGames !== null && games.length < block.plannedGames ? `, before its target of ${block.plannedGames}, and is kept as finished early` : ""}. Every game and note stays in Block history.`}
        confirmLabel="Finish block"
        busy={busy}
        onCancel={() => setFinishing(false)}
        onConfirm={() => run(() => finishRankedBlockAction(block.id), () => setFinishing(false))}
      />
      <PanelBody className="space-y-3">
        {resizing && !twoLoss ? <TargetEditor block={block} onDone={() => setResizing(false)} /> : null}
        {reached ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-panel border border-accent/40 bg-accent/10 px-3 py-2 text-sm" data-testid="target-reached">
            <span>
              <strong className="font-semibold">Target reached.</strong> Finish the block, or keep playing: new games still go into {block.label}.
            </span>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => setRankedBlockSizeAction(block.id, Math.max(games.length, block.plannedGames ?? 0) + 3))} data-testid="extend-block">
              <Plus className="h-4 w-4" /> 3 more
            </Button>
          </div>
        ) : null}
        {twoLoss && losses === LOSS_LIMIT - 1 ? (
          <p className="rounded-panel border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-fg" data-testid="last-life">
            One loss so far: the next loss completes {block.label}.
          </p>
        ) : null}
        <ProgressStrip block={block} games={games} lookups={lookups} />
        {/* The next action first; the rest of the block's controls beside it. */}
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <Link href="/overview/blocks?add=1#add-game" className={buttonClass("primary", "sm")} data-testid="log-next-game">
            <Plus className="h-4 w-4" /> Log the next game
          </Link>
          {!twoLoss ? (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setResizing((r) => !r)} aria-expanded={resizing} data-testid="change-size">
              <Target className="h-4 w-4" /> {block.plannedGames === null ? "Set a target" : `Target ${block.plannedGames}`}
            </Button>
          ) : null}
          <Button size="sm" variant={reached ? "primary" : "outline"} disabled={busy || games.length === 0} onClick={() => setFinishing(true)} data-testid="finish-early">
            <Flag className="h-4 w-4" /> Finish block
          </Button>
          <span className="ml-auto">
            <DeleteBlockButton block={{ id: block.id, label: block.label, games: games.length }} />
          </span>
        </div>
      </PanelBody>
    </Panel>
  );
}

/**
 * Logged games: the games of the block in progress, newest first, a page at a time, so a long block
 * never pushes the page down.
 */
export function BlockGamesPanel({ active, lookups }: { active: { block: RankedBlockView; games: RankedGameView[] } | null; lookups: JournalLookups }) {
  const [page, setPage] = React.useState(0);
  const games = active?.games ?? [];
  const newestFirst = games.map((g, i) => ({ g, n: i + 1 })).reverse();
  const pages = Math.max(1, Math.ceil(newestFirst.length / GAMES_PER_PAGE));
  const current = Math.min(page, pages - 1);
  const shown = newestFirst.slice(current * GAMES_PER_PAGE, (current + 1) * GAMES_PER_PAGE);
  return (
    <section className="space-y-2" aria-labelledby="block-games-title" data-testid="block-games">
      <div className="flex min-h-9 items-center justify-between gap-2">
        <h2 id="block-games-title" className="text-base font-semibold text-fg">
          Logged games{active ? <span className="hidden font-normal text-fg-muted sm:inline"> · {active.block.label}</span> : null}
        </h2>
        {pages > 1 ? (
          <span className="flex shrink-0 items-center gap-1 whitespace-nowrap text-xs text-fg-subtle" data-testid="block-games-pages">
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
      <GameList games={shown.map((x) => x.g)} numbers={shown.map((x) => x.n)} lookups={lookups} emptyText={active ? "No games in this block yet: log one from Quick Add." : "No block in progress. Your next logged game starts one."} />
    </section>
  );
}

/**
 * Quick Add: the recent Riot games (one tap each, passed in) and manual entry, beside the block so
 * logging the next game never needs scrolling. With no block in progress, the game starts one.
 */
export function AddGamePanel({ blockLabel, nextLabel, lookups, startAdding = false, recent }: { blockLabel: string | null; nextLabel: string; lookups: JournalLookups; startAdding?: boolean; recent: React.ReactNode }) {
  const router = useRouter();
  // "Add game" on My Profile links here with ?add=1: the form is open straight away.
  const [adding, setAdding] = React.useState(startAdding);
  const target = blockLabel ?? nextLabel;
  return (
    <Panel id="add-game" className="scroll-mt-20" data-testid="add-game">
      <PanelHeader
        title="Quick add"
        subtitle={blockLabel ? `Goes into ${blockLabel}.` : `Starts ${nextLabel}.`}
        actions={
          !adding ? (
            <Button size="sm" variant="outline" onClick={() => setAdding(true)} data-testid="add-manually">
              <Pencil className="h-4 w-4" /> Add manually
            </Button>
          ) : null
        }
      />
      <PanelBody className="space-y-4">
        {adding ? (
          <div className="rounded-md border border-accent/40 bg-bg-elevated p-3">
            <div className="mb-2 text-xs font-medium text-fg-muted">New game in {target}</div>
            <GameForm
              lookups={lookups}
              submitLabel="Save game"
              autoFocus
              onCancel={() => setAdding(false)}
              onSubmit={async (values) => {
                const res = await addRankedGameAction(toActionInput(values));
                if (!res.ok) return res.error;
                setAdding(false);
                if (res.data.limitReached) toast.success(`Saved: ${res.data.block.label} is complete`, { description: `Two losses: the two-loss limit ended it at ${res.data.block.games} games (${res.data.block.wins}W ${res.data.block.losses}L). Your next game starts the next block.` });
                else if (res.data.targetReached) toast.success(`Saved: ${res.data.block.label} has reached its target`, { description: `${res.data.block.games} games (${res.data.block.wins}W ${res.data.block.losses}L). Finish it, or keep playing.` });
                else toast.success(`Saved to ${res.data.block.label}.`);
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
