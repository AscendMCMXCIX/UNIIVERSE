import { getAppDb } from "@/server/bootstrap";
import { getDbHandle } from "@/server/db/client";
import { getScheduleOverrides, listJobs } from "@/server/jobs";
import { getDataHealth } from "@/server/ops/status";
import { CoveragePanel, DatasetsList } from "@/components/settings/coverage-panel";
import { RiotHealthPanel } from "@/components/settings/riot-health-panel";
import { JobsPanel, type JobView } from "@/components/settings/settings-panels";
import { Badge } from "@/components/ui/badge";
import { Info } from "@/components/ui/metric";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { platformLabel } from "@/domain/riot-platforms";
import { timeAgo } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Data & Riot: credential state, regional coverage, datasets and freshness, jobs and safe retries. */
export default async function AdminDataPage() {
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
      details: s?.details ?? {},
    };
  });
  const tone: Record<string, "good" | "info" | "warn" | "bad" | "neutral"> = { Healthy: "good", Updating: "info", Delayed: "warn", Unavailable: "neutral", "Needs attention": "bad" };
  return (
    <div className="space-y-5">
      <Panel>
        <PanelHeader title="AT A GLANCE" subtitle="Five questions, answered from what has actually been collected, not just from jobs finishing." />
        <PanelBody>
          <ul className="divide-y divide-border" data-testid="health-answers">
            {health.answers.map((a) => (
              <li key={a.key} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-start sm:gap-3" data-answer={a.key}>
                <span className="text-sm font-medium text-fg sm:w-64 sm:shrink-0">{a.question}</span>
                <span className="sm:w-36 sm:shrink-0">
                  <Badge tone={tone[a.label] ?? "neutral"}>{a.label}</Badge>
                </span>
                <span className="text-xs text-fg-muted">{a.detail}</span>
              </li>
            ))}
          </ul>
        </PanelBody>
      </Panel>
      <Panel className={health.warnings.length ? "border-warn/50" : undefined}>
        <PanelHeader title="DATA HEALTH" subtitle={`Patch ${health.patch?.id ?? "—"} (Data Dragon ${health.patch?.ddragonVersion ?? "—"}) · ${handle.description}`} />
        <PanelBody className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={health.stats.isDemo ? "warn" : health.stats.totalGames > 0 ? "good" : "neutral"}>
              Draft statistics: {health.stats.isDemo ? "demo (synthetic)" : health.stats.sources.length ? health.stats.sources.map((s) => (s === "ranked" ? "ranked" : s === "pro" ? "professional" : s)).join(" + ") : "none"} · {health.stats.totalGames.toLocaleString()} effective games
              {health.stats.regions.length ? ` · ${health.stats.regions.length} region${health.stats.regions.length === 1 ? "" : "s"} (${health.stats.regions.map(platformLabel).join(", ")})` : ""}
              {health.stats.tierPopulation ? ` · ${health.stats.tierPopulation}` : ""}
              {health.stats.lastGameAt ? ` · newest game ${timeAgo(health.stats.lastGameAt)}` : ""}
            </Badge>
            <Info text="Effective games = ranked games on the blended patches, weighted by patch recency. Population: ranked solo/duo matches of Emerald+ players (weighted by rank band) from every configured region. Source: Riot match data; professional games from Leaguepedia add pick/ban priority." />
          </div>
          <DatasetsList datasets={health.datasets} />
          {health.warnings.length === 0 ? <p className="text-xs text-good">No job failures{health.riotConfigured && health.coverage.configured.length > 0 ? `, and all ${health.coverage.configured.length} configured region${health.coverage.configured.length === 1 ? "" : "s"} ${health.coverage.configured.length === 1 ? "has" : "have"} current-patch games` : ""}.</p> : null}
          {health.warnings.map((w) => (
            <p key={w} className="text-xs text-warn">
              ⚠ {w}
            </p>
          ))}
        </PanelBody>
      </Panel>
      <RiotHealthPanel riot={{ ...health.riot, lastOkAt: health.riot.lastOkAt?.toISOString() ?? null, lastErrorAt: health.riot.lastErrorAt?.toISOString() ?? null }} isOwner />
      <CoveragePanel coverage={health.coverage} riotConfigured={health.riotConfigured} platformSpec={process.env.RIOT_PLATFORMS} patches={health.stats.patches} />
      <JobsPanel jobs={jobs} isOwner />
    </div>
  );
}
