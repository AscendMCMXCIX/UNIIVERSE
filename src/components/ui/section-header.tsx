import * as React from "react";
import { cn } from "@/lib/cn";

/*
  The heading of a page's section of Riot data (a profile's Season performance, All Champions,
  Match History and its Encounters): the title (and what belongs beside it), the line saying what is
  counted, then the page's Refresh and data status (DataRefresh) under them on the left, and the
  filters on the right. One grid for all of them, so Refresh and the filters never trade places
  from one page to the next:
    phones   the title, Refresh, then the filter bar, one under another;
    tablets  the title, then Refresh and the filters on one row, at either end;
    wide     the filters beside the title, Refresh under the title.
*/
export function SectionHeader({ id, title, aside, description, status, controls, className, testId }: {
  /** The heading's id, for the section's aria-labelledby. */
  id: string;
  title: React.ReactNode;
  /** Beside the title (Match History's switch to Encounters). */
  aside?: React.ReactNode;
  /** The line under the title: what the figures count. */
  description?: React.ReactNode;
  /** The page's Refresh and data status (DataRefresh). */
  status?: React.ReactNode;
  /** The filter bar. */
  controls?: React.ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <div className={cn("grid grid-cols-[minmax(0,1fr)] gap-y-2.5 md:grid-cols-[auto_minmax(0,1fr)] md:items-start md:gap-x-4 xl:grid-cols-[minmax(0,1fr)_auto]", className)} data-testid={testId}>
      <div className="min-w-0 md:col-span-2 xl:col-span-1 xl:pt-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
          <h2 id={id} className="min-w-0 text-lg font-semibold text-fg">
            {title}
          </h2>
          {aside}
        </div>
        {description}
      </div>
      {/* As tall as the filters beside it on tablets, so the two sit on one line; on its own row
          under the title on wide screens, only as tall as what it holds (the ⓘ alone is small). */}
      {status ? <div className="flex min-w-0 items-center md:min-h-9 xl:row-start-2 xl:min-h-0">{status}</div> : null}
      {controls ? <div className="min-w-0 md:col-start-2 xl:row-span-2 xl:row-start-1">{controls}</div> : null}
    </div>
  );
}
