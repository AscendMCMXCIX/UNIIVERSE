/**
 * Champion Intel while its page loads, in its own shape and width: the title and source line, and
 * the panel with the champion, its key mechanics and its five ability rows, so nothing jumps when
 * it arrives.
 */
export default function Loading() {
  const block = "animate-pulse bg-surface-2";
  return (
    <div className="mx-auto max-w-[var(--content-max)] space-y-3" role="status" aria-live="polite" aria-label="Loading Champion Intel" data-testid="lookup-loading">
      <div aria-hidden className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <div className={`${block} h-8 w-52 max-w-full rounded-md`} />
        <div className={`${block} h-4 w-56 max-w-full rounded-md`} />
      </div>
      <div aria-hidden className="panel-depth overflow-hidden rounded-panel border border-border bg-surface">
        <div className="flex items-center gap-3 border-b border-border px-3 py-2.5 sm:px-4">
          <div className={`${block} h-12 w-12 rounded-md`} />
          <div className="space-y-1.5">
            <div className={`${block} h-6 w-32 rounded-md`} />
            <div className={`${block} h-4 w-44 rounded-md`} />
          </div>
        </div>
        <div className="space-y-1.5 border-b border-border px-3 py-2 sm:px-4">
          <div className={`${block} h-4 w-72 max-w-full rounded-md`} />
          <div className={`${block} h-4 w-96 max-w-full rounded-md`} />
        </div>
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 border-b border-border px-3 py-2 last:border-b-0 sm:px-4">
            <div className={`${block} h-9 w-9 shrink-0 rounded-md`} />
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className={`${block} h-4 w-40 max-w-full rounded-md`} />
              <div className={`${block} h-4 w-64 max-w-full rounded-md`} />
            </div>
          </div>
        ))}
      </div>
      <p className="sr-only">Loading…</p>
    </div>
  );
}
