"use client";

import * as React from "react";
import { HelpCircle, Pin, PinOff } from "lucide-react";
import { ROLE_LABELS, type Role } from "@/domain/roles";
import type { CandidateSummary, EmergencyAlert, EnemyResponse, PickBreakdown, PinchWarning, RecommendationConfidence, StatsDescription, TeamRealism, ThreatEntry, WhatIfTrigger, WhyNotComparison } from "@/domain/engine";
import { metricTooltip } from "@/domain/metrics";
import { platformLabel } from "@/domain/riot-platforms";
import { TIER_LABELS, type ProficiencyTier } from "@/domain/proficiency";
import { Info, MetricLabel } from "@/components/ui/metric";
import { timeAgo } from "@/lib/format";
import { whyNotAction } from "@/server/actions/drafts";
import { ChampionPortrait } from "@/components/champion-portrait";
import type { PickerChampion } from "@/components/champion-picker";
import { RoleIcon } from "@/components/role-icon";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel, PanelBody, PanelHeader, SectionLabel } from "@/components/ui/panel";
import { cn } from "@/lib/cn";
import { signedPoints } from "@/lib/format";

type ChampionLookup = (id: string | null | undefined) => PickerChampion | null;

const DECISION_TONE: Record<RecommendationConfidence["level"], BadgeTone> = { strong: "good", moderate: "info", close: "warn", low: "neutral" };

/** Honest decision label: how clearly the top option separates from the rest. */
export function DecisionBadge({ decision }: { decision: RecommendationConfidence | null }) {
  if (!decision) return null;
  return (
    <span className="inline-flex items-center gap-1">
      <Badge tone={DECISION_TONE[decision.level]} title={decision.reason}>
        {decision.label}
        {decision.gap !== null ? <span className="opacity-70">· decision gap {signedPoints(decision.gap)} win-rate pts</span> : null}
      </Badge>
      <Info text={`${decision.reason} ${metricTooltip("decision-gap")}`} />
    </span>
  );
}

/** Where the numbers come from: regions, ladder, games, freshness, and whose player data was used. */
export function EvidenceLine({ stats, playerData, playerName }: { stats: StatsDescription; playerData: { withData: string[]; withoutData: string[] }; playerName: (id: string | null | undefined) => string }) {
  const p = stats.provenance;
  const regions = p?.regions ?? [];
  const source = stats.isDemo ? "demo statistics (synthetic)" : stats.totalGames === 0 ? "no game statistics yet (curated champion model and pools only)" : `${Math.round(stats.totalGames).toLocaleString()} effective ranked games · ${p?.tierPopulation ?? "MASTER+"} · ${regions.length ? `${regions.length} region${regions.length === 1 ? "" : "s"} (${regions.slice(0, 6).map(platformLabel).join(", ")}${regions.length > 6 ? "…" : ""})` : "regions unknown"}${p?.lastGameAt ? ` · newest game ${timeAgo(p.lastGameAt)}` : ""}${p?.proGames ? ` · ${p.proGames} pro games` : ""}`;
  return (
    <p className="text-[11px] text-fg-subtle">
      Source: {source}
      {" · Player data: "}
      {playerData.withData.length ? `${playerData.withData.map(playerName).join(", ")}` : "none linked"}
      {playerData.withoutData.length ? <span title={`No linked-account data for ${playerData.withoutData.map(playerName).join(", ")}: their pool order alone is used.`}> · no data for {playerData.withoutData.map(playerName).join(", ")}</span> : null}
    </p>
  );
}

const BREAKDOWN_LABEL: Record<PickBreakdown["items"][number]["key"], Parameters<typeof MetricLabel>[0]["id"]> = {
  "team-fit": "team-fit",
  "enemy-interaction": "enemy-interaction",
  "player-proficiency": "player-proficiency",
  "patch-strength": "patch-strength",
  "pro-priority": "pro-priority",
  realism: "realism",
  timing: "timing",
};

