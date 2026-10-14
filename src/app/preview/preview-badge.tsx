/** Marks a preview page so it is never mistaken for the real one. */
export function PreviewBadge() {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center p-2" aria-hidden>
      <span className="rounded-full border border-accent/50 bg-bg/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-accent shadow">Preview · nothing is saved</span>
    </div>
  );
}
