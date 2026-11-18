/** Matchup Intel while its page loads: its own width and shape (the pickers, then the abilities), so nothing jumps when it arrives. */
export default function Loading() {
  const block = "animate-pulse bg-surface-2";
  return (
    <div className="mx-auto max-w-[var(--content-max)] space-y-5" role="status" aria-live="polite" aria-label="Loading Matchup Intel" data-testid="matchup-intel-loading">
      <div className="space-y-2">
        <div className={`${block} h-8 w-44 max-w-full rounded-md`} />
        <div className={`${block} h-4 w-[32rem] max-w-full rounded-md max-md:hidden`} />
      </div>
      <div className="@container/pickers space-y-1.5">
        <div className="grid grid-cols-1 items-center gap-2 @min-[14rem]/pickers:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:gap-3">
          <div className={`${block} h-32 rounded-panel sm:h-24`} />
          <div className={`${block} h-11 w-11 justify-self-center rounded-full`} />
          <div className={`${block} h-32 rounded-panel sm:h-24`} />
        </div>
        <div className="flex min-h-11 items-center">
          <div className={`${block} h-4 w-72 max-w-full rounded-md`} />
        </div>
      </div>
      <div className="panel-depth overflow-hidden rounded-panel border border-border bg-surface">
        <div className="space-y-2 border-b border-border px-3 py-3 sm:px-4">
          <div className={`${block} h-5 w-48 rounded-md`} />
          <div className={`${block} h-4 w-64 max-w-full rounded-md`} />
        </div>
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex gap-3 border-b border-border px-3 py-3.5 last:border-b-0 sm:px-4">
            <div className={`${block} h-12 w-12 shrink-0 rounded-md`} />
            <div className="min-w-0 flex-1 space-y-2">
              <div className={`${block} h-5 w-40 max-w-full rounded-md`} />
              <div className={`${block} h-4 w-56 max-w-full rounded-md`} />
              <div className={`${block} h-4 w-full rounded-md`} />
            </div>
          </div>
        ))}
      </div>
      <p className="text-center text-xs text-fg-subtle">Loading…</p>
    </div>
  );
}
