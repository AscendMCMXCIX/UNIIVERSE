import { DataListSkeleton } from "@/components/ui/data-list";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Leaderboards while the page loads, in its own shape and at its own width (the page's
 * --content-wide, not the 80rem of the app's generic loading state, so nothing jumps wider at 1920
 * and up), on the page's own grid by its own width (leaderboards-dashboard.tsx): the title and the
 * member count on one line; the index line of a one-column page; then Recent form's board at the
 * measure with its rows at each width's height, the season records' panel (beside it from 86rem),
 * the multikills and the milestones. Each board's first row is its title, as on the page.
 */
export default function Loading() {
  return (
    <div className="@container/dash mx-auto flex w-full max-w-[var(--content-wide)] flex-col gap-4" role="status" aria-live="polite" aria-label="Loading" data-testid="leaderboards-skeleton">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
        <Skeleton className="my-1 h-6 w-40" />
        <Skeleton className="h-4 w-24" />
      </div>
      <Skeleton className="my-0.5 h-4 w-[min(18rem,100%)] @min-[59rem]/dash:hidden" />
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] items-start gap-4 @min-[59rem]/dash:grid-cols-[minmax(36rem,1fr)_minmax(21rem,24rem)] @min-[59rem]/dash:gap-6 @min-[86rem]/dash:grid-cols-[minmax(22rem,25rem)_minmax(34.5rem,1fr)_minmax(26.5rem,38.5rem)]">
        <div className="flex min-w-0 max-w-[var(--measure)] flex-col @min-[59rem]/dash:col-span-2">
          <DataListSkeleton rows={7} heads title surface="lead" density={{ narrow: "two-line", medium: "regular", wide: "dense" }} />
        </div>
        <div className="min-w-0 @min-[86rem]/dash:col-start-3 @min-[86rem]/dash:row-start-1">
          <DataListSkeleton rows={7} heads={false} title density="two-line" />
        </div>
        <DataListSkeleton rows={5} heads={false} title density="dense" />
        <div className="min-w-0 @min-[59rem]/dash:col-span-2">
          <DataListSkeleton rows={5} heads={false} title density="dense" />
        </div>
      </div>
      <p className="sr-only">Loading…</p>
    </div>
  );
}
