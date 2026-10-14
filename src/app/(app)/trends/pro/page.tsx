import { getAppDb } from "@/server/bootstrap";
import { requirePageAccess } from "@/server/auth/page-access";
import { getCurrentPatch, listChampions } from "@/server/repositories/champions";
import { buildTrendsReport } from "@/server/trends";
import { loadProDraftPatterns } from "@/server/pro/patterns";
import { ErrorBoundary } from "@/components/error-boundary";
import { Panel, PanelBody } from "@/components/ui/panel";
import { PageHeader } from "@/components/ui/page-header";
import { TrendsBoard } from "@/components/trends/trend-list";
import { PatchSwitch } from "@/components/trends/patch-switch";
import { ProPatternsGrid } from "@/components/trends/pro-patterns-grid";
import { timeAgo } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * Meta & Trends → Pro Play: professional games only (never mixed with solo queue). On the left,
 * draft priority by role (presence, pick, ban and win rate per professional game on the patch);
 * on the right, the professional draft patterns (first picks, rotations, counterpicks,
 * second-phase bans, flex picks), always visible.
 */
export default async function ProPlayPage({ searchParams }: { searchParams: Promise<{ patch?: string }> }) {
  await requirePageAccess("view-trends");
  const { patch: requested } = await searchParams;
  const db = await getAppDb();
  const [patch, champions] = await Promise.all([getCurrentPatch(db), listChampions(db)]);
  const [report, patterns] = await Promise.all([buildTrendsReport(db, patch?.patch ?? null, null, undefined, requested ?? null, { source: "pro" }), loadProDraftPatterns(db)]);
  const championsById = Object.fromEntries(champions.map((c) => [c.id, { id: c.id, name: c.name, portraitUrl: c.portraitUrl }]));
  const updated = report.source === "pro" ? await lastProUpdate(db) : null;

  return (
    <div className="mx-auto max-w-[1600px] space-y-3">
      <PageHeader
        title="Pro Play"
        description={
          report.source === "none" ? (
            "Professional draft priority and patterns."
          ) : (
            <>
              Patch <span className="font-medium text-fg">{report.patch}</span> · {report.totalGames.toLocaleString()} professional games{updated ? ` · updated ${timeAgo(updated)}` : ""}
            </>
          )
        }
        actions={<PatchSwitch basePath="/trends/pro" patches={report.patches} current={report.patch} />}
      />
      {report.source === "none" ? (
        <Panel>
          <PanelBody className="text-sm text-fg-muted">No professional games collected yet. They appear once the pro sync has imported games.</PanelBody>
        </Panel>
      ) : (
        <>
          {report.newestPatchNote || report.totalGames < 50 ? (
            <p className="rounded-xl border border-warn/40 bg-warn/5 px-3 py-2 text-sm text-fg-muted" data-testid="trends-limited">
              {report.newestPatchNote ? `${report.newestPatchNote} ` : null}
              {report.totalGames < 50 ? `Only ${report.totalGames} professional games on patch ${report.patch} so far: treat rates as early signals.` : null}
            </p>
          ) : null}
          <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
            <div className="min-w-0 space-y-2">
              <h2 className="text-base font-semibold text-fg">Draft priority</h2>
              <TrendsBoard views={report.views} champions={championsById} patch={report.patch ?? "—"} previousPatch={report.previousPatch} showDelta={report.comparison.supported} minWinGames={report.rules.minWinGames} minRoleGames={report.rules.minRoleGames} />
              <p className="px-1 text-xs text-fg-subtle">
                Per professional game on patch {report.patch}: pick and ban rates, presence (both together) and win rate (adjusted towards 50% for small samples; ranked from {report.rules.minWinGames} games). Solo queue games are not included.
              </p>
            </div>
            <ErrorBoundary label="Professional draft patterns" compact>
              <ProPatternsGrid patterns={patterns} championsById={championsById} />
            </ErrorBoundary>
          </div>
        </>
      )}
    </div>
  );
}

async function lastProUpdate(db: Awaited<ReturnType<typeof getAppDb>>): Promise<Date | null> {
  const { statPeriods } = await import("@/server/db/schema");
  const { eq, desc } = await import("drizzle-orm");
  const [row] = await db.select({ at: statPeriods.updatedAt }).from(statPeriods).where(eq(statPeriods.source, "pro")).orderBy(desc(statPeriods.updatedAt)).limit(1);
  return row?.at ?? null;
}
