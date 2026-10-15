import Link from "next/link";
import { segmentClass, segmentedGroupClass } from "@/components/ui/segmented";

/** The patches with evidence (newest first), as a compact switch; the current one highlighted. */
export function PatchSwitch({ basePath, patches, current }: { basePath: string; patches: Array<{ patch: string; games: number }>; current: string | null }) {
  if (patches.length <= 1) return null;
  return (
    <nav aria-label="Patch" className={segmentedGroupClass()} data-testid="trends-patches">
      {patches.map((p) => (
        <Link
          key={p.patch}
          href={`${basePath}?patch=${encodeURIComponent(p.patch)}`}
          aria-current={p.patch === current ? "page" : undefined}
          title={`${p.games.toLocaleString()} games`}
          className={segmentClass(p.patch === current, { className: "tabular-nums" })}
        >
          {p.patch}
        </Link>
      ))}
    </nav>
  );
}
