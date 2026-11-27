import { getAppDb } from "@/server/bootstrap";
import { PageHeader } from "@/components/ui/page-header";
import { requirePageAccess } from "@/server/auth/page-access";
import { isOwner } from "@/server/auth/permissions";
import { getDbHandle } from "@/server/db/client";
import { getScheduleOverrides, listJobs } from "@/server/jobs";
import { getDataHealth } from "@/server/ops/status";
import { DatasetsList } from "@/components/settings/datasets-list";
import { RiotHealthPanel } from "@/components/settings/riot-health-panel";
import { JobsPanel, type JobView } from "@/components/settings/settings-panels";
import { Fold } from "@/components/ui/fold";
import { StatusCards } from "@/components/admin/status-cards";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { jobsFreshness } from "@/server/ops/freshness";
import { FreshnessWatcher } from "@/components/ui/freshness-watcher";
import { staticDiffHealth } from "@/server/riot/static/digests";
import { StaticDiffCard } from "@/components/admin/static-diff";
import { readRangeReviewCounts } from "@/server/riot/static/range-review";
import { HighEloStateCard } from "@/components/admin/high-elo-state";
import { highEloState } from "@/server/champion-builds/high-elo/state";
import { log } from "@/server/observability/log";

export const dynamic = "force-dynamic";

/**
 * Data & Integrations: the Riot connection (credential state), datasets and freshness, jobs and safe
 * retries. The setup and repair jobs and the schedule's intervals are the Owner's: another
 * administrator's page is not sent them (server/actions/settings.ts refuses them too).
 */
export default async function AdminDataPage() {
  const session = await requirePageAccess("manage-data");
  const owner = isOwner(session);
  const db = await getAppDb();
  // The per-version diff of Riot's static data (counts and patch names only); one query failing never fails the page.
  const [health, handle, overrides, version, diff, ranges, highElo] = await Promise.all([
    getDataHealth(db),
    getDbHandle(),
    getScheduleOverrides(db),
    jobsFreshness(db),
    staticDiffHealth(db).catch((error: unknown) => {
      log("warn", "admin.static_diff_failed", { error });
      return null;
    }),
    // Champion Intel's reviewed ability ranges against the stored abilities (the version-check's counts).
    readRangeReviewCounts(db).catch((error: unknown) => {
      log("warn", "admin.range_review_failed", { error });
      return null;
    }),
    // The Master+ builds' collection (counts only; switched off until the owner turns it on).
    highEloState(db).catch((error: unknown) => {
      log("warn", "admin.high_elo_state_failed", { error });
      return null;
    }),
  ]);
  const statusByKey = new Map(health.jobs.map((j) => [j.key, j]));
  const jobs: JobView[] = listJobs()
    .filter((j) => owner || j.kind !== "setup")
    .map((j) => {
      const s = statusByKey.get(j.key);
      return {
        key: j.key,
        kind: j.kind,
        description: j.description,
        defaultIntervalMinutes: j.defaultIntervalMinutes,
        interval: overrides.intervals[j.key] ?? null,
        status: s?.status ?? "never",
        lastSuccessAt: s?.lastSuccessAt?.toISOString() ?? null,
        lastFailureAt: s?.lastFailureAt?.toISOString() ?? null,
        lastError: s?.lastError ?? null,
        lastDurationMs: s?.lastDurationMs ?? null,
        consecutiveFailures: s?.consecutiveFailures ?? 0,
        confirm: j.confirm ?? null,
        cost: j.cost ?? null,
        asks: j.asks ?? null,
      };
    });
  return (
    <div className="space-y-5">
      {/* Job runs and statuses update when the tab is shown again (never on a timer), and on the administrator's own actions. */}
      <FreshnessWatcher scope={{ kind: "jobs" }} version={version} on="return" />
      <PageHeader admin sectionNamed eyebrow="Admin Mode" title="Data & Integrations" description="The Riot connection, data collection and its schedule." />
      <section className="space-y-2">
        <div>
          <h2 className="text-base font-semibold">Riot data at a glance</h2>
          <p className="text-sm text-fg-muted">Answered from what has actually been collected, not just from jobs finishing.</p>
        </div>
        <StatusCards items={health.answers.map((a) => ({ key: a.key, title: a.question, label: a.label, detail: a.detail }))} testId="health-answers" />
      </section>
      <Fold title="Details" description="Datasets and freshness, the Riot API key and the background jobs." testId="data-details">
      <Panel className={health.warnings.length ? "border-warn/50" : undefined}>
        <PanelHeader title="Data health" subtitle={`Patch ${health.patch?.id ?? "—"} (Data Dragon ${health.patch?.ddragonVersion ?? "—"}) · ${handle.description}`} />
        <PanelBody className="space-y-3 text-sm">
          <DatasetsList datasets={health.datasets} />
          {diff ? <StaticDiffCard diff={diff} ranges={ranges} /> : null}
          {highElo ? <HighEloStateCard state={highElo} /> : null}
          {health.warnings.length === 0 ? <p className="text-good">No job failures.</p> : null}
          {health.warnings.map((w) => (
            <p key={w} className="text-warn [overflow-wrap:anywhere]">
              ⚠ {w}
            </p>
          ))}
        </PanelBody>
      </Panel>
      <RiotHealthPanel riot={{ ...health.riot, lastOkAt: health.riot.lastOkAt?.toISOString() ?? null, lastErrorAt: health.riot.lastErrorAt?.toISOString() ?? null }} credentialDetails />
      <JobsPanel jobs={jobs} ownerTools={owner} />
      </Fold>
    </div>
  );
}
