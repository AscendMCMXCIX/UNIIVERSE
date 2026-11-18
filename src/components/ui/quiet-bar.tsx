import { cn } from "@/lib/cn";

/*
  A bar that is a figure itself, never decoration beside one (docs/STANDARDS.md, Tables and
  rankings): Recent form's record as 20 segments, one a game, wins first. It counts games, it does
  not order them: the segments say how many of the window's games were won, not when.

  Neutral on purpose: filled, empty and missing segments are overlays of the text colour (fg), never
  a state colour or the accent, so they keep their contrast on every surface (a hovered or pressed
  row, your own row's wash) and with any Branding, which moves the surface steps. Missing segments
  are the games a provisional window does not have yet (14 of 20 played: 6 missing), outlined.

  Variants:
    inline  a 6px bar in its cell;
    inset   a 2px line along the foot of the row it is a direct child of (absolutely positioned:
            the caller sets both grid lines, col-[3/-1], so its box is that grid area); missing
            games are no line at all;
    row     a DataList row's bar: the inset line on a board under 36rem, the inline bar from it.

  No motion on segments, so nothing on the page animates at first paint (sidebar-motion's settled()).
  Without `segments`, one continuous bar of a share from 0 to 1, which slides only when its value
  changes. No "use client", hooks or context: it renders in server and client trees alike.
*/

type Variant = "inline" | "inset" | "row";
type SegmentState = "filled" | "empty" | "missing";

const FRAME: Record<Variant, string> = {
  inline: "flex h-1.5 w-full min-w-0 gap-px overflow-hidden rounded-full",
  inset: "pointer-events-none absolute inset-x-0 bottom-0 flex h-0.5 gap-px",
  row: "pointer-events-none absolute inset-x-0 bottom-0 flex h-0.5 gap-px @min-[36rem]/list:static @min-[36rem]/list:h-1.5 @min-[36rem]/list:overflow-hidden @min-[36rem]/list:rounded-full",
};

/** A segmented bar's children: each takes an equal share of the frame, its full height. */
const SEGMENTS = "[&>*]:h-full [&>*]:min-w-0 [&>*]:flex-1";

/**
 * The segments' look by their data-state, set once on the frame (not repeated on 20 segments a row):
 * filled ≈7:1 on the surface inline (≈5.5:1 as the thinner inset line); empty a faint track; missing
 * outlined (inline) or absent (inset).
 */
const SEGMENT: Record<Variant, string> = {
  inline: "[&>[data-state=filled]]:bg-fg/65 [&>[data-state=empty]]:bg-fg/12 [&>[data-state=missing]]:ring-1 [&>[data-state=missing]]:ring-inset [&>[data-state=missing]]:ring-fg/25",
  inset: "[&>[data-state=filled]]:bg-fg/55 [&>[data-state=empty]]:bg-fg/15",
  row: "[&>[data-state=filled]]:bg-fg/55 @min-[36rem]/list:[&>[data-state=filled]]:bg-fg/65 [&>[data-state=empty]]:bg-fg/15 @min-[36rem]/list:[&>[data-state=empty]]:bg-fg/12 @min-[36rem]/list:[&>[data-state=missing]]:ring-1 @min-[36rem]/list:[&>[data-state=missing]]:ring-inset @min-[36rem]/list:[&>[data-state=missing]]:ring-fg/25",
};

const whole = (n: number | undefined, fallback: number) => (n !== undefined && Number.isFinite(n) ? Math.round(n) : fallback);

/** The segments' states, wins first: `known` clamped to 0…segments, `filled` to 0…known. */
export function barSegments(value: number, segments: number, known?: number): { filled: number; known: number; states: SegmentState[] } {
  const total = Math.max(0, whole(segments, 0));
  const k = Math.min(total, Math.max(0, whole(known, total)));
  const filled = Math.min(k, Math.max(0, whole(value, 0)));
  return { filled, known: k, states: Array.from({ length: total }, (_, i) => (i < filled ? "filled" : i < k ? "empty" : "missing")) };
}

export function QuietBar({
  value,
  segments,
  known,
  variant = "inline",
  className,
  testId,
}: {
  /** Segmented: the filled count (wins). Continuous: a share from 0 to 1. */
  value: number;
  /** 20 on Recent form; omitted for one continuous bar (a share, later All Champions' games). */
  segments?: number;
  /** Segments that exist (games played); the rest are missing. All of them by default. */
  known?: number;
  variant?: Variant;
  className?: string;
  testId?: string;
}) {
  if (segments === undefined) {
    const share = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
    return (
      <span aria-hidden data-testid={testId} data-value={share} className={cn(FRAME[variant], "bg-fg/12", className)}>
        <span className="h-full w-full origin-left bg-fg/65 transition-transform duration-200 ease-emphasized" style={{ transform: `scaleX(${share})` }} />
      </span>
    );
  }
  const bar = barSegments(value, segments, known);
  return (
    <span aria-hidden data-testid={testId} data-segments={bar.states.length} data-filled={bar.filled} data-known={bar.known} className={cn(FRAME[variant], SEGMENTS, SEGMENT[variant], className)}>
      {bar.states.map((state, i) => (
        <span key={i} data-state={state} />
      ))}
    </span>
  );
}