/** Expandable "Why this pick?": each factor the engine weighed, in labelled win-rate points. */
export function WhyThisPick({ breakdown, defaultOpen = false, showDecisive = true }: { breakdown: PickBreakdown; defaultOpen?: boolean; showDecisive?: boolean }) {
  const tone = (v: number) => (v > 0.002 ? "text-good" : v < -0.002 ? "text-warn" : "text-fg-subtle");
  return (
    <details className="rounded-md border border-border bg-surface-2/40 px-3 py-2 text-xs" open={defaultOpen}>
      <summary className="cursor-pointer select-none font-semibold tracking-wide text-fg">WHY THIS PICK?</summary>
      <div className="mt-2 space-y-1.5">
        {showDecisive && breakdown.proficiencyDecisive ? <p className="rounded-sm border border-accent/40 bg-accent/10 px-2 py-1 text-fg">{breakdown.proficiencyDecisive}</p> : null}
        <table className="w-full">
          <tbody>
            {breakdown.items.map((i) => (
              <tr key={i.key} className="align-top">
                <td className="w-36 py-0.5 pr-2 text-fg-muted">
                  <MetricLabel id={BREAKDOWN_LABEL[i.key]} />
                </td>
                <td className={cn("w-16 py-0.5 pr-2 text-right font-mono", tone(i.value))}>{signedPoints(i.value)}</td>
                <td className="py-0.5 text-fg-muted">{i.text}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-fg-subtle">
          <span>Values in win-rate points for the projected full team with this pick locked.</span>
          <span className="inline-flex items-center gap-1">
            <MetricLabel id="evidence-confidence" />: {breakdown.evidence.label} ({breakdown.evidence.games.toLocaleString()} games)
          </span>
          {breakdown.proficiency ? (
            <span className="inline-flex items-center gap-1" title="Linked-account proficiency for this player on this champion">
              Linked accounts: {TIER_LABELS[breakdown.proficiency.tier as ProficiencyTier] ?? breakdown.proficiency.tier} · {breakdown.proficiency.games} games · {breakdown.proficiency.recentGames} recent · contributes {signedPoints(breakdown.proficiencyContribution)}
            </span>
          ) : (
            <span>Linked accounts: no data for this player on this champion.</span>
          )}
        </p>
      </div>
    </details>
  );
}

export function WhatIfList({ items, champion }: { items: WhatIfTrigger[]; champion: ChampionLookup }) {
  if (items.length === 0) return null;
  return (
    <div className="rounded-md border border-border bg-surface-2/40 px-3 py-2">
      <SectionLabel className="mb-1">What would change this</SectionLabel>
      <ul className="space-y-1 text-xs text-fg-muted">
        {items.map((w, i) => (
          <li key={i} className="flex items-center gap-1.5">
            <ChampionPortrait champion={champion(w.exampleChampionId)} size="xs" />
            <span>{w.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ResponsesList({ items, champion, forName }: { items: EnemyResponse[]; champion: ChampionLookup; forName: string | null }) {
  if (items.length === 0 || !forName) return null;
  return (
    <div className="rounded-md border border-border bg-surface-2/40 px-3 py-2">
      <SectionLabel className="mb-1">If we lock {forName}, their best answers</SectionLabel>
      <div className="flex flex-wrap gap-1.5">
        {items.map((r) => (
          <span key={`${r.championId}-${r.role}`} className="flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-[11px] text-fg-muted" title={r.text}>
            <ChampionPortrait champion={champion(r.championId)} size="xs" />
            {champion(r.championId)?.name} <RoleIcon role={r.role} className="h-3 w-3" /> <span className="text-bad">{signedPoints(-r.edge)}</span>
          </span>
        ))}
      </div>
      <p className="mt-1 text-[10px] text-fg-subtle">Likelihood-weighted from meta share; not a prediction.</p>
    </div>
  );
}

export function ThreatList({ threats, champion }: { threats: ThreatEntry[]; champion: ChampionLookup }) {
  if (threats.length === 0) return null;
  return (
    <div>
      <SectionLabel className="mb-1">Threat map</SectionLabel>
      <ul className="space-y-0.5 text-xs">
        {threats.slice(0, 6).map((t, i) => (
          <li key={i} className={cn("flex items-center gap-1.5", t.weight < 0 ? "text-warn" : "text-good")}>
            <ChampionPortrait champion={champion(t.from.championId)} size="xs" />
            {t.to ? (
              <>
                <span className="text-fg-subtle">→</span>
                <ChampionPortrait champion={champion(t.to.championId)} size="xs" />
              </>
            ) : null}
            <span className="text-fg-muted">{t.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function RealismChips({ realism, champion }: { realism: TeamRealism | null | undefined; champion: ChampionLookup }) {
  if (!realism) return null;
  const exTone: BadgeTone = realism.executionLabel === "very high" ? "bad" : realism.executionLabel === "high" ? "warn" : "neutral";
  return (
    <div className="flex flex-wrap gap-1.5 text-[11px]">
      <Badge tone={exTone} title="Average execution demand of the projected team (mechanics, coordination, punish)">execution {realism.executionLabel}</Badge>
      <Badge tone="neutral" title={`Power curve · spikes: ${realism.spikes.join(", ") || "even"}`}>{realism.powerCurve} game</Badge>
      {realism.resourceOverloaded ? <Badge tone="warn" title={realism.resourceHungry.map((id) => champion(id)?.name ?? id).join(", ")}>resource overload</Badge> : null}
      {realism.coordinationHeavy.length >= 3 ? <Badge tone="warn" title={realism.coordinationHeavy.map((id) => champion(id)?.name ?? id).join(", ")}>heavy comms burden</Badge> : null}
    </div>
  );
}

export function PinchPanel({ pinch, playerName, champion }: { pinch: PinchWarning[]; playerName: (id: string | null | undefined) => string; champion: ChampionLookup }) {
  const urgent = pinch.filter((p) => p.severity !== "info");
  if (pinch.length === 0) return null;
  return (
    <Panel className={urgent.length ? "border-warn/40" : undefined}>
      <PanelHeader title="BEFORE THEIR NEXT BANS" subtitle="Where leaving a role for later could pinch us, and the legal escape." />
      <PanelBody className="space-y-1.5">
        {(urgent.length ? urgent : pinch.slice(0, 2)).map((p) => (
          <div key={p.role} className="flex flex-wrap items-center gap-1.5 text-xs">
            <RoleIcon role={p.role} className="h-3.5 w-3.5 text-accent" />
            <span className="font-medium">{playerName(p.playerId)}</span>
            <Badge tone={p.severity === "danger" ? "bad" : p.severity === "warn" ? "warn" : "neutral"}>
              {p.options} options · {p.atRisk.length} ban-prone
            </Badge>
            {p.atRisk.map((id) => (
              <ChampionPortrait key={id} champion={champion(id)} size="xs" />
            ))}
            <span className="w-full text-fg-muted">{p.message}{p.escape ? ` · ${p.escape}` : ""}</span>
          </div>
        ))}
      </PanelBody>
    </Panel>
  );
}

export interface WhyNotState {
  key: string | null;
  comparison: WhyNotComparison | null;
  error: string | null;
  busy: boolean;
}

export const whyNotKey = (championId: string, role: Role | null | undefined) => `${championId}|${role ?? ""}`;

/** State + request helper for "why not X?", owned by the draft room so alternative cards can trigger it. */
export function useWhyNot(draftId: string): { state: WhyNotState; ask: (championId: string, role: Role | null) => Promise<void>; reset: () => void } {
  const [state, setState] = React.useState<WhyNotState>({ key: null, comparison: null, error: null, busy: false });
  const ask = React.useCallback(
    async (championId: string, role: Role | null) => {
      const key = whyNotKey(championId, role);
      setState((s) => ({ ...s, key, busy: true, error: null }));
      const r = await whyNotAction(draftId, championId, role);
      setState(r.ok ? { key, comparison: r.data, error: null, busy: false } : { key, comparison: null, error: r.error, busy: false });
    },
    [draftId],
  );
  const reset = React.useCallback(() => setState({ key: null, comparison: null, error: null, busy: false }), []);
  return { state, ask, reset };
}

/**
 * "Why not X?" — pick any legal candidate and see the comparison on the same dimensions the
 * engine used, including how close the call is.
 */
export function WhyNotPanel({ candidates, champion, playerName, state, ask, pinned = [], onPin }: { candidates: CandidateSummary[]; champion: ChampionLookup; playerName: (id: string | null | undefined) => string; state: WhyNotState; ask: (championId: string, role: Role | null) => Promise<void>; pinned?: string[]; onPin?: (championId: string) => void }) {
  const [custom, setCustom] = React.useState("");
  const [customRole, setCustomRole] = React.useState<Role | "">("");
  if (candidates.length === 0) return null;
  const c = state.comparison;
  const busy = state.busy;
  return (
    <Panel>
      <PanelHeader title="WHY NOT…?" subtitle="Compare the recommendation with any legal option." />
      <PanelBody className="space-y-2">
        <div className="flex flex-wrap gap-1">
          {candidates.slice(1, 7).map((cand) => (
            <span key={whyNotKey(cand.championId, cand.role)} className={cn("flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px]", state.key === whyNotKey(cand.championId, cand.role) ? "border-accent text-accent-strong" : "border-border text-fg-muted")}>
              <button type="button" disabled={busy} onClick={() => void ask(cand.championId, cand.role)} className="flex items-center gap-1 hover:text-fg" title={`#${cand.rank} · ${playerName(cand.playerId)} ${ROLE_LABELS[cand.role]}`}>
                <ChampionPortrait champion={champion(cand.championId)} size="xs" /> {champion(cand.championId)?.name} <RoleIcon role={cand.role} className="h-3 w-3" />
              </button>
              {onPin ? (
                <button type="button" onClick={() => onPin(cand.championId)} title={pinned.includes(cand.championId) ? "Unpin" : "Pin for comparison"} className="text-fg-subtle hover:text-accent">
                  {pinned.includes(cand.championId) ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
                </button>
              ) : null}
            </span>
          ))}
        </div>
        <form
          className="flex flex-wrap items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            const match = custom.trim();
            if (match) void ask(match, customRole || null);
          }}
        >
          <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Champion id (e.g. Ahri)" className="h-7 w-40 rounded-md border border-border bg-bg-elevated px-2 text-xs" />
          <select value={customRole} onChange={(e) => setCustomRole(e.target.value as Role | "")} className="h-7 rounded-md border border-border bg-bg-elevated px-1 text-xs">
            <option value="">any open role</option>
            {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
          <Button size="sm" variant="outline" type="submit" disabled={busy}>
            <HelpCircle className="h-3.5 w-3.5" /> Why not?
          </Button>
        </form>
        {state.error ? <p className="text-xs text-warn">{state.error}</p> : null}
        {c ? (
          <div className="space-y-1.5 rounded-md border border-border bg-surface-2/40 p-2">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <ChampionPortrait champion={champion(c.recommended.championId)} size="sm" />
              <span className="font-semibold">{champion(c.recommended.championId)?.name}</span>
              <span className="text-fg-subtle">vs</span>
              <ChampionPortrait champion={champion(c.alternative.championId)} size="sm" />
              <span className="font-semibold">{champion(c.alternative.championId)?.name}</span>
              <Badge tone={c.closeness === "very close" || c.closeness === "close" ? "warn" : "neutral"}>{c.closeness}</Badge>
              <span className="text-fg-subtle" title={metricTooltip("score-gap")}>{signedPoints(c.totalGap)} win-rate pts for the recommendation</span>
            </div>
            <ul className="space-y-0.5 text-[11px]">
              {c.points.map((p, i) => (
                <li key={i} className="flex gap-1.5">
                  <span className={cn("w-28 shrink-0 font-medium", p.favours === "recommended" ? "text-good" : p.favours === "alternative" ? "text-warn" : "text-fg-subtle")}>{p.topic}</span>
                  <span className="text-fg-muted">{p.text}</span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-fg">{c.verdict}</p>
          </div>
        ) : null}
      </PanelBody>
    </Panel>
  );
}

/** Pinned champions compared side by side: rank, score gap to the top option, flex, execution. */
export function PinnedPanel({ pinned, candidates, champion, playerName, onUnpin, onWhyNot, onLock, unavailable }: { pinned: string[]; candidates: CandidateSummary[]; champion: ChampionLookup; playerName: (id: string | null | undefined) => string; onUnpin: (id: string) => void; onWhyNot: (id: string, role: Role | null) => void; onLock?: (id: string, role: Role) => void; unavailable: ReadonlySet<string> }) {
  const top = candidates[0];
  return (
    <Panel className="border-accent/30">
      <PanelHeader title="PINNED FOR COMPARISON" subtitle="Right-click a champion in the grid to pin it. Pins are yours only and clear when you leave." />
      <PanelBody className="space-y-1.5">
        {pinned.map((id) => {
          const cands = candidates.filter((c) => c.championId === id);
          const best = cands[0];
          const gone = unavailable.has(id);
          return (
            <div key={id} className="flex flex-wrap items-center gap-2 rounded-md border border-border px-2 py-1 text-xs">
              <ChampionPortrait champion={champion(id)} size="sm" />
              <span className="w-24 truncate font-medium">{champion(id)?.name ?? id}</span>
              {gone ? (
                <Badge tone="neutral">unavailable</Badge>
              ) : best ? (
                <>
                  <Badge tone={best.rank === 1 ? "good" : best.rank <= 3 ? "info" : "neutral"}>#{best.rank}</Badge>
                  <span className="flex items-center gap-1 text-fg-muted">
                    <RoleIcon role={best.role} className="h-3 w-3" /> {playerName(best.playerId)}
                  </span>
                  <span className="text-fg-subtle" title={metricTooltip("score-gap")}>
                    gap to top {top ? signedPoints(best.pickNowScore - top.pickNowScore) : ""} pts
                  </span>
                  {best.isFlex ? <Badge tone="accent">flex</Badge> : null}
                  <span className="text-fg-subtle" title={metricTooltip("execution-demand")}>
                    execution {best.execution.toFixed(2)} / 1
                  </span>
                  {cands.length > 1 ? <span className="text-fg-subtle">+{cands.length - 1} other role{cands.length > 2 ? "s" : ""}</span> : null}
                </>
              ) : (
                <span className="text-fg-subtle" title="Not in the assigned player's pool for any open role, or not ranked in the top candidates">
                  not a top candidate now
                </span>
              )}
              <span className="flex-1" />
              {best && !gone ? (
                <Button size="sm" variant="ghost" onClick={() => onWhyNot(id, best.role)}>
                  Why not?
                </Button>
              ) : null}
              {best && !gone && onLock ? (
                <Button size="sm" variant="outline" onClick={() => onLock(id, best.role)}>
                  Lock
                </Button>
              ) : null}
              <button type="button" onClick={() => onUnpin(id)} className="text-fg-subtle hover:text-fg" title="Unpin">
                <PinOff className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </PanelBody>
    </Panel>
  );
}

/**
 * EMERGENCY PICKS — a player has no legal champion left in their configured pool for the role
 * they are about to play. About three options outside the pool, chosen like normal picks, with
 * the player's known experience (or "unknown") stated honestly. Locking one is a deliberate choice
 * by the controller; nothing is added to the player's pool.
 */
export function EmergencyPanel({ alerts, champion, onLock, busy }: { alerts: EmergencyAlert[]; champion: ChampionLookup; onLock?: (championId: string, role: Role) => void; busy: boolean }) {
  if (alerts.length === 0) return null;
  return (
    <Panel className="border-bad/50 xl:col-span-3" data-testid="emergency-picks">
      <PanelHeader title="EMERGENCY PICKS — OUTSIDE CONFIGURED POOL" subtitle="Every champion in this player's pool is banned or taken. These are not part of their usual pool and are not added to it." />
      <PanelBody className="space-y-3">
        {alerts.map((a) => (
          <div key={a.role} className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-sm font-medium text-fg">
              <RoleIcon role={a.role} className="h-4 w-4 text-bad" /> {a.message}
            </div>
            {a.suggestions.length === 0 ? <p className="text-xs text-fg-muted">No playable champion is left for this role; enter the pick manually in the champion grid.</p> : null}
            <ul className="grid gap-2 md:grid-cols-3">
              {a.suggestions.map((s) => (
                <li key={s.championId} className="flex items-start gap-2 rounded-md border border-border bg-bg-elevated p-2" data-testid="emergency-suggestion">
                  <ChampionPortrait champion={champion(s.championId)} size="md" />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-semibold text-fg">{champion(s.championId)?.name ?? s.championId}</span>
                      <Badge tone="bad">Outside pool</Badge>
                    </div>
                    <p className="text-xs text-fg-muted">{s.reason}</p>
                    <p className="text-[11px] text-fg-subtle">{s.familiarity ? `Player experience: ${s.familiarity.label}${s.familiarity.games ? ` (${s.familiarity.games} games)` : ""}` : "Player experience: unknown"}</p>
                    {onLock ? (
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => onLock(s.championId, s.role)}>
                        Lock {champion(s.championId)?.name ?? s.championId} (outside pool)
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </PanelBody>
    </Panel>
  );
}
