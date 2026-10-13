import { getAppDb } from "@/server/bootstrap";
import { getAuthState, isOwner } from "@/server/auth/session";
import { listInvites, listUsers } from "@/server/repositories/users";
import { listPlayers } from "@/server/repositories/team";
import { MembersPanel } from "@/components/settings/members-panel";
import { getDbHandle } from "@/server/db/client";
import { getScheduleOverrides, listJobs } from "@/server/jobs";
import { getDataHealth } from "@/server/ops/status";
import { listChangePoints } from "@/server/repositories/champions";
import { getOrCreateTeam } from "@/server/repositories/team";
import { ChangePointsPanel, DemoPanel, EnginePanel, JobsPanel, type JobView } from "@/components/settings/settings-panels";
import { Badge } from "@/components/ui/badge";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import type { EngineConfig } from "@/domain/engine";
import { BUILTIN_FORMATS } from "@/domain/draft";
import { getCustomFormats } from "@/server/repositories/formats";
import { getBranding } from "@/server/repositories/branding";
import { BrandingPanel } from "@/components/settings/branding-panel";
import { FormatsPanel } from "@/components/settings/formats-panel";
import { RIOT_LEGAL } from "@/components/app-shell";
import { normaliseRiotKey, riotKeyWarning } from "@/server/riot/api/client";

export const dynamic = "force-dynamic";

const ENV_FLAGS: Array<{ key: string; label: string; required: boolean }> = [
  { key: "DATABASE_URL", label: "Database (Supabase/Postgres)", required: true },
  { key: "UNIIVERSE_ACCESS_PASSWORD", label: "Owner setup key (first run)", required: false },
  { key: "UNIIVERSE_AUTH_SECRET", label: "Session signing secret", required: true },
  { key: "CRON_SECRET", label: "Scheduler secret", required: true },
  { key: "RIOT_API_KEY", label: "Riot API key (ranked ingestion)", required: false },
  { key: "RIOT_PLATFORMS", label: "Ranked regions", required: false },
  { key: "PRO_DATA_PROVIDER", label: "Professional data provider", required: false },
  { key: "LEAGUEPEDIA_USERNAME", label: "Leaguepedia bot login (pro data)", required: false },
  { key: "LEAGUEPEDIA_PASSWORD", label: "Leaguepedia bot password", required: false },
];

export default async function SettingsPage() {
  const db = await getAppDb();
  const auth = await getAuthState(db);
  const session = auth.session;
  const [team, health, handle, overrides, changePoints, users, invites] = await Promise.all([getOrCreateTeam(db), getDataHealth(db), getDbHandle(), getScheduleOverrides(db), listChangePoints(db), listUsers(db), listInvites(db)]);
  const owner = isOwner(session);
  const [allPlayers, customFormats, branding] = await Promise.all([listPlayers(db, team.id, { includeArchived: true }), getCustomFormats(db), getBranding(db)]);
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
            <Badge tone={auth.mode === "accounts" ? "good" : auth.mode === "open" ? "warn" : "bad"}>auth: {auth.mode}</Badge>
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

      {owner ? (
        <MembersPanel
          users={users.map((u) => ({ id: u.id, email: u.email, displayName: u.displayName, role: u.role, playerId: u.playerId, playerName: u.playerName, isActive: u.isActive, lastLoginAt: u.lastLoginAt?.toISOString() ?? null }))}
          invites={invites.map((i) => ({ id: i.id, token: i.token, role: i.role, playerName: i.playerName, email: i.email, note: i.note, expiresAt: i.expiresAt.toISOString() }))}
          players={allPlayers.filter((p) => !p.archivedAt).map((p) => ({ id: p.id, displayName: p.displayName, claimed: users.some((u) => u.playerId === p.id) }))}
          currentUserId={session?.userId ?? null}
        />
      ) : null}
      <BrandingPanel branding={branding} isOwner={owner} />
      <FormatsPanel builtin={Object.values(BUILTIN_FORMATS)} custom={customFormats} isOwner={owner} />
      <JobsPanel jobs={jobs} isOwner={owner} />
      <EnginePanel config={team.engineConfig as Partial<EngineConfig>} poolLimits={team.poolLimits} isOwner={owner} />
      <ChangePointsPanel items={changePoints.map((c) => ({ id: c.id, championId: c.championId, patch: c.patch, discount: c.discount, reason: c.reason, source: c.source, confirmed: c.confirmed }))} isOwner={owner} />
      <DemoPanel isOwner={owner} isDemo={health.stats.isDemo} />

      <Panel id="compliance">
        <PanelHeader title="RIOT GAMES COMPLIANCE" subtitle="How UNIIVERSE uses Riot data, and the notice Riot requires." />
        <PanelBody className="space-y-2 text-xs text-fg-muted">
          <p>{RIOT_LEGAL}</p>
          <p>Riot API keys stay on the server and are never sent to browsers. Only public game data (ranked matches, champion mastery, ranked tier) is read, only for accounts a team member or coach linked on purpose, and it is used solely to inform this team&apos;s own drafting. UNIIVERSE never attempts to de-anonymise players or discover hidden real identities, and removes a linked account&apos;s data when the account is unlinked.</p>
          <p>The full checklist is in docs/RIOT_COMPLIANCE.md in the repository.</p>
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader title="ENVIRONMENT" subtitle="Which secrets are configured (values are never shown). Set them in .env.local locally or in your host's environment variables." />
        <PanelBody className="grid gap-1 text-xs md:grid-cols-2">
          {ENV_FLAGS.map((f) => {
            const set = !!process.env[f.key];
            const riotKey = f.key === "RIOT_API_KEY" ? normaliseRiotKey(process.env.RIOT_API_KEY) : null;
            const malformed = riotKey ? riotKeyWarning(riotKey) : undefined;
            return (
              <div key={f.key} className="flex items-center justify-between gap-2 rounded-sm border border-border px-2 py-1.5">
                <span>
                  <span className="font-mono text-fg">{f.key}</span>
                  <span className="ml-2 text-fg-subtle">{f.label}</span>
                </span>
                <Badge tone={malformed ? "warn" : set ? "good" : f.required ? "warn" : "neutral"} title={malformed}>
                  {malformed ? "set, check value" : set ? "set" : f.required ? "missing" : "optional"}
                </Badge>
              </div>
            );
          })}
        </PanelBody>
      </Panel>
    </div>
  );
}
