import { ChampionPortrait, type PortraitChampion } from "@/components/champion-portrait";
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
export function MatchResult({ win, queue, when, duration, lineBelow, className }: { win: MatchOutcome; queue: string; when: string; duration: string | null; lineBelow?: keyof typeof LINE_BELOW; className?: string }) {
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
