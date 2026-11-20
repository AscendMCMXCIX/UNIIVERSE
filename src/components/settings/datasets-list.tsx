import { RelativeTime } from "@/components/ui/relative-time";

/** Freshness of each dataset Admin Mode → Data & Integrations reports on. */
export function DatasetsList({ datasets }: { datasets: Array<{ key: string; title: string; source: string; updatedAt: Date | null; detail: string }> }) {
  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
      {datasets.map((d) => (
        <div key={d.key} className="min-w-0 rounded-md border border-border bg-surface-2 px-3 py-2 text-sm [overflow-wrap:anywhere]">
          <div className="flex flex-wrap items-center justify-between gap-x-2">
            <span className="font-semibold text-fg">{d.title}</span>
            <span className="text-xs text-fg-subtle">{d.updatedAt ? <>updated <RelativeTime date={d.updatedAt} /></> : "never updated"}</span>
          </div>
          <div className="text-fg-muted">{d.detail}</div>
          <div className="text-xs text-fg-subtle">Source: {d.source}</div>
        </div>
      ))}
    </div>
  );
}
