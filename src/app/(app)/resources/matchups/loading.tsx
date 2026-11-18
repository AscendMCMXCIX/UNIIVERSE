/**
 * Matchup Intel while its page loads: its own width and the dashboard's shape (the bar with the
 * title and both slots; on a desktop the main panel and the notes on the left, the five ability
 * tiles on the right; one column on a phone), so nothing jumps when it arrives.
 */
export default function Loading() {
  const block = "animate-pulse bg-surface-2";
  return (
    <div className="mx-auto max-w-[var(--content-wide)] space-y-3" role="status" aria-live="polite" aria-label="Loading Matchup Intel" data-testid="matchup-intel-loading">
      <div className="@container/pickers">
        <div className="grid gap-x-4 gap-y-1.5 @min-[44rem]/pickers:grid-cols-[minmax(0,34rem)_minmax(0,1fr)] @min-[44rem]/pickers:items-center @min-[60rem]/pickers:grid-cols-[auto_minmax(0,34rem)_minmax(0,1fr)]">
          <div className={`${block} h-7 w-40 max-w-full rounded-md @min-[44rem]/pickers:col-span-2 @min-[60rem]/pickers:col-span-1`} />
          <div className="grid grid-cols-1 items-stretch gap-2 @min-[14rem]/pickers:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:gap-3">
            <div className={`${block} h-24 rounded-panel sm:h-12`} />
            <div className={`${block} h-11 w-11 justify-self-center rounded-full @min-[44rem]/pickers:h-9 @min-[44rem]/pickers:w-9`} />
            <div className={`${block} h-24 rounded-panel sm:h-12`} />
          </div>
          <div className="flex min-h-11 items-center @min-[44rem]/pickers:justify-end">
            <div className={`${block} h-4 w-72 max-w-full rounded-md`} />
          </div>
        </div>
      </div>
      <div className="@container/dash">
        <div className="grid gap-3 @min-[60rem]/dash:grid-cols-[minmax(0,1fr)_minmax(22rem,0.72fr)] @min-[60rem]/dash:items-start">
          <div className="min-w-0 space-y-3">
            <div className="panel-depth overflow-hidden rounded-panel border border-border bg-surface">
              <div className={`${block} m-3 h-4 w-40 rounded-md`} />
              <div className="grid gap-3 border-t border-border p-3 @min-[34rem]/dash:grid-cols-2">
                <div className={`${block} h-24 rounded-md`} />
                <div className={`${block} h-24 rounded-md`} />
              </div>
              <div className="grid gap-3 border-t border-border p-3 @min-[34rem]/dash:grid-cols-2">
                <div className={`${block} h-20 rounded-md`} />
                <div className={`${block} h-20 rounded-md`} />
              </div>
            </div>
            <div className="grid gap-3 @min-[40rem]/dash:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
              <div className={`${block} h-28 rounded-panel`} />
              <div className={`${block} h-28 rounded-panel`} />
            </div>
          </div>
          <div className="panel-depth overflow-hidden rounded-panel border border-border bg-surface">
            <div className="space-y-1.5 border-b border-border px-3 py-2">
              <div className={`${block} h-4 w-48 rounded-md`} />
              <div className={`${block} h-3 w-64 max-w-full rounded-md`} />
            </div>
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="flex gap-2.5 border-b border-border px-3 py-1.5 last:border-b-0">
                <div className={`${block} h-10 w-10 shrink-0 rounded-md`} />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className={`${block} h-4 w-full rounded-md`} />
                  <div className={`${block} h-5 w-48 max-w-full rounded-md`} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <p className="text-center text-xs text-fg-subtle">Loading…</p>
    </div>
  );
}
