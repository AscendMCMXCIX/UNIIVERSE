"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Ban, Check, Eye, Radio, RotateCcw, Shuffle } from "lucide-react";
import { deriveDraft, phaseLabel, stepLabel, type Side } from "@/domain/draft";
import { ROLES, ROLE_LABELS, type Role } from "@/domain/roles";
import { competitionModeLabel } from "@/domain/competition";
import { poolFor } from "@/domain/roster";
import type { BanRecommendation, PairRecommendation, PickRecommendation, RecommendationResult } from "@/domain/engine";
import type { GamePlan } from "@/domain/gameplan";
import { applyDraftAction, applyRoleSwapAction, handoffControlAction, listHandoffCandidatesAction, reloadDraftRoomAction, takeControlAction, undoDraftAction, type DraftRoomPayload } from "@/server/actions/drafts";
import { useDraftLive } from "./use-draft-live";
import { DecisionBadge, PinchPanel, RealismChips, ResponsesList, ThreatList, useWhyNot, WhatIfList, WhyNotPanel } from "./insight-panels";
import { OverridesPanel } from "./overrides-panel";
import { toDraftState } from "@/server/repositories/drafts";
import { ChampionPortrait } from "@/components/champion-portrait";
import { normalise, type PickerChampion } from "@/components/champion-picker";
import { RoleIcon } from "@/components/role-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel, PanelBody, PanelHeader, SectionLabel } from "@/components/ui/panel";
import { cn } from "@/lib/cn";
import { percent, signedPoints } from "@/lib/format";

export interface DraftRoomProps {
  initial: DraftRoomPayload;
  champions: PickerChampion[];
  /** Whether this user holds draft-control rights (owner/coach). */
  canEdit: boolean;
  viewer: { userId: string | null; label: string };
}

