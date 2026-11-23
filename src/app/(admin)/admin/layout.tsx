export const dynamic = "force-dynamic";

/**
 * The Admin Mode pages' column (the mode itself, and who may open it, is src/app/(admin)/layout.tsx),
 * centred in the room beside the sidebar as every page is (app-shell.tsx, FRAME). A page narrower
 * than it (Settings) centres itself in it too (23 Nov 2026; G4-2 kept it at the column's left edge).
 */
export default function AdminPagesLayout({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-[var(--content-max)] space-y-5">{children}</div>;
}
