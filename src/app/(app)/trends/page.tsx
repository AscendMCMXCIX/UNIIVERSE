import { ROLES } from "@/domain/roles";
import { getAppDb } from "@/server/bootstrap";
import { requirePageAccess } from "@/server/auth/page-access";
import { getCurrentPatch, listChampions } from "@/server/repositories/champions";
import { getActiveLineupProfiles, getOrCreateTeam } from "@/server/repositories/team";
import { buildTrendsReport, MIN_STRONG_GAMES, type ChampionTrend } from "@/server/trends";
import { loadProDraftPatterns } from "@/server/pro/patterns";
import { ProPatternsPanel } from "@/components/predraft/pro-patterns";
import { ErrorBoundary } from "@/components/error-boundary";
import { ChampionPortrait } from "@/components/champion-portrait";
import { Badge } from "@/components/ui/badge";
import { Panel, PanelBody } from "@/components/ui/panel";
import { PageHeader } from "@/components/ui/page-header";
import { RoleTrends, TrendList, type TrendItem } from "@/components/trends/trend-list";
import { percent, timeAgo } from "@/lib/format";
import { SourceLine } from "@/components/ui/metric";
import { platformLabel } from "@/domain/riot-platforms";
import { loadStatsProvider } from "@/server/stats/loader";

export const dynamic = "force-dynamic";