export function DraftRoom({ initial, champions, canEdit, viewer }: DraftRoomProps) {
  const [payload, setPayload] = React.useState<DraftRoomPayload>(initial);
  const [handoffOpen, setHandoffOpen] = React.useState(false);
  const [candidates, setCandidates] = React.useState<Array<{ id: string; label: string; role: string }>>([]);
  const refreshing = React.useRef(false);
  const reload = React.useCallback(async () => {
    if (refreshing.current) return;
    refreshing.current = true;
    try {
      const fresh = await reloadDraftRoomAction(initial.draft.id);
      if (fresh) setPayload(fresh);
    } finally {
      refreshing.current = false;
    }
  }, [initial.draft.id]);
  const live = useDraftLive(initial.draft.id, payload.draft.version, () => void reload());
  const controllerId = live.version !== null ? live.controllerUserId : payload.draft.controllerUserId;
  const controllerLabel = live.version !== null ? live.controllerLabel : null;
  const iControl = controllerId !== null && controllerId === viewer.userId;
  const canAct = controllerId ? iControl : canEdit;
  const canTake = canEdit || (controllerId !== null && controllerId === viewer.userId);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  /** The user's role choice for the current step, keyed by draft progress so it resets after each action. */
  const [roleOverride, setRoleOverride] = React.useState<{ at: number; role: Role } | null>(null);
  const whyNot = useWhyNot(initial.draft.id);
  const searchRef = React.useRef<HTMLInputElement>(null);

  const { draft, recommendation, gamePlan } = payload;
  const byId = React.useMemo(() => new Map(champions.map((c) => [c.id, c])), [champions]);
  const players = React.useMemo(() => new Map(draft.lineup.map((p) => [p.id, p])), [draft.lineup]);
  const state = React.useMemo(() => toDraftState(draft), [draft]);
  const derived = React.useMemo(() => deriveDraft(state), [state]);
  const step = derived.nextStep;
  const isOurPick = !!step && step.type === "pick" && step.side === draft.side;
  const assignment = recommendation.assignment;

  // Role chip: the user's choice for this step, else the primary recommendation's role, else the first open role.
  const recommendedRole = recommendation.primary?.kind === "pick" ? recommendation.primary.role : recommendation.primary?.kind === "pair" ? recommendation.primary.picks[0].role : null;
  const defaultRole = recommendedRole && derived.openRoles.includes(recommendedRole) ? recommendedRole : derived.openRoles[0] ?? null;
  const selectedRole: Role | null = isOurPick ? (roleOverride && roleOverride.at === draft.actions.length ? roleOverride.role : defaultRole) : null;
  const setSelectedRole = (role: Role) => setRoleOverride({ at: draft.actions.length, role });

  const champion = (id: string | null | undefined) => (id ? byId.get(id) ?? { id, name: id, portraitUrl: "" } : null);
  const playerName = (id: string | null | undefined) => (id ? players.get(id)?.displayName ?? "?" : "?");

  const commit = async (championId: string | null, role?: Role | null) => {
    if (!canAct || busy || !step) return;
    setBusy(true);
    setError(null);
    const r = role ?? (isOurPick ? selectedRole : null);
    const res = await applyDraftAction(draft.id, { championId, role: isOurPick ? r : null, playerId: isOurPick && r ? assignment[r] : null }, draft.version);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      if (res.conflict) void reload();
    } else {
      setPayload(res.data);
      setQuery("");
      whyNot.reset();
      searchRef.current?.focus();
    }
  };

  const undo = async () => {
    if (!canAct || busy) return;
    setBusy(true);
    setError(null);
    const res = await undoDraftAction(draft.id, draft.version);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      if (res.conflict) void reload();
    } else setPayload(res.data);
  };

  const takeControl = async () => {
    const r = await takeControlAction(draft.id);
    if (!r.ok) setError(r.error);
    else void reload();
  };

  const openHandoff = async () => {
    setCandidates(await listHandoffCandidatesAction());
    setHandoffOpen(true);
  };

  const applySwap = async () => {
    if (!recommendation.roleSwap || busy) return;
    setBusy(true);
    const res = await applyRoleSwapAction(draft.id, recommendation.roleSwap.to, recommendation.roleSwap.why.join(" "));
    setBusy(false);
    if (!res.ok) setError(res.error);
    else setPayload(res.data);
  };

  const lockRecommendation = async (rec: PickRecommendation | BanRecommendation) => {
    if (rec.kind === "ban") return commit(rec.championId, null);
    return commit(rec.championId, rec.role);
  };

  // Grid: eligible-for-selected-role champions first when it is our pick.
  const q = normalise(query);
  const selectedPlayer = selectedRole ? players.get(assignment[selectedRole]) : null;
  const poolIds = new Set(selectedPlayer && selectedRole ? poolFor(selectedPlayer, selectedRole) : []);
  const grid = React.useMemo(() => {
    const list = q ? champions.filter((c) => normalise(c.name).includes(q)) : champions;
    if (!isOurPick) return list;
    return [...list].sort((a, b) => Number(poolIds.has(b.id)) - Number(poolIds.has(a.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [champions, q, isOurPick, selectedRole, assignment]);

  const sideTone = (side: Side) => (side === "blue" ? "blue" : "red");
  const teamName = (side: Side) => (side === draft.side ? "UNIIVERSE" : draft.opponentName || "Enemy");

  return (
    <div className="mx-auto max-w-[1500px] space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/draft" className="text-fg-muted hover:text-fg">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-lg font-bold">
          vs {draft.opponentName || "Unnamed opponent"} <span className="ml-2 text-sm font-normal text-fg-subtle">patch {draft.patch}</span>
        </h1>
        <Badge tone="neutral">{competitionModeLabel(draft.mode)}</Badge>
        {draft.isTheorycraft ? <Badge tone="accent">THEORYCRAFT</Badge> : null}
        <Badge tone={sideTone(draft.side)}>{draft.side} side</Badge>
        {recommendation.stats.isDemo ? <Badge tone="warn">demo statistics</Badge> : null}
        <Badge tone={recommendation.confidence === "high" ? "good" : recommendation.confidence === "medium" ? "info" : "neutral"}>evidence: {recommendation.confidence}</Badge>
        <span className="flex-1" />
        <span className="flex items-center gap-1 text-[11px] text-fg-subtle" title={live.viewers.map((v) => v.label).join(", ") || "nobody else"}>
          <Radio className={cn("h-3 w-3", live.connected ? "text-good" : "text-fg-subtle")} /> {live.connected ? "live" : "reconnecting"}
          {live.viewers.length > 0 ? (
            <>
              <Eye className="ml-2 h-3 w-3" /> {live.viewers.length}
            </>
          ) : null}
        </span>
        {canAct ? (
          <Button variant="ghost" size="sm" onClick={undo} disabled={busy || draft.actions.length === 0}>
            <RotateCcw className="h-3.5 w-3.5" /> Undo
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-bg-elevated px-3 py-1.5 text-xs">
        {controllerId ? (
          <span>
            <span className="font-semibold">{iControl ? "You are controlling the draft" : `${controllerLabel ?? "Someone"} is controlling the draft`}</span>
            <span className="text-fg-subtle"> · everyone else watches live</span>
          </span>
        ) : (
          <span className="text-fg-muted">{canEdit ? "Open control: any coach or owner can enter actions. Take control to lock it to you." : "Watching live. A coach or owner can hand you control."}</span>
        )}
        <span className="flex-1" />
        {live.viewers.length > 0 ? <span className="text-fg-subtle">Viewing: {live.viewers.map((v) => v.label).join(", ")}</span> : null}
        {canTake && !iControl ? (
          <Button size="sm" variant="outline" onClick={takeControl}>
            Take control
          </Button>
        ) : null}
        {(iControl || canEdit) ? (
          <Button size="sm" variant="ghost" onClick={openHandoff}>
            Hand off
          </Button>
        ) : null}
        {handoffOpen ? (
          <span className="flex items-center gap-1">
            <select className="h-7 rounded-md border border-border bg-bg-elevated px-2 text-xs" defaultValue="" onChange={async (e) => { const to = e.target.value || null; setHandoffOpen(false); const r = await handoffControlAction(draft.id, to); if (!r.ok) setError(r.error); else void reload(); }}>
              <option value="">— release (open control) —</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label} ({c.role})
                </option>
              ))}
            </select>
            <Button size="sm" variant="ghost" onClick={() => setHandoffOpen(false)}>
              cancel
            </Button>
          </span>
        ) : null}
      </div>

      {error ? <div className="rounded-md border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</div> : null}

      <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_380px]">
        <div className="space-y-4">
        {/* OUR SIDE */}
        <TeamColumn
          title={teamName(draft.side)}
          side={draft.side}
          bans={derived.ourBans.map((b) => champion(b.championId))}
          rows={ROLES.map((role) => {
            const pick = derived.ourPicks.find((p) => p.role === role);
            const pid = assignment[role];
            const player = players.get(pid);
            return { role, label: player?.displayName ?? "?", sub: player && player.primaryRole !== role ? "secondary role" : undefined, champion: champion(pick?.championId), active: isOurPick && selectedRole === role, onClick: isOurPick && !pick ? () => setSelectedRole(role) : undefined };
          })}
          ours
        />

        {/* ENEMY SIDE */}
        <TeamColumn
          title={teamName(derived.enemySide)}
          side={derived.enemySide}
          bans={derived.enemyBans.map((b) => champion(b.championId))}
          rows={derived.enemyPicks.map((p, i) => {
            const est = recommendation.enemy.roles.find((r) => r.championId === p.championId);
            const prob = est ? est.probabilities[est.mostLikely] ?? 0 : 0;
            return { role: est?.mostLikely ?? null, label: `${stepLabel(derived.steps[p.index]!)}`, sub: est ? `${ROLE_LABELS[est.mostLikely]}${est.isFlex ? ` (${percent(prob, 0)}, flex)` : ""}` : undefined, champion: champion(p.championId), active: false, key: String(i) };
          })}
          identity={recommendation.enemy.identity}
        />
        </div>

        {/* CENTRE */}
        <div className="space-y-3">
          <Panel>
            <PanelBody className="flex flex-wrap items-center gap-3 py-2.5">
              {step ? (
                <>
                  <Badge tone={sideTone(step.side)} className="text-xs">
                    {step.side === draft.side ? "UNIIVERSE" : teamName(step.side)}
                  </Badge>
                  <span className="text-sm font-semibold">
                    {phaseLabel(step.phase)} · {stepLabel(step)} · {step.type === "ban" ? "BAN" : "PICK"}
                    {step.type === "pick" && step.windowSize === 2 ? (step.windowPosition === 0 ? " (first of two)" : " (second of two)") : ""}
                  </span>
                  <span className="text-xs text-fg-subtle">
                    {derived.ourRemainingPicks} picks · {derived.ourRemainingBans} bans left for us
                    {step.simultaneous ? " · simultaneous bans: enter ours, then theirs once revealed" : ""}
                  </span>
                  <span className="flex-1" />
                  {step.type === "ban" && canAct ? (
                    <Button size="sm" variant="ghost" onClick={() => commit(null)} disabled={busy}>
                      <Ban className="h-3.5 w-3.5" /> No ban
                    </Button>
                  ) : null}
                </>
              ) : (
                <span className="text-sm font-semibold text-good">Draft complete</span>
              )}
            </PanelBody>
          </Panel>

          {isOurPick ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-fg-subtle">Picking for:</span>
              {derived.openRoles.map((role) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => setSelectedRole(role)}
                  className={cn("flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs", selectedRole === role ? "border-accent bg-accent/10 text-accent-strong" : "border-border bg-bg-elevated text-fg-muted hover:text-fg")}
                >
                  <RoleIcon role={role} className="h-3.5 w-3.5" /> {playerName(assignment[role])}
                </button>
              ))}
            </div>
          ) : null}

          <div className="flex items-center gap-2">
            <Input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={step ? `Search champion to ${step.type}…` : "Draft complete"} disabled={!step || !canAct} onKeyDown={(e) => {
              if (e.key === "Enter") {
                const first = grid.find((c) => !derived.unavailableChampionIds.has(c.id));
                if (first) commit(first.id);
              }
            }} />
          </div>
          <div className="grid max-h-[560px] grid-cols-[repeat(auto-fill,minmax(64px,1fr))] gap-1.5 overflow-y-auto rounded-lg border border-border bg-surface p-2">
            {grid.map((c) => {
              const unavailable = derived.unavailableChampionIds.has(c.id);
              const inPool = poolIds.has(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  disabled={unavailable || !step || !canAct || busy}
                  onClick={() => commit(c.id)}
                  className={cn("flex flex-col items-center gap-0.5 rounded-md p-1 hover:bg-surface-2 disabled:cursor-not-allowed", inPool && isOurPick && "ring-1 ring-accent/50")}
                  title={inPool ? `${c.name} — in ${selectedPlayer?.displayName}'s pool` : c.name}
                >
                  <ChampionPortrait champion={c} size="md" dimmed={unavailable} />
                  <span className={cn("w-full truncate text-center text-[10px] leading-tight", unavailable ? "text-fg-subtle" : "text-fg-muted")}>{c.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* RECOMMENDATIONS */}
        <div className="space-y-3">
          {recommendation.roleSwap ? (
            <Panel className="border-accent/50">
              <PanelHeader title="RECOMMENDED ROLE ADJUSTMENT" actions={canAct ? <Button size="sm" variant="primary" onClick={applySwap} disabled={busy}><Shuffle className="h-3.5 w-3.5" /> Apply swap</Button> : null} />
              <PanelBody className="space-y-2">
                {recommendation.roleSwap.moves.map((m) => (
                  <div key={m.playerId} className="flex items-center gap-2 text-sm">
                    <span className="font-semibold">{m.displayName}</span>
                    <RoleIcon role={m.from} className="h-3.5 w-3.5 text-fg-subtle" /> <span className="text-fg-subtle">→</span> <RoleIcon role={m.to} className="h-3.5 w-3.5 text-accent" /> {ROLE_LABELS[m.to]}
                  </div>
                ))}
                <WhyList items={recommendation.roleSwap.why} />
              </PanelBody>
            </Panel>
          ) : null}

          {recommendation.kind === "complete" && gamePlan ? (
            <GamePlanPanel plan={gamePlan} />
          ) : recommendation.kind === "enemy-turn" ? (
            <Panel>
              <PanelHeader title="WAITING FOR ENEMY" subtitle="Enter their selection in the grid. Our projected plan is below." />
              <PanelBody>
                <BestFit recommendation={recommendation} champion={champion} playerName={playerName} />
              </PanelBody>
            </Panel>
          ) : (
            <>
              <Panel className="border-accent/40">
                <PanelHeader title={recommendation.kind === "ban" ? "RECOMMENDED BAN" : recommendation.kind === "pair" ? "RECOMMENDED PAIR" : "RECOMMENDED NOW"} subtitle={recommendation.kind === "pair" ? "Both picks evaluated together" : undefined} actions={<DecisionBadge decision={recommendation.decision} />} />
                <PanelBody className="space-y-3">
                  {recommendation.primary ? (
                    <RecommendationCard rec={recommendation.primary} champion={champion} playerName={playerName} onLock={canAct && step ? lockRecommendation : undefined} busy={busy} primary />
                  ) : (
                    <p className="text-sm text-fg-muted">No legal option: check the players&apos; champion pools.</p>
                  )}
                  {recommendation.holds.map((h) => (
                    <div key={h.role} className="rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
                      <span className="font-semibold uppercase">Hold {ROLE_LABELS[h.role]}</span> — {h.reason}
                    </div>
                  ))}
                  <ResponsesList items={recommendation.responses} champion={champion} forName={recommendation.primary?.kind === "pick" ? champion(recommendation.primary.championId)?.name ?? null : recommendation.primary?.kind === "pair" ? champion(recommendation.primary.picks[0].championId)?.name ?? null : null} />
                  <WhatIfList items={recommendation.whatIf} champion={champion} />
                </PanelBody>
              </Panel>
              {recommendation.alternatives.length > 0 ? (
                <Panel>
                  <PanelHeader title="ALTERNATIVES" />
                  <PanelBody className="space-y-3">
                    {recommendation.alternatives.map((alt, i) => (
                      <RecommendationCard key={i} rec={alt} champion={champion} playerName={playerName} onLock={canAct && step ? lockRecommendation : undefined} busy={busy} onWhyNot={(c, r) => void whyNot.ask(c, r)} />
                    ))}
                  </PanelBody>
                </Panel>
              ) : null}
              {recommendation.candidates.length > 1 ? <WhyNotPanel candidates={recommendation.candidates} champion={champion} playerName={playerName} state={whyNot.state} ask={whyNot.ask} /> : null}
              <Panel>
                <PanelHeader title="PROJECTED TEAM" subtitle="Best complete team reachable from here" />
                <PanelBody>
                  <BestFit recommendation={recommendation} champion={champion} playerName={playerName} />
                </PanelBody>
              </Panel>
              <PinchPanel pinch={recommendation.pinch} playerName={playerName} champion={champion} />
            </>
          )}
          {recommendation.kind !== "complete" ? <OverridesPanel draftId={draft.id} active={recommendation.overrides.active} warning={recommendation.overrides.warning} canEdit={canEdit} onSaved={(p) => setPayload(p)} /> : null}
        </div>

      </div>
    </div>
  );
}

function TeamColumn({ title, side, bans, rows, ours = false, identity, className }: { title: string; side: Side; bans: Array<PickerChampion | null>; rows: Array<{ role: Role | null; label: string; sub?: string; champion: PickerChampion | null; active: boolean; onClick?: () => void; key?: string }>; ours?: boolean; identity?: string | null; className?: string }) {
  const tone = side === "blue" ? "border-blue/50" : "border-red/50";
  return (
    <Panel className={cn("self-start", className)}>
      <PanelHeader title={<span className={side === "blue" ? "text-blue" : "text-red"}>{title}</span>} subtitle={identity ? `Reads as: ${identity}` : ours ? "Players and locked champions" : "Revealed picks and probable roles"} />
      <PanelBody className="space-y-3">
        <div>
          <SectionLabel className="mb-1">Bans</SectionLabel>
          <div className="flex gap-1.5">
            {Array.from({ length: 5 }, (_, i) => (
              <ChampionPortrait key={i} champion={bans[i] ?? null} size="sm" dimmed className={cn(bans[i] && "grayscale")} />
            ))}
          </div>
        </div>
        <div className={cn("space-y-1.5 border-l-2 pl-3", tone)}>
          {rows.length === 0 ? <p className="text-xs text-fg-subtle">Nothing revealed yet.</p> : null}
          {rows.map((r, i) => (
            <button key={r.key ?? i} type="button" disabled={!r.onClick} onClick={r.onClick} className={cn("flex w-full items-center gap-2 rounded-md p-1 text-left", r.active && "bg-accent/10 ring-1 ring-accent/50", r.onClick && "hover:bg-surface-2")}>
              <ChampionPortrait champion={r.champion} size="md" />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-sm font-medium">
                  {r.role ? <RoleIcon role={r.role} className="h-3.5 w-3.5 text-accent" /> : null}
                  <span className="truncate">{r.champion?.name ?? r.label}</span>
                </div>
                <div className="truncate text-[11px] text-fg-subtle">{r.champion ? r.label : r.sub ?? (r.role ? ROLE_LABELS[r.role] : "")}{r.champion && r.sub ? ` · ${r.sub}` : ""}</div>
              </div>
            </button>
          ))}
        </div>
      </PanelBody>
    </Panel>
  );
}

function WhyList({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="space-y-1 text-xs text-fg-muted">
      {items.map((w, i) => (
        <li key={i} className={cn("flex gap-1.5", /^Warning/.test(w) && "text-warn")}>
          <span className="text-accent">•</span>
          <span>{w}</span>
        </li>
      ))}
    </ul>
  );
}

function RecommendationCard({ rec, champion, playerName, onLock, busy, primary = false, onWhyNot }: { rec: PickRecommendation | PairRecommendation | BanRecommendation; champion: (id: string | null | undefined) => PickerChampion | null; playerName: (id: string | null | undefined) => string; onLock?: (rec: PickRecommendation | BanRecommendation) => void; busy: boolean; primary?: boolean; onWhyNot?: (championId: string, role: Role) => void }) {
  if (rec.kind === "pair") {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          {rec.picks.map((p) => (
            <div key={p.championId} className="flex items-center gap-2">
              <ChampionPortrait champion={champion(p.championId)} size={primary ? "xl" : "lg"} />
              <div>
                <div className="text-sm font-semibold">{champion(p.championId)?.name}</div>
                <div className="flex items-center gap-1 text-[11px] text-fg-subtle">
                  <RoleIcon role={p.role} className="h-3 w-3" /> {playerName(p.playerId)}
                </div>
              </div>
            </div>
          ))}
        </div>
        <WhyList items={rec.why} />
        {onLock ? (
          <div className="flex gap-2">
            {rec.picks.map((p) => (
              <Button key={p.championId} size="sm" variant="primary" onClick={() => onLock(p)} disabled={busy}>
                <Check className="h-3.5 w-3.5" /> Lock {champion(p.championId)?.name}
              </Button>
            ))}
          </div>
        ) : null}
        <details className="text-xs text-fg-subtle">
          <summary className="cursor-pointer">Individual reasons</summary>
          <div className="mt-1 space-y-2">
            {rec.picks.map((p) => (
              <div key={p.championId}>
                <div className="font-medium text-fg-muted">{champion(p.championId)?.name}</div>
                <WhyList items={p.why} />
              </div>
            ))}
          </div>
        </details>
      </div>
    );
  }
  const c = champion(rec.championId);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <ChampionPortrait champion={c} size={primary ? "xl" : "lg"} />
        <div className="min-w-0 flex-1">
          <div className="text-base font-semibold">{c?.name}</div>
          {rec.kind === "pick" ? (
            <div className="flex items-center gap-1 text-xs text-fg-subtle">
              <RoleIcon role={rec.role} className="h-3.5 w-3.5" /> {playerName(rec.playerId)} · {ROLE_LABELS[rec.role]}
              {rec.candidate.isFlex ? <Badge tone="accent">flex</Badge> : null}
            </div>
          ) : (
            <div className="flex items-center gap-1 text-xs text-fg-subtle">
              {rec.likelyRole ? <RoleIcon role={rec.likelyRole} className="h-3.5 w-3.5" /> : null} likely {rec.likelyRole ? ROLE_LABELS[rec.likelyRole] : "?"}
              {rec.protects.length ? <span>· protects {rec.protects.map((p) => `${playerName(p.playerId)}`).join(", ")}</span> : null}
            </div>
          )}
        </div>
        {rec.kind === "pick" && onWhyNot ? (
          <Button size="sm" variant="ghost" onClick={() => onWhyNot(rec.championId, rec.role)} title="Compare with the recommendation">
            Why not?
          </Button>
        ) : null}
        {onLock ? (
          <Button size="sm" variant={primary ? "primary" : "outline"} onClick={() => onLock(rec)} disabled={busy}>
            <Check className="h-3.5 w-3.5" /> {rec.kind === "ban" ? "Ban" : "Lock"}
          </Button>
        ) : null}
      </div>
      <WhyList items={rec.why} />
      {rec.kind === "pick" && rec.tradeoff ? <p className="text-[11px] text-fg-subtle">{rec.tradeoff}</p> : null}
    </div>
  );
}

