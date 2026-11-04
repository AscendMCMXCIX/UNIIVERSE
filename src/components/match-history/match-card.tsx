import type * as React from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { ChampionPortrait, type PortraitChampion } from "@/components/champion-portrait";
import type { LpRecord } from "@/domain/lp-attribution";
import { formatDate, formatDateTime, formatLpChange } from "@/lib/format";
import type { Icon } from "@/server/players/match-history";
import { cn } from "@/lib/cn";
import { IconImg } from "./icon-img";

/*
  The match card system shared by a player's Match History and the Team Matches list: the same
  result colours, the same result column (queue, when, Victory / Defeat, length) and the same
  champion loadout, so a game reads the same wherever it appears. Each list keeps its own body:
  one player's figures and build, or the team members who played.
*/

/** A game's result: true won, false lost, null unknown (not stored). */
export type MatchOutcome = boolean | null;

const TONES = {
  win: { word: "Victory", text: "text-blue", rail: "bg-blue", card: "border-border bg-gradient-to-r from-blue/[0.08] via-surface to-surface", hover: "hover:border-blue/50" },
  loss: { word: "Defeat", text: "text-red", rail: "bg-red", card: "border-border bg-gradient-to-r from-red/[0.08] via-surface to-surface", hover: "hover:border-red/50" },
  none: { word: "No result", text: "text-fg-muted", rail: "bg-border-strong", card: "border-border bg-surface", hover: "hover:border-border-strong" },
} as const;

export function matchTone(win: MatchOutcome) {
  return win === true ? TONES.win : win === false ? TONES.loss : TONES.none;
}

/** The card's outer surface: a result-coloured rail on the left and a faint wash of the same colour. */
export function matchCardClass(win: MatchOutcome, { interactive = false }: { interactive?: boolean } = {}) {
  const t = matchTone(win);
  return cn("relative isolate overflow-hidden rounded-panel border pl-1.5", t.card, interactive && cn("transition-colors", t.hover));
}

export function MatchRail({ win }: { win: MatchOutcome }) {
  return <span className={cn("absolute inset-y-0 left-0 w-1.5", matchTone(win).rail)} aria-hidden />;
}

/** Below this width the result column lies down as one line. */
const LINE_BELOW = {
  sm: { wrap: "max-sm:flex-row max-sm:flex-wrap max-sm:items-baseline max-sm:gap-x-2" },
  md: { wrap: "max-md:flex-row max-md:flex-wrap max-md:items-baseline max-md:gap-x-2" },
  lg: { wrap: "max-lg:flex-row max-lg:flex-wrap max-lg:items-baseline max-lg:gap-x-2" },
} as const;

/**
 * The result, then the game: the column at the start of a wide card, read top down in order of
 * importance: Victory or Defeat (the largest, in the result's colour, the word saying it without the
 * colour) with the game's length, the queue in the secondary grey, and when in the quietest. With
 * `lineBelow`, narrower screens show it as one line instead, in the same order.
 */
export function MatchResult({ win, queue, when, duration, lineBelow, extra, className }: { win: MatchOutcome; queue: string; when: string; duration: string | null; lineBelow?: keyof typeof LINE_BELOW; /** A last line, under when (a ranked game's LP change). */ extra?: React.ReactNode; className?: string }) {
  const t = matchTone(win);
  const line = lineBelow ? LINE_BELOW[lineBelow] : null;
  return (
    <span className={cn("flex min-w-0 flex-col leading-snug", line?.wrap, className)}>
      <span className="flex items-baseline gap-1.5">
        <span className={cn("text-base font-bold", t.text)}>{t.word}</span>
        {duration ? <span className="text-xs tabular-nums text-fg-subtle">{duration}</span> : null}
      </span>
      <span className="truncate text-xs font-medium text-fg-muted">{queue}</span>
      {/* "3h ago" is measured on the server first, then by the browser's own clock (useNow). */}
      <span className="truncate text-xs tabular-nums text-fg-subtle" suppressHydrationWarning>
        {when}
      </span>
      {extra ? <span className="mt-0.5 flex">{extra}</span> : null}
    </span>
  );
}

const reading = (r: { label: string; leaguePoints: number }) => `${r.label} ${r.leaguePoints} LP`;

