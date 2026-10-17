import { Skeleton } from "@/components/ui/skeleton";

/**
 * Meta & Trends while a page loads: the shape of the page (header, the three highlights, the board
 * with its toolbar and rows, the definitions; on wide screens the highlights in the right column) so nothing jumps when the figures arrive. The tabs
 * above stay in place (they belong to the shell).
 */
export default function Loading() {
  return (
    <div className="mx-auto max-w-[var(--content-wide)] space-y-3" role="status" aria-live="polite" aria-label="Loading" data-testid="meta-loading">
      <div className="flex items-end justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-7 w-52" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <Skeleton className="hidden h-9 w-40 sm:block" />
      </div>
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_17rem] xl:grid-rows-[auto_1fr]">
        <div className="grid gap-2 sm:grid-cols-3 sm:gap-3 xl:col-start-2 xl:row-start-1 xl:grid-cols-1 xl:gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[5.5rem] rounded-card sm:h-[6.5rem] xl:h-[4.75rem]" />
          ))}
        </div>
        <div className="overflow-hidden rounded-card border border-border bg-surface xl:col-start-1 xl:row-span-2 xl:row-start-1">
          <div className="flex justify-between gap-2 border-b border-border p-2">
            <Skeleton className="h-9 w-80 max-w-[60%]" />
            <Skeleton className="h-9 w-56 max-w-[35%]" />
          </div>
          <div className="divide-y divide-border/70">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="flex items-center gap-3 px-3.5 py-2.5">
                <Skeleton className="h-9 w-9 rounded-lg" />
                <Skeleton className="h-4 w-36" />
                <Skeleton className="ml-auto h-4 w-24" />
              </div>
            ))}
          </div>
        </div>
        <div className="hidden space-y-2 xl:col-start-2 xl:row-start-2 xl:block">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
          <Skeleton className="h-3 w-4/6" />
        </div>
      </div>
      <p className="sr-only">Loading…</p>
    </div>
  );
}
