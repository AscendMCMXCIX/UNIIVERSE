"use client";

import * as React from "react";
import { getMatchGroupsAction, getMatchMeetingsAction, getMatchRanksAction, getMatchTimelineAction, type MatchMeetingsResult } from "@/server/actions/match-history";
import type { MatchGroupsResult } from "@/server/matches/possible-groups";
import type { MatchTimelineResult } from "@/server/accounts/match-timeline";
import type { DetailParticipant, MatchDetailView, MatchRanksResult } from "@/server/players/match-history";
import type { PortraitChampion } from "@/components/champion-portrait";
import { BookmarkButton } from "@/components/matches/bookmark-button";
import { formatCount, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { MatchDetailCacheContext, type MeetingScope } from "./match-detail-cache";
import { OpggHistoryLink } from "./opgg-history-link";
import { GroupsNote, RanksNote, TeamTable } from "./scoreboard";
import { AnalysisPanel } from "./match-analysis-panel";
import { TimelinePanel } from "./match-timeline-panel";
import { BuildPanel } from "./build-panel";

/*
  One match's breakdown, the same wherever a match opens: under its card in Match History (inline)
  and in the match window from Team Matches, Matchups and Encounters. One row of sections, no
  deeper navigation:
  - Scoreboard: both teams with ranks, members and possible groups (stored record; ranks missing or
    stale are checked with Riot once it is open, possible groups load after it). Under a card, the
    players met in other games of the list's season and game mode are marked too (after it as well),
    each opening their Encounters window.
  - Analysis: the player's shares, place and lane, their usual, objectives (stored record; the
    lane's 10:00 and 15:00 from the match timeline).
  - Timeline: the gold difference over the game (match timeline).
  - Build: build order, skill order and runes (match timeline).
  The match timeline is requested the first time a section that reads it opens (one request, kept
  per list; Riot is asked at most once per match, ever), never for every game in the list.
  The window adds the player's figures on top (a card shows them in Match History).
*/

type Tab = "scoreboard" | "analysis" | "timeline" | "build";

/** Match History's way from a game's scoreboard to Encounters: the list's scope, and a player's window. */
export interface EncounterLink {
  scope: MeetingScope;
  open(target: { key: string; name: string }): void;
}

/** Given by Match History's list; a breakdown under a card marks the players met in its other games. */
export const EncounterLinkContext = React.createContext<EncounterLink | null>(null);

const TABS: Array<[Tab, string]> = [
  ["scoreboard", "Scoreboard"],
  ["analysis", "Analysis"],
  ["timeline", "Timeline"],
  ["build", "Build"],
];

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);
const int = (v: number | null) => (v === null ? "—" : formatCount(v));

function Figure({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-surface px-2.5 py-1.5">
      <div className="truncate text-2xs text-fg-subtle">{label}</div>
      <div className="text-base font-semibold tabular-nums leading-tight text-fg">{value}</div>
      {sub ? <div className="truncate text-2xs tabular-nums text-fg-muted">{sub}</div> : null}
    </div>
  );
}

/** The player's figures at the top of the match window. */
function Figures({ p }: { p: DetailParticipant }) {
  return (
    <div className="grid grid-cols-3 gap-1.5 @min-[40rem]/bd:grid-cols-6" data-testid="match-detail-figures">
      <Figure label="KDA" value={`${p.kills}/${p.deaths}/${p.assists}`} sub={p.deaths === 0 ? "Perfect" : `${p.kda.toFixed(2)} ratio`} />
      <Figure label="Kill participation" value={pct(p.killParticipation)} />
      <Figure label="Damage to champions" value={int(p.damage)} sub={p.damageShare !== null ? `${pct(p.damageShare)} of the team` : undefined} />
      <Figure label="Gold" value={int(p.gold)} sub={p.goldPerMin !== null ? `${formatCount(p.goldPerMin)} per min` : undefined} />
      <Figure label="CS" value={int(p.cs)} sub={`${p.csPerMin === null ? "—" : p.csPerMin.toFixed(1)} per min`} />
      <Figure label="Vision score" value={int(p.vision)} sub={p.wardsPlaced !== null ? `${formatCount(p.wardsPlaced)} wards placed` : undefined} />
    </div>
  );
}

