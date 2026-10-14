import type { GlobalCoverage, RankCoverageStatus, RegionCoverageStatus } from "@/server/ops/coverage";
import type { PatchEvidence } from "@/domain/engine/types";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { Info, MetricLabel, SourceLine } from "@/components/ui/metric";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/cn";

const STATUS: Record<RegionCoverageStatus, { label: string; tone: BadgeTone }> = {
  active: { label: "Active", tone: "good" },
  stale: { label: "Stale", tone: "warn" },
  "no-data": { label: "No data", tone: "warn" },
  error: { label: "Error", tone: "bad" },
  pending: { label: "Pending", tone: "neutral" },
  "not-configured": { label: "Not configured", tone: "neutral" },
};

/** Global Data Coverage: one row per Riot server, configured or not, with honest status wording. */
const RANK_STATUS: Record<RankCoverageStatus, { label: string; tone: BadgeTone }> = {
  available: { label: "Available", tone: "good" },
  "no-data": { label: "No current-patch games", tone: "warn" },
  pending: { label: "Pending", tone: "neutral" },
  "not-configured": { label: "Not collected", tone: "neutral" },
};

const PATCH_LABEL: Record<PatchEvidence["label"], string> = { full: "Full weight", reduced: "Reduced weight", fallback: "Fallback evidence", ignored: "Not used" };

/** Ladder bands and the patch window behind the ranked evidence, in plain words. */
export function EvidenceWindow({ coverage, patches }: { coverage: GlobalCoverage; patches: PatchEvidence[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div>
        <div className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-subtle">
          Ladder coverage <Info text={`Which ranked populations the sample comes from. Games are weighted by ladder quality: a game from a lower band counts as a fraction of a Challenger game (never more than one), so Emerald volume adds evidence without outvoting apex quality. Configured: ${coverage.tierPopulation}.`} />
        </div>
        <div className="space-y-1">
          {coverage.ranks.map((r) => (
            <div key={r.band} className="flex flex-wrap items-center gap-2 text-xs">
              <span className="w-28 font-medium text-fg">{r.label}</span>
              <Badge tone={RANK_STATUS[r.status].tone}>{RANK_STATUS[r.status].label}</Badge>
              <span className="text-fg-muted">{r.currentPatchGames.toLocaleString()} current-patch games · {r.totalGames.toLocaleString()} total</span>
              {r.playersTracked ? <span className="text-fg-subtle">{r.playersTracked.toLocaleString()} players tracked</span> : null}
              <span className="text-fg-subtle" title="Evidence weight per game from this band">weight {r.weight}</span>
            </div>
          ))}
        </div>
      </div>
      <div>
        <div className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-subtle">
          Patch evidence window <Info text="Recommendations use the current patch plus the previous two. The current patch always counts in full; older patches count less per game and fade further as the current patch accumulates games, so a brand-new patch leans on its predecessors and a mature one hardly at all. Reworked champions discount their older periods on top." />
        </div>
        {patches.length === 0 ? <p className="text-xs text-fg-muted">No ranked games aggregated yet.</p> : null}
        <div className="space-y-1">
          {patches.map((p) => (
            <div key={p.patch} className="flex flex-wrap items-center gap-2 text-xs">
              <span className="w-28 font-medium text-fg">{p.distance === 0 ? "Current patch" : p.distance === 1 ? "Previous patch" : `${p.distance} patches ago`}</span>
              <span className="font-mono text-fg">{p.patch}</span>
              <span className="text-fg-muted">{p.games.toLocaleString()} games</span>
              <Badge tone={p.label === "full" ? "good" : p.label === "reduced" ? "info" : "neutral"}>{PATCH_LABEL[p.label]}{p.distance > 0 && p.label !== "ignored" ? ` · ${Math.round(p.weight * 100)}% per game` : ""}</Badge>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function CoveragePanel({ coverage, riotConfigured, platformSpec, patches = [] }: { coverage: GlobalCoverage; riotConfigured: boolean; platformSpec: string | undefined; patches?: PatchEvidence[] }) {
  const configured = coverage.regions.filter((r) => r.configured);
  const others = coverage.regions.filter((r) => !r.configured);
  const complete = configured.length > 0 && coverage.withCurrentData === configured.length;
  return (
    <Panel className={!riotConfigured ? undefined : complete ? "border-good/30" : "border-warn/40"}>
      <PanelHeader
        title="Global data coverage"
        subtitle={
          riotConfigured
            ? `${coverage.withCurrentData} of ${configured.length} configured region${configured.length === 1 ? "" : "s"} ${coverage.withCurrentData === 1 ? "has" : "have"} games on patch ${coverage.currentPatch ?? "—"} · RIOT_PLATFORMS=${platformSpec?.trim() || "(unset → " + coverage.configured.join(",") + ")"}${coverage.usedFallback && platformSpec ? " (nothing valid; using the default)" : ""}`
            : "No Riot API key configured: nothing is collected yet."
        }
      />
      <PanelBody className="space-y-3">
        {coverage.unknownConfigured.length ? <p className="text-xs text-warn">Unknown entries in RIOT_PLATFORMS ignored: {coverage.unknownConfigured.join(", ")}. Valid ids: {coverage.regions.map((r) => r.platform).join(", ")} or &quot;all&quot;.</p> : null}
        <EvidenceWindow coverage={coverage} patches={patches} />
        {/* Phones: one card per region; the table needs about 700px. */}
        <div className="space-y-1.5 md:hidden">
          {[...configured, ...others].map((r) => (
            <div key={r.platform} className={cn("rounded-md border border-border bg-bg-elevated px-3 py-2 text-xs", !r.configured && "text-fg-subtle")}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0">
                  <span className="font-semibold text-fg">{r.label}</span> <span className="text-fg-subtle">{r.name}</span>
                  <span className="ml-1 font-mono text-[10px] text-fg-subtle">{r.platform}</span>
                </span>
                <span className="inline-flex items-center gap-1">
                  <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
                  <Info text={r.detail} />
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-fg-muted">
                <span>patch <span className="font-mono text-fg">{r.patch ?? "—"}</span></span>
                <span title="Games stored from this server: current patch / all patches">games <span className={r.currentPatchGames > 0 ? "text-fg" : ""}>{r.currentPatchGames.toLocaleString()}</span> / {r.totalGames.toLocaleString()}</span>
                <span>{r.playersTracked.toLocaleString()} players</span>
                <span>{r.queuePending.toLocaleString()} queued</span>
                <span title={r.lastSyncAt ? r.lastSyncAt.toISOString() : undefined}>sync {r.lastSyncAt ? timeAgo(r.lastSyncAt) : "never"}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="hidden overflow-x-auto md:block">
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
        <SourceLine source={`Riot ranked solo/duo matches of ${coverage.tierPopulation} players, per server`} population="Games = matches stored from that server (current patch / all patches); the engine blends every configured region, weighted by game count and ladder band" updated={coverage.lastSyncAt ? timeAgo(coverage.lastSyncAt) : null} />
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
