"use client";

import * as React from "react";
import { ArrowLeft } from "lucide-react";
import { ROLE_LABELS, type Role } from "@/domain/roles";
import { getMatchDetailAction } from "@/server/actions/match-history";
import type { DetailParticipant, MatchDetailResult } from "@/server/players/match-history";
import { ChampionPortrait, type PortraitChampion } from "@/components/champion-portrait";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";
import { BELOW_CONTROLS_ON_PHONES, CLEAR_OF_CONTROLS, DetailModal } from "@/components/ui/detail-modal";
import { MatchDetailCacheContext } from "./match-detail-cache";
import { fmtDuration } from "./match-format";
import { IconImg, ItemRow } from "./icon-img";
import { MatchBreakdown } from "./match-breakdown";

/**
 * One match in the site's shared detail window (wide, centred over the page; the whole screen on
 * phones), from Team Matches, Matchups and Encounters, and from a link to a game that is not on
 * the Match History page shown (Match History opens its games under their cards). The list behind
 * stays where it was; Escape, the close button or Back return to it, and focus goes back to the
 * game that opened it. The record loads when opened (and is fetched once from Riot if it was not
 * collected yet); the body is the match's breakdown (MatchBreakdown), the same as under a card.
 */
/**
 * `back` is for a match opened from another window (a champion's matchup): that window gives way to
 * this one, and Back returns to it; Close and Escape close both.
 */
export function MatchDetailModal({ playerId, matchId, championsById, onClose, back, encounterLinks = false }: { playerId: string; matchId: string; championsById: Record<string, PortraitChampion>; onClose: () => void; back?: { label: string; onBack: () => void }; /** Opened over Match History itself (a phone): the scoreboard's marks lead to its Encounters (see MatchBreakdown). */ encounterLinks?: boolean }) {
  const cache = React.useContext(MatchDetailCacheContext);
  const [loaded, setLoaded] = React.useState<{ matchId: string; result: MatchDetailResult } | null>(null);
  // The record starts loading as the window opens, but is shown only once the window has finished
  // opening (onSettled): its first frames hold the shell and a light skeleton, and rendering the
  // scoreboard never lands in the middle of the motion.
  const [settled, setSettled] = React.useState(false);
  React.useEffect(() => {
    let live = true;
    void (cache ? cache.load(playerId, matchId) : getMatchDetailAction(playerId, matchId)).then((r) => {
      if (live) React.startTransition(() => setLoaded({ matchId, result: r }));
    });
    return () => {
      live = false;
    };
  }, [cache, playerId, matchId]);
  const champ = (id: string | null): PortraitChampion => (id ? (championsById[id] ?? { id, name: id, portraitUrl: "" }) : { id: "unknown", name: "Unknown", portraitUrl: "" });
  const result = settled && loaded?.matchId === matchId ? loaded.result : null;
  const view = result?.status === "ok" ? result.view : null;
  // The match at a glance: the result large, then the champion, the game's context as labelled
  // chips, and the loadout; the close button (top right, as on every panel) never crowds it.
  const header = view ? (
    <div className={cn("flex flex-col gap-4 pb-4 pl-4 pt-4 sm:pl-6 sm:pt-5 lg:flex-row lg:items-end lg:justify-between", back ? BELOW_CONTROLS_ON_PHONES : CLEAR_OF_CONTROLS)}>
      <div className="flex min-w-0 items-center gap-4">
        <ChampionPortrait champion={champ(view.championId)} size="lg" className={cn("ring-2", view.win ? "ring-blue/60" : "ring-red/60")} />
        <div className="min-w-0 space-y-1.5">
          <h2 id="match-detail-title" className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <span className={cn("text-2xl font-bold tracking-tight sm:text-3xl", view.win ? "text-blue" : "text-red")} data-testid="match-result">
              {view.win ? "Victory" : "Defeat"}
            </span>
            <span className="truncate text-lg font-semibold text-fg">{champ(view.championId).name}</span>
          </h2>
          <ul className="flex flex-wrap gap-1.5 text-xs text-fg-muted" aria-label="Game">
            <li className="rounded-full border border-border bg-bg/50 px-2 py-0.5 text-fg">{view.queue}</li>
            {view.role && view.role !== "UNKNOWN" ? <li className="rounded-full border border-border bg-bg/50 px-2 py-0.5">{ROLE_LABELS[view.role as Role] ?? view.role}</li> : null}
            <li className="rounded-full border border-border bg-bg/50 px-2 py-0.5 tabular-nums">{fmtDuration(view.durationS)}</li>
            <li className="rounded-full border border-border bg-bg/50 px-2 py-0.5">{formatDate(new Date(view.playedAt))}</li>
            {view.patch ? <li className="rounded-full border border-border bg-bg/50 px-2 py-0.5">Patch {view.patch}</li> : null}
          </ul>
        </div>
      </div>
      <Loadout player={view.player} className="shrink-0" />
    </div>
  ) : (
    <h2 id="match-detail-title" className={cn("py-4 pl-4 text-lg font-semibold text-fg sm:pl-6", back ? BELOW_CONTROLS_ON_PHONES : CLEAR_OF_CONTROLS)}>
      Match details
    </h2>
  );
  return (
    <DetailModal
      open
      onClose={onClose}
      size="wide"
      title="Match details"
      titleId="match-detail-title"
      header={header}
      headerClassName={view ? (view.win ? "bg-gradient-to-r from-blue/15 via-blue/5 to-transparent" : "bg-gradient-to-r from-red/15 via-red/5 to-transparent") : "bg-surface"}
      testId="match-detail"
      headerExtra={
        back ? (
          <button type="button" onClick={back.onBack} className="inline-flex h-9 max-w-[min(16rem,50vw)] items-center gap-1.5 rounded-md border border-border-strong bg-bg/60 px-2.5 text-xs font-medium text-fg-muted transition-colors hover:text-fg focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-11" data-testid="match-detail-back">
            <ArrowLeft className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="truncate">
              <span className="sr-only">Back to </span>
              {back.label}
            </span>
          </button>
        ) : undefined
      }
      headerTestId="match-detail-header"
      closeTestId="match-detail-close"
      bodyTestId="match-detail-body"
      onSettled={() => setSettled(true)}
    >
      {!result ? (
        <DetailSkeleton />
      ) : (
        <div className="motion-safe:fade-in">{result.status !== "ok" ? <p className="rounded-panel border border-dashed border-border p-4 text-sm text-fg-muted" data-testid="match-detail-message">{result.message}</p> : <MatchBreakdown key={view!.matchId} playerId={playerId} view={view!} champ={champ} variant="window" encounterLinks={encounterLinks} />}</div>
      )}
    </DetailModal>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading the match">
      <div className="grid grid-cols-4 gap-2">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-lg bg-surface-2" />
        ))}
      </div>
      {Array.from({ length: 2 }, (_, i) => (
        <div key={i} className="h-64 animate-pulse rounded-panel bg-surface-2" />
      ))}
    </div>
  );
}

/** Summoner spells, runes and final items (in the window header on wide screens). */
function Loadout({ player: p, className }: { player: DetailParticipant; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-3", className)}>
      <span className="flex gap-0.5">{p.spells?.map((s, i) => <IconImg key={i} icon={s} size={26} />)}</span>
      <span className="flex items-center gap-0.5">
        <IconImg icon={p.keystone} size={28} rounded="rounded-full" />
        <IconImg icon={p.secondary} size={20} rounded="rounded-full" />
      </span>
      <ItemRow items={p.items} size={28} />
    </div>
  );
}
