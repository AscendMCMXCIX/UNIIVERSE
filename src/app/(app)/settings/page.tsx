import { getAppDb } from "@/server/bootstrap";
import { authMode, getSession, isOwner } from "@/server/auth/session";
import { getDbHandle } from "@/server/db/client";
import { getScheduleOverrides, listJobs } from "@/server/jobs";
import { getDataHealth } from "@/server/ops/status";
import { listChangePoints } from "@/server/repositories/champions";
import { getOrCreateTeam } from "@/server/repositories/team";
import { ChangePointsPanel, DemoPanel, EnginePanel, JobsPanel, type JobView } from "@/components/settings/settings-panels";
import { Badge } from "@/components/ui/badge";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import type { EngineConfig } from "@/domain/engine";

export const dynamic = "force-dynamic";

const ENV_FLAGS: Array<{ key: string; label: string; required: boolean }> = [
  { key: "DATABASE_URL", label: "Database (Supabase/Postgres)", required: true },
  { key: "UNIIVERSE_ACCESS_PASSWORD", label: "Team password", required: true },
  { key: "UNIIVERSE_AUTH_SECRET", label: "Session signing secret", required: false },
  { key: "CRON_SECRET", label: "Scheduler secret", required: true },
  { key: "RIOT_API_KEY", label: "Riot API key (ranked ingestion)", required: false },
  { key: "RIOT_PLATFORMS", label: "Ranked regions", required: false },
  { key: "PRO_DATA_PROVIDER", label: "Professional data provider", required: false },
];

export default async function SettingsPage() {
  const db = await getAppDb();
  const [session, team, health, handle, overrides, changePoints] = await Promise.all([getSession(), getOrCreateTeam(db), getDataHealth(db), getDbHandle(), getScheduleOverrides(db), listChangePoints(db)]);
  const owner = isOwner(session);
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

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <h1 className="text-xl font-bold">Settings</h1>
        <p className="text-sm text-fg-muted">Data health, automation, engine weights and environment. Signed in as {session?.label ?? "—"}.</p>
      </div>

      <Panel className={health.warnings.length ? "border-warn/50" : undefined}>
        <PanelHeader title="DATA HEALTH" subtitle={`Patch ${health.patch?.id ?? "—"} (Data Dragon ${health.patch?.ddragonVersion ?? "—"}) · ${handle.description}`} />
        <PanelBody className="space-y-2 text-sm">
          <div className="flex flex-wrap gap-2">
            <Badge tone={health.stats.isDemo ? "warn" : health.stats.totalGames > 0 ? "good" : "neutral"}>
              statistics: {health.stats.isDemo ? "demo" : health.stats.sources.join("+") || "none"} · {health.stats.totalGames.toLocaleString()} games
            </Badge>
            <Badge tone={authMode() === "password" ? "good" : authMode() === "open" ? "warn" : "bad"}>auth: {authMode()}</Badge>
            <Badge tone={handle.mode === "postgres" ? "good" : "warn"}>db: {handle.mode}</Badge>
          </div>
          {health.warnings.length === 0 ? <p className="text-xs text-good">All pipelines healthy.</p> : null}
          {health.warnings.map((w) => (
            <p key={w} className="text-xs text-warn">
              ⚠ {w}
            </p>
          ))}
        </PanelBody>
      </Panel>

      <JobsPanel jobs={jobs} isOwner={owner} />
      <EnginePanel config={team.engineConfig as Partial<EngineConfig>} poolLimits={team.poolLimits} isOwner={owner} />
      <ChangePointsPanel items={changePoints.map((c) => ({ id: c.id, championId: c.championId, patch: c.patch, discount: c.discount, reason: c.reason, source: c.source, confirmed: c.confirmed }))} isOwner={owner} />
      <DemoPanel isOwner={owner} isDemo={health.stats.isDemo} />

      <Panel>
        <PanelHeader title="ENVIRONMENT" subtitle="Which secrets are configured (values are never shown). Set them in .env.local locally or in your host's environment variables." />
        <PanelBody className="grid gap-1 text-xs md:grid-cols-2">
          {ENV_FLAGS.map((f) => {
            const set = !!process.env[f.key];
            return (
              <div key={f.key} className="flex items-center justify-between gap-2 rounded-sm border border-border px-2 py-1.5">
                <span>
                  <span className="font-mono text-fg">{f.key}</span>
                  <span className="ml-2 text-fg-subtle">{f.label}</span>
                </span>
                <Badge tone={set ? "good" : f.required ? "warn" : "neutral"}>{set ? "set" : f.required ? "missing" : "optional"}</Badge>
              </div>
            );
          })}
        </PanelBody>
      </Panel>
    </div>
  );
}
