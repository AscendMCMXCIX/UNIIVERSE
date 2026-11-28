import Link from "next/link";
import { sql } from "drizzle-orm";
import { players } from "@/server/db/schema";
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
import { StatusCards } from "@/components/admin/status-cards";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { FieldPerformancePanel } from "@/components/admin/field-performance";
import { cn } from "@/lib/cn";
import { vitalsReport } from "@/server/observability/web-vitals";
import { jobsFreshness } from "@/server/ops/freshness";
import { FreshnessWatcher } from "@/components/ui/freshness-watcher";
import { SectionPanels, SectionRail, SectionedWorkspace, type WorkspaceSectionItem } from "@/components/ui/sectioned-workspace";
import { WorkspaceFlowFold, WorkspaceOpenFold, WorkspacePlaced } from "@/components/ui/workspace-window";
import { WS_COLUMN } from "@/components/ui/workspace-classes";

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
 *
 * On a desktop window (the one-screen workspace, docs/RESPONSIVE.md, "One-screen desktop pages":
 * System Health) it is a sectioned workspace: a rail of Statuses, Page speed, Build & database,
 * Diagnostics, Environment, Riot compliance (and Demo data on an empty team), one at a time beside it,
 * in the address (?section=; #compliance opens Riot compliance). Nothing in a section opens by growing
 * the page: page speed by device and by page, the recent errors and the job runs open in a window
 * (WorkspaceWindow), Technical details' panels are sections of their own, and Riot compliance is open.
 * The Audit Logs line is under every section. Outside the workspace the page is the stack it always was.
 */
export default async function AdminSystemPage() {
  await requirePageAccess("manage-data");
  const db = await getAppDb();
  const [auth, { items: status, health }, handle, branding, version] = await Promise.all([getAuthState(db), loadSystemStatus(db), getDbHandle(), getBranding(db), jobsFreshness(db)]);
  const diagnostics = await getDiagnostics(db, handle.description).catch(() => null);
  const vitals = await vitalsReport(db).catch(() => null);
  // The demo roster is only ever created on an empty team, so its panel shows only then (S9c).
  const [{ n: playerCount } = { n: 0 }] = await db.select({ n: sql<number>`count(*)::int` }).from(players);
  const deployment = deploymentInfo();
  const technical = Number(playerCount) === 0 ? "Build, database, job runs, secrets and demo data." : "Build, database, job runs and secrets.";
  const sections: WorkspaceSectionItem[] = [
    {
      id: "statuses",
      title: "Statuses",
      content: (
        <section aria-label="Statuses">
          <StatusCards items={status} testId="system-status" />
        </section>
      ),
    },
    ...(vitals ? [{ id: "speed", title: "Page speed", content: <FieldPerformancePanel report={vitals} /> }] : []),
    {
      id: "build",
      title: "Build & database",
      content: (
        // The Technical details fold's spacing between its panels (its body's space-y-4).
        <div className="space-y-4">
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
        </div>
      ),
    },
    ...(diagnostics ? [{ id: "diagnostics", title: "Diagnostics", content: <DiagnosticsPanel d={diagnostics} /> }] : []),
    {
      id: "environment",
      title: "Environment",
      content: (
        <Panel>
          <PanelHeader title="Environment" subtitle="Which secrets are configured (values are never shown). Set them in .env.local locally or in your host's environment variables." />
          <PanelBody className="grid min-w-0 gap-1 text-xs md:grid-cols-2">
            {ENV_FLAGS.map((f) => {
              const set = !!process.env[f.key];
              const riotKey = f.key === "RIOT_API_KEY" ? normaliseRiotKey(process.env.RIOT_API_KEY) : null;
              const malformed = riotKey ? riotKeyWarning(riotKey) : undefined;
              return (
                <div key={f.key} className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-sm border border-border px-2 py-1.5">
                  <span className="min-w-0 [overflow-wrap:anywhere]">
                    <span className="break-all font-mono text-fg">{f.key}</span>
                    <span className="ml-2 text-fg-subtle">{f.label}</span>
                  </span>
                  <Badge tone={malformed ? "warn" : set ? "good" : f.required ? "warn" : "neutral"}>
                    {malformed ? "set, check value" : set ? "set" : f.required ? "missing" : "optional"}
                    {riotKey ? ` · ends ${riotKeyFingerprint(riotKey)}` : ""}
                  </Badge>
                  {malformed ? <p className="w-full text-warn">{malformed}</p> : null}
                </div>
              );
            })}
          </PanelBody>
        </Panel>
      ),
    },
    ...(Number(playerCount) === 0 ? [{ id: "demo", title: "Demo data", content: <DemoPanel canSeed /> }] : []),
    {
      id: "compliance",
      title: "Riot compliance",
      content: (
        <WorkspaceOpenFold id="compliance" title="Riot Games compliance" description="How Riot data is used, and Riot's notice." testId="system-compliance">
          <div className="space-y-2 text-sm text-fg-muted [overflow-wrap:anywhere]">
            <p>{riotLegal(branding.productName)}</p>
            <p>Riot API keys stay on the server and are never sent to browsers. Game data (matches and their timelines, champion mastery and ranks) is read only for accounts a player linked on purpose, plus the current rank of the other players in those accounts&apos; games, and it is used solely for this team&apos;s own preparation and improvement. {branding.productName} never attempts to de-anonymise players or discover hidden real identities, and removes a linked account&apos;s data when the account is unlinked.</p>
            <p>Champion Intel is a static reference for one or two champions chosen by hand: their abilities, base cooldowns, costs, descriptions, base statistics and the mechanics Riot&apos;s descriptions name, from Riot&apos;s Data Dragon, and those cooldowns at an ability haste the reader chooses. It makes no Riot API request, has no timers or tracking, and reads nothing from a game or champion select.</p>
            <p>The full checklist is in the repository&apos;s Riot compliance notes.</p>
          </div>
        </WorkspaceOpenFold>
      ),
    },
  ];
  const inFold = sections.map((x) => x.id).filter((id) => ["build", "diagnostics", "environment", "demo"].includes(id));
  const auditLine = (className: string) => (
    <p className={className}>
      Who changed what is recorded under{" "}
      <Link href="/admin/audit" className="text-accent underline-offset-2 hover:underline" data-testid="system-audit-link">
        Audit Logs
      </Link>
      .
    </p>
  );
  return (
    <div className={cn("space-y-5", WS_COLUMN)}>
      {/* Job runs and statuses update when the tab is shown again (never on a timer), and on the administrator's own actions. */}
      <FreshnessWatcher scope={{ kind: "jobs" }} version={version} on="return" />
      {/* One title (Release 19, the visual review's V7: a section "System health" under the page's "System Health" repeated it); the
          statuses' own line joins the page's description. */}
      <PageHeader admin sectionNamed eyebrow="Admin Mode" title="System Health" description="Database, background jobs and the evidence behind each status, checked as the page loaded: Healthy only with evidence." />
      {/* The flow: Statuses, Page speed, Technical details (a fold round four sections), the Audit Logs line, Riot compliance, as
          always. The workspace: the rail, and one section at a time with the Audit Logs line under it. */}
      <SectionedWorkspace sections={sections} label="System Health sections" testId="system-workspace" className="space-y-5 ws:flex ws:flex-1 ws:flex-row ws:items-start ws:gap-5 ws:space-y-0">
        <SectionRail className="ws:w-52 ws:shrink-0" />
        {/* No gap in the workspace: the sections not shown leave nothing; the Audit Logs line keeps its own margin. */}
        <div className="min-w-0 space-y-5 ws:flex ws:flex-1 ws:flex-col ws:space-y-0">
          <SectionPanels only={["statuses", "speed"]} className="space-y-5 ws:space-y-0" />
          <WorkspaceFlowFold title="Technical details" description={technical} testId="system-details">
            <SectionPanels only={inFold} className="space-y-4 ws:space-y-0" />
          </WorkspaceFlowFold>
          {/* The Audit Logs line before Riot compliance in the flow, and after it in the markup in the workspace, where it is drawn
              under the section shown (WorkspacePlaced: Tab and a screen reader follow the screen). Its order class draws it there
              for the first paint only. */}
          <WorkspacePlaced at="flow">{auditLine("text-sm text-fg-muted ws:order-last ws:mt-4")}</WorkspacePlaced>
          <SectionPanels only={["compliance"]} />
          <WorkspacePlaced at="workspace">{auditLine("text-sm text-fg-muted ws:mt-4")}</WorkspacePlaced>
        </div>
      </SectionedWorkspace>
    </div>
  );
}
