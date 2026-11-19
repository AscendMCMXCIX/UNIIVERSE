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
  readers, and is not repeated on screen under the primary tab that already names it. A section
  whose title only repeats that tab (All Champions) can leave it to screen readers on a phone held
  either way (`titleOnPhones="tab"`: below sm and in a short window, where the current tab, in the
  top bar or right above the section, says it).
  `toolbarBesideNav` (Match History, owner decision D8 of 8 Nov 2026): the toolbar shares the views'
  row at every width whenever it fits beside them (a phone's views, Filters and Refresh on one row),
  the scope line under both; a toolbar too wide for the row (a tablet's several selects) takes the
  next row, and so do filters whose chips need the room (`toolbarFills`).
*/
export function SectionHeader({ id, title, titleOnPhones = "shown", nav, aside, description, status, statusAfterText = false, controls, refresh, toolbarBesideNav = false, toolbarFills, toolbarBesideScope = false, className, testId }: {
  /** The heading's id, for the section's aria-labelledby. */
  id: string;
  title: React.ReactNode;
  /** "tab": on phones (below sm, and in a short window) the title is read by screen readers only; the current tab names the section. */
  titleOnPhones?: "shown" | "tab";
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
  /** The toolbar on the views' row whenever it fits there, at every width (see above). */
  toolbarBesideNav?: boolean;
  /**
   * Beside the views, filters with chips fill the toolbar from its start: `true` for a phone's
   * narrowed filters, whose chips sit beside Filters (the toolbar takes the next row when they do not
   * fit beside the views); "below-xl" for active refinements, whose chips a tablet shows under the
   * bar: below xl the toolbar then always takes a row of its own, so they start at the row's start,
   * clear of the Refine panel that opens from the right. From xl it stays beside the views.
   */
  toolbarFills?: boolean | "below-xl";
  /** Phones (below sm): the folded Filters and Refresh at the scope line's end, never a row of their own (the phone header budget, docs/MOBILE.md). */
  toolbarBesideScope?: boolean;
  className?: string;
  testId?: string;
}) {
  const heading = (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
      <h2 id={id} className={nav ? "sr-only" : cn("min-w-0 text-xl font-semibold tracking-tight text-fg", titleOnPhones === "tab" && "max-sm:sr-only short:sr-only")}>
        {title}
      </h2>
      {nav}
      {aside}
    </div>
  );
  // The scope line: under the title; beside the views, a line of its own after the toolbar.
  const scopeAt = toolbarBesideNav ? "basis-full" : "mt-1";
  const scope =
    description || status ? (
      statusAfterText ? (
        // The data status at the end of the scope's text, in its flow (on a phone a long scope
        // used to leave the status's ⓘ alone on a line of its own).
        <div className={cn(scopeAt, "min-w-0 text-sm leading-5 [&>p]:inline")} data-testid="section-scope">
          {description}
          {status ? (
            <>
              {" "}
              <span className="ml-1 inline-flex max-w-full align-middle">{status}</span>
            </>
          ) : null}
        </div>
      ) : (
        <div className={cn(scopeAt, "flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1")}>
          {description}
          {status}
        </div>
      )
    ) : null;
  const toolbar =
    controls || refresh ? (
      // The toolbar: the filters take the room there is (on phones their folded button fills the
      // row beside Refresh); from xl it sits at the title's right, as wide as what it holds.
      // Beside the views it asks for the width its content needs, at the row's end, and takes the
      // next row when that does not fit (flex-wrap breaks a line before shrinking anything); there
      // its filters shrink to what Refresh leaves, so the chips of a phone's narrowed filters scroll.
      <div className={cn("flex min-w-0 items-start gap-2", toolbarBesideNav ? cn("flex-auto justify-end", toolbarFills === "below-xl" && "basis-full xl:basis-auto") : "xl:justify-end")} data-testid="section-toolbar">
        {controls ? <div className={cn("min-w-0", toolbarBesideNav ? (toolbarFills ? "flex-1" : "flex-initial") : "flex-1 xl:flex-none")}>{controls}</div> : null}
        {refresh}
      </div>
    ) : null;
  if (toolbarBesideNav)
    // Beside the views: one wrapping row whose items come in the order they are drawn and read: the
    // views, the toolbar (at the row's end, growing into what the views leave, or the next line),
    // then the scope line on a line of its own.
    return (
      <div className={cn("flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1", className)} data-testid={testId}>
        {heading}
        {toolbar}
        {scope}
      </div>
    );
  return (
    <div className={cn("grid grid-cols-[minmax(0,1fr)] gap-y-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start xl:gap-x-6", toolbarBesideScope && "max-sm:grid-cols-[minmax(0,1fr)_auto] max-sm:items-center max-sm:gap-x-2 max-sm:gap-y-1 max-sm:[&>[data-testid=section-toolbar]]:col-start-2 max-sm:[&>[data-testid=section-toolbar]]:row-start-2", className)} data-testid={testId}>
      <div className={cn("min-w-0 xl:pt-0.5", toolbarBesideScope && "max-sm:contents max-sm:[&>[data-testid=section-scope]]:mt-0 max-sm:[&>:first-child]:col-span-2")}>
        {heading}
        {scope}
      </div>
      {toolbar}
    </div>
  );
}
