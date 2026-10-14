import Link from "next/link";
import { cn } from "@/lib/cn";

/** The patches with evidence (newest first), as a compact switch; the current one highlighted. */
export function PatchSwitch({ basePath, patches, current }: { basePath: string; patches: Array<{ patch: string; games: number }>; current: string | null }) {
  if (patches.length <= 1) return null;
  return (
    <nav aria-label="Patch" className="flex gap-0.5 rounded-lg border border-border bg-bg-elevated p-0.5" data-testid="trends-patches">
      {patches.map((p) => (
        <Link
          key={p.patch}
          href={`${basePath}?patch=${encodeURIComponent(p.patch)}`}
          aria-current={p.patch === current ? "page" : undefined}
          title={`${p.games.toLocaleString()} games`}
          className={cn("inline-flex min-h-8 items-center rounded-md px-2.5 text-xs font-medium tabular-nums pointer-coarse:min-h-10", p.patch === current ? "bg-surface-3 text-fg" : "text-fg-muted hover:text-fg")}
        >
          {p.patch}
        </Link>
      ))}
    </nav>
  );
}
