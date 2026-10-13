import type { GlobalCoverage, RegionCoverageStatus } from "@/server/ops/coverage";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { Info, MetricLabel, SourceLine } from "@/components/ui/metric";
import { timeAgo } from "@/lib/format";

const STATUS: Record<RegionCoverageStatus, { label: string; tone: BadgeTone }> = {
  active: { label: "Active", tone: "good" },
  stale: { label: "Stale", tone: "warn" },
  "no-data": { label: "No data", tone: "warn" },
  error: { label: "Error", tone: "bad" },
  pending: { label: "Pending", tone: "neutral" },
  "not-configured": { label: "Not configured", tone: "neutral" },
};

/** Global Data Coverage: one row per Riot server, configured or not, with honest status wording. */
export function CoveragePanel({ coverage, riotConfigured, platformSpec }: { coverage: GlobalCoverage; riotConfigured: boolean; platformSpec: string | undefined }) {
  const configured = coverage.regions.filter((r) => r.configured);
  const others = coverage.regions.filter((r) => !r.configured);
  const complete = configured.length > 0 && coverage.withCurrentData === configured.length;
  return (
    <Panel className={!riotConfigured ? undefined : complete ? "border-good/30" : "border-warn/40"}>
      <PanelHeader
        title="GLOBAL DATA COVERAGE"
        subtitle={
          riotConfigured
            ? `${coverage.withCurrentData} of ${configured.length} configured region${configured.length === 1 ? "" : "s"} ${coverage.withCurrentData === 1 ? "has" : "have"} games on patch ${coverage.currentPatch ?? "—"} · RIOT_PLATFORMS=${platformSpec?.trim() || "(unset → " + coverage.configured.join(",") + ")"}${coverage.usedFallback && platformSpec ? " (nothing valid; using the default)" : ""}`
            : "No Riot API key configured: nothing is collected yet."
        }
      />
      <PanelBody className="space-y-3">
        {coverage.unknownConfigured.length ? <p className="text-xs text-warn">Unknown entries in RIOT_PLATFORMS ignored: {coverage.unknownConfigured.join(", ")}. Valid ids: {coverage.regions.map((r) => r.platform).join(", ")} or &quot;all&quot;.</p> : null}
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-left text-fg-subtle">
              <tr>
                <th className="py-1 pr-3 font-medium">Region</th>
                <th className="py-1 pr-3 font-medium">Status</th>
                <th className="py-1 pr-3 font-medium">Patch</th>
                <th className="py-1 pr-3 font-medium"><MetricLabel id="region-games">Games (current patch / all)</MetricLabel></th>
                <th className="py-1 pr-3 font-medium"><MetricLabel id="players-tracked" /></th>
                <th className="py-1 pr-3 font-medium"><MetricLabel id="queue-pending" /></th>
                <th className="py-1 pr-3 font-medium">Last sync</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {[...configured, ...others].map((r) => (
                <tr key={r.platform} className={r.configured ? "align-top" : "align-top text-fg-subtle"}>
                  <td className="py-1.5 pr-3">
                    <span className="font-semibold text-fg">{r.label}</span> <span className="text-fg-subtle">{r.name}</span>
                    <span className="ml-1 font-mono text-[10px] text-fg-subtle">{r.platform}</span>
                  </td>
                  <td className="py-1.5 pr-3">
                    <span className="inline-flex items-center gap-1">
                      <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
                      <Info text={r.detail} />
                    </span>
                  </td>
                  <td className="py-1.5 pr-3 font-mono">{r.patch ?? "—"}</td>
                  <td className="py-1.5 pr-3">
                    <span className={r.currentPatchGames > 0 ? "text-fg" : "text-fg-subtle"}>{r.currentPatchGames.toLocaleString()}</span> <span className="text-fg-subtle">/ {r.totalGames.toLocaleString()}</span>
                  </td>
                  <td className="py-1.5 pr-3">{r.playersTracked.toLocaleString()}</td>
                  <td className="py-1.5 pr-3">{r.queuePending.toLocaleString()}</td>
                  <td className="py-1.5 pr-3" title={r.lastSyncAt ? r.lastSyncAt.toISOString() : undefined}>{r.lastSyncAt ? timeAgo(r.lastSyncAt) : "never"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <SourceLine source="Riot ranked solo/duo matches of Challenger, Grandmaster and Master players, per server" population="Games = matches stored from that server (current patch / all patches); the engine blends every configured region, weighted by game count" updated={coverage.lastSyncAt ? timeAgo(coverage.lastSyncAt) : null} />
        <p className="text-[11px] text-fg-subtle">Collection is incremental and bounded: each run refreshes a few ladders, scans a fair share of players per region and fetches queued matches for all regions in parallel within Riot&apos;s per-host rate limits. A newly added region shows <em>Pending</em>, then <em>No data</em> while its first matches are queued, then <em>Active</em>.</p>
      </PanelBody>
    </Panel>
  );
}

export function DatasetsList({ datasets }: { datasets: Array<{ key: string; title: string; source: string; updatedAt: Date | null; detail: string }> }) {
  return (
    <div className="grid gap-2 md:grid-cols-2">
      {datasets.map((d) => (
        <div key={d.key} className="rounded-md border border-border bg-bg-elevated px-3 py-2 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-fg">{d.title}</span>
            <span className="text-fg-subtle" title={d.updatedAt ? d.updatedAt.toISOString() : undefined}>updated {d.updatedAt ? timeAgo(d.updatedAt) : "never"}</span>
          </div>
          <div className="text-fg-muted">{d.detail}</div>
          <div className="text-[11px] text-fg-subtle">Source: {d.source}</div>
        </div>
      ))}
    </div>
  );
}
