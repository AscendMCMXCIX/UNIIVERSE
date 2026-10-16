"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Ban, Check, Copy, Eye, Flame, PanelRightOpen, Radio, RotateCcw, Shuffle, TriangleAlert, X } from "lucide-react";
import { applyAction, deriveDraft, phaseLabel, stepLabel, type DraftState, type Side } from "@/domain/draft";
import { ROLES, ROLE_LABELS, type Role } from "@/domain/roles";
import { competitionModeLabel } from "@/domain/competition";
import { canStartNextGame, seriesLabel } from "@/domain/series";
import { assignmentStatus, poolFor } from "@/domain/roster";
import type { BanRecommendation, EmergencyAlert, PairRecommendation, PickRecommendation, RecommendationResult } from "@/domain/engine";
import { metricTooltip } from "@/domain/metrics";
import { QuickPlaybook } from "@/components/playbook/quick-playbook";
import { saveDraftAsMatchAction } from "@/server/actions/matches";
import { applyDraftAction, applyRoleSwapAction, cloneDraftAsTheorycraftAction, reloadDraftRoomAction, setDraftSideAction, undoDraftAction, type DraftRoomPayload } from "@/server/actions/drafts";
import { toDraftState } from "@/server/repositories/drafts";
import { useDraftLive } from "./use-draft-live";
import { EnemyTendenciesPanel } from "./enemy-tendencies-panel";
import { EmergencyPanel, EvidenceLine, PinchPanel, PinnedPanel, RealismChips, ResponsesList, ThreatList, useWhyNot, WhatIfList, WhyNotPanel, WhyThisPick } from "./insight-panels";
import { OverridesPanel } from "./overrides-panel";
import { CompactBoard, OurSlotLine, type BoardRow, type BoardTeam } from "./compact-board";
import { ChampionGrid } from "@/components/champions/champion-grid";
import type { PickerChampion } from "@/components/champions/types";
import { ChampionPortrait } from "@/components/champion-portrait";
import { RoleIcon } from "@/components/role-icon";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button, buttonClass } from "@/components/ui/button";
import { MobileSection } from "@/components/ui/mobile-section";
import { Drawer } from "@/components/ui/drawer";
import { SectionLabel } from "@/components/ui/panel";
import { toast } from "@/components/ui/toast";
import { InfoTip } from "@/components/ui/info-tip";
import { recommendationHeadline } from "./recommendation-headline";
import { cn } from "@/lib/cn";
import { percent, signedPoints } from "@/lib/format";

export interface DraftRoomProps {
  initial: DraftRoomPayload;
  champions: PickerChampion[];
  /** This viewer created the draft or may override it: they control it. The server checks again on every action. */
  canEdit: boolean;
  /** Any signed-in member may start a theorycraft copy (which they then own). */
  canCreateDrafts?: boolean;
  viewer: { userId: string | null; label: string; playerId?: string | null };
  /** Our team's short name (branding). */
  ourName?: string;
  /** The best-of series this game belongs to, if any. */
  series?: { id: string; bestOf: number; status: "in_progress" | "completed" | "cancelled"; ourWins: number; theirWins: number; gamesStarted: number } | null;
}

type ChampionLookup = (id: string | null | undefined) => PickerChampion | null;
type AnyRecommendation = PickRecommendation | PairRecommendation | BanRecommendation;

const DECISION_TONE: Record<string, BadgeTone> = { strong: "good", moderate: "info", close: "warn", low: "neutral" };

