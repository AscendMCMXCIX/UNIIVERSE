import { getAppDb } from "@/server/bootstrap";
import { PageHeader } from "@/components/ui/page-header";
import { requirePageAccess } from "@/server/auth/page-access";
import { getDbHandle } from "@/server/db/client";
import { getScheduleOverrides, listJobs } from "@/server/jobs";
import { getDataHealth } from "@/server/ops/status";
import { DatasetsList } from "@/components/settings/datasets-list";
import { RiotHealthPanel } from "@/components/settings/riot-health-panel";
import { JobsPanel, type JobView } from "@/components/settings/settings-panels";
import { Disclosure } from "@/components/ui/disclosure";
import { StatusCards } from "@/components/admin/status-cards";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";

export const dynamic = "force-dynamic";

/** Data & Integrations: the Riot connection (credential state), datasets and freshness, jobs and safe retries. */
export default async function AdminDataPage() {
  await requirePageAccess("manage-data");
  const db = await getAppDb();
  const [health, handle, overrides] = await Promise.all([getDataHealth(db), getDbHandle(), getScheduleOverrides(db)]);
  const statusByKey = new Map(health.jobs.map((j) => [j.key, j]));
  const jobs: JobView[] = listJobs().map((j) => {
    const s = statusByKey.get(j.key);
    return {
      key: j.key,
      description: j.description,
      defaultIntervalMinutes: j.defaultIntervalMinutes,
      interval: overrides.intervals[j.key] ?? null,
      status: s?.status ?? "never",
      lastSuccessAt: s?.lastSuccessAt?.toISOString() ?? null,
      lastFailureAt: s?.lastFailureAt?.toISOString() ?? null,
      lastError: s?.lastError ?? null,
      lastDurationMs: s?.lastDurationMs ?? null,
      consecutiveFailures: s?.consecutiveFailures ?? 0,
    };
  });
  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Admin Mode" title="Data & Integrations" description="The Riot connection, data collection and its schedule." />
      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">Riot data at a glance</h2>
          <p className="text-sm text-fg-muted">Answered from what has actually been collected, not just from jobs finishing.</p>
        </div>
        <StatusCards items={health.answers.map((a) => ({ key: a.key, title: a.question, label: a.label, detail: a.detail }))} testId="health-answers" />
      </section>
      <Disclosure title="Details" description="Datasets and freshness, the Riot API key and background jobs." testId="data-details">
      <Panel className={health.warnings.length ? "border-warn/50" : undefined}>
        <PanelHeader title="Data health" subtitle={`Patch ${health.patch?.id ?? "—"} (Data Dragon ${health.patch?.ddragonVersion ?? "—"}) · ${handle.description}`} />
        <PanelBody className="space-y-3 text-sm">
          <DatasetsList datasets={health.datasets} />
          {health.warnings.length === 0 ? <p className="text-xs text-good">No job failures.</p> : null}
          {health.warnings.map((w) => (
            <p key={w} className="text-xs text-warn [overflow-wrap:anywhere]">
              ⚠ {w}
            </p>
          ))}
        </PanelBody>
      </Panel>
      <RiotHealthPanel riot={{ ...health.riot, lastOkAt: health.riot.lastOkAt?.toISOString() ?? null, lastErrorAt: health.riot.lastErrorAt?.toISOString() ?? null }} isOwner />
      <JobsPanel jobs={jobs} isOwner />
      </Disclosure>
    </div>
  );
}
