"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Play } from "lucide-react";
import { DEFAULT_ENGINE_CONFIG, type EngineConfig } from "@/domain/engine";
import { demoDataAction, runJobAction, saveEngineConfigAction, savePoolLimitsAction, saveScheduleAction, setChangePointAction } from "@/server/actions/settings";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label } from "@/components/ui/input";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
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

function useAction() {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const run = async (key: string, fn: () => Promise<{ ok: boolean; error?: string; data?: unknown }>, successText?: string) => {
    setBusy(key);
    setMessage(null);
    const r = await fn();
    setBusy(null);
    if (!r.ok) setMessage({ tone: "bad", text: r.error ?? "Failed" });
    else {
      setMessage({ tone: "good", text: successText ?? (typeof r.data === "string" ? r.data : "Saved.") });
      router.refresh();
    }
  };
  return { busy, message, run };
}

function Message({ message }: { message: { tone: "good" | "bad"; text: string } | null }) {
  if (!message) return null;
  return <p className={message.tone === "good" ? "text-xs text-good" : "text-xs text-bad"}>{message.text}</p>;
}

export function JobsPanel({ jobs, isOwner }: { jobs: JobView[]; isOwner: boolean }) {
  const { busy, message, run } = useAction();
  const [intervals, setIntervals] = React.useState<Record<string, number>>(Object.fromEntries(jobs.map((j) => [j.key, j.interval ?? j.defaultIntervalMinutes ?? 0])));
  return (
    <Panel>
      <PanelHeader title="DATA JOBS" subtitle="Each job records its last run. Intervals are minutes between runs when the scheduler tick fires (0 = disabled)." actions={isOwner ? <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run("schedule", () => saveScheduleAction(intervals), "Schedule saved.")}>Save intervals</Button> : null} />
      <PanelBody className="space-y-2">
        <Message message={message} />
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
                    <Input type="number" min={0} className="h-7 w-20 text-xs" value={intervals[j.key] ?? 0} disabled={!isOwner} onChange={(e) => setIntervals({ ...intervals, [j.key]: Number(e.target.value) })} />
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
      </PanelBody>
    </Panel>
  );
}

const WEIGHT_LABELS: Record<keyof EngineConfig["weights"], string> = {
  championStrength: "Current-patch champion strength",
  playerComfort: "Player comfort (pool order)",
  laneMatchup: "Lane matchups",
  teamMatchup: "Cross-role matchups",
  pairSynergy: "Pair synergy evidence",
  structure: "Composition structure",
  interaction: "Composition vs enemy",
  proPriority: "Professional priority",
  flexValue: "Flex / role concealment",
  roleSwapCost: "Role-swap cost per player",
  execution: "Execution demand (realism)",
  resourceOverload: "Resource overload (3+ hungry carries)",
  coordination: "Communication burden",
};

export function EnginePanel({ config, poolLimits, isOwner }: { config: Partial<EngineConfig>; poolLimits: { primary: number; secondary: number }; isOwner: boolean }) {
  const { busy, message, run } = useAction();
  const merged = { ...DEFAULT_ENGINE_CONFIG, ...config, weights: { ...DEFAULT_ENGINE_CONFIG.weights, ...(config.weights ?? {}) }, philosophy: { ...DEFAULT_ENGINE_CONFIG.philosophy, ...(config.philosophy ?? {}) } };
  const [synergy, setSynergy] = React.useState(Math.round(merged.philosophy.synergy * 100));
  const [weights, setWeights] = React.useState<Record<string, number>>(merged.weights);
  const [swapThreshold, setSwapThreshold] = React.useState(merged.swapThreshold);
  const [limits, setLimits] = React.useState(poolLimits);
  return (
    <Panel>
      <PanelHeader title="DRAFT ENGINE" subtitle="Weights are in win-rate units. The 50/50 balance is a starting point, not a law." actions={isOwner ? <Button size="sm" variant="primary" disabled={!!busy} onClick={() => run("engine", () => saveEngineConfigAction({ philosophy: { synergy: synergy / 100, enemy: 1 - synergy / 100 }, weights, swapThreshold }), "Engine settings saved.")}>Save engine</Button> : null} />
      <PanelBody className="space-y-4">
        <Message message={message} />
        <div>
          <Label>
            Philosophy: {synergy}% team synergy / {100 - synergy}% strength into the enemy
          </Label>
          <input type="range" min={20} max={80} value={synergy} disabled={!isOwner} onChange={(e) => setSynergy(Number(e.target.value))} className="w-full accent-[var(--color-accent)]" />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {(Object.keys(WEIGHT_LABELS) as Array<keyof EngineConfig["weights"]>).map((k) => (
            <div key={k} className="flex items-center justify-between gap-3">
              <span className="text-xs text-fg-muted">{WEIGHT_LABELS[k]}</span>
              <Input type="number" step={k === "roleSwapCost" ? 0.005 : 0.1} min={0} className="h-7 w-24 text-xs" value={weights[k] ?? 0} disabled={!isOwner} onChange={(e) => setWeights({ ...weights, [k]: Number(e.target.value) })} />
            </div>
          ))}
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-fg-muted">Minimum improvement to recommend a role swap</span>
            <Input type="number" step={0.005} min={0} className="h-7 w-24 text-xs" value={swapThreshold} disabled={!isOwner} onChange={(e) => setSwapThreshold(Number(e.target.value))} />
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3 border-t border-border pt-3">
          <div>
            <Label>Primary pool limit</Label>
            <Input type="number" min={1} max={20} className="h-8 w-24" value={limits.primary} disabled={!isOwner} onChange={(e) => setLimits({ ...limits, primary: Number(e.target.value) })} />
          </div>
          <div>
            <Label>Secondary pool limit</Label>
            <Input type="number" min={0} max={20} className="h-8 w-24" value={limits.secondary} disabled={!isOwner} onChange={(e) => setLimits({ ...limits, secondary: Number(e.target.value) })} />
          </div>
          {isOwner ? (
            <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run("limits", () => savePoolLimitsAction(limits), "Pool limits saved.")}>
              Save limits
            </Button>
          ) : null}
        </div>
      </PanelBody>
    </Panel>
  );
}

export function ChangePointsPanel({ items, isOwner }: { items: Array<{ id: number; championId: string; patch: string; discount: number; reason: string; source: string; confirmed: boolean }>; isOwner: boolean }) {
  const { busy, message, run } = useAction();
  return (
    <Panel>
      <PanelHeader title="CHAMPION REWORKS" subtitle="Evidence from before a change point is discounted. Auto-detected entries wait for your confirmation (and use a milder discount until then)." />
      <PanelBody className="space-y-2">
        <Message message={message} />
        {items.length === 0 ? <p className="text-xs text-fg-muted">No change points recorded.</p> : null}
        {items.map((cp) => (
          <div key={cp.id} className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-medium">{cp.championId}</span>
            <span className="text-fg-subtle">from patch {cp.patch}</span>
            <Badge tone={cp.confirmed ? "good" : "warn"}>{cp.confirmed ? `confirmed · ×${cp.discount}` : "unconfirmed"}</Badge>
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
  const { busy, message, run } = useAction();
  return (
    <Panel>
      <PanelHeader title="DEMO DATA" subtitle="Synthetic sample roster and statistics for exploring the product. Never mixed with real data once real data exists." />
      <PanelBody className="flex flex-wrap items-center gap-2">
        <Message message={message} />
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