/**
 * The live draft, laid out like champion select: BLUE on the left, the champion selector in the
 * centre with the current action and the recommendation above it, RED on the right, all inside
 * one desktop viewport (the grid scrolls inside). Phones stack current action → recommendation →
 * selector → board. Deeper analysis sits below the workspace, collapsed.
 */
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
  const iOwn = ownerId !== null && ownerId === viewer.userId;
  // The creator controls the draft; an admin may override. Everyone else watches and inspects.
  const canAct = canEdit;
  const [busy, setBusy] = React.useState(false);
  /** The action just entered, shown on the board before the server confirms it (reverted on failure). */
  const [optimistic, setOptimistic] = React.useState<DraftState | null>(null);
  /** Grid filter: only the selected player's pool champions for the chosen role. */
  const [poolOnly, setPoolOnly] = React.useState(false);
  /** The user's role choice for the current step, keyed by draft progress so it resets after each action. */
  const [roleOverride, setRoleOverride] = React.useState<{ at: number; role: Role } | null>(null);
  const whyNot = useWhyNot(initial.draft.id);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const [savedMatchId, setSavedMatchId] = React.useState<string | null>(null);
  /** A champion chosen in the grid, waiting for Lock in / Ban (cleared by any draft action). */
  const [selection, setSelection] = React.useState<{ at: number; championId: string } | null>(null);
  const [analysisOpen, setAnalysisOpen] = React.useState(false);

  const { draft, recommendation, playbook } = payload;
  const byId = React.useMemo(() => new Map(champions.map((c) => [c.id, c])), [champions]);
  const championsById = React.useMemo(() => Object.fromEntries(champions.map((c) => [c.id, c])), [champions]);
  const players = React.useMemo(() => new Map(draft.lineup.map((p) => [p.id, p])), [draft.lineup]);
  const serverState = React.useMemo(() => toDraftState(draft), [draft]);
  const state = optimistic ?? serverState;
  const derived = React.useMemo(() => deriveDraft(state), [state]);
  // Why each champion is unavailable: this game's bans and picks, and (Fearless) earlier games' picks.
  const unavailableReasons = React.useMemo(() => {
    const m = new Map<string, { kind: "ban" | "pick" | "fearless"; text: string }>();
    for (const l of draft.fearless?.locks ?? []) m.set(l.championId, { kind: "fearless", text: `Fearless: picked in game ${l.gameNumber}` });
    for (const id of derived.bannedChampionIds) m.set(id, { kind: "ban", text: "banned this game" });
    for (const id of derived.pickedChampionIds) m.set(id, { kind: "pick", text: "picked this game" });
    return m;
  }, [derived, draft.fearless]);
  const step = derived.nextStep;
  // Fearless: players whose remaining pool for their role is thin for the games still to come.
  const fearlessThin = React.useMemo(() => {
    if (!draft.fearless?.enabled) return [] as Array<{ role: Role; name: string; left: number; games: number }>;
    const games = Math.max(1, draft.fearless.bestOf - draft.gameNumber + 1);
    const out: Array<{ role: Role; name: string; left: number; games: number }> = [];
    for (const role of ROLES) {
      const p = draft.lineup.find((x) => x.id === state.assignments[role]);
      if (!p || derived.filledRoles.has(role)) continue;
      const left = poolFor(p, role).filter((c) => !derived.unavailableChampionIds.has(c)).length;
      if (left < games + 1) out.push({ role, name: p.displayName, left, games });
    }
    return out;
  }, [draft.fearless, draft.gameNumber, draft.lineup, state.assignments, derived]);
  const isOurPick = !!step && step.type === "pick" && step.side === draft.side;
  const assignment = recommendation.assignment;

  // Role being picked for: the user's choice for this step, else the recommendation's role, else the first open role.
  const recommendedRole = recommendation.primary?.kind === "pick" ? recommendation.primary.role : recommendation.primary?.kind === "pair" ? recommendation.primary.picks[0].role : null;
  const defaultRole = recommendedRole && derived.openRoles.includes(recommendedRole) ? recommendedRole : derived.openRoles[0] ?? null;
  const selectedRole: Role | null = isOurPick ? (roleOverride && roleOverride.at === draft.actions.length ? roleOverride.role : defaultRole) : null;
  const setSelectedRole = (role: Role) => setRoleOverride({ at: draft.actions.length, role });

  const champion: ChampionLookup = (id) => (id ? byId.get(id) ?? { id, name: id, portraitUrl: "" } : null);
  const playerName = (id: string | null | undefined) => (id ? players.get(id)?.displayName ?? "?" : "?");

  const commit = async (championId: string | null, role?: Role | null) => {
    if (!canAct || busy || !step) return;
    const r = role ?? (isOurPick ? selectedRole : null);
    const input = { championId, role: isOurPick ? r : null, playerId: isOurPick && r ? assignment[r] : null };
    // The board shows the action at once; the recommendation is marked as updating until the
    // server answers, and the local view is reverted if the server rejects the action.
    const local = applyAction(serverState, { championId: input.championId, role: input.role ?? null, playerId: input.playerId ?? null });
    if (!local.ok) {
      toast.error(local.error);
      return;
    }
    setBusy(true);
    setOptimistic(local.state);
    const res = await applyDraftAction(draft.id, input, draft.version);
    setBusy(false);
    setOptimistic(null);
    if (!res.ok) {
      toast.error(res.conflict ? "The draft changed in another window" : "Could not save that action", { description: res.error });
      if (res.conflict) void reload();
    } else {
      setPayload(res.data);
      whyNot.reset();
      searchRef.current?.focus({ preventScroll: true });
    }
  };

  const undo = async () => {
    if (!canAct || busy) return;
    setBusy(true);
    const res = await undoDraftAction(draft.id, draft.version);
    setBusy(false);
    if (!res.ok) {
      toast.error("Could not undo", { description: res.error });
      if (res.conflict) void reload();
    } else setPayload(res.data);
  };

  const applySwap = async () => {
    if (!recommendation.roleSwap || busy) return;
    setBusy(true);
    const res = await applyRoleSwapAction(draft.id, recommendation.roleSwap.to, recommendation.roleSwap.why.join(" "));
    setBusy(false);
    if (!res.ok) toast.error("Could not apply the role swap", { description: res.error });
    else {
      setPayload(res.data);
      toast.success("Roles swapped.");
    }
  };

  const theorycraftCopy = async () => {
    const r = await cloneDraftAsTheorycraftAction(draft.id);
    if (r.ok) router.push(`/draft/${r.data.id}`);
    else toast.error("Could not copy the draft", { description: r.error });
  };

  const lockRecommendation = (rec: PickRecommendation | BanRecommendation) => (rec.kind === "ban" ? commit(rec.championId, null) : commit(rec.championId, rec.role));

  // Champion select: a click (or Enter) selects; the same champion again, Enter again or the
  // Lock in / Ban button confirms. The recommendation's own buttons lock in one step.
  const selected = selection && selection.at === draft.actions.length && !derived.unavailableChampionIds.has(selection.championId) ? selection.championId : null;
  const choose = (id: string) => {
    if (!canAct || !step || busy) return;
    if (selected === id) void commit(id);
    else setSelection({ at: draft.actions.length, championId: id });
  };
  React.useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector("dialog[open]")) setSelection(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);
  // Details: the drawer beside the workspace on desktop; the sections below it on smaller screens.
  const showDetails = () => {
    if (typeof window !== "undefined" && window.matchMedia("(min-width: 1280px)").matches) setAnalysisOpen(true);
    else document.getElementById("draft-details")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const selectedPlayer = selectedRole ? players.get(assignment[selectedRole]) : null;
  const poolIds = React.useMemo(() => new Set(selectedPlayer && selectedRole ? poolFor(selectedPlayer, selectedRole) : []), [selectedPlayer, selectedRole]);
  const gridChampions = React.useMemo(() => (isOurPick && poolOnly ? champions.filter((c) => poolIds.has(c.id)) : champions), [champions, isOurPick, poolOnly, poolIds]);
  const pinnedSet = React.useMemo(() => new Set(pinned), [pinned]);

  const teamName = (side: Side) => (side === draft.side ? ourName : draft.opponentName || "Enemy");
  const ourRows: BoardRow[] = ROLES.map((role) => {
    const pick = derived.ourPicks.find((p) => p.role === role);
    const player = players.get(assignment[role]);
    const active = isOurPick && selectedRole === role;
    return { role, label: player?.displayName ?? "?", status: player ? assignmentStatus(player, role) : undefined, champion: champion(pick?.championId ?? (active ? selected : null)), preview: active && !pick && !!selected, active, onClick: isOurPick && !pick && canAct ? () => setSelectedRole(role) : undefined };
  });
  const enemyRows: BoardRow[] = derived.enemyPicks.map((p, i) => {
    const est = recommendation.enemy.roles.find((r) => r.championId === p.championId);
    const prob = est ? est.probabilities[est.mostLikely] ?? 0 : 0;
    return { role: est?.mostLikely ?? null, label: stepLabel(derived.steps[p.index]!), sub: est ? `${ROLE_LABELS[est.mostLikely]}${est.isFlex ? ` (${percent(prob, 0)}, flex)` : ""}` : undefined, champion: champion(p.championId), active: false, key: String(i) };
  });
  const ourTeam: BoardTeam = { title: teamName(draft.side), side: draft.side, bans: derived.ourBans.map((b) => champion(b.championId)), rows: ourRows, ours: true };
  const enemyTeam: BoardTeam = { title: teamName(derived.enemySide), side: derived.enemySide, bans: derived.enemyBans.map((b) => champion(b.championId)), rows: enemyRows, ours: false, identity: recommendation.enemy.identity, preview: step && step.side === derived.enemySide && step.type === "pick" && selected ? champion(selected) : null };
  const blueTeam = draft.side === "blue" ? ourTeam : enemyTeam;
  const redTeam = draft.side === "blue" ? enemyTeam : ourTeam;
  const turnFor = (side: Side): "pick" | "ban" | null => (step && step.side === side ? step.type : null);
  const complete = recommendation.kind === "complete" && !step;

  const topBar = (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
      <Link href="/draft" className="grid h-9 w-9 place-items-center rounded-md text-fg-muted hover:bg-surface-2 hover:text-fg" aria-label="Back to Draft">
        <ArrowLeft className="h-4 w-4" />
      </Link>
      <h1 className="min-w-0 truncate text-lg font-bold">
        {draft.opponentName ? `vs ${draft.opponentName}` : competitionModeLabel(draft.mode)}
      </h1>
      <span className="flex flex-wrap items-center gap-1.5">
        {draft.opponentName ? <Badge tone="neutral">{competitionModeLabel(draft.mode)}</Badge> : null}
        <Badge tone={draft.side === "blue" ? "blue" : "red"}>{draft.side === "blue" ? "Blue side" : "Red side"}</Badge>
        {canEdit && draft.actions.length === 0 && draft.status === "in_progress" ? (
          <button
            type="button"
            className="rounded-md px-1.5 py-0.5 text-xs text-accent hover:bg-accent/10"
            data-testid="switch-side"
            onClick={async () => {
              const r = await setDraftSideAction(draft.id, draft.side === "blue" ? "red" : "blue");
              if (!r.ok) return toast.error(r.error);
              await reload();
            }}
          >
            Switch to {draft.side === "blue" ? "red" : "blue"}
          </button>
        ) : null}
        {series ? (
          <Badge tone="info">
            Game {draft.gameNumber} · {seriesLabel(series.bestOf)} · {series.ourWins}–{series.theirWins}
          </Badge>
        ) : null}
        {draft.isTheorycraft ? <Badge tone="accent">Theorycraft</Badge> : null}
        {recommendation.stats.isDemo ? <Badge tone="warn">Demo statistics</Badge> : null}
        <span className="text-xs text-fg-subtle">Patch {draft.patch}</span>
      </span>
      <span className="flex-1" />
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-fg-muted" data-testid="draft-control" title={live.viewers.map((v) => v.label).join(", ") || "Nobody else is watching"}>
        <Radio className={cn("h-3 w-3", live.connected ? "text-good" : "text-fg-subtle")} aria-hidden />
        {iOwn ? "You control this draft" : canEdit ? `Override${live.ownerLabel ? ` · ${live.ownerLabel}'s draft` : ""}` : `Watching${live.ownerLabel ? ` · ${live.ownerLabel} controls` : ""}`}
        {live.viewers.length > 0 ? (
          <span className="inline-flex items-center gap-0.5 text-fg-subtle">
            <Eye className="ml-1 h-3 w-3" aria-hidden /> {live.viewers.length}
          </span>
        ) : null}
        {!live.connected ? <span className="text-fg-subtle">· reconnecting</span> : null}
      </span>
      {canCreateDrafts ? (
        <Button variant="ghost" size="sm" title="Copy this draft as a theorycraft to explore alternatives" aria-label="Theorycraft copy" onClick={theorycraftCopy}>
          <Copy className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Theorycraft copy</span>
        </Button>
      ) : null}
      <Button variant="ghost" size="sm" className="max-xl:hidden" onClick={() => setAnalysisOpen(true)} data-testid="open-analysis">
        <PanelRightOpen className="h-3.5 w-3.5" /> Analysis
      </Button>
      {canAct ? (
        <Button variant="outline" size="sm" onClick={undo} disabled={busy || draft.actions.length === 0}>
          <RotateCcw className="h-3.5 w-3.5" /> Undo
        </Button>
      ) : null}
    </div>
  );

  if (complete) {
    return (
      <div className="mx-auto max-w-[112.5rem] space-y-4" data-testid="draft-room">
        {topBar}
        <FinalBoard blue={blueTeam} red={redTeam} />
        <div className="rounded-card border border-good/40 bg-surface p-4 sm:p-5" data-testid="room-playbook">
          {playbook ? (
            <QuickPlaybook
              playbook={playbook}
              championsById={championsById}
              ourPicks={derived.ourPicks.map((p) => p.championId)}
              enemyPicks={derived.enemyPicks.map((p) => p.championId)}
              myPlayerId={viewer.playerId ?? null}
              detailHref={`/draft/${draft.id}/playbook?view=detail`}
              showMatchup={false}
              headerExtra={
                <span className="flex flex-wrap items-center gap-2">
                  <Link href={`/draft/${draft.id}/playbook`} className="text-sm text-accent hover:underline">
                    Full screen
                  </Link>
                  {draft.isTheorycraft ? (
                    savedMatchId ? (
                      <Link href={`/matches/${savedMatchId}`} className="text-sm text-accent hover:underline">
                        Saved as a match
                      </Link>
                    ) : canEdit ? (
                      <Button size="sm" variant="outline" onClick={async () => { const r = await saveDraftAsMatchAction(draft.id); if (r.ok) { setSavedMatchId(r.data.matchId); toast.success("Saved as a match record."); } else toast.error("Could not save the match", { description: r.error }); }}>
                        Save as match record
                      </Button>
                    ) : null
                  ) : (
                    <>
                      {series && canEdit && canStartNextGame(series) ? (
                        <Link href={`/draft?series=${series.id}`} className={buttonClass("primary", "sm")}>
                          Next game →
                        </Link>
                      ) : null}
                      <Link href="/matches?view=drafted" className="whitespace-nowrap text-sm text-accent hover:underline">
                        Saved in Matches
                      </Link>
                    </>
                  )}
                </span>
              }
            />
          ) : (
            <p className="text-sm text-fg-muted">The draft is complete. The playbook is being prepared; reload in a moment.</p>
          )}
        </div>
      </div>
    );
  }

  const currentAction = (
    <div className="max-xl:sticky max-xl:top-[calc(3.5rem+env(safe-area-inset-top))] max-xl:z-20 lg:max-xl:top-0 [@media(max-height:480px)]:static" aria-live="polite" data-testid="current-action">
      <div className={cn("flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 rounded-panel border bg-bg-elevated px-3 py-1.5 shadow-sm max-xl:shadow-lg", step?.side === "blue" ? "border-blue/50" : step?.side === "red" ? "border-red/50" : "border-border")}>
        {step ? (
          <>
            <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full motion-safe:animate-pulse", step.side === "blue" ? "bg-blue" : "bg-red")} aria-hidden />
            <span className="text-base font-semibold">
              <span className={step.side === "blue" ? "text-blue" : "text-red"}>{teamName(step.side)}</span> {step.type === "ban" ? "BAN" : "PICK"}
            </span>
            <span className="text-sm text-fg-muted">
              {phaseLabel(step.phase)} · {stepLabel(step)}
              {step.type === "pick" && step.windowSize === 2 ? (step.windowPosition === 0 ? " · first of two" : " · second of two") : ""}
            </span>
            {step.simultaneous ? (
              <Badge tone="neutral" title="Bans are simultaneous: enter ours, then theirs once revealed.">
                Simultaneous
              </Badge>
            ) : null}
            <span className="flex-1" />
            <span className="hidden text-xs text-fg-subtle 2xl:inline">
              {derived.ourRemainingPicks} picks · {derived.ourRemainingBans} bans left for us
            </span>
            {selected && canAct ? (
              <span className="flex items-center gap-2" data-testid="selected-champion">
                <ChampionPortrait champion={champion(selected)} size="sm" className="ring-2 ring-highlight" />
                <Button size="md" variant="primary" onClick={() => void commit(selected)} disabled={busy} data-testid="confirm-action" className="min-w-32">
                  {step.type === "ban" ? <Ban className="h-4 w-4" /> : <Check className="h-4 w-4" />} {step.type === "ban" ? "Ban" : "Lock in"} {champion(selected)?.name}
                </Button>
                <button type="button" onClick={() => setSelection(null)} className="grid h-9 w-9 place-items-center rounded-md text-fg-subtle hover:bg-surface-2 hover:text-fg pointer-coarse:h-11 pointer-coarse:w-11" aria-label="Clear selection" title="Clear selection (Esc)">
                  <X className="h-4 w-4" />
                </button>
              </span>
            ) : step.type === "ban" && canAct ? (
              <Button size="sm" variant="ghost" onClick={() => commit(null)} disabled={busy}>
                <Ban className="h-3.5 w-3.5" /> No ban
              </Button>
            ) : canAct ? (
              <span className="hidden text-xs text-fg-subtle sm:inline">Choose a champion, then lock it in</span>
            ) : null}
          </>
        ) : (
          <span className="text-sm font-semibold text-good">Draft complete</span>
        )}
      </div>
      {draft.fearless?.enabled ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-warn/40 bg-warn/5 px-3 py-1.5 text-xs" data-testid="fearless-strip">
          <span className="inline-flex items-center gap-1 font-semibold text-warn">
            <Flame className="h-3.5 w-3.5" aria-hidden /> Fearless · Game {draft.gameNumber} of up to {draft.fearless.bestOf}
          </span>
          <span className="text-fg-muted">
            {draft.fearless.locks.length} champion{draft.fearless.locks.length === 1 ? "" : "s"} used in earlier games {draft.fearless.locks.length === 1 ? "is" : "are"} unavailable to both teams. Bans reset each game.
          </span>
          {fearlessThin.map((t) => (
            <span key={t.role} className="inline-flex items-center gap-1 text-warn" title="Every champion picked now is gone for the rest of the series.">
              <RoleIcon role={t.role} className="h-3.5 w-3.5" /> {t.name}: {t.left} champion{t.left === 1 ? "" : "s"} left for {t.games} more game{t.games === 1 ? "" : "s"}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );

  const analysis = (inDrawer: boolean) => (
        <div className={cn("grid items-start gap-3", inDrawer ? "grid-cols-1" : "md:grid-cols-2 2xl:grid-cols-3")}>
          {recommendation.primary ? (
            <MobileSection title="Why this recommendation" openFrom="never" defaultOpen={inDrawer}>
              <div className="space-y-4 rounded-panel border border-border bg-surface p-3">
                <EvidenceLine stats={recommendation.stats} playerData={recommendation.playerData} playerName={playerName} />
                <RecommendationDetail rec={recommendation.primary} champion={champion} playerName={playerName} primary />
                {recommendation.alternatives.map((alt, i) => (
                  <div key={i} className="border-t border-border pt-3">
                    <RecommendationDetail rec={alt} champion={champion} playerName={playerName} onWhyNot={(c, r) => void whyNot.ask(c, r)} />
                  </div>
                ))}
              </div>
            </MobileSection>
          ) : null}
          {recommendation.responses.length > 0 || recommendation.whatIf.length > 0 ? (
            <MobileSection title="Enemy responses & what-ifs" openFrom="never">
              <div className="space-y-3 rounded-panel border border-border bg-surface p-3">
                <ResponsesList items={recommendation.responses} champion={champion} forName={recommendation.primary?.kind === "pick" ? champion(recommendation.primary.championId)?.name ?? null : recommendation.primary?.kind === "pair" ? champion(recommendation.primary.picks[0].championId)?.name ?? null : null} />
                <WhatIfList items={recommendation.whatIf} champion={champion} />
              </div>
            </MobileSection>
          ) : null}
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
            <div className="rounded-panel border border-border bg-surface p-3">
              <p className="mb-2 text-sm text-fg-muted">The best complete team reachable from here.</p>
              <BestFit recommendation={recommendation} champion={champion} playerName={playerName} />
            </div>
          </MobileSection>
          {recommendation.emergency.length > 0 ? (
            <MobileSection title="Emergency picks explained" openFrom="never">
              <EmergencyPanel alerts={recommendation.emergency} champion={champion} busy={busy} onLock={canAct && isOurPick ? (id, role) => void commit(id, role) : undefined} />
            </MobileSection>
          ) : null}
          {recommendation.pinch.length > 0 ? (
            <MobileSection title="Pool pinch warnings" openFrom="never">
              <PinchPanel pinch={recommendation.pinch} playerName={playerName} champion={champion} />
            </MobileSection>
          ) : null}
          {recommendation.tendencies || (payload.scouting?.length ?? 0) > 0 ? (
            <MobileSection title="Enemy likely picks" defaultOpen openFrom="never">
              <EnemyTendenciesPanel draftId={draft.id} tendencies={recommendation.tendencies} scouting={payload.scouting ?? []} championsById={championsById} canEdit={false} compact />
            </MobileSection>
          ) : null}
          <MobileSection title="Today's overrides" openFrom="never">
            <OverridesPanel draftId={draft.id} active={recommendation.overrides.active} warning={recommendation.overrides.warning} canEdit={canEdit} onSaved={(p) => setPayload(p)} />
          </MobileSection>
        </div>
  );

  const selector = (
    <div className="flex min-h-0 flex-col rounded-panel border border-border bg-surface p-2.5 max-xl:max-h-[70dvh] xl:flex-1" data-testid="selector">
      {isOurPick && canAct ? (
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-fg-subtle">Picking for</span>
          {derived.openRoles.map((role) => (
            <button key={role} type="button" onClick={() => setSelectedRole(role)} aria-pressed={selectedRole === role} className={cn("inline-flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors pointer-coarse:min-h-11", selectedRole === role ? "border-accent bg-accent/15 text-accent" : "border-border text-fg-muted hover:text-fg")}>
              <RoleIcon role={role} className="h-3.5 w-3.5" /> {playerName(assignment[role])}
            </button>
          ))}
        </div>
      ) : null}
      <ChampionGrid
        champions={gridChampions}
        disabledIds={derived.unavailableChampionIds}
        disabledReason="banned or picked"
        unavailableReasons={unavailableReasons}
        onPick={choose}
        selectedIds={selected ? new Set([selected]) : undefined}
        maxHeight="fill"
        size="sm"
        testId="champion-grid"
        readOnly={!canAct || !step || busy}
        prioritisedIds={isOurPick ? poolIds : undefined}
        prioritisedLabel={selectedPlayer ? `in ${selectedPlayer.displayName}'s pool` : undefined}
        markedIds={pinnedSet}
        onSecondary={togglePin}
        inputRef={searchRef}
        clearOn={draft.actions.length}
        placeholder="Search champion…"
        toolbarExtra={
          isOurPick ? (
            <button type="button" onClick={() => setPoolOnly((v) => !v)} aria-pressed={poolOnly} title="Only the champions in the selected player's pool for this role" className={cn("h-9 rounded-lg border px-3 text-xs font-medium transition-colors pointer-coarse:h-11", poolOnly ? "border-accent bg-accent/15 text-accent" : "border-border text-fg-muted hover:text-fg")}>
              Pool only
            </button>
          ) : null
        }
      />
    </div>
  );

  return (
    <div className="mx-auto max-w-[112.5rem] space-y-4 xl:space-y-0" data-testid="draft-room">
      <div className="flex flex-col gap-3 xl:h-[calc(100dvh-3.5rem)] xl:min-h-[620px]" data-testid="draft-workspace">
        {topBar}
        <div className="flex min-h-0 flex-col gap-3 xl:grid xl:flex-1 xl:grid-cols-[13rem_minmax(0,1fr)_13rem] xl:grid-rows-[minmax(0,1fr)] min-[1400px]:grid-cols-[15rem_minmax(0,1fr)_15rem] 2xl:grid-cols-[18rem_minmax(0,1fr)_18rem]" data-testid="draft-layout">
          <div className="hidden min-h-0 xl:block" data-testid="team-blue">
            <TeamColumn team={blueTeam} turn={turnFor("blue")} />
          </div>
          <div className="flex min-h-0 min-w-0 flex-col gap-3" data-testid="draft-centre">
            {currentAction}
            {/* Below xl the draft so far comes first, right under the current action. */}
            <div className="xl:hidden" data-testid="compact-board-slot">
              <CompactBoard teams={[ourTeam, enemyTeam]} collapsible />
            </div>
            <RecommendationStrip
              recommendation={recommendation}
              champion={champion}
              playerName={playerName}
              canAct={canAct && !!step}
              isOurPick={isOurPick}
              busy={busy}
              updating={!!optimistic}
              enemyName={teamName(derived.enemySide)}
              stepType={step?.type ?? null}
              onLock={lockRecommendation}
              onLockEmergency={(id, role) => void commit(id, role)}
              onApplySwap={canAct ? applySwap : undefined}
              onDetails={showDetails}
            />
            {selector}
          </div>
          <div className="hidden min-h-0 xl:block" data-testid="team-red">
            <TeamColumn team={redTeam} turn={turnFor("red")} />
          </div>
        </div>
      </div>

      {/* Analysis: below the workspace on phones and tablets; a drawer beside it on desktop, so the
          drafting screen itself never scrolls. */}
      <section id="draft-details" className="space-y-3 scroll-mt-4 xl:hidden" data-testid="draft-deeper" aria-label="Analysis">
        <h2 className="text-base font-semibold">Analysis</h2>
        {analysis(false)}
      </section>
      <Drawer open={analysisOpen} onClose={() => setAnalysisOpen(false)} size="lg" title="Analysis" description="Why this recommendation, alternatives, the projected team and today's overrides." testId="analysis-drawer">
        {analysisOpen ? analysis(true) : null}
      </Drawer>
    </div>
  );
}

/** One side of champion select: picks (ours by role and player, theirs in order) and bans, with the active slot lit. */
function TeamColumn({ team, turn }: { team: BoardTeam; turn: "pick" | "ban" | null }) {
  const blue = team.side === "blue";
  const prefix = blue ? "B" : "R";
  // The slot being picked right now: our selected role, or their next empty slot.
  const nextEnemySlot = !team.ours && turn === "pick" ? team.rows.length : -1;
  return (
    <section className={cn("flex h-full min-h-0 flex-col overflow-hidden rounded-panel border bg-surface", blue ? "border-blue/40" : "border-red/40", turn && "ring-1 ring-accent/40")} data-side={team.side} data-turn={turn ?? undefined}>
      <header className={cn("border-b border-border px-3 py-2.5", blue ? "bg-gradient-to-r from-blue/15 to-transparent" : "bg-gradient-to-l from-red/15 to-transparent")}>
        <div className="flex items-center justify-between gap-2">
          <span className={cn("truncate text-sm font-bold uppercase tracking-wider", blue ? "text-blue" : "text-red")}>{team.title}</span>
          {turn ? <Badge tone="accent">{turn === "ban" ? "Banning" : "Picking"}</Badge> : <span className="text-xs uppercase tracking-wider text-fg-subtle">{team.side}</span>}
        </div>
        {team.identity ? <p className="mt-0.5 truncate text-xs text-fg-muted">Reads as {team.identity}</p> : null}
      </header>
      {/* Five ban slots always fit the column, however narrow (13rem at 1280-1399px). */}
      <div className="flex justify-between gap-1 border-b border-border px-2.5 py-2 min-[1400px]:px-3" role="group" aria-label={`${team.title} bans`} data-testid="ban-row">
        {Array.from({ length: 5 }, (_, i) => (
          <ChampionPortrait key={i} champion={team.bans[i] ?? null} size="xs" dimmed className={cn(team.bans[i] && "grayscale", "2xl:h-9 2xl:w-9")} />
        ))}
      </div>
      {/* Five slots share the column's height (champion select's look): no empty space below them. */}
      <ol className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-2">
        {Array.from({ length: 5 }, (_, i) => {
          const r = team.rows[i];
          const active = r ? r.active : i === nextEnemySlot;
          const previewEnemy = !r && active && team.preview ? team.preview : null;
          const shownChampion = r?.champion ?? previewEnemy;
          const isPreview = !!previewEnemy || !!r?.preview;
          const name = (isPreview ? null : r?.champion?.name) ?? (team.ours ? r?.label : `${prefix}${i + 1}`);
          const sub = r && !team.ours && r.champion ? (r.sub ?? r.label) : "";
          return (
            <li key={r?.key ?? i} className="flex min-h-14 flex-1">
              <button type="button" disabled={!r?.onClick} onClick={r?.onClick} className={cn("flex w-full items-center gap-2.5 rounded-lg border p-1.5 text-left transition-colors", active ? "border-highlight bg-highlight/10 shadow-[0_0_0_1px_var(--color-highlight)]" : "border-transparent bg-bg-elevated", r?.onClick && "hover:border-border-strong")} data-active={active ? "true" : undefined} data-preview={isPreview ? "true" : undefined}>
                <ChampionPortrait champion={shownChampion ?? null} size="md" className={cn(active && !shownChampion && "motion-safe:animate-pulse", isPreview && "opacity-70")} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-fg">
                    {r?.role ? <RoleIcon role={r.role} className="h-4 w-4 shrink-0 text-accent" /> : null}
                    <span className="truncate" title={name ?? undefined}>
                      {name}
                    </span>
                  </span>
                  {isPreview ? <span className="block truncate text-xs text-highlight">{shownChampion?.name} · selected</span> : null}
                  {team.ours && r ? <OurSlotLine row={isPreview ? { ...r, champion: null } : r} className="text-fg-muted" /> : sub ? <span className="block truncate text-xs text-fg-muted">{sub}</span> : null}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** The final board after the last pick: both teams side by side above the playbook. */
function FinalBoard({ blue, red }: { blue: BoardTeam; red: BoardTeam }) {
  const card = (team: BoardTeam) => {
    const isBlue = team.side === "blue";
    return (
      <div className={cn("min-w-0 space-y-2 rounded-panel border px-3 py-2.5", isBlue ? "border-blue/40 bg-gradient-to-r from-blue/10 to-surface" : "border-red/40 bg-gradient-to-r from-red/10 to-surface")} data-side={team.side}>
        <div className="flex items-center gap-2">
          <span className={cn("min-w-0 truncate text-sm font-bold uppercase tracking-wider", isBlue ? "text-blue" : "text-red")}>{team.title}</span>
          <span className="text-xs capitalize text-fg-subtle">{team.side} side</span>
          <span className="flex-1" />
          <span className="flex items-center gap-0.5" role="group" aria-label={`${team.title} bans`} title="Bans">
            {team.bans.map((b, i) => (
              <ChampionPortrait key={i} champion={b} size="xs" dimmed className="grayscale" />
            ))}
          </span>
        </div>
        <ul className="grid grid-cols-5 gap-2">
          {team.rows.map((r, i) => (
            <li key={r.key ?? i} className="flex min-w-0 flex-col items-center gap-0.5" title={`${r.champion?.name ?? "?"} · ${team.ours ? r.label : r.sub ?? ""}`}>
              <span className="relative">
                <ChampionPortrait champion={r.champion} size="md" />
                {r.role ? (
                  <span className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full border border-border bg-bg-elevated">
                    <RoleIcon role={r.role} className="h-3.5 w-3.5 text-accent" />
                  </span>
                ) : null}
              </span>
              <span className="w-full truncate text-center text-xs text-fg-muted">{r.champion?.name ?? "—"}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  };
  return (
    <div className="grid gap-2 xl:grid-cols-2" data-testid="final-board">
      {card(blue)}
      {card(red)}
    </div>
  );
}

/**
 * The recommendation at a glance: the primary option with one short reason and its confidence,
 * a few alternatives to lock in one tap, emergency picks when a pool has run dry, and a role swap
 * when one helps. Everything longer lives under Analysis.
 */
function RecommendationStrip({ recommendation, champion, playerName, canAct, isOurPick, busy, updating, enemyName, stepType, onLock, onLockEmergency, onApplySwap, onDetails }: { recommendation: RecommendationResult; champion: ChampionLookup; playerName: (id: string | null | undefined) => string; canAct: boolean; isOurPick: boolean; busy: boolean; updating: boolean; enemyName: string; stepType: "pick" | "ban" | null; onLock: (rec: PickRecommendation | BanRecommendation) => void; onLockEmergency: (championId: string, role: Role) => void; onApplySwap?: () => void; onDetails: () => void }) {
  const rec = recommendation;
  if (rec.kind === "enemy-turn") {
    return (
      <section className="@container rounded-panel border border-border bg-surface p-3" data-testid="draft-intel">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold">
            Waiting for {enemyName}&apos;s {stepType ?? "action"}
          </h2>
          <span className="text-sm text-fg-muted">Select it in the grid below.</span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-fg-subtle">Our projected team</span>
          <BestFitPortraits recommendation={rec} champion={champion} playerName={playerName} />
        </div>
      </section>
    );
  }
  const primary = rec.primary;
  const alternatives = rec.alternatives.slice(0, 3);
  const title = rec.kind === "ban" ? "Recommended ban" : rec.kind === "pair" ? "Recommended pair" : "Recommended pick";
  return (
    <section className={cn("@container relative space-y-2.5 rounded-panel border border-accent/40 bg-surface p-3", updating && "overflow-hidden")} aria-busy={updating} data-testid="draft-intel">
      {updating ? (
        <div className="absolute inset-0 z-10 grid place-items-center bg-bg/70 backdrop-blur-[1px]">
          <span className="rounded-md border border-accent/40 bg-bg-elevated px-3 py-1.5 text-sm text-fg">Updating recommendation…</span>
        </div>
      ) : null}
      {rec.roleSwap ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-accent/40 bg-accent/5 px-2.5 py-1.5 text-sm" title={rec.roleSwap.why.join(" ")}>
          <Shuffle className="h-4 w-4 shrink-0 text-accent" aria-hidden />
          <span className="font-medium">Role swap:</span>
          {rec.roleSwap.moves.map((m) => (
            <span key={m.playerId} className="inline-flex items-center gap-1 text-fg-muted">
              {m.displayName} <RoleIcon role={m.to} className="h-3.5 w-3.5 text-accent" /> {ROLE_LABELS[m.to]}
            </span>
          ))}
          <span className="flex-1" />
          {onApplySwap ? (
            <Button size="sm" variant="primary" onClick={onApplySwap} disabled={busy}>
              Apply swap
            </Button>
          ) : null}
        </div>
      ) : null}
      {rec.emergency.length > 0 ? <EmergencyStrip alerts={rec.emergency} champion={champion} busy={busy} onLock={canAct && isOurPick ? onLockEmergency : undefined} /> : null}
      <header className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {rec.decision ? (
          // One confidence signal: the decision label; why, the gap and the evidence behind it on demand.
          <span className="inline-flex items-center gap-1" data-testid="decision-confidence">
            <Badge tone={DECISION_TONE[rec.decision.level] ?? "neutral"}>{rec.decision.label}</Badge>
            <InfoTip label="About this recommendation's confidence" text={`${rec.decision.reason}${rec.decision.gap !== null ? ` Gap to the next option: ${signedPoints(rec.decision.gap)} win-rate points.` : ""} Evidence behind it: ${rec.confidence}. ${metricTooltip("evidence-confidence")}`} />
          </span>
        ) : (
          <span className="text-xs text-fg-subtle" title={metricTooltip("evidence-confidence")}>
            Evidence: {rec.confidence}
          </span>
        )}
        <span className="flex-1" />
        <button type="button" onClick={onDetails} className="text-xs font-medium text-accent hover:underline">
          Details
        </button>
      </header>
      {primary ? (
        <div className="grid gap-3 @xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <div className="min-w-0" data-testid="recommendation">
            <PrimaryOption rec={primary} champion={champion} playerName={playerName} onLock={canAct ? onLock : undefined} busy={busy} />
          </div>
          {alternatives.length > 0 ? (
            <ul className="grid min-w-0 gap-1 @md:grid-cols-3 @xl:grid-cols-1 @xl:content-start @xl:border-l @xl:border-border @xl:pl-3" data-testid="alternatives" aria-label="Alternatives">
              {alternatives.map((alt, i) => (
                <AlternativeRow key={i} rec={alt} champion={champion} playerName={playerName} onLock={canAct ? onLock : undefined} busy={busy} />
              ))}
            </ul>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-fg-muted" data-testid="recommendation">
          {rec.emergency.length > 0 ? "No pool champion is left for the open roles: use an emergency pick above or pick from the grid." : "No legal option: check the players' champion pools."}
        </p>
      )}
      {rec.holds.map((h) => (
        <p key={h.role} className="flex items-start gap-1.5 text-xs text-warn">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            <span className="font-semibold">Hold {ROLE_LABELS[h.role]}:</span> {h.reason}
          </span>
        </p>
      ))}
    </section>
  );
}

function optionMeta(rec: PickRecommendation | BanRecommendation, playerName: (id: string | null | undefined) => string): { role: Role | null; text: string } {
  if (rec.kind === "pick") return { role: rec.role, text: `${playerName(rec.playerId)} · ${ROLE_LABELS[rec.role]}` };
  // Who the ban protects is the reason line below (recommendationHeadline); this line keeps the role.
  return { role: rec.likelyRole, text: rec.likelyRole ? `Likely ${ROLE_LABELS[rec.likelyRole]}` : "Role unclear" };
}

function PrimaryOption({ rec, champion, playerName, onLock, busy }: { rec: AnyRecommendation; champion: ChampionLookup; playerName: (id: string | null | undefined) => string; onLock?: (rec: PickRecommendation | BanRecommendation) => void; busy: boolean }) {
  if (rec.kind === "pair") {
    return (
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          {rec.picks.map((p) => (
            <div key={p.championId} className="flex min-w-0 items-center gap-2">
              <ChampionPortrait champion={champion(p.championId)} size="lg" />
              <span className="min-w-0">
                <span className="block truncate text-base font-semibold">{champion(p.championId)?.name}</span>
                <span className="flex items-center gap-1 truncate text-xs text-fg-muted">
                  <RoleIcon role={p.role} className="h-3.5 w-3.5 shrink-0" /> {playerName(p.playerId)}
                </span>
                {onLock ? (
                  <Button size="sm" variant="primary" className="mt-1" onClick={() => onLock(p)} disabled={busy}>
                    <Check className="h-3.5 w-3.5" /> Lock
                  </Button>
                ) : null}
              </span>
            </div>
          ))}
        </div>
        <p className="text-sm text-fg-muted" data-testid="recommendation-reason">
          {recommendationHeadline(rec, { player: playerName, champion: (id) => champion(id)?.name ?? id })}
        </p>
      </div>
    );
  }
  const c = champion(rec.championId);
  const meta = optionMeta(rec, playerName);
  return (
    <div className="flex items-start gap-3">
      <ChampionPortrait champion={c} size="lg" className="ring-2 ring-accent/60" />
      <div className="flex min-w-0 flex-1 flex-col gap-2 @lg:flex-row @lg:items-center @xl:flex-col @xl:items-start @3xl:flex-row @3xl:items-center">
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-lg font-semibold leading-tight">{c?.name}</span>
            {rec.kind === "pick" && rec.candidate.isFlex ? <Badge tone="accent">Flex</Badge> : null}
          </div>
          <div className="flex items-center gap-1 text-xs text-fg-muted">
            {meta.role ? <RoleIcon role={meta.role} className="h-3.5 w-3.5 shrink-0" /> : null}
            <span className="truncate">{meta.text}</span>
          </div>
          <p className="text-sm text-fg" data-testid="recommendation-reason">
            {recommendationHeadline(rec, { player: playerName, champion: (id) => champion(id)?.name ?? id })}
          </p>
        </div>
        {onLock ? (
          <Button size="md" variant="primary" className="shrink-0 self-start @lg:self-center @xl:self-start @3xl:self-center" onClick={() => onLock(rec)} disabled={busy}>
            {rec.kind === "ban" ? <Ban className="h-4 w-4" /> : <Check className="h-4 w-4" />} {rec.kind === "ban" ? "Ban" : "Lock"} {c?.name}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function AlternativeRow({ rec, champion, playerName, onLock, busy }: { rec: AnyRecommendation; champion: ChampionLookup; playerName: (id: string | null | undefined) => string; onLock?: (rec: PickRecommendation | BanRecommendation) => void; busy: boolean }) {
  if (rec.kind === "pair") {
    return (
      <li className="flex min-w-0 items-center gap-2 rounded-lg px-1 py-1" title={rec.why.join(" ")}>
        {rec.picks.map((p) => (
          <ChampionPortrait key={p.championId} champion={champion(p.championId)} size="sm" />
        ))}
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{rec.picks.map((p) => champion(p.championId)?.name).join(" + ")}</span>
      </li>
    );
  }
  const c = champion(rec.championId);
  const meta = optionMeta(rec, playerName);
  return (
    <li className="flex min-w-0 items-center gap-2 rounded-lg border border-border px-1.5 py-1 hover:bg-surface-2/60 @xl:border-transparent">
      <ChampionPortrait champion={c} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{c?.name}</span>
        <span className="hidden min-w-0 items-center gap-1 text-xs text-fg-muted @xl:flex">
          {meta.role ? <RoleIcon role={meta.role} className="h-3 w-3 shrink-0" /> : null}
          <span className="min-w-0 truncate" data-testid="alternative-reason">{recommendationHeadline(rec, { player: playerName, champion: (id) => champion(id)?.name ?? id })}</span>
        </span>
      </span>
      {onLock ? (
        <Button size="sm" variant="outline" onClick={() => onLock(rec)} disabled={busy} aria-label={`${rec.kind === "ban" ? "Ban" : "Lock"} ${c?.name}`}>
          {rec.kind === "ban" ? "Ban" : "Lock"}
        </Button>
      ) : null}
    </li>
  );
}

/** Pool exhausted: a few labelled picks outside the configured pool, never added to it. */
function EmergencyStrip({ alerts, champion, busy, onLock }: { alerts: EmergencyAlert[]; champion: ChampionLookup; busy: boolean; onLock?: (championId: string, role: Role) => void }) {
  return (
    <div className="space-y-2 rounded-lg border border-bad/50 bg-bad/5 p-2.5" data-testid="emergency-picks">
      {alerts.map((a) => (
        <div key={a.role} className="space-y-1.5">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-fg">
            <RoleIcon role={a.role} className="h-4 w-4 text-bad" /> Emergency picks · {a.message}
          </p>
          {a.suggestions.length === 0 ? <p className="text-xs text-fg-muted">No playable champion is left for this role; pick from the grid.</p> : null}
          <ul className="flex flex-wrap gap-2">
            {a.suggestions.map((s) => (
              <li key={s.championId} className="flex items-center gap-2 rounded-lg border border-border bg-bg-elevated py-1 pl-1 pr-1.5" data-testid="emergency-suggestion" title={`${s.reason} ${s.familiarity ? `Experience: ${s.familiarity.label}${s.familiarity.games ? ` (${s.familiarity.games} games)` : ""}.` : "Experience unknown."}`}>
                <ChampionPortrait champion={champion(s.championId)} size="sm" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{champion(s.championId)?.name ?? s.championId}</span>
                  <span className="block text-xs font-semibold uppercase tracking-wide text-bad">Outside pool</span>
                </span>
                {onLock ? (
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => onLock(s.championId, s.role)} aria-label={`Lock ${champion(s.championId)?.name ?? s.championId} (outside pool)`}>
                    Lock
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function WhyList({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="space-y-1 text-sm text-fg-muted">
      {items.map((w, i) => (
        <li key={i} className={cn("flex gap-1.5", /^Warning/.test(w) && "text-warn")}>
          <span className="text-accent">•</span>
          <span>{w}</span>
        </li>
      ))}
    </ul>
  );
}

/** The full reasoning behind one option (Analysis → Why this recommendation). */
function RecommendationDetail({ rec, champion, playerName, primary = false, onWhyNot }: { rec: AnyRecommendation; champion: ChampionLookup; playerName: (id: string | null | undefined) => string; primary?: boolean; onWhyNot?: (championId: string, role: Role) => void }) {
  if (rec.kind === "pair") {
    return (
      <div className="space-y-2">
        <div className="text-sm font-semibold">{primary ? "Recommended pair: " : ""}{rec.picks.map((p) => `${champion(p.championId)?.name} (${playerName(p.playerId)})`).join(" + ")}</div>
        <WhyList items={rec.why} />
        {rec.picks.map((p) => (
          <div key={p.championId} className="space-y-1">
            <div className="text-sm font-medium text-fg-muted">{champion(p.championId)?.name}</div>
            <WhyList items={p.why} />
            <WhyThisPick breakdown={p.breakdown} />
          </div>
        ))}
      </div>
    );
  }
  const c = champion(rec.championId);
  const meta = optionMeta(rec, playerName);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <ChampionPortrait champion={c} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">
            {c?.name} {primary ? <span className="font-normal text-fg-subtle">· recommended</span> : null}
          </div>
          <div className="truncate text-xs text-fg-muted">{meta.text}</div>
        </div>
        {rec.kind === "pick" && onWhyNot ? (
          <Button size="sm" variant="ghost" onClick={() => onWhyNot(rec.championId, rec.role)} title="Compare with the recommendation">
            Why not?
          </Button>
        ) : null}
      </div>
      <WhyList items={rec.why} />
      {rec.kind === "pick" && rec.tradeoff ? <p className="text-xs text-fg-subtle">{rec.tradeoff}</p> : null}
      {rec.kind === "pick" ? <WhyThisPick breakdown={rec.breakdown} defaultOpen={primary && !!rec.breakdown.proficiencyDecisive} showDecisive={false} /> : null}
    </div>
  );
}

function BestFitPortraits({ recommendation, champion, playerName }: { recommendation: RecommendationResult; champion: ChampionLookup; playerName: (id: string | null | undefined) => string }) {
  const sorted = [...recommendation.bestFit].sort((a, b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role));
  return (
    <span className="flex flex-wrap gap-1.5">
      {sorted.map((m) => (
        <span key={m.role} className={cn("flex items-center gap-1 rounded-md border px-1 py-0.5", m.locked ? "border-accent/50" : "border-dashed border-border")} title={`${champion(m.championId)?.name} · ${playerName(m.playerId)} · ${ROLE_LABELS[m.role]}${m.locked ? " (locked)" : " (projected)"}`}>
          <ChampionPortrait champion={champion(m.championId)} size="xs" />
          <RoleIcon role={m.role} className="h-3.5 w-3.5 text-fg-subtle" />
        </span>
      ))}
    </span>
  );
}

function BestFit({ recommendation, champion, playerName }: { recommendation: RecommendationResult; champion: ChampionLookup; playerName: (id: string | null | undefined) => string }) {
  const ev = recommendation.bestFitEvaluation;
  const sorted = [...recommendation.bestFit].sort((a, b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {sorted.map((m) => (
          <div key={m.role} className={cn("flex items-center gap-1.5 rounded-md border px-1.5 py-1", m.locked ? "border-accent/50" : "border-dashed border-border")} title={`${playerName(m.playerId)} · ${ROLE_LABELS[m.role]}${m.locked ? " (locked)" : " (projected)"}`}>
            <ChampionPortrait champion={champion(m.championId)} size="sm" />
            <RoleIcon role={m.role} className="h-3.5 w-3.5 text-fg-subtle" />
          </div>
        ))}
        {ROLES.filter((r) => !sorted.some((m) => m.role === r)).map((r) => (
          <div key={r} className="flex items-center gap-1.5 rounded-md border border-dashed border-warn/50 px-1.5 py-1 text-xs text-warn" title="No eligible champion left for this role">
            <RoleIcon role={r} className="h-3.5 w-3.5" /> no option
          </div>
        ))}
      </div>
      {ev ? (
        <div className="flex flex-wrap gap-1.5 text-xs">
          {ev.identity ? <Badge tone="accent">{ev.identity}</Badge> : null}
          <Badge tone="neutral" title={metricTooltip("team-fit")}>Team fit {signedPoints(ev.synergyPart)} pts</Badge>
          <Badge tone="neutral" title={metricTooltip("enemy-interaction")}>Into their draft {signedPoints(ev.enemyPart)} pts</Badge>
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
          <ul className="space-y-0.5 text-sm text-fg-muted">
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
