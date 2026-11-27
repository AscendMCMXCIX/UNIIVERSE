import type { ReactNode } from "react";
import { ROW_PAD_X } from "@/components/ui/data-list";
import { cn } from "@/lib/cn";

/**
 * A Leaderboards board's title row, the first row of its panel (DataList's `title`): its heading
 * (named for the section's aria-labelledby; h2, the page's sections), its icon on the heading's
 * first line however many lines a large text size gives it, what sits beside it (an ⓘ, the season's
 * choice), and one short line saying what the board counts: beside the heading where the row has
 * room for both (Release 16: a line of its own under every heading cost the one-screen board 18px a
 * board), else under it. Every board on the page has one, so the four read as one set: the same type,
 * padding and line. The heading, the note and what sits at the row's end share one baseline (Release
 * 19: the heading was centred on its row, and the notes beside it sat 8px above its baseline); the ⓘ
 * is centred on the heading's line.
 */
export function BoardTitle({ id, icon, aside, end, endClassName, note, noteTestId, noteClassName, children }: {
  id: string;
  icon?: ReactNode;
  /** Beside the heading (an ⓘ). */
  aside?: ReactNode;
  /** At the row's end where it fits, else under the heading (the records' season). */
  end?: ReactNode;
  /** The end's display where it shows at some widths only (its classes replace "flex"). */
  endClassName?: string;
  /** What the board counts, in a few words. */
  note?: ReactNode;
  noteTestId?: string;
  /** The note's own classes where it takes a line of its own at some widths only (they replace "basis-full" beside an end). */
  noteClassName?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 py-1.5", ROW_PAD_X)}>
      {/* The heading's baseline is its words' (the icon sits at its first line's middle, and takes no part in the row's baseline). */}
      <h2 id={id} className="flex min-w-0 items-start gap-1.5 text-base font-semibold text-fg [&>svg]:mt-[calc((1lh_-_1rem)/2)]">
        {icon}
        <span className="min-w-0 self-baseline">{children}</span>
      </h2>
      {aside ? <span className="flex self-center">{aside}</span> : null}
      {end ? <div className={cn("ml-auto min-w-0 max-sm:basis-full", endClassName ?? "flex")}>{end}</div> : null}
      {note ? (
        // Beside the heading where the whole line fits, else a line of its own under it (a flex item wraps whole, then its words).
        <p className={cn("min-w-0 text-xs text-fg-muted", end && (noteClassName ?? "basis-full"), !end && noteClassName)} data-testid={noteTestId}>
          {note}
        </p>
      ) : null}
    </div>
  );
}
