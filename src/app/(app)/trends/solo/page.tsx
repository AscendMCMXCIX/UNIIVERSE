import { getAppDb } from "@/server/bootstrap";
import { requirePageAccess } from "@/server/auth/page-access";
import { getCurrentPatch, listChampions } from "@/server/repositories/champions";
import { getActiveLineupProfiles, getOrCreateTeam } from "@/server/repositories/team";
import { buildTrendsReport, MIN_ROLE_GAMES, MIN_ROLE_SHARE, MIN_WIN_RATE_GAMES } from "@/server/trends";
import Link from "next/link";
import { MobileSection } from "@/components/ui/mobile-section";
import { ChampionPortrait } from "@/components/champion-portrait";
import { InfoTip } from "@/components/ui/info-tip";
import { Badge } from "@/components/ui/badge";
import { Panel, PanelBody } from "@/components/ui/panel";
import { PageHeader } from "@/components/ui/page-header";
import { TrendsBoard } from "@/components/trends/trend-list";
import { timeAgo } from "@/lib/format";
import { PatchSwitch } from "@/components/trends/patch-switch";
import { platformLabel } from "@/domain/riot-platforms";
import { loadStatsProvider } from "@/server/stats/loader";

export const dynamic = "force-dynamic";

/**
 * Meta & Trends → Solo Queue Meta: global ranked evidence (Emerald+ Solo/Duo) for one patch,
 * overall or by role, ranked by presence, pick, ban or win rate. Professional games never enter
 * these numbers: they have their own page (Pro Play).
 */
