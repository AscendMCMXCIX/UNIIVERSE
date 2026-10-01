"use client";

import * as React from "react";
import { HelpCircle } from "lucide-react";
import { ROLE_LABELS, type Role } from "@/domain/roles";
import type { CandidateSummary, EnemyResponse, PinchWarning, RecommendationConfidence, TeamRealism, ThreatEntry, WhatIfTrigger, WhyNotComparison } from "@/domain/engine";
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
    <Badge tone={DECISION_TONE[decision.level]} title={decision.reason}>
      {decision.label}
      {decision.gap !== null ? <span className="opacity-70">· gap {signedPoints(decision.gap)}</span> : null}
    </Badge>
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
export function WhyNotPanel({ candidates, champion, playerName, state, ask }: { candidates: CandidateSummary[]; champion: ChampionLookup; playerName: (id: string | null | undefined) => string; state: WhyNotState; ask: (championId: string, role: Role | null) => Promise<void> }) {
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
            <button key={whyNotKey(cand.championId, cand.role)} type="button" disabled={busy} onClick={() => void ask(cand.championId, cand.role)} className={cn("flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] hover:bg-surface-2", state.key === whyNotKey(cand.championId, cand.role) ? "border-accent text-accent-strong" : "border-border text-fg-muted")} title={`#${cand.rank} · ${playerName(cand.playerId)} ${ROLE_LABELS[cand.role]}`}>
              <ChampionPortrait champion={champion(cand.championId)} size="xs" /> {champion(cand.championId)?.name} <RoleIcon role={cand.role} className="h-3 w-3" />
            </button>
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
              <span className="text-fg-subtle">{signedPoints(c.totalGap)} for the recommendation</span>
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
