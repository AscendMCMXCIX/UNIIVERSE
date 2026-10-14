import type { Diagnostics } from "@/server/ops/diagnostics";
import { Badge } from "@/components/ui/badge";
import { Panel, PanelBody, PanelHeader, SectionLabel } from "@/components/ui/panel";
import { timeAgo } from "@/lib/format";

/** Owner-only operational view: build, database latency from this function, jobs, backlog, errors. */
export function DiagnosticsPanel({ d }: { d: Diagnostics }) {
  const dbTone = d.db.pingMs < 20 ? "good" : d.db.pingMs < 150 ? "info" : "warn";
  return (
    <Panel>
      <PanelHeader title="Diagnostics" subtitle="Measured from the server instance that rendered this page. Secrets are never shown." />
      <PanelBody className="space-y-4 text-xs">
        <div className="flex flex-wrap gap-2">
          <Badge tone="neutral">build {d.build.commit ?? "local"}</Badge>
          <Badge tone="neutral">region {d.build.region ?? "local"}</Badge>
          <Badge tone={dbTone} title="Round trip of SELECT 1 from this server instance to the database">db ping {d.db.pingMs} ms</Badge>
          <Badge tone="neutral" title={d.db.description}>pool max {d.db.poolMax}</Badge>
          <Badge tone="neutral">instance up {d.build.uptimeSeconds}s · {d.build.memoryMb} MB</Badge>
          <Badge tone="neutral">{d.build.node}</Badge>
        </div>
        <div className="grid gap-4 md:grid-cols-2 [&>*]:min-w-0">
          <div>
            <SectionLabel className="mb-1">Backlog</SectionLabel>
            <p className="text-fg-muted">
              Match ids queued: <span className="text-fg">{d.queue.pending.toLocaleString()}</span> · failed: <span className="text-fg">{d.queue.failed}</span> · stored but not yet aggregated: <span className="text-fg">{d.queue.unaggregated.toLocaleString()}</span>
            </p>
            <SectionLabel className="mb-1 mt-3">Slowest runs (24 h)</SectionLabel>
            {d.slowestRuns.length === 0 ? <p className="text-fg-subtle">No runs in the last day.</p> : null}
            {d.slowestRuns.map((r, i) => (
              <div key={i} className="flex gap-2 text-fg-muted">
                <span className="w-28 font-mono text-fg">{r.job}</span>
                <span>{(r.durationMs / 1000).toFixed(1)} s</span>
                <span className="text-fg-subtle">{timeAgo(r.at)}</span>
              </div>
            ))}
          </div>
          <div>
            <SectionLabel className="mb-1">Recent errors</SectionLabel>
            {d.recentErrors.length === 0 ? <p className="text-fg-subtle">No job errors recorded.</p> : null}
            {d.recentErrors.map((e, i) => (
              <div key={i} className="mb-1 text-fg-muted">
                <span className="font-mono text-fg">{e.job}</span> <span className="text-fg-subtle">{timeAgo(e.at)}</span>
                <div className="truncate text-bad" title={e.error}>
                  {e.error}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <SectionLabel className="mb-1">Recent job runs</SectionLabel>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="text-left text-fg-subtle">
                <tr>
                  <th className="py-1 pr-3 font-medium">Job</th>
                  <th className="py-1 pr-3 font-medium">Trigger</th>
                  <th className="py-1 pr-3 font-medium">Started</th>
                  <th className="py-1 pr-3 font-medium">Duration</th>
                  <th className="py-1 pr-3 font-medium">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {d.recentRuns.map((r) => (
                  <tr key={r.id}>
                    <td className="py-1 pr-3 font-mono text-fg">{r.job}</td>
                    <td className="py-1 pr-3 text-fg-muted">{r.trigger}</td>
                    <td className="py-1 pr-3 text-fg-muted">{timeAgo(r.startedAt)}</td>
                    <td className="py-1 pr-3 text-fg-muted">{r.durationMs === null ? "running" : `${(r.durationMs / 1000).toFixed(1)} s`}</td>
                    <td className="py-1 pr-3">
                      <Badge tone={r.ok === null ? "info" : r.ok ? (r.error ? "warn" : "good") : "bad"}>{r.ok === null ? "running" : r.ok ? (r.error ? "degraded" : "ok") : "failed"}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </PanelBody>
    </Panel>
  );
}
