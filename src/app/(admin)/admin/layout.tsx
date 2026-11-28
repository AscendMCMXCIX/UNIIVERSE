import { WS_COLUMN } from "@/components/ui/workspace-classes";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

/**
 * The Admin Mode pages' column (the mode itself, and who may open it, is src/app/(admin)/layout.tsx),
 * centred in the room beside the sidebar as every page is (app-shell.tsx, FRAME). A page narrower
 * than it (Settings) centres itself in it too (23 Nov 2026; G4-2 kept it at the column's left edge).
 * On a one-screen page (its section carries data-workspace) it is a flex column the section fills
 * (WS_COLUMN: docs/RESPONSIVE.md, "One-screen desktop pages"); every other page keeps the block.
 */
export default function AdminPagesLayout({ children }: { children: React.ReactNode }) {
  return <div className={cn("mx-auto w-full max-w-[var(--content-max)] space-y-5", WS_COLUMN)}>{children}</div>;
}