function BestFit({ recommendation, champion, playerName }: { recommendation: RecommendationResult; champion: (id: string | null | undefined) => PickerChampion | null; playerName: (id: string | null | undefined) => string }) {
  const ev = recommendation.bestFitEvaluation;
  const sorted = [...recommendation.bestFit].sort((a, b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {sorted.map((m) => (
          <div key={m.role} className={cn("flex items-center gap-1.5 rounded-md border px-1.5 py-1", m.locked ? "border-accent/50" : "border-border border-dashed")} title={`${playerName(m.playerId)} · ${ROLE_LABELS[m.role]}${m.locked ? " (locked)" : " (projected)"}`}>
            <ChampionPortrait champion={champion(m.championId)} size="sm" />
            <RoleIcon role={m.role} className="h-3.5 w-3.5 text-fg-subtle" />
          </div>
        ))}
        {ROLES.filter((r) => !sorted.some((m) => m.role === r)).map((r) => (
          <div key={r} className="flex items-center gap-1.5 rounded-md border border-dashed border-warn/50 px-1.5 py-1 text-[11px] text-warn" title="No eligible champion left for this role">
            <RoleIcon role={r} className="h-3.5 w-3.5" /> no option
          </div>
        ))}
      </div>
      {ev ? (
        <div className="flex flex-wrap gap-1.5 text-[11px]">
          {ev.identity ? <Badge tone="accent">{ev.identity}</Badge> : null}
          <Badge tone="neutral" title="Team synergy component (win-rate points)">synergy {signedPoints(ev.synergyPart)}</Badge>
          <Badge tone="neutral" title="Strength into their revealed draft (win-rate points)">vs enemy {signedPoints(ev.enemyPart)}</Badge>
          {ev.lanes
            .filter((l) => l.likelyOpponent && (l.severity === "significantly-unfavourable" || l.severity === "near-unplayable"))
            .map((l) => (
              <Badge key={l.role} tone="bad">
                {ROLE_LABELS[l.role]} lane {l.severity.replace(/-/g, " ")}
              </Badge>
            ))}
        </div>
      ) : null}
      <RealismChips realism={ev?.realism} champion={champion} />
      <ThreatList threats={recommendation.threats} champion={champion} />
      {recommendation.needs.length > 0 ? (
        <div>
          <SectionLabel className="mb-1">Composition needs</SectionLabel>
          <ul className="space-y-0.5 text-xs text-fg-muted">
            {recommendation.needs.map((n) => (
              <li key={n.key} className={cn(n.severity >= 0.7 && "text-warn")}>
                • {n.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function PlanSection({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <SectionLabel className="mb-1">{title}</SectionLabel>
      <ul className="space-y-0.5 text-xs text-fg-muted">
        {items.map((t, i) => (
          <li key={i}>• {t}</li>
        ))}
      </ul>
    </div>
  );
}

function GamePlanPanel({ plan }: { plan: GamePlan }) {
  return (
    <Panel className="border-good/40">
      <PanelHeader title="GAME PLAN" subtitle={plan.identity.summary} actions={<Button size="sm" variant="ghost" onClick={() => navigator.clipboard?.writeText(plan.summaryLines.join("\n"))}>Copy for Discord</Button>} />
      <PanelBody className="space-y-3">
        <PlanSection title="Primary win condition" items={plan.winCondition} />
        <PlanSection title="Lane priorities" items={plan.lanePriorities} />
        <PlanSection title="Teamfight plan" items={plan.teamfight.plan} />
        <PlanSection title={`Side lane · ${plan.sideLane.formation}`} items={plan.sideLane.notes} />
        <PlanSection title="Objectives" items={[`Early: ${plan.objectives.early}`, `Dragon: ${plan.objectives.dragon}`, `Baron: ${plan.objectives.baron}`]} />
        <PlanSection title="Key enemy threats" items={plan.threats} />
        <PlanSection title="Avoid" items={plan.avoid} />
      </PanelBody>
    </Panel>
  );
}
