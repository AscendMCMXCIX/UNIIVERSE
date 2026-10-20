import { timeAgo } from "@/lib/format";

/** Freshness of each dataset Admin → Riot Data reports on. */
export function DatasetsList({ datasets }: { datasets: Array<{ key: string; title: string; source: string; updatedAt: Date | null; detail: string }> }) {
  return (
    <div className="grid gap-2 md:grid-cols-2">
      {datasets.map((d) => (
        <div key={d.key} className="rounded-md border border-border bg-bg-elevated px-3 py-2 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-fg">{d.title}</span>
            <span className="text-fg-subtle" title={d.updatedAt ? d.updatedAt.toISOString() : undefined}>updated {d.updatedAt ? timeAgo(d.updatedAt) : "never"}</span>
          </div>
          <div className="text-fg-muted">{d.detail}</div>
          <div className="text-xs text-fg-subtle">Source: {d.source}</div>
        </div>
      ))}
    </div>
  );
}
