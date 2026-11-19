"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Play } from "lucide-react";
import { demoDataAction, runJobAction, saveScheduleAction } from "@/server/actions/settings";
import { Button } from "@/components/ui/button";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Disclosure } from "@/components/ui/disclosure";
import { Input, Label } from "@/components/ui/input";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { toast } from "@/components/ui/toast";
import { RelativeTime } from "@/components/ui/relative-time";
import { formatCount, formatNumber } from "@/lib/format";
import { turnOffPhrase, typedMatches } from "@/domain/typed-confirmation";

/*
  Admin Mode → Data & Integrations → the background jobs, in three lists by what a run can do
  (JobDefinition.kind, src/server/jobs/registry.ts):
  - Checks: read only. "Run check", no question.
  - Refresh: collect or tidy data, as their schedule does anyway. "Run now"; a full champion sync
    asks once.
  - Advanced (closed, the Owner only): the setup and repair jobs, each run only after its phrase is
    typed, and the schedule's intervals, where 0 turns a job off after "TURN OFF <job>" is typed.
  The server checks the same (server/actions/settings.ts); another administrator's page does not
  even receive the setup jobs or the intervals.
*/

export interface JobView {
  key: string;
  kind: "check" | "refresh" | "setup";
  description: string;
  defaultIntervalMinutes: number | null;
  interval: number | null;
  status: string;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastError: string | null;
  lastDurationMs: number | null;
  consecutiveFailures: number;
  /** Setup jobs: the dialog's title, the effect in plain words, and the phrase to type. */
  confirm: { title: string; effect: string; phrase: string } | null;
  /** What a run costs, said beside it (perf-probe, data-audit). */
  cost: string | null;
  /** A refresh that asks once before it runs (static-sync): the question. */
  asks: string | null;
}

/** Runs an admin action with a busy state; the outcome arrives as a notification. */
function useAction() {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const run = async (key: string, fn: () => Promise<{ ok: boolean; error?: string; data?: unknown }>, successText?: string): Promise<boolean> => {
    setBusy(key);
    const r = await fn();
    setBusy(null);
    if (!r.ok) toast.error("That did not work", { description: r.error ?? "Failed" });
    else {
      toast.success(successText ?? (typeof r.data === "string" ? r.data : "Saved."));
      router.refresh();
    }
    return r.ok;
  };
  return { busy, run };
}

const STATUS_TONE: Record<string, BadgeTone> = { ok: "good", degraded: "warn", failed: "bad", running: "info" };

/** The interval a job runs at now: its override, else its default (null: on demand only). */
const intervalOf = (j: Pick<JobView, "interval" | "defaultIntervalMinutes">): number | null => j.interval ?? j.defaultIntervalMinutes;

function scheduleWords(j: JobView): string {
  const every = intervalOf(j);
  if (every === null) return "on demand";
  return every === 0 ? "off (interval 0)" : `every ${formatCount(every)} min`;
}

/** One job's run through the server action, as a notification: "rank-audit: ok in 1.2 s". */
function runJob(j: JobView, confirmation?: string) {
  return runJobAction(j.key, confirmation).then((r) => (r.ok ? { ok: r.data.ok, error: r.data.error, data: `${j.key}: ${r.data.ok ? "ok" : "failed"} in ${formatNumber(r.data.durationMs / 1000, 1)} s` } : r));
}

function JobRow({ job: j, title, description, children }: { job: JobView; title?: React.ReactNode; description?: string; children: React.ReactNode }) {
  return (
    <li className="grid gap-x-4 gap-y-2 py-3 text-xs first:pt-1 last:pb-1 md:grid-cols-[minmax(0,1fr)_auto] md:items-center" data-testid="job-row" data-job={j.key}>
      <div className="min-w-0 space-y-1 [overflow-wrap:anywhere]">
        <div className="flex flex-wrap items-center gap-2">
          {title ?? <span className="font-mono text-sm text-fg">{j.key}</span>}
          <Badge tone={STATUS_TONE[j.status] ?? "neutral"}>{j.status}</Badge>
        </div>
        <p className="text-fg-subtle">{description ?? j.description}</p>
        {j.cost ? <p className="text-fg-muted" data-testid="job-cost">{j.cost}</p> : null}
        {j.lastError ? <p className="text-bad">{j.lastError}</p> : null}
        {j.consecutiveFailures >= 3 ? <p className="text-bad">{formatCount(j.consecutiveFailures)} failures in a row</p> : null}
        <p className="flex flex-wrap gap-x-3 text-fg-muted">
          <span>last success {j.lastSuccessAt ? <RelativeTime date={j.lastSuccessAt} /> : "never"}</span>
          <span>{j.lastDurationMs !== null ? `took ${formatNumber(j.lastDurationMs / 1000, 1)} s` : "no run timed yet"}</span>
          <span>{scheduleWords(j)}</span>
        </p>
      </div>
      <div className="flex flex-wrap items-center md:justify-end">{children}</div>
    </li>
  );
}

