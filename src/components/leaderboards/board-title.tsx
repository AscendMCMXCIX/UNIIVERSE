import type { ReactNode } from "react";
import { ROW_PAD_X } from "@/components/ui/data-list";
import { cn } from "@/lib/cn";

/**
 * A Leaderboards board's title row, the first row of its panel (DataList's `title`): its heading
 * (named for the section's aria-labelledby; h2, the page's sections), its icon on the heading's
 * first line however many lines a large text size gives it, what sits beside it (an ⓘ, the season's
 * choice), and one short line under it saying what the board counts. Every board on the page has
 * one, so the four read as one set: the same type, padding and line under them.
 */
export function BoardTitle({ id, icon, aside, end, note, noteTestId, children }: {
  id: string;
  icon?: ReactNode;
  /** Beside the heading (an ⓘ). */
  aside?: ReactNode;
  /** At the row's end where it fits, else under the heading (the records' season). */
  end?: ReactNode;
  /** What the board counts, in a few words. */
  note?: ReactNode;
  noteTestId?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-0.5 py-2", ROW_PAD_X)}>
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <h2 id={id} className="flex min-w-0 items-start gap-1.5 text-base font-semibold text-fg [&>svg]:mt-[calc((1lh_-_1rem)/2)]">
          {icon}
          <span className="min-w-0">{children}</span>
        </h2>
        {aside}
        {end ? <div className="ml-auto flex min-w-0 max-sm:basis-full">{end}</div> : null}
      </div>
      {note ? (
        <p className="text-xs text-fg-muted" data-testid={noteTestId}>
          {note}
        </p>
      ) : null}
    </div>
  );
}