export default async function SoloQueueMetaPage({ searchParams }: { searchParams: Promise<{ patch?: string }> }) {
  await requirePageAccess("view-trends");
  const { patch: requested } = await searchParams;
  const db = await getAppDb();
  const [team, patch, champions] = await Promise.all([getOrCreateTeam(db), getCurrentPatch(db), listChampions(db)]);
  const lineup = await getActiveLineupProfiles(db, team.id);
  const nameById = new Map(champions.map((c) => [c.id, c.name]));
  const [report, stats] = await Promise.all([buildTrendsReport(db, patch?.patch ?? null, lineup?.players ?? null, (id) => nameById.get(id) ?? id, requested ?? null), loadStatsProvider(db)]);
  const provenance = stats.describe().provenance;
  const regions = provenance?.regions ?? [];
  const championsById = Object.fromEntries(champions.map((c) => [c.id, { id: c.id, name: c.name, portraitUrl: c.portraitUrl }]));
  const champ = (id: string) => championsById[id] ?? { id, name: id, portraitUrl: "" };
  const sourceText = report.source === "demo" ? "Demo statistics (synthetic, not real games)" : `Ranked Solo/Duo games of ${provenance?.tierPopulation ?? "Emerald+"} players${regions.length ? ` · ${regions.map(platformLabel).join(", ")}` : ""}`;

  return (
    <div className="mx-auto max-w-[var(--content-wide)] space-y-3">
      <PageHeader
        title="Solo Queue Meta"
        description={
          report.source === "none" ? (
            "Champion priority in ranked games, by role."
          ) : (
            <>
              Patch <span className="font-medium text-fg">{report.patch}</span> · {report.totalGames.toLocaleString()} games · {sourceText}
              {provenance?.lastGameAt ? ` · newest ${timeAgo(provenance.lastGameAt)}` : ""}
            </>
          )
        }
        actions={
          <div className="flex items-center gap-2">
            {report.source === "demo" ? <Badge tone="warn">Demo data — synthetic</Badge> : null}
            <PatchSwitch basePath="/trends/solo" patches={report.patches} current={report.patch} />
          </div>
        }
      />

      {report.source === "none" ? (
        <Panel>
          <PanelBody className="text-sm text-fg-muted">No statistics yet. They appear once ranked games have been collected.</PanelBody>
        </Panel>
      ) : (
        <>
          {report.newestPatchNote || report.totalGames < 1000 ? (
            <p className="rounded-panel border border-warn/40 bg-warn/5 px-3 py-2 text-sm text-fg-muted" data-testid="trends-limited">
              {report.newestPatchNote ? `${report.newestPatchNote} ` : null}
              {report.totalGames < 1000 ? `Limited data: ${report.totalGames.toLocaleString()} games on patch ${report.patch}. Pick and ban rates of popular champions are already useful; win rates settle as more games arrive.` : null}
            </p>
          ) : null}
          {report.poolAlerts.length > 0 ? (
            <section className="rounded-card border border-warn/40 bg-warn/5 px-3.5 py-2.5" data-testid="trends-pool-alerts">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold">
                For our champion pools
                <InfoTip label="About these notes" text="Recorded change: a balance change entered or confirmed for this patch in Admin → Riot data. Statistical: the champion's win rate in that role moved by 2+ points between patches with 1,000+ games each, and the move is unlikely to be chance; it describes the games, not the reason. Bans: two or more pool champions banned in 15%+ of games. Nothing listed means no reliable change, not no change." />
              </h2>
              <ul className="mt-1 grid gap-x-4 gap-y-1 text-sm lg:grid-cols-2">
                {report.poolAlerts.slice(0, 6).map((a, i) => (
                  <li key={i} className="flex min-w-0 items-center gap-2" data-testid="pool-alert" data-kind={a.kind ?? "statistical"}>
                    <ChampionPortrait champion={champ(a.championId)} size="xs" />
                    <Badge tone={a.kind === "verified" ? "info" : a.kind === "bans" ? "warn" : "neutral"} className="shrink-0">
                      {a.kind === "verified" ? "Recorded change" : a.kind === "bans" ? "Bans" : "Statistical"}
                    </Badge>
                    <span className="min-w-0 text-fg-muted">
                      <Link href={`/players/${a.playerId}`} className="text-fg hover:underline">
                        {a.displayName}
                      </Link>
                      : {a.message}
                    </span>
                    {a.detail ? <InfoTip label="The evidence" text={a.detail} /> : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_20rem]">
            <TrendsBoard
              views={report.views}
              champions={championsById}
              patch={report.patch ?? "—"}
              previousPatch={report.previousPatch}
              showDelta={report.comparison.supported}
              minWinGames={MIN_WIN_RATE_GAMES}
              minRoleGames={MIN_ROLE_GAMES}
            />
            <aside aria-label="Pool alerts and definitions" className="space-y-3">
              <section className="text-xs xl:rounded-card xl:border xl:border-border xl:bg-surface xl:px-3.5 xl:py-3 text-fg-muted" data-testid="trends-definitions">
                {/* Collapsed below wide screens (the board comes first); always open beside it on xl. */}
                <MobileSection title="What the numbers mean" openFrom="xl">
                  <h2 className="hidden text-sm font-semibold text-fg xl:block">What the numbers mean</h2>
                <dl className="mt-1.5 space-y-1.5">
                  <div>
                    <dt className="inline font-medium text-fg">Pick rate</dt> <dd className="inline">share of patch {report.patch} games in which the champion was played{" "}(in that role, on a role tab).</dd>
                  </div>
                  <div>
                    <dt className="inline font-medium text-fg">Ban rate</dt> <dd className="inline">share of games in which it was banned (a ban by both teams counts once). On a role tab its bans are split across the roles it is played in.</dd>
                  </div>
                  <div>
                    <dt className="inline font-medium text-fg">Presence</dt> <dd className="inline">pick rate + ban rate.</dd>
                  </div>
                  <div>
                    <dt className="inline font-medium text-fg">Win rate</dt> <dd className="inline">in the role (main role on Overall), adjusted towards 50% for small samples; ranked only with {MIN_WIN_RATE_GAMES}+ games.</dd>
                  </div>
                  <div>
                    <dt className="inline font-medium text-fg">Role tabs</dt> <dd className="inline">list champions with {MIN_ROLE_GAMES}+ games and at least {Math.round(MIN_ROLE_SHARE * 100)}% of their games in that role.</dd>
                  </div>
                </dl>
                <p className="mt-2">Only patch {report.patch} games are counted; earlier patches are not mixed in.{report.comparison.supported ? "" : ` ${report.comparison.reason ?? ""}`}</p>
                </MobileSection>
              </section>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
