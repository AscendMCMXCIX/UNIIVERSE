"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Play } from "lucide-react";
import { demoDataAction, runJobAction, saveScheduleAction, setChangePointAction } from "@/server/actions/settings";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { toast } from "@/components/ui/toast";
import { timeAgo } from "@/lib/format";

export interface JobView {
  key: string;
  description: string;
  defaultIntervalMinutes: number | null;
  interval: number | null;
  status: string;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastError: string | null;
  lastDurationMs: number | null;
  consecutiveFailures: number;
  details: Record<string, unknown>;
}

/** Runs an admin action with a busy state; the outcome arrives as a notification. */
function useAction() {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const run = async (key: string, fn: () => Promise<{ ok: boolean; error?: string; data?: unknown }>, successText?: string) => {
    setBusy(key);
    const r = await fn();
    setBusy(null);
    if (!r.ok) toast.error("That did not work", { description: r.error ?? "Failed" });
    else {
      toast.success(successText ?? (typeof r.data === "string" ? r.data : "Saved."));
      router.refresh();
    }
  };
  return { busy, run };
}

export function JobsPanel({ jobs, isOwner }: { jobs: JobView[]; isOwner: boolean }) {
  const { busy, run } = useAction();
  const [intervals, setIntervals] = React.useState<Record<string, number>>(Object.fromEntries(jobs.map((j) => [j.key, j.interval ?? j.defaultIntervalMinutes ?? 0])));
  return (
    <Panel>
      <PanelHeader title="Data jobs" subtitle="Each job records its last run. Intervals are minutes between runs when the scheduler tick fires (0 = disabled)." actions={isOwner ? <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run("schedule", () => saveScheduleAction(intervals), "Schedule saved.")}>Save intervals</Button> : null} />
      <PanelBody className="space-y-2">
        <div className="space-y-2 md:hidden">
          {jobs.map((j) => (
            <div key={j.key} className="rounded-md border border-border bg-bg-elevated px-3 py-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-fg">{j.key}</span>
                <Badge tone={j.status === "ok" ? "good" : j.status === "degraded" ? "warn" : j.status === "failed" ? "bad" : j.status === "running" ? "info" : "neutral"}>{j.status}</Badge>
              </div>
              <div className="text-fg-subtle">{j.description}</div>
              {j.lastError ? <div className="mt-1 break-words text-bad">{j.lastError}</div> : null}
              {j.consecutiveFailures >= 3 ? <div className="mt-1 text-bad">{j.consecutiveFailures} failures in a row</div> : null}
              <div className="mt-1 flex flex-wrap gap-x-3 text-fg-muted">
                <span>last success {j.lastSuccessAt ? timeAgo(j.lastSuccessAt) : "never"}</span>
                <span>{j.lastDurationMs !== null ? `${(j.lastDurationMs / 1000).toFixed(1)}s` : "—"}</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {j.defaultIntervalMinutes === null ? (
                  <span className="text-fg-subtle">on demand</span>
                ) : (
                  <label className="flex items-center gap-1.5 text-fg-subtle">
                    every
                    <Input type="number" min={0} className="w-24" value={intervals[j.key] ?? 0} disabled={!isOwner} aria-label={`${j.key} interval in minutes`} onChange={(e) => setIntervals({ ...intervals, [j.key]: Number(e.target.value) })} />
                    min
                  </label>
                )}
                <span className="flex-1" />
                {isOwner ? (
                  <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run(j.key, () => runJobAction(j.key).then((r) => (r.ok ? { ok: r.data.ok, error: r.data.error, data: `${j.key}: ${r.data.ok ? "ok" : "failed"} in ${(r.data.durationMs / 1000).toFixed(1)}s` } : r)))}>
                    <Play className="h-3 w-3" /> {busy === j.key ? "Running…" : "Run now"}
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
        <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-xs">
          <thead className="text-left text-fg-subtle">
            <tr>
              <th className="py-1 font-medium">Job</th>
              <th className="py-1 font-medium">Status</th>
              <th className="py-1 font-medium">Last success</th>
              <th className="py-1 font-medium">Duration</th>
              <th className="py-1 font-medium">Interval</th>
              <th className="py-1 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {jobs.map((j) => (
              <tr key={j.key} className="align-top">
                <td className="py-2 pr-3">
                  <div className="font-mono text-fg">{j.key}</div>
                  <div className="text-fg-subtle">{j.description}</div>
                  {j.lastError ? <div className="mt-1 max-w-md truncate text-bad" title={j.lastError}>{j.lastError}</div> : null}
                </td>
                <td className="py-2 pr-3">
                  <Badge tone={j.status === "ok" ? "good" : j.status === "degraded" ? "warn" : j.status === "failed" ? "bad" : j.status === "running" ? "info" : "neutral"}>{j.status}</Badge>
                  {j.consecutiveFailures >= 3 ? <div className="mt-1 text-bad">{j.consecutiveFailures} failures in a row</div> : null}
                </td>
                <td className="py-2 pr-3 text-fg-muted">{j.lastSuccessAt ? timeAgo(j.lastSuccessAt) : "never"}</td>
                <td className="py-2 pr-3 text-fg-muted">{j.lastDurationMs !== null ? `${(j.lastDurationMs / 1000).toFixed(1)}s` : "—"}</td>
                <td className="py-2 pr-3">
                  {j.defaultIntervalMinutes === null ? (
                    <span className="text-fg-subtle">on demand</span>
                  ) : (
                    <Input type="number" min={0} className="h-7 w-20 text-xs" aria-label={`${j.key} interval in minutes`} value={intervals[j.key] ?? 0} disabled={!isOwner} onChange={(e) => setIntervals({ ...intervals, [j.key]: Number(e.target.value) })} />
                  )}
                </td>
                <td className="py-2 text-right">
                  {isOwner ? (
                    <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run(j.key, () => runJobAction(j.key).then((r) => (r.ok ? { ok: r.data.ok, error: r.data.error, data: `${j.key}: ${r.data.ok ? "ok" : "failed"} in ${(r.data.durationMs / 1000).toFixed(1)}s` } : r)))}>
                      <Play className="h-3 w-3" /> {busy === j.key ? "Running…" : "Run now"}
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </PanelBody>
    </Panel>
  );
}

export function ChangePointsPanel({ items, isOwner }: { items: Array<{ id: number; championId: string; patch: string; discount: number; reason: string; source: string; confirmed: boolean }>; isOwner: boolean }) {
  const { busy, run } = useAction();
  return (
    <Panel data-testid="champion-updates">
      <PanelHeader
        title="Champion updates (reworks)"
        subtitle="When Riot reworks a champion, games from before the rework say little about the new kit. UNIIVERSE notices a rework automatically (the champion's abilities change in Riot's data) and lists it here. Confirm a real rework and Meta & Trends shows it as a confirmed change on your pool champions, or dismiss a false alarm. Player history and match records are never changed."
      />
      <PanelBody className="space-y-2">
        {items.length === 0 ? <p className="text-xs text-fg-muted">No reworks detected. Nothing to do.</p> : null}
        {items.map((cp) => (
          <div key={cp.id} className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-medium">{cp.championId}</span>
            <span className="text-fg-subtle">from patch {cp.patch}</span>
            <Badge tone={cp.confirmed ? "good" : "warn"}>{cp.confirmed ? "confirmed" : "waiting for you"}</Badge>
            <span className="text-fg-subtle">{cp.reason}</span>
            {isOwner ? (
              <span className="ml-auto flex gap-1">
                {!cp.confirmed ? <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run(String(cp.id), () => setChangePointAction(cp.id, "confirm"), "Confirmed.")}>Confirm rework</Button> : null}
                <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => run(String(cp.id), () => setChangePointAction(cp.id, "delete"), "Removed.")}>Dismiss</Button>
              </span>
            ) : null}
          </div>
        ))}
      </PanelBody>
    </Panel>
  );
}

export function DemoPanel({ isOwner, isDemo }: { isOwner: boolean; isDemo: boolean }) {
  const { busy, run } = useAction();
  return (
    <Panel>
      <PanelHeader title="Demo data" subtitle="Synthetic sample roster and statistics for exploring the product. Never mixed with real data once real data exists." />
      <PanelBody className="flex flex-wrap items-center gap-2">
        {isOwner ? (
          <>
            <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run("roster", () => demoDataAction("seed-roster"))}>Seed demo roster</Button>
            <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run("stats", () => demoDataAction("seed-stats"))}>Seed demo statistics</Button>
            {isDemo ? <Button size="sm" variant="danger" disabled={!!busy} onClick={() => run("clear", () => demoDataAction("clear-stats"))}>Remove demo statistics</Button> : null}
          </>
        ) : (
          <p className="text-xs text-fg-muted">Owner only.</p>
        )}
      </PanelBody>
    </Panel>
  );
}
