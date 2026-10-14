"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Ban, Check, Copy, Eye, Pin, Radio, RotateCcw, Shuffle } from "lucide-react";
import { applyAction, deriveDraft, phaseLabel, stepLabel, type DraftState, type Side } from "@/domain/draft";
import { ROLES, ROLE_LABELS, type Role } from "@/domain/roles";
import { competitionModeLabel } from "@/domain/competition";
import { canStartNextGame, seriesLabel } from "@/domain/series";
import { EnemyPlayersPanel } from "./enemy-players-panel";
import { EnemyTendenciesPanel } from "./enemy-tendencies-panel";
import { poolFor } from "@/domain/roster";
import type { BanRecommendation, PairRecommendation, PickRecommendation, RecommendationResult } from "@/domain/engine";
import { PlaybookPanel } from "@/components/playbook/playbook-panel";
import { saveDraftAsMatchAction } from "@/server/actions/matches";
import { applyDraftAction, applyRoleSwapAction, cloneDraftAsTheorycraftAction, reloadDraftRoomAction, undoDraftAction, type DraftRoomPayload } from "@/server/actions/drafts";
import { useDraftLive } from "./use-draft-live";
import { DecisionBadge, EmergencyPanel, EvidenceLine, PinchPanel, PinnedPanel, RealismChips, ResponsesList, ThreatList, useWhyNot, WhatIfList, WhyNotPanel, WhyThisPick } from "./insight-panels";
import { metricTooltip } from "@/domain/metrics";
import { OverridesPanel } from "./overrides-panel";
import { toDraftState } from "@/server/repositories/drafts";
import { ChampionPortrait } from "@/components/champion-portrait";
import { normalise, type PickerChampion } from "@/components/champion-picker";
import { RoleIcon } from "@/components/role-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel, PanelBody, PanelHeader, SectionLabel } from "@/components/ui/panel";
import { MobileSection } from "@/components/ui/mobile-section";
import { ToggleChip } from "@/components/ui/toggle";
import { CompactBoard, type BoardRow, type BoardTeam } from "./compact-board";
import { cn } from "@/lib/cn";
import { percent, signedPoints } from "@/lib/format";

export interface DraftRoomProps {
  initial: DraftRoomPayload;
  champions: PickerChampion[];
  /** This viewer created the draft or is an admin: they control it. The server checks again on every action. */
  canEdit: boolean;
  /** Any signed-in member may start a theorycraft copy (which they then own). */
  canCreateDrafts?: boolean;
  viewer: { userId: string | null; label: string; playerId?: string | null };
  /** Our team's short name (branding). */
  ourName?: string;
  /** The best-of series this game belongs to, if any. */
  series?: { id: string; bestOf: number; status: "in_progress" | "completed" | "cancelled"; ourWins: number; theirWins: number; gamesStarted: number } | null;
}

