import { DataListSkeleton } from "@/components/ui/data-list";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Leaderboards while the page loads, in its own shape and at its own width (the page's
 * --content-wide, not the 80rem of the app's generic loading state, so nothing jumps wider at 1920
 * and up): the two views and the scope line, then Recent form's board at the measure with its rows
 * at each width's height, then the footnote. Records is read in the same transition when the view
 * changes in the page, so only a direct load of ?view=records shows this board's shape first.
 * The header copies SectionHeader's spacing and SubTabs' phone track, and the scope line takes as
 * many 20px lines as the real one (three up to 24rem, two on phones, one from sm), so the board
 * lands where its skeleton was.
 */
export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-[var(--content-wide)] flex-col gap-4" role="status" aria-live="polite" aria-label="Loading" data-testid="leaderboards-skeleton">
      <div className="min-w-0 xl:pt-0.5">
        <div className="flex min-w-0 flex-wrap items-center gap-1 max-sm:w-full max-sm:rounded-[0.875rem] max-sm:bg-surface/70 max-sm:p-1 max-sm:ring-1 max-sm:ring-inset max-sm:ring-border">
          <Skeleton className="h-9 w-36 rounded-lg! max-sm:flex-1 pointer-coarse:h-11" />
          <Skeleton className="h-9 w-48 rounded-lg! max-sm:flex-1 pointer-coarse:h-11" />
        </div>
        <div className="mt-1 flex flex-col">
          <Skeleton className="my-0.5 h-4 w-[min(36rem,100%)]" />
          <Skeleton className="my-0.5 h-4 w-2/3 sm:hidden" />
          <Skeleton className="my-0.5 hidden h-4 w-1/3 max-[24rem]:block" />
        </div>
      </div>
      <div className="flex min-w-0 max-w-[var(--measure)] flex-col gap-3">
        <DataListSkeleton rows={7} heads surface="lead" density={{ narrow: "two-line", medium: "regular", wide: "dense" }} />
        <Skeleton className="h-3 w-[min(40rem,100%)]" />
      </div>
      <p className="sr-only">Loading…</p>
    </div>
  );
}
