import { DataListSkeleton } from "@/components/ui/data-list";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Leaderboards while the page loads, in its own shape and at its own width (the page's
 * --content-wide, not the 80rem of the app's generic loading state, so nothing jumps wider at 1920
 * and up): the two views and the scope line, then Recent form's board at the measure with its rows
 * at each width's height, then the footnote. Records is read in the same transition when the view
 * changes in the page, so only a direct load of ?view=records shows this board's shape first.
 */
export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-[var(--content-wide)] flex-col gap-4" role="status" aria-live="polite" aria-label="Loading" data-testid="leaderboards-skeleton">
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-1 max-sm:w-full">
          <Skeleton className="h-9 w-36 rounded-lg max-sm:flex-1 pointer-coarse:h-11" />
          <Skeleton className="h-9 w-48 rounded-lg max-sm:flex-1 pointer-coarse:h-11" />
        </div>
        <Skeleton className="mt-2 h-4 w-[min(36rem,100%)]" />
        <Skeleton className="mt-1.5 h-4 w-2/3 sm:hidden" />
      </div>
      <div className="flex min-w-0 max-w-[var(--measure)] flex-col gap-3">
        <DataListSkeleton rows={7} heads surface="lead" density={{ narrow: "two-line", medium: "regular", wide: "dense" }} />
        <Skeleton className="h-3 w-[min(40rem,100%)]" />
      </div>
      <p className="sr-only">Loading…</p>
    </div>
  );
}
