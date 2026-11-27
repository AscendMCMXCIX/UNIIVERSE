import { BAND_TITLE } from "@/domain/matchup/words";
import { cn } from "@/lib/cn";

/*
  Matchup Intel's band while it is read (docs/MATCHUP_INTEL.md): its title and the shape of its
  three blocks at about their final height, so the board under it does not jump when the band
  arrives. Streamed by the page (<Suspense>), and drawn by the page's view at once while a lane
  chosen here is on its way. The abilities never wait for it.
*/
export function MatchupBandLoading({ blocks = 3 }: { blocks?: 2 | 3 }) {
  const block = "animate-pulse rounded-md bg-surface-2";
  return (
    <div role="status" aria-live="polite" className="@container/band panel-depth overflow-hidden rounded-panel border border-border bg-surface" data-testid="matchup-band-loading">
      <span className="sr-only">Loading Matchup Intel</span>
      <div aria-hidden className="flex items-baseline gap-x-2 border-b border-border px-3 py-1 sm:px-4">
        <span className="text-sm font-semibold text-fg">{BAND_TITLE}</span>
        <span className={cn(block, "h-3 w-48 max-w-full")} />
      </div>
      <div aria-hidden className={cn("grid grid-cols-1 divide-y divide-border @min-[60rem]/band:divide-x @min-[60rem]/band:divide-y-0", blocks === 3 ? "@min-[60rem]/band:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,0.85fr)]" : "@min-[60rem]/band:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]")}>
        {Array.from({ length: blocks }, (_, i) => (
          <div key={i} className="space-y-1.5 px-3 py-2.5 sm:px-4">
            <span className={cn(block, "block h-4 w-32")} />
            {Array.from({ length: 5 }, (_, k) => (
              <span key={k} className={cn(block, "block h-4 w-full")} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
