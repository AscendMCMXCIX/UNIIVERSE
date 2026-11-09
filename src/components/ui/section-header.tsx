import * as React from "react";
import { cn } from "@/lib/cn";

/*
  The heading of a page's section of Riot data (a profile's Season performance, All Champions,
  Match History and its Encounters): the title (and what belongs beside it), the line saying what is
  counted with the data status at the end of its text (DataStatusNote), and one toolbar: the filters, then
  Refresh at its end (RefreshButton). Refresh never takes a row of its own, and it is in the same
  place on every section:
    phones   the title, the scope line, then the toolbar: the folded filters and Refresh on one row;
    tablets  the same, with the filters inline (game mode, Refine) and Refresh after them;
    wide     the toolbar beside the title, at the right edge; the scope line under the title.
  A section with views of equal weight (Match History: Games and Encounters) shows their secondary
  tabs (`nav`, ui/sub-tabs) in the title's place: the title stays the section's heading for screen
  readers, and is not repeated on screen under the primary tab that already names it.
*/
export function SectionHeader({ id, title, nav, aside, description, status, statusAfterText = false, controls, refresh, className, testId }: {
  /** The heading's id, for the section's aria-labelledby. */
  id: string;
  title: React.ReactNode;
  /** The section's views (SubTabs), shown in the title's place; the title is then read by screen readers only. */
  nav?: React.ReactNode;
  /** Beside the title. */
  aside?: React.ReactNode;
  /** The line under the title: what the figures count. */
  description?: React.ReactNode;
  /** How current the data is (DataStatusNote), beside the scope line. */
  status?: React.ReactNode;
  /** The status in the scope's text flow, after its last word, for a plain `<p>` scope (a scope with
   * a layout of its own, as Encounters' on phones, keeps the status beside it). */
  statusAfterText?: boolean;
  /** The filter bar. */
  controls?: React.ReactNode;
  /** The section's Refresh (RefreshButton), at the end of the toolbar. */
  refresh?: React.ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <div className={cn("grid grid-cols-[minmax(0,1fr)] gap-y-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start xl:gap-x-6", className)} data-testid={testId}>
      <div className="min-w-0 xl:pt-0.5">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
          <h2 id={id} className={nav ? "sr-only" : "min-w-0 text-xl font-semibold tracking-tight text-fg"}>
            {title}
          </h2>
          {nav}
          {aside}
        </div>
        {description || status ? (
          statusAfterText ? (
            // The data status at the end of the scope's text, in its flow (on a phone a long scope
            // used to leave the status's ⓘ alone on a line of its own).
            <div className="mt-1 min-w-0 [&>p]:inline" data-testid="section-scope">
              {description}
              {status ? (
                <>
                  {" "}
                  <span className="ml-1 inline-flex max-w-full align-middle">{status}</span>
                </>
              ) : null}
            </div>
          ) : (
            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
              {description}
              {status}
            </div>
          )
        ) : null}
      </div>
      {controls || refresh ? (
        // The toolbar: the filters take the room there is (on phones their folded button fills the
        // row beside Refresh); from xl it sits at the title's right, as wide as what it holds.
        <div className="flex min-w-0 items-start gap-2 xl:justify-end" data-testid="section-toolbar">
          {controls ? <div className="min-w-0 flex-1 xl:flex-none">{controls}</div> : null}
          {refresh}
        </div>
      ) : null}
    </div>
  );
}
