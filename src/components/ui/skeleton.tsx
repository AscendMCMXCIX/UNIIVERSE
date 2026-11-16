import { cn } from "@/lib/cn";

/** Neutral placeholder block shown while a page or panel is loading. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-surface-2", className)} aria-hidden />;
}

/** Page-sized loading layout: title bar plus a few panels, used by route loading states. */
export function PageSkeleton({ panels = 3, title = true }: { panels?: number; title?: boolean }) {
  return (
    <div className="mx-auto max-w-[var(--content-max)] space-y-5" role="status" aria-live="polite" aria-label="Loading">
      {title ? (
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-80" />
        </div>
      ) : null}
      {Array.from({ length: panels }, (_, i) => (
        <div key={i} className="rounded-card border border-border bg-surface panel-depth">
          <div className="border-b border-border px-4 py-3">
            <Skeleton className="h-4 w-40" />
          </div>
          <div className="space-y-2 px-4 py-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
      ))}
      <p className="text-center text-xs text-fg-subtle">Loading…</p>
    </div>
  );
}

/** A card's placeholder: a title line and a block, as tall as the card it stands for. */
function SkeletonCard({ className, testId }: { className?: string; testId?: string }) {
  return (
    <div className={cn("space-y-3 rounded-card border border-border bg-surface p-4 panel-depth", className)} data-testid={testId}>
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-[calc(100%-1.75rem)] min-h-16 w-full" />
    </div>
  );
}

/**
 * Profile Overview's loading state in the page's own shape (player-overview.tsx, OverviewDashboard):
 * the heading, then the season's card beside recent form, ranked progress and the pools, with the
 * same container rules (two columns from a 58rem dashboard, the 2×2 from a 1440px window), so the
 * page does not jump from four full-width panels into a dashboard as it arrives.
 */
export function OverviewSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-live="polite" aria-label="Loading" data-testid="overview-skeleton">
      {/* The heading: the title, the scope line, and below xl the toolbar's row (Filters and Refresh). */}
      <div className="space-y-2">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
        <Skeleton className="h-9 w-full max-w-md xl:hidden" />
      </div>
      <div className="@container/ov">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:gap-4 @min-[58rem]/ov:grid-cols-[minmax(0,1fr)_minmax(18rem,21rem)] min-[90rem]:@min-[68rem]/ov:grid-cols-[minmax(0,1fr)_clamp(20rem,40%,30rem)]">
          <SkeletonCard className="h-80 @min-[34rem]/ov:h-72" />
          <SkeletonCard className="h-64 @min-[58rem]/ov:h-auto" />
          <SkeletonCard className="h-72 @min-[58rem]/ov:col-span-2 min-[90rem]:@min-[68rem]/ov:col-span-1 min-[90rem]:@min-[68rem]/ov:col-start-2 min-[90rem]:@min-[68rem]/ov:row-start-2" />
          <SkeletonCard className="h-96 @min-[58rem]/ov:col-span-2 min-[90rem]:@min-[68rem]/ov:col-span-1 min-[90rem]:@min-[68rem]/ov:col-start-1 min-[90rem]:@min-[68rem]/ov:row-start-2" />
        </div>
      </div>
      <p className="sr-only">Loading…</p>
    </div>
  );
}
