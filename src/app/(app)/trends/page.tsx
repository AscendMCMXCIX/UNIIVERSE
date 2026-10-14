import { ROLES, ROLE_LABELS } from "@/domain/roles";
import { getAppDb } from "@/server/bootstrap";
import { requirePageAccess } from "@/server/auth/page-access";
import { getCurrentPatch, listChampions } from "@/server/repositories/champions";
import { getActiveLineupProfiles, getOrCreateTeam } from "@/server/repositories/team";
import { buildTrendsReport, type ChampionTrend } from "@/server/trends";
import { loadProDraftPatterns } from "@/server/pro/patterns";
import { ProPatternsPanel } from "@/components/predraft/pro-patterns";
import { ErrorBoundary } from "@/components/error-boundary";
import { ChampionPortrait } from "@/components/champion-portrait";
import { RoleIcon } from "@/components/role-icon";
import { Badge } from "@/components/ui/badge";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { percent, signedPoints, timeAgo } from "@/lib/format";
import { metricTooltip } from "@/domain/metrics";
import { Info, SourceLine } from "@/components/ui/metric";
import { platformLabel } from "@/domain/riot-platforms";
import { loadStatsProvider } from "@/server/stats/loader";

export const dynamic = "force-dynamic";

export default async function TrendsPage() {
  await requirePageAccess("view-trends");
  const db = await getAppDb();
  const [team, patch, champions] = await Promise.all([getOrCreateTeam(db), getCurrentPatch(db), listChampions(db)]);
  const lineup = await getActiveLineupProfiles(db, team.id);
  const [report, patterns, stats] = await Promise.all([buildTrendsReport(db, patch?.patch ?? null, lineup?.players ?? null), loadProDraftPatterns(db), loadStatsProvider(db)]);
  const provenance = stats.describe().provenance;
  const regions = provenance?.regions ?? [];
  const sourceText = report.source === "demo" ? "Demo statistics (synthetic, not real games)" : `Riot ranked solo/duo matches of ${provenance?.tierPopulation ?? "Emerald+"} players${regions.length ? ` from ${regions.length} region${regions.length === 1 ? "" : "s"} (${regions.map(platformLabel).join(", ")})` : ""}`;
  const patchWindow = (provenance?.patches ?? []).filter((p) => p.label !== "ignored");
  const windowText = patchWindow.length > 1 ? ` Evidence window: ${patchWindow.map((p) => `${p.patch} (${p.games.toLocaleString()} games, ${p.distance === 0 ? "full weight" : `${Math.round(p.weight * 100)}% per game`})`).join(", ")}.` : "";
  const populationText = `${report.totalGames.toLocaleString()} games on patch ${report.patch ?? "—"}; rates are per game of that patch, win rates shrunk towards 50% for small samples.${windowText}`;
  const championsById = Object.fromEntries(champions.map((c) => [c.id, { id: c.id, name: c.name, portraitUrl: c.portraitUrl }]));
  const byId = new Map(champions.map((c) => [c.id, { id: c.id, name: c.name, portraitUrl: c.portraitUrl }]));
  const champ = (id: string) => byId.get(id) ?? { id, name: id, portraitUrl: "" };

  const Row = ({ t, showDelta = true }: { t: ChampionTrend; showDelta?: boolean }) => (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
      <ChampionPortrait champion={champ(t.championId)} size="sm" />
      <div className="w-28 min-w-0 flex-1 sm:w-32 sm:flex-none">
        <div className="truncate text-sm font-medium">{champ(t.championId).name}</div>
        <div className="flex items-center gap-1 text-[11px] text-fg-subtle">{t.role ? <><RoleIcon role={t.role} className="h-3 w-3" /> {ROLE_LABELS[t.role]}</> : null}</div>
      </div>
      <div className="flex basis-full flex-wrap items-center gap-x-3 gap-y-0.5 pl-12 text-xs sm:basis-auto sm:flex-1 sm:pl-0">
        <span className="w-16 text-fg-muted sm:w-20" title={metricTooltip("pick-rate")}>{percent(t.pickRate, 0)} pick</span>
        <span className="w-16 text-fg-muted sm:w-20" title={metricTooltip("ban-rate")}>{percent(t.banRate, 0)} ban</span>
        <span className="w-28" title={`${metricTooltip("win-rate")} Sample: ${t.games.toLocaleString()} games.`}>
          <span className={t.confidence < 0.3 ? "text-fg-subtle" : "text-fg"}>{percent(t.winRate)} win</span>
          <span className="ml-1 text-[10px] text-fg-subtle">{t.confidence < 0.3 ? `low data (${t.games})` : `${t.games.toLocaleString()} g`}</span>
        </span>
        {showDelta ? (
          <span className="w-28 sm:w-24" title={metricTooltip("presence-delta")}>
            {t.presenceDelta !== null ? <span className={t.presenceDelta > 0 ? "text-good" : t.presenceDelta < 0 ? "text-bad" : "text-fg-subtle"}>{signedPoints(t.presenceDelta, 1)} pts presence</span> : <span className="text-fg-subtle">—</span>}
          </span>
        ) : null}
        {t.proPresence > 0 ? <Badge tone="info" title={metricTooltip("pro-presence")}>{percent(t.proPresence, 0)} pro</Badge> : null}
      </div>
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-bold">Trends</h1>
          <p className="text-sm text-fg-muted">
            Patch {report.patch ?? "—"}
            {report.previousPatch ? ` vs ${report.previousPatch}` : ""} · {report.totalGames.toLocaleString()} games · source: {report.source === "ranked" ? "Riot ranked matches" : report.source}
          </p>
          {report.source !== "none" ? <SourceLine source={sourceText} population={populationText} updated={provenance?.lastGameAt ? `newest game ${timeAgo(provenance.lastGameAt)}` : null} className="mt-1" /> : null}
        </div>
        {report.source === "demo" ? <Badge tone="warn">DEMO DATA — synthetic</Badge> : null}
      </div>

      {report.source === "none" ? (
        <Panel>
          <PanelBody className="text-sm text-fg-muted">No statistics yet. Configure the Riot API key in Settings to start ranked ingestion, or seed demo statistics to explore.</PanelBody>
        </Panel>
      ) : null}

      {report.poolAlerts.length > 0 ? (
        <Panel className="border-warn/40">
          <PanelHeader title="POOL ALERTS" subtitle="Changes that affect the active lineup's champion pools" />
          <PanelBody className="space-y-1 text-sm">
            {report.poolAlerts.map((a, i) => (
              <div key={i} className="flex items-center gap-2">
                <ChampionPortrait champion={champ(a.championId)} size="xs" />
                <Badge tone={a.severity === "warn" ? "warn" : "info"}>{a.severity}</Badge>
                <span className="text-fg-muted">{a.message}</span>
              </div>
            ))}
          </PanelBody>
        </Panel>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="MOST CONTESTED" subtitle={<span className="inline-flex items-center gap-1">Highest pick + ban presence this patch <Info text="Presence = pick rate + ban rate: the share of games in which the champion appears in champion select at all." /></span>} />
          <PanelBody className="divide-y divide-border">{report.contested.map((t) => <Row key={t.championId} t={t} />)}</PanelBody>
        </Panel>
        <div className="space-y-5">
          <Panel>
            <PanelHeader title="RISING" subtitle="Presence up versus the previous patch" />
            <PanelBody className="divide-y divide-border">{report.rising.length ? report.rising.map((t) => <Row key={t.championId} t={t} />) : <p className="text-sm text-fg-muted">Not enough history yet.</p>}</PanelBody>
          </Panel>
          <Panel>
            <PanelHeader title="FALLING" subtitle="Presence down versus the previous patch" />
            <PanelBody className="divide-y divide-border">{report.falling.length ? report.falling.map((t) => <Row key={t.championId} t={t} />) : <p className="text-sm text-fg-muted">Not enough history yet.</p>}</PanelBody>
          </Panel>
        </div>
      </div>

      {report.pro.length > 0 ? (
        <Panel>
          <PanelHeader title="PROFESSIONAL PRIORITY" subtitle={`${report.pro[0]?.games ?? 0} pro games this patch`} />
          <PanelBody className="flex flex-wrap gap-2">
            {report.pro.map((p) => (
              <div key={p.championId} className="flex items-center gap-2 rounded-md border border-border px-2 py-1">
                <ChampionPortrait champion={champ(p.championId)} size="xs" />
                <span className="text-xs">{champ(p.championId).name}</span>
                <Badge tone="info">{percent(p.presence, 0)}</Badge>
              </div>
            ))}
          </PanelBody>
        </Panel>
      ) : null}

      {report.source !== "none" ? (
        <ErrorBoundary label="Professional draft patterns" compact>
          <ProPatternsPanel patterns={patterns} championsById={championsById} compact />
        </ErrorBoundary>
      ) : null}

      <Panel>
        <PanelHeader title="BY ROLE" subtitle="Most played champions per role" />
        <PanelBody className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {ROLES.map((role) => (
            <div key={role}>
              <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-fg-muted">
                <RoleIcon role={role} className="h-4 w-4 text-accent" /> {ROLE_LABELS[role]}
              </div>
              <div className="space-y-1">
                {report.byRole[role].map((t) => (
                  <div key={t.championId} className="flex items-center gap-2 text-xs">
                    <ChampionPortrait champion={champ(t.championId)} size="xs" />
                    <span className="w-20 truncate">{champ(t.championId).name}</span>
                    <span className="text-fg-subtle" title={metricTooltip("pick-rate")}>{percent(t.pickRate, 0)} pick</span>
                    <span className={t.confidence < 0.3 ? "text-fg-subtle" : "text-fg-muted"} title={`${metricTooltip("win-rate")} Sample: ${t.games} games.`}>{percent(t.winRate)} win</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </PanelBody>
      </Panel>
    </div>
  );
}
