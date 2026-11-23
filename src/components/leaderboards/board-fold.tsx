"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { usePhoneFold } from "@/components/ui/phone-fold";
import { cn } from "@/lib/cn";
import { showAllClass, type OverviewMore } from "./overview";

/*
  A Leaderboards board's overview (Release 16, docs/TEAM_LEADERBOARDS.md → Layout): on the desktop's
  one-screen board the multikills and the milestones show their first rows (as many as the window's
  height holds: overview.ts), and the rest is one press away behind "Show all 9 · 6 more" at the end
  of the board's title row (a footer row of its own cost the one-screen board 30px a board), which
  opens the board in place (the profile pool's Show all, FOLDED). Never hidden
  without the button saying how many: the button is drawn exactly where rows are folded. Phones and
  tablets (one column) show every row and no button. The section is the fold's group; its open state
  is kept on the history entry (usePhoneFold), so Back to the page reopens what was open.
*/

const FoldContext = React.createContext<{ open: boolean; toggle: () => void } | null>(null);

/** The board's section, and its fold's group (data-fold): server-rendered rows inside fold by their own classes (overview.ts). */
export function BoardFoldSection({ foldKey, className, children, ...props }: React.ComponentProps<"section"> & { foldKey: string }) {
  const fold = usePhoneFold(foldKey);
  const value = React.useMemo(() => ({ open: fold.open, toggle: fold.toggle }), [fold.open, fold.toggle]);
  return (
    <FoldContext.Provider value={value}>
      <section {...props} data-fold={fold.groupProps["data-fold"]} className={cn(fold.groupProps.className, className)}>
        {children}
      </section>
    </FoldContext.Provider>
  );
}

/**
 * The board's Show all, at its title row's end (BoardTitle's `end`): "Show all 9 · 6 more" (the count
 * folded at this window's height), or "Show fewer" once open. Its words are its name, with what it opens for screen readers ("of the multikill
 * ranking").
 */
export function BoardShowAll({ total, more, label, controls, testId }: { total: number; /** How many rows fold in a short window and in a tall one. */ more: OverviewMore; /** What it opens, for screen readers: "the multikill ranking". */ label: string; /** The id of the list it opens. */ controls?: string; testId?: string }) {
  const fold = React.useContext(FoldContext);
  const open = fold?.open ?? false;
  return (
    <span className={cn(showAllClass(more), "items-center")} data-testid={testId}>
      <button
        type="button"
        onClick={fold?.toggle}
        aria-expanded={open}
        aria-controls={controls}
        className="touch-target inline-flex min-h-7 items-center gap-1 rounded-md px-1.5 text-xs font-medium text-fg-muted transition-colors hover:text-accent focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:min-h-11"
        data-testid={testId ? `${testId}-button` : undefined}
      >
        {open ? (
          "Show fewer"
        ) : (
          <>
            Show all {total}
            <span aria-hidden>&nbsp;·&nbsp;</span>
            <span className="sr-only">, </span>
            {/* The count folded at this window's height (overview.ts): one of the two shows. */}
            <span className="board-tall:hidden" data-testid={testId ? `${testId}-more-short` : undefined}>
              {more.short} more
            </span>
            <span className="board-short:hidden" data-testid={testId ? `${testId}-more-tall` : undefined}>
              {more.tall} more
            </span>
          </>
        )}
        <span className="sr-only"> of {label}</span>
        <ChevronDown aria-hidden className={cn("size-3.5 transition-transform duration-150 motion-reduce:transition-none", open && "rotate-180")} />
      </button>
    </span>
  );
}
