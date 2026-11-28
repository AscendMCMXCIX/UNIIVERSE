import type { Diagnostics } from "@/server/ops/diagnostics";
import { Badge } from "@/components/ui/badge";
import { Panel, PanelBody, PanelHeader, SectionLabel } from "@/components/ui/panel";
import { timeAgo } from "@/lib/format";
import { ScrollRegion } from "@/components/ui/scroll-region";
import { WorkspaceWindow } from "@/components/ui/workspace-window";
import { formatCount } from "@/lib/format";

/**
 * Owner-only operational view: build, database latency from this function, jobs, errors. On a desktop
 * window (System Health's workspace) the recent errors (up to 8, each whole there, never cut) and the
 * recent job runs (up to 15) open in a window from a row each, so the section never grows past the
 * screen; elsewhere they are inline, as always.
 */
export function DiagnosticsPanel({ d }: { d: Diagnostics }) {
  const dbTone = d.db.pingMs < 20 ? "good" : d.db.pingMs < 150 ? "info" : "warn";
  const runsTable = (
    <table className="w-full">
      <thead className="text-left text-fg-muted">
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
  );
  return (
    <Panel>
      <PanelHeader title="Diagnostics" subtitle="Measured from the server instance that rendered this page. Secrets are never shown." />
      <PanelBody className="space-y-4 text-xs">
        <div className="flex flex-wrap gap-2">
          <Badge tone="neutral">build {d.build.commit ?? "local"}</Badge>
          <Badge tone="neutral">region {d.build.region ?? "local"}</Badge>
          <Badge tone={dbTone}>database answers in {d.db.pingMs} ms</Badge>
          <Badge tone="neutral">pool max {d.db.poolMax}</Badge>
          <Badge tone="neutral">instance up {d.build.uptimeSeconds}s · {d.build.memoryMb} MB</Badge>
          <Badge tone="neutral">{d.build.node}</Badge>
        </div>
        <div className="grid gap-4 md:grid-cols-2 [&>*]:min-w-0">
          <div>
            <SectionLabel className="mb-1">Slowest runs (24 h)</SectionLabel>
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
            {d.recentErrors.length === 0 ? (
              <>
                <SectionLabel className="mb-1">Recent errors</SectionLabel>
                <p className="text-fg-subtle">No job errors recorded.</p>
              </>
            ) : (
              <WorkspaceWindow
                testId="diagnostics-errors"
                label="Recent errors"
                description={`${formatCount(d.recentErrors.length)} recorded`}
                title="Recent errors"
                windowDescription="The latest job errors, newest first, each in full."
                flow={
                  <>
                    <SectionLabel className="mb-1">Recent errors</SectionLabel>
                    {d.recentErrors.map((e, i) => (
                      <div key={i} className="mb-1 text-fg-muted">
                        <span className="font-mono text-fg">{e.job}</span> <span className="text-fg-subtle">{timeAgo(e.at)}</span>
                        <div className="truncate text-bad" title={e.error}>
                          {e.error}
                        </div>
                      </div>
                    ))}
                  </>
                }
              >
                <ul className="space-y-2 text-xs">
                  {d.recentErrors.map((e, i) => (
                    <li key={i} className="text-fg-muted">
                      <span className="font-mono text-fg">{e.job}</span> <span className="text-fg-subtle">{timeAgo(e.at)}</span>
                      <p className="text-bad [overflow-wrap:anywhere]">{e.error}</p>
                    </li>
                  ))}
                </ul>
              </WorkspaceWindow>
            )}
          </div>
        </div>
        <div>
          <WorkspaceWindow
            testId="diagnostics-runs"
            label="Recent job runs"
            description={`The last ${formatCount(d.recentRuns.length)}`}
            title="Recent job runs"
            windowDescription="The latest background job runs, newest first."
            flow={
              <>
                <SectionLabel className="mb-1">Recent job runs</SectionLabel>
                <ScrollRegion label="Recent job runs">{runsTable}</ScrollRegion>
              </>
            }
          >
            <div className="text-xs">{runsTable}</div>
          </WorkspaceWindow>
        </div>
      </PanelBody>
    </Panel>
  );
}