export default async function TrendsPage() {
  await requirePageAccess("view-trends");
  const db = await getAppDb();
  const [team, patch, champions] = await Promise.all([getOrCreateTeam(db), getCurrentPatch(db), listChampions(db)]);
  const lineup = await getActiveLineupProfiles(db, team.id);
  const nameById = new Map(champions.map((c) => [c.id, c.name]));
  const [report, patterns, stats] = await Promise.all([buildTrendsReport(db, patch?.patch ?? null, lineup?.players ?? null, (id) => nameById.get(id) ?? id), loadProDraftPatterns(db), loadStatsProvider(db)]);
  const provenance = stats.describe().provenance;
  const regions = provenance?.regions ?? [];
  const sourceText = report.source === "demo" ? "Demo statistics (synthetic, not real games)" : `Riot ranked solo/duo matches of ${provenance?.tierPopulation ?? "Emerald+"} players${regions.length ? ` from ${regions.length} region${regions.length === 1 ? "" : "s"} (${regions.map(platformLabel).join(", ")})` : ""}`;
  const patchWindow = (provenance?.patches ?? []).filter((p) => p.label !== "ignored");
  const windowText = patchWindow.length > 1 ? ` Evidence window: ${patchWindow.map((p) => `${p.patch} (${p.games.toLocaleString()} games, ${p.distance === 0 ? "full weight" : `up to ${Math.round(p.weight * 100)}% per game`})`).join(", ")}.` : "";
  const populationText = `${report.totalGames.toLocaleString()} games on patch ${report.patch ?? "—"}; rates are per game of that patch, win rates shrunk towards 50% for small samples.${windowText}`;
  const championsById = Object.fromEntries(champions.map((c) => [c.id, { id: c.id, name: c.name, portraitUrl: c.portraitUrl }]));
  const byId = new Map(champions.map((c) => [c.id, { id: c.id, name: c.name, portraitUrl: c.portraitUrl }]));
  const champ = (id: string) => byId.get(id) ?? { id, name: id, portraitUrl: "" };
  const item = (t: ChampionTrend): TrendItem => ({ championId: t.championId, name: champ(t.championId).name, portraitUrl: champ(t.championId).portraitUrl, role: t.role, pickRate: t.pickRate, banRate: t.banRate, winRate: t.winRate, games: t.games, confidence: t.confidence, presenceDelta: t.presenceDelta, proPresence: t.proPresence });
  const byRole = Object.fromEntries(ROLES.map((r) => [r, report.byRole[r].map(item)])) as Record<(typeof ROLES)[number], TrendItem[]>;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Trends"
        description={
          <>
            Patch {report.patch ?? "—"}
            {report.previousPatch ? ` compared with ${report.previousPatch}` : ""} · {report.totalGames.toLocaleString()} games
          </>
        }
        actions={report.source === "demo" ? <Badge tone="warn">Demo data — synthetic</Badge> : null}
      />
      {report.source !== "none" ? <SourceLine source={sourceText} population={populationText} updated={provenance?.lastGameAt ? `newest game ${timeAgo(provenance.lastGameAt)}` : null} /> : null}

      {report.source === "none" ? (
        <Panel>
          <PanelBody className="text-sm text-fg-muted">No statistics yet. They appear once ranked games have been collected.</PanelBody>
        </Panel>
      ) : null}

      {report.poolAlerts.length > 0 ? (
        <section className="rounded-2xl border border-warn/40 bg-warn/5 p-4">
          <h2 className="text-base font-semibold">For our champion pools</h2>
          <ul className="mt-2 space-y-2 text-sm">
            {report.poolAlerts.slice(0, 5).map((a, i) => (
              <li key={i} className="flex items-center gap-2.5">
                <ChampionPortrait champion={champ(a.championId)} size="sm" />
                <span className="text-fg-muted">{a.message}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {report.source !== "none" && report.totalGames < 1000 ? (
        <p className="rounded-xl border border-warn/40 bg-warn/5 px-4 py-3 text-sm text-fg-muted" data-testid="trends-limited">
          <span className="font-medium text-fg">Limited data:</span> {report.totalGames.toLocaleString()} games on this patch so far. Rates for popular champions are already useful; rare champions and win rates settle as more games arrive.
        </p>
      ) : null}

      {report.source !== "none" ? (
        <div className="grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3">
          <TrendList title="Highest presence" subtitle="Picked or banned in the most games" info="Presence = pick rate + ban rate: the share of games in which the champion appears in champion select at all." items={report.contested.map(item)} testId="trends-contested" />
          <TrendList title="Most picked" subtitle="Share of games the champion was played" metric="pick" items={report.mostPicked.map(item)} testId="trends-picked" />
          <TrendList title="Most banned" subtitle="Share of games the champion was banned" metric="ban" items={report.mostBanned.map(item)} testId="trends-banned" />
        </div>
      ) : null}

      {report.source !== "none" ? (
        <div className="grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3">
          <TrendList
            title="Strong performing"
            subtitle={`Highest win rate in their main role, ${MIN_STRONG_GAMES}+ games`}
            info="Win rates are adjusted towards 50% for small samples (a champion needs many games before its win rate moves far from 50%)."
            metric="win"
            items={report.strong.map(item)}
            empty={`No champion has ${MIN_STRONG_GAMES}+ games in one role and an adjusted win rate above 50% yet.`}
            testId="trends-strong"
          />
          {report.comparison.supported ? (
            <>
              <TrendList title="Rising" subtitle={`Presence up since ${report.previousPatch} (points)`} items={report.rising.map(item)} showDelta empty="No clear risers." testId="trends-rising" />
              <TrendList title="Falling" subtitle={`Presence down since ${report.previousPatch} (points)`} items={report.falling.map(item)} showDelta empty="No clear fallers." testId="trends-falling" />
            </>
          ) : (
            <section className="flex h-full flex-col justify-center rounded-2xl border border-dashed border-border p-4 text-sm text-fg-muted md:col-span-1 xl:col-span-2" data-testid="trends-comparison-note">
              <h2 className="text-base font-semibold text-fg">Rising and falling</h2>
              <p className="mt-1">{report.comparison.reason}</p>
            </section>
          )}
        </div>
      ) : null}

      {report.source !== "none" ? <RoleTrends byRole={byRole} /> : null}

      {report.pro.length > 0 ? (
        <section className="rounded-2xl border border-border bg-surface p-4" data-testid="trends-pro">
          <h2 className="text-base font-semibold">Professional priority</h2>
          <p className="text-xs text-fg-muted">Pick + ban presence in {report.pro[0]?.games ?? 0} pro games this patch.</p>
          <ol className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {report.pro.slice(0, 10).map((p, i) => (
              <li key={p.championId} className="flex items-center gap-2 rounded-lg bg-bg-elevated px-2 py-1.5">
                <span className="w-4 text-right text-xs font-semibold text-fg-subtle">{i + 1}</span>
                <ChampionPortrait champion={champ(p.championId)} size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm">{champ(p.championId).name}</span>
                <span className="text-xs font-semibold text-info">{percent(p.presence, 0)}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {report.source !== "none" ? (
        <details className="group rounded-2xl border border-border bg-surface">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 text-sm font-medium text-fg-muted hover:text-fg">
            Professional draft patterns
            <span className="text-xs font-normal text-fg-subtle group-open:hidden">Show</span>
            <span className="hidden text-xs font-normal text-fg-subtle group-open:inline">Hide</span>
          </summary>
          <div className="border-t border-border p-3">
            <ErrorBoundary label="Professional draft patterns" compact>
              <ProPatternsPanel patterns={patterns} championsById={championsById} compact />
            </ErrorBoundary>
          </div>
        </details>
      ) : null}
    </div>
  );
}
