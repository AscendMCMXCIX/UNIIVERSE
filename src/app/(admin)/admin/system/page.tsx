import Link from "next/link";
import { getAppDb } from "@/server/bootstrap";
import { PageHeader } from "@/components/ui/page-header";
import { requirePageAccess } from "@/server/auth/page-access";
import { getDbHandle } from "@/server/db/client";
import { getAuthState } from "@/server/auth/session";
import { getDiagnostics } from "@/server/ops/diagnostics";
import { deploymentInfo } from "@/server/ops/deployment";
import { loadSystemStatus } from "@/server/ops/system-status";
import { DiagnosticsPanel } from "@/components/settings/diagnostics-panel";
import { DemoPanel } from "@/components/settings/settings-panels";
import { riotLegal } from "@/components/app-shell";
import { getBranding } from "@/server/repositories/branding";
import { normaliseRiotKey, riotKeyFingerprint, riotKeyWarning } from "@/server/riot/api/client";
import { Badge } from "@/components/ui/badge";
import { Disclosure } from "@/components/ui/disclosure";
import { StatusCards } from "@/components/admin/status-cards";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { FieldPerformancePanel } from "@/components/admin/field-performance";
import { vitalsReport } from "@/server/observability/web-vitals";
import { jobsFreshness } from "@/server/ops/freshness";
import { FreshnessWatcher } from "@/components/ui/freshness-watcher";

export const dynamic = "force-dynamic";

const ENV_FLAGS: Array<{ key: string; label: string; required: boolean }> = [
  { key: "DATABASE_URL", label: "Database (Supabase/Postgres)", required: true },
  { key: "UNIIVERSE_ACCESS_PASSWORD", label: "Owner setup & recovery key (/recover)", required: true },
  { key: "UNIIVERSE_AUTH_SECRET", label: "Session signing secret", required: true },
  { key: "CRON_SECRET", label: "Scheduler secret", required: true },
  { key: "RIOT_API_KEY", label: "Riot API key (linked accounts)", required: false },
  { key: "RIOT_PLATFORMS", label: "Riot server for the key check (platform id)", required: false },
  { key: "RIOT_RATE_LIMITS", label: "Riot rate limits per host (default 20:1,100:120)", required: false },
];

/**
 * System Health & Monitoring: five plain statuses first (website, database, Riot API, player
 * syncing, background jobs); technical details on request. Admin activity is under Audit Logs.
 */
export default async function AdminSystemPage() {
  await requirePageAccess("manage-data");
  const db = await getAppDb();
  const [auth, { items: status, health }, handle, branding, version] = await Promise.all([getAuthState(db), loadSystemStatus(db), getDbHandle(), getBranding(db), jobsFreshness(db)]);
  const diagnostics = await getDiagnostics(db, handle.description).catch(() => null);
  const vitals = await vitalsReport(db).catch(() => null);
  const deployment = deploymentInfo();
  return (
    <div className="space-y-5">
      {/* Job runs and statuses update without a reload. */}
      <FreshnessWatcher scope={{ kind: "jobs" }} version={version} />
      <PageHeader eyebrow="Admin Mode" title="System Health" description="Database, background jobs and the evidence behind each status." />
      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">System health</h2>
          <p className="text-sm text-fg-muted">Checked when this page loaded. A status is only Healthy when there is evidence for it.</p>
        </div>
        <StatusCards items={status} testId="system-status" />
      </section>
      {vitals ? <FieldPerformancePanel report={vitals} /> : null}
      <Disclosure title="Technical details" description="Build, database, recent job runs and errors, configured secrets (never their values) and demo data." testId="system-details">
        <Panel>
          <PanelHeader title="Build & database" subtitle="What is running and where." />
          <PanelBody className="flex flex-wrap items-center gap-2 text-sm">
            <Badge tone="neutral">build {deployment.commit ?? "local"}</Badge>
            {deployment.region ? <Badge tone="neutral">region {deployment.region}</Badge> : null}
            <Badge tone={auth.mode === "accounts" ? "good" : auth.mode === "open" ? "warn" : "bad"}>auth: {auth.mode}</Badge>
            <Badge tone={handle.mode === "postgres" ? "good" : "warn"}>db: {handle.mode}</Badge>
            <span className="text-xs text-fg-subtle">{handle.description}</span>
          </PanelBody>
        </Panel>
        {health.warnings.length ? (
          <Panel className="border-warn/50">
            <PanelHeader title="Warnings" subtitle="Also shown on Riot Data where they come from." />
            <PanelBody className="space-y-1">
              {health.warnings.map((w) => (
                <p key={w} className="text-xs text-warn [overflow-wrap:anywhere]">
                  ⚠ {w}
                </p>
              ))}
            </PanelBody>
          </Panel>
        ) : null}
        {diagnostics ? <DiagnosticsPanel d={diagnostics} /> : null}
        <Panel>
          <PanelHeader title="Environment" subtitle="Which secrets are configured (values are never shown). Set them in .env.local locally or in your host's environment variables." />
          <PanelBody className="grid min-w-0 gap-1 text-xs md:grid-cols-2">
            {ENV_FLAGS.map((f) => {
              const set = !!process.env[f.key];
              const riotKey = f.key === "RIOT_API_KEY" ? normaliseRiotKey(process.env.RIOT_API_KEY) : null;
              const malformed = riotKey ? riotKeyWarning(riotKey) : undefined;
              return (
                <div key={f.key} className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-sm border border-border px-2 py-1.5">
                  <span className="min-w-0">
                    <span className="break-all font-mono text-fg">{f.key}</span>
                    <span className="ml-2 text-fg-subtle">{f.label}</span>
                  </span>
                  <Badge tone={malformed ? "warn" : set ? "good" : f.required ? "warn" : "neutral"} title={malformed}>
                    {malformed ? "set, check value" : set ? "set" : f.required ? "missing" : "optional"}
                    {riotKey ? ` · ends ${riotKeyFingerprint(riotKey)}` : ""}
                  </Badge>
                </div>
              );
            })}
          </PanelBody>
        </Panel>
        <DemoPanel isOwner />
      </Disclosure>
      <p className="text-sm text-fg-muted">
        Who changed accounts, access, passwords, settings or jobs is recorded under{" "}
        <Link href="/admin/audit" className="text-accent underline-offset-2 hover:underline" data-testid="system-audit-link">
          Audit Logs
        </Link>
        .
      </p>
      <Panel id="compliance">
        <PanelHeader title="Riot Games compliance" subtitle={`How ${branding.productName} uses Riot data, and the notice Riot requires.`} />
        <PanelBody className="space-y-2 text-xs text-fg-muted">
          <p>{riotLegal(branding.productName)}</p>
          <p>Riot API keys stay on the server and are never sent to browsers. Only public game data (ranked matches, champion mastery, ranked tier) is read, only for accounts a player linked on purpose, and it is used solely for this team&apos;s own preparation and improvement. {branding.productName} never attempts to de-anonymise players or discover hidden real identities, and removes a linked account&apos;s data when the account is unlinked.</p>
          <p>The full checklist is in docs/RIOT_COMPLIANCE.md in the repository.</p>
        </PanelBody>
      </Panel>
    </div>
  );
}
