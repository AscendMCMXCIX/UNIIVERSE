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
        <div key={i} className="rounded-lg border border-border bg-surface">
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