export function MatchBreakdown({ playerId, view, champ, variant }: { playerId: string; view: MatchDetailView; champ: (id: string | null) => PortraitChampion; variant: "inline" | "window" }) {
  const cache = React.useContext(MatchDetailCacheContext);
  const p = view.player;
  const uid = React.useId();
  const [tab, setTab] = React.useState<Tab>("scoreboard");
  // Possible groups load after the scoreboard is on screen (a second, separate request), so they
  // never delay the breakdown itself.
  const [groups, setGroups] = React.useState<MatchGroupsResult | null>(null);
  React.useEffect(() => {
    let live = true;
    void (cache ? cache.groups(playerId, view.matchId) : getMatchGroupsAction(playerId, view.matchId))
      .catch((): MatchGroupsResult => ({ status: "unavailable", message: "" }))
      .then((r) => {
        if (live) React.startTransition(() => setGroups(r));
      });
    return () => {
      live = false;
    };
  }, [cache, playerId, view.matchId]);
  // Ranks missing or older than three days are checked with Riot once the breakdown is open (only
  // when the server says some need it); the stored ones show meanwhile.
  const [ranks, setRanks] = React.useState<MatchRanksResult | null>(null);
  React.useEffect(() => {
    if (!view.rankCheck) return;
    let live = true;
    void (cache ? cache.ranks(playerId, view.matchId) : getMatchRanksAction(playerId, view.matchId))
      .catch((): MatchRanksResult => ({ status: "not-found", message: "" }))
      .then((r) => {
        if (live) React.startTransition(() => setRanks(r));
      });
    return () => {
      live = false;
    };
  }, [cache, playerId, view.matchId, view.rankCheck]);
  const checked = React.useMemo(() => new Map(ranks?.status === "ok" ? ranks.ranks.map((r) => [r.slot, r.rank]) : []), [ranks]);
  // The players met in other games of the list's scope, under a card only (the window has no way to
  // another window); after the scoreboard, like the possible groups.
  const link = React.useContext(EncounterLinkContext);
  const meetScope = variant === "inline" ? (link?.scope ?? null) : null;
  const [meetings, setMeetings] = React.useState<MatchMeetingsResult | null>(null);
  React.useEffect(() => {
    if (!meetScope) return;
    let live = true;
    void (cache ? cache.meetings(playerId, view.matchId, meetScope) : getMatchMeetingsAction(playerId, view.matchId, meetScope))
      .catch((): MatchMeetingsResult => ({ status: "not-found", message: "" }))
      .then((r) => {
        if (live) React.startTransition(() => setMeetings(r));
      });
    return () => {
      live = false;
    };
  }, [cache, playerId, view.matchId, meetScope]);
  const met = React.useMemo(() => new Map(meetings?.status === "ok" ? meetings.players.map((m) => [m.slot, m]) : []), [meetings]);
  const onMeet = link && meetScope ? (x: DetailParticipant, key: string) => link.open({ key, name: x.name ?? "Player" }) : null;
  const rankOf = React.useCallback((x: DetailParticipant) => checked.get(x.slot) ?? x.rank, [checked]);
  const checking = view.rankCheck && !ranks;
  // The match timeline: requested when a section that reads it first opens, then kept.
  const [wantTimeline, setWantTimeline] = React.useState(false);
  const [timeline, setTimeline] = React.useState<MatchTimelineResult | null>(null);
  React.useEffect(() => {
    if (!wantTimeline) return;
    let live = true;
    void (cache ? cache.timeline(playerId, view.matchId) : getMatchTimelineAction(playerId, view.matchId))
      .catch((): MatchTimelineResult => ({ status: "error", message: "The timeline could not be loaded just now. Open the game again in a moment." }))
      .then((r) => {
        if (live) React.startTransition(() => setTimeline(r));
      });
    return () => {
      live = false;
    };
  }, [cache, playerId, view.matchId, wantTimeline]);
  const choose = (next: Tab) => {
    setTab(next);
    // The Analysis section reads the timeline only for the lane (10:00 and 15:00).
    if (next === "timeline" || next === "build" || (next === "analysis" && view.comparison.opponent)) setWantTimeline(true);
  };
  const tabId = (key: Tab) => `${uid}-tab-${key}`;
  const panelId = (key: Tab) => `${uid}-panel-${key}`;
  const actions = view.share.eligible || p.opgg;
  return (
    <div className="@container/bd space-y-3" data-testid="match-breakdown" data-variant={variant} data-met={meetings ? (meetings.status === "ok" ? meetings.players.length : 0) : undefined}>
      {variant === "window" ? (
        <section aria-label="Your performance" className="space-y-2">
          <Figures p={p} />
        </section>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b border-border">
        {/* Four sections share a phone's width (no hidden tab), and take their own width from sm up. */}
        <div role="tablist" aria-label="Match details" className="-mb-px flex w-full min-w-0 gap-0.5 sm:w-auto sm:gap-1">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              id={tabId(key)}
              aria-selected={tab === key}
              aria-controls={panelId(key)}
              onClick={() => choose(key)}
              onKeyDown={(e) => {
                if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "Home" && e.key !== "End") return;
                e.preventDefault();
                const i = TABS.findIndex(([k]) => k === tab);
                const at = e.key === "Home" ? 0 : e.key === "End" ? TABS.length - 1 : (i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length;
                const next = TABS[at]![0];
                choose(next);
                document.getElementById(tabId(next))?.focus();
              }}
              tabIndex={tab === key ? 0 : -1}
              className={cn("h-10 min-w-0 flex-1 border-b-2 px-1 text-sm font-medium transition-colors pointer-coarse:h-11 sm:flex-none sm:px-3 md:h-9", tab === key ? "border-accent text-fg" : "border-transparent text-fg-muted hover:text-fg")}
              data-testid={`match-tab-${key}`}
            >
              {label}
            </button>
          ))}
        </div>
        {actions || variant === "inline" ? (
          <div className="flex flex-wrap items-center gap-2 pb-1.5">
            {variant === "inline" ? (
              <span className="text-2xs tabular-nums text-fg-subtle" data-testid="match-breakdown-when">
                {formatDateTime(new Date(view.playedAt))}
                {view.patch ? ` · Patch ${view.patch}` : ""}
              </span>
            ) : null}
            {view.share.eligible ? <BookmarkButton matchId={view.matchId} bookmarked={view.share.shared} share /> : null}
            {p.opgg ? <OpggHistoryLink href={p.opgg} account={p.name?.split("#")[0]?.trim() || null} /> : null}
          </div>
        ) : null}
      </div>
      <div id={panelId(tab)} role="tabpanel" aria-labelledby={tabId(tab)} className="min-w-0" data-testid={`match-panel-${tab}`}>
        {tab === "scoreboard" ? (
          <div className="space-y-3">
            {view.teams.map((t) => (
              <TeamTable key={t.teamId} team={t} champ={champ} maxDamage={view.maxDamage} groups={groups?.status === "ok" ? (groups.teams.find((g) => g.teamId === t.teamId) ?? null) : null} laneSlot={view.comparison.opponent?.slot ?? null} rankOf={rankOf} queueId={view.queueId} checking={checking} met={met} onMeet={onMeet} />
            ))}
            <RanksNote ranks={view.teams.flatMap((t) => t.participants.filter((x) => !x.removed).map(rankOf))} queueId={view.queueId} checking={checking} result={ranks} />
            <GroupsNote result={groups} teams={view.teams} />
          </div>
        ) : tab === "analysis" ? (
          <AnalysisPanel view={view} champ={champ} timeline={view.comparison.opponent ? timeline : null} />
        ) : tab === "timeline" ? (
          <TimelinePanel result={timeline} />
        ) : (
          <BuildPanel result={timeline} runePage={p.runePage} player={p} />
        )}
      </div>
    </div>
  );
}
