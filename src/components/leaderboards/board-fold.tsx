"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { usePhoneFold } from "@/components/ui/phone-fold";
import { cn } from "@/lib/cn";
import { FitStyle, useFit, wideBoard, type Fit } from "@/components/ui/fit-rows";
import { IN_TIER_TEXT, TIERS, showAllClass, type OverviewMore } from "./overview";

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

const FoldContext = React.createContext<{ open: boolean; toggle: () => void; fit: Fit | null } | null>(null);

/**
 * The board's section, and its fold's group (data-fold): server-rendered rows inside fold by their own
 * classes (overview.ts) while it is "closed". Once interactive, on a 59rem page, the closed board shows
 * as many rows as fit above the window's bottom (fit-rows.tsx: "fit", never fewer than the tiers), and
 * its Show all says how many more there are then.
 */
export function BoardFoldSection({ foldKey, className, children, ...props }: React.ComponentProps<"section"> & { foldKey: string }) {
  const fold = usePhoneFold(foldKey);
  const ref = React.useRef<HTMLElement>(null);
  const fit = useFit(ref, "data-fold", "closed", wideBoard, fold.open);
  const value = React.useMemo(() => ({ open: fold.open, toggle: fold.toggle, fit }), [fold.open, fold.toggle, fit]);
  const mode = fold.open ? "open" : fit ? "fit" : "closed";
  return (
    <FoldContext.Provider value={value}>
      <section {...props} ref={ref} data-fold={mode} className={cn(fold.groupProps.className, className)}>
        {fit && !fold.open && props.id ? <FitStyle selector={`#${props.id}[data-fold="fit"]`} fit={fit} /> : null}
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
  const fit = fold?.fit ?? null;
  // Measured (a 59rem page, interactive): drawn where rows stay hidden, with their count; else by the CSS tiers.
  const display = fit ? (open || fit.more > 0 ? "flex" : "hidden") : showAllClass(more);
  return (
    <span className={cn(display, "items-center")} data-testid={testId}>
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
            {/* The count folded: the fitted one once measured; until then the window height's (overview.ts), one of the four shows. */}
            {fit ? (
              <span data-testid={testId ? `${testId}-more-fit` : undefined}>{fit.more} more</span>
            ) : (
              TIERS.map((t) => (
                <span key={t} className={IN_TIER_TEXT[t]} data-testid={testId ? `${testId}-more-${t}` : undefined}>
                  {more[t]} more
                </span>
              ))
            )}
          </>
        )}
        <span className="sr-only"> of {label}</span>
        <ChevronDown aria-hidden className={cn("size-3.5 transition-transform duration-150 motion-reduce:transition-none", open && "rotate-180")} />
      </button>
    </span>
  );
}