/** What a ranked game's LP figure rests on, or why it has none: its hover text and the screen reader's words. */
export function lpNote(lp: LpRecord): string {
  if (lp.kind === "lp") return `Recorded: ${reading(lp.before)} before this game (read ${formatDateTime(lp.before.at)}) and ${reading(lp.after)} after it (read ${formatDateTime(lp.after.at)}).`;
  if (lp.kind === "promoted" || lp.kind === "demoted")
    return `${lp.kind === "promoted" ? "Promoted" : "Demoted"} to ${lp.after.label}: ${reading(lp.before)} before this game, ${reading(lp.after)} after it. A change of division has no single LP figure.`;
  switch (lp.reason) {
    case "remake":
      return "A remake: Riot does not count it in wins and losses. No LP recorded.";
    case "unknown-length":
      return "LP not recorded: this game's length is not stored, so it cannot be matched to Riot's count of games.";
    case "before-tracking":
      return lp.trackingSince ? `LP not recorded: UNIIVERSE started reading this account's rank in this queue on ${formatDate(lp.trackingSince)}.` : "LP not recorded: UNIIVERSE has not read this account's rank in this queue.";
    case "awaiting-reading":
      return "LP not recorded yet: the next reading of this account's rank will tell.";
    case "several-games":
      return `LP not recorded for this game: the rank readings around it span ${lp.games} games${lp.before && lp.after ? ` (${reading(lp.before)} to ${reading(lp.after)} across them)` : ""}, so no single game's change is known.`;
    case "readings-too-far":
      return "LP not recorded: no rank reading was close enough before and after this game to rule out another change between them.";
    case "series":
      return "A promotion series game: the series moved, not the LP.";
    case "season-reset":
      return "LP not recorded: a ranked reset falls between the readings around this game.";
    case "unranked":
      return "LP not recorded: the account was unranked in this queue (placements).";
    case "inconsistent":
      return "LP not recorded: Riot's count of games and the stored games do not agree around this game.";
  }
}

/** A ranked game's LP change for the card's label: "+24 LP", "promoted", or "LP not recorded". */
export function lpSpoken(lp: LpRecord): string {
  return lp.kind === "lp" ? formatLpChange(lp.delta) : lp.kind === "promoted" ? "promoted" : lp.kind === "demoted" ? "demoted" : "LP not recorded";
}

/**
 * A ranked game's LP change on its card: the figure the rank readings prove ("+24 LP" in the gain
 * colour, "−21 LP" in the loss colour), a promotion or demotion (a change of division has no single
 * figure), or a quiet dash where none is recorded. The hover text says what it rests on, or why
 * there is none; nothing is ever estimated.
 */
export function LpChange({ lp, className, dense = false }: { lp: LpRecord | null; className?: string; /** Inside a line of text: no taller than the line. */ dense?: boolean }) {
  if (!lp) return null;
  const leading = dense ? "leading-4" : "leading-5";
  const pill = cn("inline-flex items-center gap-0.5 whitespace-nowrap rounded px-1.5 text-xs font-semibold", leading);
  if (lp.kind === "lp") {
    const tone = lp.delta > 0 ? "bg-good/10 text-good" : lp.delta < 0 ? "bg-bad/10 text-bad" : "bg-surface-2 text-fg-muted";
    return (
      <span className={cn(pill, "tabular-nums", tone, className)} title={lpNote(lp)} data-testid="match-lp" data-lp={lp.delta}>
        {formatLpChange(lp.delta)}
      </span>
    );
  }
  if (lp.kind === "promoted" || lp.kind === "demoted") {
    const up = lp.kind === "promoted";
    const Icon = up ? ArrowUp : ArrowDown;
    return (
      <span className={cn(pill, up ? "bg-good/10 text-good" : "bg-bad/10 text-bad", className)} title={lpNote(lp)} data-testid="match-lp" data-lp={lp.kind}>
        <Icon className="h-3 w-3 shrink-0" aria-hidden />
        {up ? "Promoted" : "Demoted"}
      </span>
    );
  }
  return (
    <span className={cn("text-xs text-fg-subtle", leading, className)} title={lpNote(lp)} data-testid="match-lp" data-lp="none" data-reason={lp.reason}>
      <span aria-hidden>—</span>
      <span className="sr-only">LP not recorded</span>
    </span>
  );
}

/**
 * The champion as it was played: the portrait (with the level it ended on, when known) and the two
 * summoner spells and two rune trees beside it (empty slots when the details were not collected,
 * never guessed ones).
 */
export function ChampionLoadout({ champion, spells, keystone, secondary, level = null, size = "lg", icon = 22, className, portraitClassName, iconsClassName }: { champion: PortraitChampion; spells: Array<Icon | null> | null; keystone: Icon | null; secondary: Icon | null; /** The champion's level at the end of the game, on the portrait's corner. */ level?: number | null; size?: "md" | "lg"; icon?: number; className?: string; portraitClassName?: string; iconsClassName?: string }) {
  const two = spells?.length ? spells.slice(0, 2) : [null, null];
  return (
    <span className={cn("flex shrink-0 items-center gap-1", className)}>
      <span className="relative flex shrink-0">
        <ChampionPortrait champion={champion} size={size} className={portraitClassName} />
        {level !== null ? (
          <span className="absolute -bottom-1 -right-1 rounded bg-bg px-1 text-2xs font-semibold tabular-nums leading-4 text-fg-muted" title={`Level ${level}`} data-testid="champion-level">
            {level}
          </span>
        ) : null}
      </span>
      <span className={cn("grid grid-flow-col grid-rows-2 gap-0.5", iconsClassName)} aria-hidden>
        {two.map((s, i) => (
          <IconImg key={i} icon={s} size={icon} />
        ))}
        <IconImg icon={keystone} size={icon} rounded="rounded-full" />
        <IconImg icon={secondary} size={icon} rounded="rounded-full" className="p-0.5" />
      </span>
    </span>
  );
}