function JobGroup({ title, subtitle, testId, children }: { title: string; subtitle: string; testId: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0 space-y-1" data-testid={testId} aria-labelledby={`${testId}-title`}>
      <h3 id={`${testId}-title`} className="text-sm font-semibold text-fg">
        {title}
      </h3>
      <p className="text-xs text-fg-subtle">{subtitle}</p>
      <ul className="divide-y divide-border">{children}</ul>
    </section>
  );
}

/** A setup job's run: its effect in plain words, and Run only once its phrase is typed. */
function SetupJobDialog({ job, busy, onCancel, onRun }: { job: JobView | null; busy: boolean; onCancel: () => void; onRun: (typed: string) => void }) {
  // A new job opens a new dialog (the parent keys it by the job), so nothing typed carries over.
  const [typed, setTyped] = React.useState("");
  const id = React.useId();
  const confirm = job?.confirm ?? null;
  const ready = !!confirm && typedMatches(typed, confirm.phrase);
  return (
    <Dialog
      open={!!job}
      onClose={() => (busy ? undefined : onCancel())}
      title={confirm ? `${confirm.title}?` : "Run this job?"}
      description={confirm?.effect}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => onRun(typed)} disabled={!ready || busy} data-testid="job-confirm-run">
            {busy ? "Running…" : "Run"}
          </Button>
        </>
      }
    >
      {confirm ? (
        <div className="space-y-1" data-testid="job-confirm">
          <Label htmlFor={`${id}-phrase`}>
            Type <span className="font-semibold text-fg">{confirm.phrase}</span> to run <span className="font-mono">{job!.key}</span>
          </Label>
          <Input id={`${id}-phrase`} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck={false} data-testid="job-confirm-input" />
        </div>
      ) : null}
    </Dialog>
  );
}

/**
 * The intervals of the jobs the scheduler's tick runs, the Owner only. Saving asks once, listing each
 * change; a job turned off (0) needs "TURN OFF <job>" typed there, as the server checks.
 */
