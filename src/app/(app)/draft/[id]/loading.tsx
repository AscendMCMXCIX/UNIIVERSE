import { Skeleton } from "@/components/ui/skeleton";

/** Draft room shape while the recommendation is computed: board columns and the recommendation panel. */
export default function Loading() {
  return (
    <div className="mx-auto max-w-[1500px] space-y-4" role="status" aria-live="polite" aria-label="Loading draft">
      <div className="flex items-center gap-3">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-5 w-20" />
      </div>
      <Skeleton className="h-9 w-full" />
      <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_380px]">
        <div className="space-y-3">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
        <Skeleton className="h-[520px] w-full" />
        <div className="space-y-3">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
      <p className="text-center text-xs text-fg-subtle">Loading the draft and computing recommendations…</p>
    </div>
  );
}
