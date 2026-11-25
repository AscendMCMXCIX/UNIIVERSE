import { formatOrdinal } from "@/lib/format";
import { cn } from "@/lib/cn";

/*
  A player's place in one game by performance score (domain/performance-score; docs/PERFORMANCE_SCORE.md),
  the one mark for it everywhere a place shows (the owner's requirements of 25 Nov 2026, §1): a
  collapsed Match History card, the opened game's header and its inspected player, every scoreboard
  row, and each member's row on Team → Matches.

  - MVP (the winning team's highest score): gold, the fixed rarity colour Branding never changes
    (globals.css --color-gold), on a gold wash with a gold ring, in bold.
  - ACE (the losing team's highest): the same structure in the fixed violet (--color-violet).
  - Any other place ("2nd" … "10th"): restrained, the secondary text on a faint neutral wash, no ring.
  MVP and ACE replace the ordinal (an MVP is not always 1st: a stronger loser can be, as ACE); the
  ordinal stays in the accessible name ("MVP: highest score on the winning team, 1st of 10"). One
  shape at every size: a pill, the same height and minimum width for every word, so a column of
  them stays level whatever each says. No hooks and nothing from the server: it renders in the
  server-rendered Team Matches list and in the client's Match History alike.
*/

export interface Placement {
  /** 1 = the game's highest score (all scored players, both teams). */
  rank: number;
  /** How many players were scored (a removed player is not). */
  of: number;
  mvp: boolean;
  ace: boolean;
}

export type PlacementKind = "mvp" | "ace" | "place";

/** row: a scoreboard row or a member's row; card: a collapsed card; header: the opened game's header and its inspected player. */
export type PlacementSize = "row" | "card" | "header";

export function placementKind(p: Pick<Placement, "mvp" | "ace">): PlacementKind {
  return p.mvp ? "mvp" : p.ace ? "ace" : "place";
}

/** What the pill says: "MVP", "ACE" or the place ("3rd"). */
export function placementWord(p: Pick<Placement, "rank" | "mvp" | "ace">): string {
  return p.mvp ? "MVP" : p.ace ? "ACE" : formatOrdinal(p.rank);
}

/** Its words for a screen reader: "MVP: highest score on the winning team, 1st of 10", "ACE: highest score on the losing team, 2nd of 10" or "3rd of 10". */
export function placementWords(p: Placement): string {
  const place = `${formatOrdinal(p.rank)} of ${p.of}`;
  return p.mvp ? `MVP: highest score on the winning team, ${place}` : p.ace ? `ACE: highest score on the losing team, ${place}` : place;
}

/** The three looks (exported for the tests that read them). */
export const PLACEMENT_TONE: Record<PlacementKind, string> = {
  mvp: "bg-gold/15 font-bold text-gold ring-1 ring-inset ring-gold/45",
  ace: "bg-violet/15 font-bold text-violet ring-1 ring-inset ring-violet/45",
  place: "bg-fg/8 font-semibold text-fg-muted",
};

const SIZE: Record<PlacementSize, string> = {
  row: "h-4 min-w-8 px-1 text-2xs",
  card: "h-5 min-w-10 px-1.5 text-2xs",
  header: "h-5 min-w-10 px-1.5 text-xs",
};

/**
 * The pill. `spoken` (the default) gives it its own accessible name; where the words around it
 * already say the place (a card's score mark, a scoreboard row's sentence), `spoken={false}` hides
 * it from screen readers so the place is not read twice.
 */
export function PlacementBadge({ placement, size = "card", spoken = true, className, testId = "placement-badge" }: { placement: Placement; size?: PlacementSize; spoken?: boolean; className?: string; testId?: string }) {
  const kind = placementKind(placement);
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full leading-none tabular-nums", SIZE[size], PLACEMENT_TONE[kind], className)}
      aria-hidden={spoken ? undefined : true}
      data-testid={testId}
      data-placement={kind}
      data-rank={placement.rank}
      data-of={placement.of}
    >
      {spoken ? (
        <>
          <span aria-hidden>{placementWord(placement)}</span>
          <span className="sr-only">{placementWords(placement)}</span>
        </>
      ) : (
        placementWord(placement)
      )}
    </span>
  );
}
