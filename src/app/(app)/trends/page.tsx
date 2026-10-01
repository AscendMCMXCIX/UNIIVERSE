import { ROLES, ROLE_LABELS } from "@/domain/roles";
import { getAppDb } from "@/server/bootstrap";
import { getCurrentPatch, listChampions } from "@/server/repositories/champions";
import { getActiveLineupProfiles, getOrCreateTeam } from "@/server/repositories/team";
import { buildTrendsReport, type ChampionTrend } from "@/server/trends";
import { loadProDraftPatterns } from "@/server/pro/patterns";
import { ProPatternsPanel } from "@/components/predraft/pro-patterns";
import { ChampionPortrait } from "@/components/champion-portrait";
import { RoleIcon } from "@/components/role-icon";
import { Badge } from "@/components/ui/badge";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { percent, signedPoints } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function TrendsPage() {
  const db = await getAppDb();
  const [team, patch, champions] = await Promise.all([getOrCreateTeam(db), getCurrentPatch(db), listChampions(db)]);
  const lineup = await getActiveLineupProfiles(db, team.id);
  const [report, patterns] = await Promise.all([buildTrendsReport(db, patch?.patch ?? null, lineup?.players ?? null), loadProDraftPatterns(db)]);
  const championsById = Object.fromEntries(champions.map((c) => [c.id, { id: c.id, name: c.name, portraitUrl: c.portraitUrl }]));
  const byId = new Map(champions.map((c) => [c.id, { id: c.id, name: c.name, portraitUrl: c.portraitUrl }]));
  const champ = (id: string) => byId.get(id) ?? { id, name: id, portraitUrl: "" };

  const Row = ({ t, showDelta = true }: { t: ChampionTrend; showDelta?: boolean }) => (
    <div className="flex items-center gap-3 py-1.5">
      <ChampionPortrait champion={champ(t.championId)} size="sm" />
      <div className="w-32 min-w-0">
        <div className="truncate text-sm font-medium">{champ(t.championId).name}</div>
        <div className="flex items-center gap-1 text-[11px] text-fg-subtle">{t.role ? <><RoleIcon role={t.role} className="h-3 w-3" /> {ROLE_LABELS[t.role]}</> : null}</div>
      </div>
      <div className="w-20 text-xs text-fg-muted" title="Pick rate">{percent(t.pickRate, 0)} pick</div>
      <div className="w-20 text-xs text-fg-muted" title="Ban rate">{percent(t.banRate, 0)} ban</div>
      <div className="w-24 text-xs" title={`${t.games} games`}>
        <span className={t.confidence < 0.3 ? "text-fg-subtle" : "text-fg"}>{percent(t.winRate)}</span>
        {t.confidence < 0.3 ? <span className="ml-1 text-[10px] text-fg-subtle">low data</span> : null}
      </div>
      {showDelta ? (
        <div className="w-20 text-xs">
          {t.presenceDelta !== null ? <span className={t.presenceDelta > 0 ? "text-good" : t.presenceDelta < 0 ? "text-bad" : "text-fg-subtle"}>{signedPoints(t.presenceDelta, 1)} pres.</span> : <span className="text-fg-subtle">—</span>}
        </div>
      ) : null}
      {t.proPresence > 0 ? <Badge tone="info">{percent(t.proPresence, 0)} pro</Badge> : null}
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-bold">Trends</h1>
          <p className="text-sm text-fg-muted">
            Patch {report.patch ?? "—"}
            {report.previousPatch ? ` vs ${report.previousPatch}` : ""} · {report.totalGames.toLocaleString()} games · source: {report.source}
          </p>
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
          <PanelHeader title="MOST CONTESTED" subtitle="Highest pick + ban presence this patch" />
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

      {report.source !== "none" ? <ProPatternsPanel patterns={patterns} championsById={championsById} compact /> : null}

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
                    <span className="text-fg-subtle">{percent(t.pickRate, 0)}</span>
                    <span className={t.confidence < 0.3 ? "text-fg-subtle" : "text-fg-muted"}>{percent(t.winRate)}</span>
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
