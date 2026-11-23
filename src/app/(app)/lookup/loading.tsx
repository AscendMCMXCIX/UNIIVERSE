/**
 * Champion Lookup while its page loads, in its own shape and width: the title and source line, the
 * toolbar, and the panel with the champion and its five ability rows, so nothing jumps when it arrives.
 */
export default function Loading() {
  const block = "animate-pulse bg-surface-2";
  return (
    <div className="mx-auto max-w-[var(--content-max)] space-y-3" role="status" aria-live="polite" aria-label="Loading Champion Lookup" data-testid="lookup-loading">
      <div aria-hidden className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div className={`${block} h-8 w-52 max-w-full rounded-md`} />
        <div className={`${block} h-4 w-56 max-w-full rounded-md`} />
      </div>
      <div aria-hidden className="flex flex-wrap items-center gap-2">
        <div className={`${block} h-11 w-full rounded-md min-[30rem]:w-72 md:pointer-fine:h-9`} />
        <div className={`${block} h-11 w-36 rounded-md md:pointer-fine:h-9`} />
      </div>
      <div aria-hidden className="panel-depth overflow-hidden rounded-panel border border-border bg-surface">
        <div className="flex items-center gap-3 border-b border-border px-3 py-3 sm:px-4">
          <div className={`${block} h-12 w-12 rounded-md sm:h-16 sm:w-16`} />
          <div className="space-y-1.5">
            <div className={`${block} h-6 w-32 rounded-md`} />
            <div className={`${block} h-4 w-44 rounded-md`} />
          </div>
        </div>
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 border-b border-border px-3 py-2 last:border-b-0 sm:px-4">
            <div className={`${block} h-10 w-10 shrink-0 rounded-md`} />
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
