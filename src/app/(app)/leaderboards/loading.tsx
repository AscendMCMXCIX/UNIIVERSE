import { DataListSkeleton } from "@/components/ui/data-list";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Leaderboards while the page loads, in its own shape and at its own width (the page's
 * --content-wide, not the 80rem of the app's generic loading state, so nothing jumps wider at 1920
 * and up), on the page's own grid by its own width (leaderboards-dashboard.tsx): the title and the
 * count on one line; the index line of a one-column page; then from 59rem the 2 × 2 grid, Recent form
 * beside the multikills, the season records beside the milestones, each pair as tall as each other;
 * under 59rem the four boards in that order. Each board's first row is its title, as on the page.
 */
export default function Loading() {
  return (
    <div className="@container/dash mx-auto flex w-full max-w-[var(--content-wide)] flex-col gap-4" role="status" aria-live="polite" aria-label="Loading" data-testid="leaderboards-skeleton">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
        <Skeleton className="my-1 h-6 w-40" />
        <Skeleton className="h-4 w-32" />
      </div>
      <Skeleton className="my-0.5 h-4 w-[min(18rem,100%)] @min-[59rem]/dash:hidden" />
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 @min-[59rem]/dash:grid-cols-[minmax(36.25rem,1.25fr)_minmax(21.75rem,1fr)]">
        <div className="flex min-w-0 flex-col [&>*]:flex-auto">
          <DataListSkeleton rows={7} heads title surface="lead" density={{ narrow: "two-line", medium: "compact", wide: "compact" }} />
        </div>
        <div className="flex min-w-0 flex-col [&>*]:flex-auto">
          <DataListSkeleton rows={5} heads title density="compact" />
        </div>
        <div className="min-w-0">
          <DataListSkeleton rows={4} heads={false} title density="dense" />
        </div>
        <div className="min-w-0">
          <DataListSkeleton rows={4} heads={false} title density="dense" />
        </div>
      </div>
      <p className="sr-only">Loading…</p>
    </div>
  );
}