function ScheduleEditor({ jobs }: { jobs: JobView[] }) {
  const router = useRouter();
  const scheduled = jobs.filter((j) => j.defaultIntervalMinutes !== null);
  const [values, setValues] = React.useState<Record<string, string>>(() => Object.fromEntries(scheduled.map((j) => [j.key, String(intervalOf(j) ?? 0)])));
  const [reviewing, setReviewing] = React.useState(false);
  const [phrases, setPhrases] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);
  const id = React.useId();
  const parsed = (key: string) => {
    const raw = (values[key] ?? "").trim();
    return /^\d+$/.test(raw) ? Number(raw) : null;
  };
  const invalid = scheduled.filter((j) => parsed(j.key) === null).map((j) => j.key);
  const changes = scheduled.filter((j) => parsed(j.key) !== null && parsed(j.key) !== intervalOf(j)).map((j) => ({ job: j, from: intervalOf(j) ?? 0, to: parsed(j.key)! }));
  const turningOff = changes.filter((c) => c.to === 0 && c.from !== 0);
  const ready = turningOff.every((c) => typedMatches(phrases[c.job.key], turnOffPhrase(c.job.key)));
  const minutes = (n: number) => (n === 0 ? "off" : `every ${formatCount(n)} min`);
  const save = async () => {
    setBusy(true);
    const r = await saveScheduleAction(Object.fromEntries(scheduled.map((j) => [j.key, parsed(j.key) ?? intervalOf(j) ?? 0])), Object.fromEntries(turningOff.map((c) => [c.job.key, phrases[c.job.key] ?? ""])));
    setBusy(false);
    if (!r.ok) return toast.error("The schedule was not saved", { description: r.error });
    setReviewing(false);
    setPhrases({});
    toast.success(r.data.changed ? `Schedule saved: ${formatCount(r.data.changed)} job${r.data.changed === 1 ? "" : "s"} changed.` : "Nothing changed.");
    router.refresh();
  };
  return (
    <section className="min-w-0 space-y-2" data-testid="schedule-editor" aria-labelledby={`${id}-title`}>
      <div>
        <h3 id={`${id}-title`} className="text-sm font-semibold text-fg">
          Schedule
        </h3>
        <p className="text-xs text-fg-subtle">Minutes between runs when the scheduler&apos;s tick comes round. 0 turns a job off: it then runs only when started by hand, and the health check names it.</p>
      </div>
      <ul className="divide-y divide-border">
        {scheduled.map((j) => (
          <li key={j.key} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 py-2 text-xs" data-testid="schedule-row" data-job={j.key}>
            <label htmlFor={`${id}-${j.key}`} className="min-w-0 [overflow-wrap:anywhere]">
              <span className="font-mono text-sm text-fg">{j.key}</span>
              <span className="block text-fg-subtle">default every {formatCount(j.defaultIntervalMinutes ?? 0)} min</span>
            </label>
            <span className="flex items-center gap-1.5 text-fg-subtle">
              every
              <Input id={`${id}-${j.key}`} type="number" inputMode="numeric" min={0} step={1} className="w-24" value={values[j.key] ?? ""} aria-label={`${j.key} interval in minutes`} aria-invalid={invalid.includes(j.key) || undefined} onChange={(e) => setValues((v) => ({ ...v, [j.key]: e.target.value }))} />
              min
            </span>
          </li>
        ))}
      </ul>
      {invalid.length ? <p className="text-xs text-bad" role="alert">Enter whole minutes, 0 or more: {invalid.join(", ")}.</p> : null}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button size="sm" variant="outline" wrap disabled={changes.length === 0 || invalid.length > 0} onClick={() => setReviewing(true)} data-testid="save-schedule">
          Save intervals
        </Button>
      </div>
      <Dialog
        open={reviewing}
        onClose={() => (busy ? undefined : setReviewing(false))}
        title="Save the schedule?"
        description={turningOff.length ? "Each job turned off stops running by itself until its interval is set again." : "The scheduler uses the new intervals from its next tick."}
        footer={
          <>
            <Button variant="ghost" onClick={() => setReviewing(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant={turningOff.length ? "danger" : "primary"} onClick={() => void save()} disabled={!ready || busy} data-testid="schedule-confirm-save">
              {busy ? "Saving…" : "Save"}
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm" data-testid="schedule-confirm">
          <ul className="space-y-1 text-fg-muted">
            {changes.map((c) => (
              <li key={c.job.key}>
                <span className="font-mono text-fg">{c.job.key}</span>: {minutes(c.from)} → {minutes(c.to)}
              </li>
            ))}
          </ul>
          {turningOff.map((c) => (
            <div key={c.job.key} className="space-y-1">
              <Label htmlFor={`${id}-off-${c.job.key}`}>
                Type <span className="font-semibold text-fg">{turnOffPhrase(c.job.key)}</span> to turn it off
              </Label>
              <Input id={`${id}-off-${c.job.key}`} value={phrases[c.job.key] ?? ""} onChange={(e) => setPhrases((p) => ({ ...p, [c.job.key]: e.target.value }))} autoComplete="off" autoCapitalize="characters" spellCheck={false} data-testid="schedule-turn-off-input" data-job={c.job.key} />
            </div>
          ))}
        </div>
      </Dialog>
    </section>
  );
}

/**
 * The background jobs. `ownerTools`: the Owner's page, with Advanced (setup and repair jobs, the
 * schedule); any other administrator's page lists the checks and refreshes only.
 */
export function JobsPanel({ jobs, ownerTools }: { jobs: JobView[]; ownerTools: boolean }) {
  const { busy, run } = useAction();
  const [asking, setAsking] = React.useState<JobView | null>(null);
  const [confirming, setConfirming] = React.useState<JobView | null>(null);
  const checks = jobs.filter((j) => j.kind === "check");
  const refresh = jobs.filter((j) => j.kind === "refresh");
  const setup = ownerTools ? jobs.filter((j) => j.kind === "setup") : [];
  const plainRun = (j: JobView, label: string) => (
    <Button size="sm" variant="outline" disabled={!!busy} onClick={() => (j.asks ? setAsking(j) : void run(j.key, () => runJob(j)))} data-testid="run-job">
      <Play className="h-3 w-3" aria-hidden /> {busy === j.key ? "Running…" : label}
    </Button>
  );
  return (
    <Panel data-testid="jobs-panel">
      <PanelHeader title="Background jobs" subtitle="Each job records its last run. Checks only read; refreshes collect or tidy data, as their schedule does anyway." />
      <PanelBody className="space-y-5">
        <JobGroup title="Checks" subtitle="Read only: a check changes nothing." testId="jobs-checks">
          {checks.map((j) => (
            <JobRow key={j.key} job={j}>
              {plainRun(j, "Run check")}
            </JobRow>
          ))}
        </JobGroup>
        <JobGroup title="Refresh" subtitle="Collect or tidy data; most also run on their schedule." testId="jobs-refresh">
          {refresh.map((j) => (
            <JobRow key={j.key} job={j}>
              {plainRun(j, "Run now")}
            </JobRow>
          ))}
        </JobGroup>
        {ownerTools ? (
          <Disclosure title="Advanced" description="Setup and repair jobs, and the schedule. Only the Owner sees these." testId="jobs-advanced">
            <JobGroup title="Setup and repair" subtitle="Each changes the site's setup or repairs data once. Type its phrase to run it." testId="jobs-setup">
              {setup.map((j) => (
                <JobRow
                  key={j.key}
                  job={j}
                  // What it does in plain words; the technical description is the job's own (the key below the title).
                  description={j.confirm?.effect}
                  title={
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-fg">{j.confirm?.title ?? j.key}</span>
                      <span className="block font-mono text-fg-subtle">{j.key}</span>
                    </span>
                  }
                >
                  <Button size="sm" variant="danger" disabled={!!busy} onClick={() => setConfirming(j)} data-testid="run-job">
                    <Play className="h-3 w-3" aria-hidden /> {busy === j.key ? "Running…" : "Run…"}
                  </Button>
                </JobRow>
              ))}
            </JobGroup>
            <ScheduleEditor jobs={jobs} />
          </Disclosure>
        ) : (
          <p className="text-xs text-fg-muted" data-testid="jobs-owner-only">
            The schedule and the setup and repair jobs are the Owner&apos;s.
          </p>
        )}
      </PanelBody>
      <ConfirmDialog
        open={!!asking}
        tone="primary"
        busy={!!busy}
        title={`Run ${asking?.key ?? "this job"} now?`}
        description={asking?.asks ?? undefined}
        confirmLabel="Run now"
        onCancel={() => setAsking(null)}
        onConfirm={() => {
          const j = asking;
          if (!j) return;
          void run(j.key, () => runJob(j)).then(() => setAsking(null));
        }}
      />
      <SetupJobDialog
        key={confirming?.key ?? ""}
        job={confirming}
        busy={!!busy}
        onCancel={() => setConfirming(null)}
        onRun={(typed) => {
          const j = confirming;
          if (!j) return;
          void run(j.key, () => runJob(j, typed)).then((ok) => ok && setConfirming(null));
        }}
      />
    </Panel>
  );
}

export function DemoPanel({ canSeed }: { canSeed: boolean }) {
  const { busy, run } = useAction();
  return (
    <Panel>
      <PanelHeader title="Demo data" subtitle="A synthetic sample roster for exploring the product. Never created when players already exist." />
      <PanelBody className="flex flex-wrap items-center gap-2">
        {canSeed ? (
          <>
            <Button size="sm" variant="outline" wrap disabled={!!busy} onClick={() => run("roster", () => demoDataAction())}>Seed demo roster</Button>
          </>
        ) : (
          <p className="text-xs text-fg-muted">Administrators who manage data can seed it.</p>
        )}
      </PanelBody>
    </Panel>
  );
}
