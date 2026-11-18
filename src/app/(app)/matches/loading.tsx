import { Skeleton } from "@/components/ui/skeleton";

/**
 * Team → Matches while the page loads, in its own shape rather than the app's generic panels: the
 * title and its scope line, the filter row with Bookmarked at its end (Filters and Bookmarked on a
 * phone), then game cards as the list draws them, by the list's own width (@container/tm, as
 * played-together.tsx): the result over the members on narrower lists, both teams under them from
 * md; from a 58rem list the result, the members, both teams and the bookmark side by side. The
 * members go two to a row from a 34rem column, as the cards do, so the list lands where its
 * skeleton was. The lists are hidden from screen readers (the status and its "Loading…" say it);
 * Team Insights, below this folder, has its own loading.tsx.
 */
const MEMBERS = [4, 3, 2, 2];

export default function Loading() {
  return (
    <div className="mx-auto max-w-[var(--content-max)] space-y-4" role="status" aria-live="polite" aria-label="Loading" data-testid="matches-skeleton">
      <div>
        <Skeleton className="h-8 w-32" />
        <Skeleton className="mt-1 h-5 w-[min(22rem,100%)]" />
      </div>
      <div className="flex min-w-0 items-center gap-2">
        <Skeleton className="h-11 w-28 md:w-48 md:pointer-fine:h-9" />
        <Skeleton className="hidden h-9 w-40 md:block pointer-coarse:h-11" />
        <Skeleton className="hidden h-9 w-28 md:block pointer-coarse:h-11" />
        <Skeleton className="ml-auto h-9 w-32 rounded-full pointer-coarse:h-11" />
      </div>
      <ol className="@container/tm space-y-2.5" aria-hidden="true">
        {MEMBERS.map((members, i) => (
          <li key={i} className="rounded-panel border border-border bg-surface pl-1.5">
            <div className="grid gap-x-3 gap-y-2.5 px-3 py-2.5 @min-[58rem]/tm:grid-cols-[8.5rem_minmax(0,1fr)_minmax(0,20rem)_auto] @min-[58rem]/tm:items-center @min-[58rem]/tm:py-3">
              <div className="space-y-1.5">
                <Skeleton className="h-5 w-56 max-w-full @min-[58rem]/tm:w-24" />
                <Skeleton className="hidden h-3 w-28 @min-[58rem]/tm:block" />
                <Skeleton className="hidden h-3 w-20 @min-[58rem]/tm:block" />
              </div>
              <div className="@container/members min-w-0">
                <ul className="grid gap-x-5 gap-y-1.5 @min-[34rem]/members:grid-cols-2">
                  {Array.from({ length: members }, (_, j) => (
                    <li key={j} className="flex min-w-0 items-center gap-2.5">
                      <Skeleton className="h-9 w-9 shrink-0" />
                      <span className="min-w-0 flex-1 space-y-1.5">
                        <Skeleton className="h-3.5 w-36 max-w-full" />
                        <Skeleton className="h-3 w-24 max-w-full" />
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="min-w-0 border-t border-border/60 pt-2.5 max-md:hidden @min-[58rem]/tm:border-l @min-[58rem]/tm:border-t-0 @min-[58rem]/tm:pl-3 @min-[58rem]/tm:pt-0">
                <Skeleton className="h-22 w-full" />
              </div>
              <span className="hidden w-8 @min-[58rem]/tm:block" />
            </div>
          </li>
        ))}
      </ol>
      <p className="sr-only">Loading…</p>
    </div>
  );
}
