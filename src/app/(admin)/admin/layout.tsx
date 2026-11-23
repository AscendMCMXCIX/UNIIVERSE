export const dynamic = "force-dynamic";

/**
 * The Admin Mode pages' column (the mode itself, and who may open it, is src/app/(admin)/layout.tsx).
 * A page narrower than it starts at its left edge, whatever its own centring (`*:ml-0`, as the
 * frame's), so Settings' title is at the Dashboard's x (G4-2).
 */
export default function AdminPagesLayout({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-[var(--content-max)] space-y-5 *:ml-0">{children}</div>;
}
