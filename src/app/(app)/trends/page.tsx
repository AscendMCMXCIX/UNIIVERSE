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
import { timeAgo } from "@/lib/format";
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

  const proItems: TrendItem[] = report.pro.map((p) => ({ championId: p.championId, name: champ(p.championId).name, portraitUrl: champ(p.championId).portraitUrl, role: null, pickRate: p.presence, banRate: 0, winRate: 0.5, games: p.games, confidence: 1, presenceDelta: null, proPresence: p.presence, pro: true }));

  return (
    <div className="mx-auto max-w-[1600px] space-y-4">
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

      {report.source !== "none" && report.totalGames < 1000 ? (
        <p className="rounded-xl border border-warn/40 bg-warn/5 px-4 py-2.5 text-sm text-fg-muted" data-testid="trends-limited">
          <span className="font-medium text-fg">Limited data:</span> {report.totalGames.toLocaleString()} games on this patch so far. Rates for popular champions are already useful; rare champions and win rates settle as more games arrive.
        </p>
      ) : null}

      {report.poolAlerts.length > 0 ? (
        <section className="rounded-2xl border border-warn/40 bg-warn/5 px-4 py-3" data-testid="trends-pool-alerts">
          <h2 className="text-sm font-semibold">For our champion pools</h2>
          <ul className="mt-1.5 grid gap-x-4 gap-y-1.5 text-sm md:grid-cols-2">
            {report.poolAlerts.slice(0, 6).map((a, i) => (
              <li key={i} className="flex items-center gap-2">
                <ChampionPortrait champion={champ(a.championId)} size="xs" />
                <span className="min-w-0 text-fg-muted">{a.message}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {report.source !== "none" ? (
        <div className="grid items-stretch gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" data-testid="trends-grid">
          <TrendList title="Highest presence" subtitle="Picked or banned" info="Presence = pick rate + ban rate: the share of games in which the champion appears in champion select at all." items={report.contested.map(item)} testId="trends-contested" />
          <TrendList title="Most picked" subtitle="Share of games played" metric="pick" items={report.mostPicked.map(item)} testId="trends-picked" />
          <TrendList title="Most banned" subtitle="Share of games banned" metric="ban" items={report.mostBanned.map(item)} testId="trends-banned" />
          <TrendList
            title="Strong performing"
            subtitle={`${MIN_STRONG_GAMES}+ games in main role`}
            info="Highest win rate in the champion's main role. Win rates are adjusted towards 50% for small samples (a champion needs many games before its win rate moves far from 50%)."
            metric="win"
            items={report.strong.map(item)}
            empty={`No champion has ${MIN_STRONG_GAMES}+ games in one role and an adjusted win rate above 50% yet.`}
            testId="trends-strong"
          />
          <RoleTrends byRole={byRole} />
          {report.comparison.supported ? (
            <>
              <TrendList title="Rising" subtitle={`Presence up since ${report.previousPatch}`} items={report.rising.map(item)} showDelta empty="No clear risers." testId="trends-rising" />
              <TrendList title="Falling" subtitle={`Presence down since ${report.previousPatch}`} items={report.falling.map(item)} showDelta empty="No clear fallers." testId="trends-falling" />
            </>
          ) : (
            <section className="self-start rounded-2xl border border-dashed border-border p-4 text-sm text-fg-muted" data-testid="trends-comparison-note">
              <h2 className="text-sm font-semibold text-fg">Rising and falling</h2>
              <p className="mt-1">{report.comparison.reason}</p>
            </section>
          )}
          {proItems.length > 0 ? <TrendList title="Professional priority" subtitle={`Pick + ban, ${report.pro[0]?.games ?? 0} pro games`} metric="pick" items={proItems} testId="trends-pro" /> : null}
        </div>
      ) : null}

      {report.source !== "none" ? (
        <details className="group rounded-2xl border border-border bg-surface">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-4 text-sm font-medium text-fg-muted hover:text-fg">
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
