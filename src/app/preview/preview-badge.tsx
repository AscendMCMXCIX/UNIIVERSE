/** Marks a preview page so it is never mistaken for the real one. The page leaves room for it (PREVIEW_PAD_TOP). */
export function PreviewBadge() {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-2 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]" aria-hidden>
      <span className="rounded-full border border-accent/50 bg-bg/90 px-3 py-1 text-2xs font-semibold uppercase tracking-label text-accent shadow" data-testid="preview-badge">Preview · nothing is saved</span>
    </div>
  );
}
