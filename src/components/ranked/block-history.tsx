import Link from "next/link";
import type { RankedBlockView } from "@/server/ranked/repository";
import { blockProgressText, blockStatusText } from "@/domain/ranked-improvement";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";

/** Blocks newest first, each a link to its games. */
export function BlockHistoryList({ blocks, emptyText = "No blocks yet." }: { blocks: RankedBlockView[]; emptyText?: string }) {
  if (blocks.length === 0) return <p className="text-sm text-fg-muted">{emptyText}</p>;
  return (
    <ul className="divide-y divide-border">
      {blocks.map((b) => (
        <li key={b.id}>
          <Link href={`/overview/blocks/${b.id}`} className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm hover:bg-surface-2/50">
            <span className="font-semibold tracking-wide text-fg">{b.label}</span>
            <Badge tone={b.state === "active" ? "accent" : b.state === "completed-early" ? "warn" : "neutral"}>{blockStatusText(b)}</Badge>
            {b.completionRule === "two-losses" ? <span className="text-xs text-fg-subtle">Two-loss limit</span> : null}
            <span className="text-fg-muted">{blockProgressText(b.games, b.plannedGames)}</span>
            <span className="tabular-nums">
              <span className="text-blue">{b.wins}W</span> <span className="text-red">{b.losses}L</span>
            </span>
            {b.focus ? <span className="min-w-0 max-w-full truncate text-xs text-fg-subtle sm:max-w-xs" title={b.focus}>Focus: {b.focus}</span> : null}
            <span className="ml-auto text-xs text-fg-subtle">
              {formatDate(b.startedAt)}
              {b.completedAt ? ` → ${formatDate(b.completedAt)}` : ""}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