export function DraftRoom({ initial, champions, canEdit, canCreateDrafts = false, viewer, ourName = "UNIIVERSE", series = null }: DraftRoomProps) {
  const router = useRouter();
  const [payload, setPayloadRaw] = React.useState<DraftRoomPayload>(initial);
  // Action results do not carry the scouting status; keep the last known one.
  const setPayload = React.useCallback((next: DraftRoomPayload) => setPayloadRaw((prev) => ({ ...next, scouting: next.scouting ?? prev.scouting })), []);
  const [pinned, setPinned] = React.useState<string[]>([]);
  const togglePin = (id: string) => setPinned((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 6 ? p : [...p, id]));
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
  }, [initial.draft.id, setPayload]);
  const live = useDraftLive(initial.draft.id, payload.draft.version, () => void reload());
  const ownerId = payload.draft.createdByUserId;
  const ownerLabel = live.ownerLabel;
  const iOwn = ownerId !== null && ownerId === viewer.userId;
  // The creator controls the draft; an admin may override. Everyone else watches and inspects.
  const canAct = canEdit;
  const [busy, setBusy] = React.useState(false);
  /** The action just entered, shown on the board before the server confirms it (reverted on failure). */
  const [optimistic, setOptimistic] = React.useState<DraftState | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  /** Grid filter: only the selected player's pool champions for the chosen role. */
  const [poolOnly, setPoolOnly] = React.useState(false);
  /** The user's role choice for the current step, keyed by draft progress so it resets after each action. */
  const [roleOverride, setRoleOverride] = React.useState<{ at: number; role: Role } | null>(null);
  const whyNot = useWhyNot(initial.draft.id);
  const searchRef = React.useRef<HTMLInputElement>(null);

  const { draft, recommendation, playbook } = payload;
  const byId = React.useMemo(() => new Map(champions.map((c) => [c.id, c])), [champions]);
  const championsById = React.useMemo(() => Object.fromEntries(champions.map((c) => [c.id, c])), [champions]);
  const [savedMatchId, setSavedMatchId] = React.useState<string | null>(null);
  const players = React.useMemo(() => new Map(draft.lineup.map((p) => [p.id, p])), [draft.lineup]);
  const serverState = React.useMemo(() => toDraftState(draft), [draft]);
  const state = optimistic ?? serverState;
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
    const r = role ?? (isOurPick ? selectedRole : null);
    const input = { championId, role: isOurPick ? r : null, playerId: isOurPick && r ? assignment[r] : null };
    // The board shows the action at once; the recommendation is marked as updating until the
    // server answers, and the local view is reverted if the server rejects the action.
    const local = applyAction(serverState, { championId: input.championId, role: input.role ?? null, playerId: input.playerId ?? null });
    if (!local.ok) {
      setError(local.error);
      return;
    }
    setBusy(true);
    setError(null);
    setOptimistic(local.state);
    setQuery("");
    const res = await applyDraftAction(draft.id, input, draft.version);
    setBusy(false);
    setOptimistic(null);
    if (!res.ok) {
      setError(res.error);
      if (res.conflict) void reload();
    } else {
      setPayload(res.data);
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
    const scoped = poolOnly ? list.filter((c) => poolIds.has(c.id)) : list;
    return [...scoped].sort((a, b) => Number(poolIds.has(b.id)) - Number(poolIds.has(a.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [champions, q, isOurPick, selectedRole, assignment, poolOnly]);

  const sideTone = (side: Side) => (side === "blue" ? "blue" : "red");
  const teamName = (side: Side) => (side === draft.side ? ourName : draft.opponentName || "Enemy");

  const ourRows: BoardRow[] = ROLES.map((role) => {
    const pick = derived.ourPicks.find((p) => p.role === role);
    const pid = assignment[role];
    const player = players.get(pid);
    return { role, label: player?.displayName ?? "?", sub: player && player.primaryRole !== role ? "secondary role" : undefined, champion: champion(pick?.championId), active: isOurPick && selectedRole === role, onClick: isOurPick && !pick ? () => setSelectedRole(role) : undefined };
  });
  const enemyRows: BoardRow[] = derived.enemyPicks.map((p, i) => {
    const est = recommendation.enemy.roles.find((r) => r.championId === p.championId);
    const prob = est ? est.probabilities[est.mostLikely] ?? 0 : 0;
    return { role: est?.mostLikely ?? null, label: `${stepLabel(derived.steps[p.index]!)}`, sub: est ? `${ROLE_LABELS[est.mostLikely]}${est.isFlex ? ` (${percent(prob, 0)}, flex)` : ""}` : undefined, champion: champion(p.championId), active: false, key: String(i) };
  });
  const ourTeam: BoardTeam = { title: teamName(draft.side), side: draft.side, bans: derived.ourBans.map((b) => champion(b.championId)), rows: ourRows, ours: true };
  const enemyTeam: BoardTeam = { title: teamName(derived.enemySide), side: derived.enemySide, bans: derived.enemyBans.map((b) => champion(b.championId)), rows: enemyRows, ours: false, identity: recommendation.enemy.identity };
  // Champion select: blue on the left, red on the right, whichever side we are.
  const blueTeam = draft.side === "blue" ? ourTeam : enemyTeam;
  const redTeam = draft.side === "blue" ? enemyTeam : ourTeam;
  const turnFor = (side: Side): "pick" | "ban" | null => (step && step.side === side ? step.type : null);

  const altCard = (alt: PickRecommendation | PairRecommendation | BanRecommendation, i: number) => <RecommendationCard key={i} rec={alt} champion={champion} playerName={playerName} onLock={canAct && step ? lockRecommendation : undefined} busy={busy} onWhyNot={(c, r) => void whyNot.ask(c, r)} />;
  const gridTitle = !step ? "Champion grid" : !isOurPick && step.side !== draft.side ? `Enter their ${step.type}: search champions` : step.type === "ban" ? "All champions: search & ban manually" : "All champions: search & pick manually";

  return (
    <div className="mx-auto max-w-[1500px] space-y-3 md:space-y-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Link href="/draft" className="flex h-9 w-9 items-center justify-center rounded-md text-fg-muted hover:text-fg md:h-auto md:w-auto" aria-label="Back to drafts">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="min-w-0 text-base font-bold sm:text-lg">
          vs {draft.opponentName || "Unnamed opponent"} <span className="ml-2 text-sm font-normal text-fg-subtle">patch {draft.patch}</span>
        </h1>
        <Badge tone="neutral">{competitionModeLabel(draft.mode)}</Badge>
        {series ? <Badge tone="info">game {draft.gameNumber} · {seriesLabel(series.bestOf)}</Badge> : null}
        {draft.isTheorycraft ? <Badge tone="accent">THEORYCRAFT</Badge> : null}
        <Badge tone={sideTone(draft.side)}>{draft.side} side</Badge>
        {recommendation.stats.isDemo ? <Badge tone="warn">demo statistics</Badge> : null}
        <Badge tone={recommendation.confidence === "high" ? "good" : recommendation.confidence === "medium" ? "info" : "neutral"} title={metricTooltip("evidence-confidence")}>evidence: {recommendation.confidence}</Badge>
        <span className="flex-1" />
        <span className="flex items-center gap-1 text-[11px] text-fg-subtle" title={live.viewers.map((v) => v.label).join(", ") || "nobody else"}>
          <Radio className={cn("h-3 w-3", live.connected ? "text-good" : "text-fg-subtle")} /> {live.connected ? "live" : "reconnecting"}
          {live.viewers.length > 0 ? (
            <>
              <Eye className="ml-2 h-3 w-3" /> {live.viewers.length}
            </>
          ) : null}
        </span>
        {canCreateDrafts ? (
          <Button variant="ghost" size="sm" title="Copy this draft as a theorycraft to explore alternatives" aria-label="Theorycraft copy" onClick={async () => { const r = await cloneDraftAsTheorycraftAction(draft.id); if (r.ok) router.push(`/draft/${r.data.id}`); else setError(r.error); }}>
            <Copy className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Theorycraft copy</span>
          </Button>
        ) : null}
        {canAct ? (
          <Button variant="ghost" size="sm" onClick={undo} disabled={busy || draft.actions.length === 0}>
            <RotateCcw className="h-3.5 w-3.5" /> Undo
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-bg-elevated px-3 py-1.5 text-xs" data-testid="draft-control">
        <span>
          {iOwn ? (
            <span className="font-semibold">You created this draft and control it.</span>
          ) : canEdit ? (
            <span className="font-semibold">Admin override: you can change this draft{ownerLabel ? ` (created by ${ownerLabel})` : ""}.</span>
          ) : (
            <span className="text-fg-muted">Watching live{ownerLabel ? `: ${ownerLabel} controls this draft` : ""}. Only its creator or an admin can enter picks and bans; everything here can be inspected.</span>
          )}
        </span>
        <span className="flex-1" />
        {live.viewers.length > 0 ? <span className="text-fg-subtle">Viewing: {live.viewers.map((v) => v.label).join(", ")}</span> : null}
      </div>

      {error ? <div className="rounded-md border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</div> : null}

      {/*
        One DOM order, three compositions:
          phones   one column: current action → recommendation → champion selector → compact board → deeper panels;
          tablets  board and selector on the left, recommendation and deeper panels on the right;
          desktop  champion select: BLUE column left, selector centre, RED column right, the
                   recommendation and alternatives below, deeper analytics collapsible under that.
        Wrappers use display:contents where a composition places their children individually.
      */}
      <div className="flex flex-col gap-3 md:grid md:grid-cols-[minmax(0,1fr)_340px] md:items-start md:gap-4 xl:grid-cols-[250px_minmax(0,1fr)_250px]" data-testid="draft-layout">
        <div className="hidden xl:col-start-1 xl:row-start-1 xl:block" data-testid="team-blue">
          <TeamColumn {...blueTeam} turn={turnFor("blue")} />
        </div>

        <div className="max-md:contents md:col-start-1 md:row-start-1 md:space-y-3 xl:col-start-2 xl:space-y-4" data-testid="draft-centre">
          {/* CURRENT ACTION: sticky under the top bar on phones so the context never scrolls away */}
          <div className="order-1 min-w-0">
            <Panel className="max-md:sticky max-md:top-[calc(3.5rem+env(safe-area-inset-top))] max-md:z-20 max-md:shadow-lg [@media(max-height:480px)]:static" aria-live="polite" data-testid="current-action">
              <PanelBody className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5">
                {step ? (
                  <>
                    <Badge tone={sideTone(step.side)} className="text-xs">
                      {teamName(step.side)}
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
          </div>

          {/* COMPACT BOARD: phones and tablets; the desktop has the two team columns instead */}
          <div className="order-4 min-w-0 xl:hidden">
            <CompactBoard teams={[ourTeam, enemyTeam]} />
          </div>

          {/* CHAMPION SELECTOR: role and pool filters, search, the grid */}
          <div className="order-3 min-w-0" data-testid="champion-grid">
            <MobileSection title={gridTitle} defaultOpen={recommendation.kind === "enemy-turn"} openFrom="md">
              <div className="space-y-3">
                {isOurPick ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-fg-subtle">Picking for:</span>
                    {derived.openRoles.map((role) => (
                      <ToggleChip key={role} size="sm" active={selectedRole === role} onClick={() => setSelectedRole(role)}>
                        <RoleIcon role={role} className="h-3.5 w-3.5" /> {playerName(assignment[role])}
                      </ToggleChip>
                    ))}
                    <span className="flex-1" />
                    <ToggleChip size="sm" active={poolOnly} onClick={() => setPoolOnly((v) => !v)} aria-pressed={poolOnly} title="Only the champions in the selected player's pool for this role">
                      Pool only
                    </ToggleChip>
                  </div>
                ) : null}
                <div className="flex items-center gap-2">
                  <Input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={step ? (canAct ? `Search champion to ${step.type}…` : "Search champions") : "Draft complete"} aria-label="Search champion" disabled={!step} onKeyDown={(e) => {
                    if (e.key === "Enter" && canAct) {
                      const first = grid.find((c) => !derived.unavailableChampionIds.has(c.id));
                      if (first) commit(first.id);
                    }
                  }} />
                </div>
                <div className="grid max-h-[55dvh] grid-cols-[repeat(auto-fill,minmax(64px,1fr))] gap-1.5 overflow-y-auto rounded-lg border border-border bg-surface p-2 md:max-h-[560px] xl:min-h-[280px]" data-testid="champion-grid-cells">
                  {grid.map((c) => {
                    const unavailable = derived.unavailableChampionIds.has(c.id);
                    const inPool = poolIds.has(c.id);
                    return (
                      <div key={c.id} className="relative">
                        <button
                          type="button"
                          disabled={unavailable || !step || !canAct || busy}
                          onClick={() => commit(c.id)}
                          onContextMenu={(e) => { e.preventDefault(); togglePin(c.id); }}
                          className={cn("flex w-full flex-col items-center gap-0.5 rounded-md p-1 hover:bg-surface-2 disabled:cursor-not-allowed", inPool && isOurPick && "ring-1 ring-accent/50", pinned.includes(c.id) && "bg-accent/10")}
                          title={`${inPool ? `${c.name} — in ${selectedPlayer?.displayName}'s pool` : c.name} (right-click to pin for comparison)`}
                          data-champion={c.id}
                          data-unavailable={unavailable ? "true" : undefined}
                        >
                          <ChampionPortrait champion={c} size="md" dimmed={unavailable} />
                          <span className={cn("w-full truncate text-center text-[10px] leading-tight", unavailable ? "text-fg-subtle" : "text-fg-muted")}>{c.name}</span>
                        </button>
                        {pinned.includes(c.id) ? <Pin className="pointer-events-none absolute right-1 top-1 h-3 w-3 text-accent" /> : null}
                      </div>
                    );
                  })}
                  {grid.length === 0 ? <p className="col-span-full px-1 py-2 text-xs text-fg-muted">No champion matches{poolOnly ? " in the pool" : ""}.</p> : null}
                </div>
              </div>
            </MobileSection>
          </div>
        </div>

        <div className="hidden xl:col-start-3 xl:row-start-1 xl:block" data-testid="team-red">
          <TeamColumn {...redTeam} turn={turnFor("red")} />
        </div>

        <div className="max-md:contents md:col-start-2 md:row-start-1 md:space-y-3 xl:contents">
          {/* RECOMMENDATION: the primary option with its reasons and confidence, and the alternatives */}
          <div className="order-2 min-w-0 xl:col-span-3 xl:col-start-1 xl:row-start-2" data-testid="draft-intel">
            <div className="space-y-3 xl:grid xl:grid-cols-3 xl:items-start xl:gap-4 xl:space-y-0">
              {recommendation.roleSwap ? (
                <Panel className="border-accent/50 xl:col-span-3">
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

              {recommendation.kind !== "complete" && recommendation.emergency.length > 0 ? (
                <EmergencyPanel alerts={recommendation.emergency} champion={champion} busy={busy} onLock={canAct && isOurPick ? (id, role) => void commit(id, role) : undefined} />
              ) : null}

              {recommendation.kind === "complete" && playbook ? (
                <div className="xl:col-span-3">
                  <PlaybookPanel
                    playbook={playbook}
                    championsById={championsById}
                    myPlayerId={viewer.playerId ?? null}
                    actions={
                      draft.isTheorycraft ? (
                        savedMatchId ? (
                          <Link href={`/matches/${savedMatchId}`} className="text-xs text-accent hover:underline">
                            saved as match
                          </Link>
                        ) : canEdit ? (
                          <Button size="sm" variant="outline" onClick={async () => { const r = await saveDraftAsMatchAction(draft.id); if (r.ok) setSavedMatchId(r.data.matchId); else setError(r.error); }}>
                            Save as match record
                          </Button>
                        ) : null
                      ) : (
                        <span className="flex items-center gap-2">
                          {series && canEdit && canStartNextGame(series) ? (
                            <Link href={`/draft?series=${series.id}`}>
                              <Button size="sm" variant="primary">Next game →</Button>
                            </Link>
                          ) : null}
                          <Link href="/matches" className="whitespace-nowrap text-xs text-accent hover:underline">
                            archived in Matches
                          </Link>
                        </span>
                      )
                    }
                  />
                </div>
              ) : recommendation.kind === "enemy-turn" ? (
                <Panel className="xl:col-span-3">
                  <PanelHeader title="WAITING FOR ENEMY" subtitle="Enter their selection in the champion grid. Our projected plan is below." />
                  <PanelBody>
                    <BestFit recommendation={recommendation} champion={champion} playerName={playerName} />
                  </PanelBody>
                </Panel>
              ) : (
                <>
                  <Panel className={cn("border-accent/40", recommendation.alternatives.length > 0 ? "xl:col-span-2" : "xl:col-span-3", optimistic && "relative")} aria-busy={!!optimistic} data-testid="recommendation">
                    {optimistic ? (
                      <div className="absolute inset-0 z-10 grid place-items-center rounded-lg bg-bg/70 backdrop-blur-[1px]">
                        <span className="rounded-md border border-accent/40 bg-bg-elevated px-3 py-1.5 text-xs text-fg">Updating recommendation for the new state…</span>
                      </div>
                    ) : null}
                    <PanelHeader title={recommendation.kind === "ban" ? "RECOMMENDED BAN" : recommendation.kind === "pair" ? "RECOMMENDED PAIR" : "RECOMMENDED NOW"} subtitle={recommendation.kind === "pair" ? "Both picks evaluated together" : undefined} actions={<DecisionBadge decision={recommendation.decision} />} />
                    <PanelBody className="space-y-3">
                      <EvidenceLine stats={recommendation.stats} playerData={recommendation.playerData} playerName={playerName} />
                      {recommendation.primary ? (
                        <RecommendationCard rec={recommendation.primary} champion={champion} playerName={playerName} onLock={canAct && step ? lockRecommendation : undefined} busy={busy} primary />
                      ) : (
                        <p className="text-sm text-fg-muted">{recommendation.emergency.length > 0 ? "No pool champion is left for the open roles: see the emergency picks above." : "No legal option: check the players&apos; champion pools."}</p>
                      )}
                      {recommendation.holds.map((h) => (
                        <div key={h.role} className="rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
                          <span className="font-semibold uppercase">Hold {ROLE_LABELS[h.role]}</span> — {h.reason}
                        </div>
                      ))}
                      {recommendation.responses.length > 0 || recommendation.whatIf.length > 0 ? (
                        <MobileSection title="Enemy responses & what-ifs">
                          <div className="space-y-3">
                            <ResponsesList items={recommendation.responses} champion={champion} forName={recommendation.primary?.kind === "pick" ? champion(recommendation.primary.championId)?.name ?? null : recommendation.primary?.kind === "pair" ? champion(recommendation.primary.picks[0].championId)?.name ?? null : null} />
                            <WhatIfList items={recommendation.whatIf} champion={champion} />
                          </div>
                        </MobileSection>
                      ) : null}
                    </PanelBody>
                  </Panel>
                  {recommendation.alternatives.length > 0 ? (
                    <Panel data-testid="alternatives">
                      <PanelHeader title="ALTERNATIVES" subtitle="Next-best options, each with its own reasons." />
                      <PanelBody className="space-y-3">
                        {recommendation.alternatives.slice(0, 2).map(altCard)}
                        {recommendation.alternatives.length > 2 ? (
                          <MobileSection title={`${recommendation.alternatives.length - 2} more alternative${recommendation.alternatives.length - 2 === 1 ? "" : "s"}`} openFrom="never">
                            <div className="space-y-3">{recommendation.alternatives.slice(2).map((alt, i) => altCard(alt, i + 2))}</div>
                          </MobileSection>
                        ) : null}
                      </PanelBody>
                    </Panel>
                  ) : null}
                </>
              )}
            </div>
          </div>

          {/* DEEPER ANALYTICS: collapsible on every screen size */}
          <div className="order-5 min-w-0 xl:col-span-3 xl:col-start-1 xl:row-start-3" data-testid="draft-deeper">
            <div className="space-y-3 xl:grid xl:grid-cols-3 xl:items-start xl:gap-4 xl:space-y-0">
              {recommendation.kind !== "complete" && recommendation.kind !== "enemy-turn" ? (
                <>
                  {pinned.length > 0 ? (
                    <MobileSection title="Pinned comparison" defaultOpen openFrom="never">
                      <PinnedPanel pinned={pinned} candidates={recommendation.candidates} champion={champion} playerName={playerName} onUnpin={togglePin} onWhyNot={(id, role) => void whyNot.ask(id, role)} onLock={canAct && step ? (id, role) => void commit(id, role) : undefined} unavailable={derived.unavailableChampionIds} />
                    </MobileSection>
                  ) : null}
                  {recommendation.candidates.length > 1 ? (
                    <MobileSection title="Why not another champion?" openFrom="never">
                      <WhyNotPanel candidates={recommendation.candidates} champion={champion} playerName={playerName} state={whyNot.state} ask={whyNot.ask} pinned={pinned} onPin={togglePin} />
                    </MobileSection>
                  ) : null}
                  <MobileSection title="Projected team" openFrom="never">
                    <Panel>
                      <PanelHeader title="PROJECTED TEAM" subtitle="Best complete team reachable from here" />
                      <PanelBody>
                        <BestFit recommendation={recommendation} champion={champion} playerName={playerName} />
                      </PanelBody>
                    </Panel>
                  </MobileSection>
                  {recommendation.pinch.length > 0 ? (
                    <MobileSection title="Pool pinch warnings" openFrom="never">
                      <PinchPanel pinch={recommendation.pinch} playerName={playerName} champion={champion} />
                    </MobileSection>
                  ) : null}
                </>
              ) : null}
              {recommendation.kind !== "complete" ? (
                <MobileSection title="Today's overrides" openFrom="never">
                  <OverridesPanel draftId={draft.id} active={recommendation.overrides.active} warning={recommendation.overrides.warning} canEdit={canEdit} onSaved={(p) => setPayload(p)} />
                </MobileSection>
              ) : null}
              {recommendation.tendencies || (payload.scouting?.length ?? 0) > 0 ? (
                <MobileSection title="Enemy likely picks" defaultOpen openFrom="never">
                  <EnemyTendenciesPanel draftId={draft.id} tendencies={recommendation.tendencies} scouting={payload.scouting ?? []} championsById={championsById} canEdit={canEdit} compact />
                </MobileSection>
              ) : null}
              {!draft.isTheorycraft ? (
                <MobileSection title="Enemy players" openFrom="never">
                  <EnemyPlayersPanel draftId={draft.id} initial={draft.enemyPlayers} canEdit={canEdit} compact />
                </MobileSection>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** One side of the champion select: bans, then the five picks (ours by role and player, theirs in order), with a marker while it is their turn. */
function TeamColumn({ title, side, bans, rows, ours = false, identity, turn = null, className }: { title: string; side: Side; bans: Array<PickerChampion | null>; rows: BoardRow[]; ours?: boolean; identity?: string | null; turn?: "pick" | "ban" | null; className?: string }) {
  const tone = side === "blue" ? "border-blue/50" : "border-red/50";
  return (
    <Panel className={cn("self-start", turn && "ring-1 ring-accent/40", className)} data-side={side} data-turn={turn ?? undefined}>
      <PanelHeader
        title={<span className={side === "blue" ? "text-blue" : "text-red"}>{title}</span>}
        subtitle={identity ? `Reads as: ${identity}` : ours ? "Players and locked champions" : "Revealed picks and probable roles"}
        actions={turn ? <Badge tone="accent">{turn === "ban" ? "BANNING" : "PICKING"}</Badge> : <span className="text-[10px] uppercase tracking-wider text-fg-subtle">{side} side</span>}
      />
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
              <div key={p.championId} className="space-y-1">
                <div className="font-medium text-fg-muted">{champion(p.championId)?.name}</div>
                <WhyList items={p.why} />
                <WhyThisPick breakdown={p.breakdown} />
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
      {rec.kind === "pick" ? <WhyThisPick breakdown={rec.breakdown} defaultOpen={primary && !!rec.breakdown.proficiencyDecisive} showDecisive={false} /> : null}
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
          <Badge tone="neutral" title={metricTooltip("team-fit")}>team fit {signedPoints(ev.synergyPart)} pts</Badge>
          <Badge tone="neutral" title={metricTooltip("enemy-interaction")}>into their draft {signedPoints(ev.enemyPart)} pts</Badge>
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
