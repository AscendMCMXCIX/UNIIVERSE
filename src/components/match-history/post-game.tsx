"use client";

import * as React from "react";
import { getMatchGroupsAction, getMatchMeetingsAction, getMatchRanksAction, getMatchTimelineAction, type MatchMeetingsResult } from "@/server/actions/match-history";
import type { MatchGroupsResult } from "@/server/matches/possible-groups";
import type { MatchTimelineResult, TimelinePlayerView } from "@/server/accounts/match-timeline";
import type { DetailParticipant, Icon, MatchDetailView, MatchRanksResult } from "@/server/players/match-history";
import { ChampionPortrait, type PortraitChampion } from "@/components/champion-portrait";
import { BookmarkButton } from "@/components/matches/bookmark-button";
import { ArrowUp, Undo2 } from "lucide-react";
import { formatCount, formatDateTime, formatKilo, formatNumber, formatOrdinal } from "@/lib/format";
import { laneOf } from "@/domain/match-analysis";
import { ParticipantPanels, type PanelKey } from "./participant-panels";
import { PerformancePanel, PhoneFold, ScoreWhy } from "./performance-panel";
import { usePhone } from "@/components/ui/use-phone";
import { gameScoresOf } from "./performance-inputs";
import { cn } from "@/lib/cn";
import { MatchDetailCacheContext, type MeetingScope } from "./match-detail-cache";
import { OpggHistoryLink } from "./opgg-history-link";
import { GroupsNote, RanksNote, TeamTable } from "./scoreboard";
import { IconImg } from "./icon-img";
import { publicPatchName } from "@/domain/patch";

/*
  One game after it was played, in one view, the same wherever a game opens: under its card in
  Match History and Team → Matches, and in the match window (a phone's whole screen, Matchups,
  Encounters, a link to a game not on the page). Read top down:
  - The player inspected: the profile's player as the game opens, or any of the ten chosen in the
    scoreboard (a click, a tap, Enter; ↑ and ↓ move between its rows). Their name, champion, role
    and performance score; the loadout as the client draws it (the portrait and level; spells and
    runes two by two; the six items two rows of three with the trinket beside the first row); six
    figure tiles and one line of the figures that serve supports and tanks; Build Path | Skill
    Order | Runes, three segmented headings, one shown at a time; and the lane by role (against
    their lane opponent at 10:00, 15:00 and the end).
  - "Scoreboard": both teams, the player's first, in compact rows (TeamTable compact) with each
    player's performance score and MVP and ACE, the ranks note and the possible groups under them,
    and the performance panel: the inspected player's score, why, and the score through the game,
    with a second player to compare.
  The two columns sit side by side from a 60rem view (desktop) and stack below it (tablets, the
  sidebar open at 1280, phones). The timeline is asked for once as the game opens (stored, about
  10–20 KB, every player's in it; Riot is asked at most once per game, ever): the lane's 10:00 and
  15:00, the build path, the skill order and the score's lane and timeline read it. Inspecting
  another player reads nothing more: the record and the timeline already hold all ten, and the
  choice is not written to the address (Back still closes the game). The written notes and the
  gold curve stay removed (23 Nov 2026, docs/MATCH_NOTES.md); Build Path and Skill Order came back
  as segmented headings at the owner's request (Release 16).
*/
/** Match History's way from a game's scoreboard to Encounters: the list's scope, and the address of a player's games. */
export interface EncounterLink {
  scope: MeetingScope;
  href(key: string): string;
}

/** Given by Match History's list; a game opened over it marks the players met in its other games. */
export const EncounterLinkContext = React.createContext<EncounterLink | null>(null);

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);
const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : "±"}${formatCount(Math.abs(Math.round(v)))}`;

function useResult<T>(run: (() => Promise<T>) | null, fallback: T, deps: React.DependencyList): T | null {
  const [value, setValue] = React.useState<T | null>(null);
  React.useEffect(() => {
    if (!run) return;
    let live = true;
    void run()
      .catch(() => fallback)
      .then((r) => {
        if (live) React.startTransition(() => setValue(r));
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
}

/**
 * An icon of the loadout that names itself: on hover and keyboard focus (desktop) and on a tap
 * (touch), its name shows in the loadout's caption line, which always sits inside the screen.
 */
function Named({ icon, size, rounded, onName, className }: { icon: Icon | null; size: number; rounded?: string; onName: (name: string | null) => void; className?: string }) {
  if (!icon) return <IconImg icon={null} size={size} rounded={rounded} className={cn("bg-black/35 ring-1 ring-inset ring-border/70", className)} />;
  return (
    <button
      type="button"
      aria-label={icon.name}
      className={cn("shrink-0 rounded focus-visible:outline-2 focus-visible:outline-accent", rounded)}
      onMouseEnter={() => onName(icon.name)}
      onMouseLeave={() => onName(null)}
      onFocus={() => onName(icon.name)}
      onBlur={() => onName(null)}
      onClick={() => onName(icon.name)}
      data-testid="loadout-icon"
    >
      <IconImg icon={icon} size={size} rounded={rounded} className={cn("ring-1 ring-inset ring-border/70", className)} />
    </button>
  );
}

/** The loadout, as the client's scoreboard and HUD draw it (the rune page is under the Runes heading), and the line an icon names itself in. */
function Loadout({ p, champ, small }: { p: DetailParticipant; champ: PortraitChampion; small: boolean }) {
  const [name, setName] = React.useState<string | null>(null);
  const icon = small ? 24 : 30;
  const item = small ? 32 : 40;
  const two = p.spells?.length ? p.spells.slice(0, 2) : [null, null];
  return (
    <div className="space-y-1" data-testid="post-game-loadout">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="relative shrink-0">
          <ChampionPortrait champion={champ} size="lg" className={small ? "h-14 w-14" : "h-18 w-18"} />
          {p.champLevel !== null ? (
            <span className="absolute -bottom-1 -right-1 rounded bg-bg px-1 text-xs font-semibold tabular-nums leading-4 text-fg" data-testid="champion-level">
              <span className="sr-only">Level </span>
              {p.champLevel}
            </span>
          ) : null}
        </span>
        <span className="grid grid-flow-col grid-rows-2 gap-1">
          {two.map((s, i) => (
            <Named key={`s${i}`} icon={s} size={icon} onName={setName} />
          ))}
          <Named icon={p.keystone} size={icon} rounded="rounded-full" onName={setName} />
          <Named icon={p.secondary} size={icon} rounded="rounded-full" onName={setName} className="p-0.5" />
        </span>
        {/* The inventory: two rows of three with the trinket beside the first, in inset slots; an empty slot is a quiet tile (a post-game inventory with empty slots is truthful). */}
        <span className="grid grid-cols-4 gap-0.5 rounded-lg bg-black/25 p-0.5" role="group" aria-label="Items" data-testid="post-game-items">
          {p.items
            ? [0, 1, 2, 6, 3, 4, 5].map((i) => <Named key={i} icon={p.items![i] ?? null} size={item} rounded={i === 6 ? "rounded-full" : "rounded"} onName={setName} />)
            : <span className="col-span-4 px-1 text-xs text-fg-subtle">Items not recorded</span>}
        </span>
        <span className="min-h-4 min-w-24 flex-1 self-end truncate text-right text-xs leading-4 text-fg-muted" aria-hidden data-testid="loadout-name">
          {name ?? ""}
        </span>
      </div>
    </div>
  );
}

function Tile({ label, value, sub, testId }: { label: string; value: string; sub: string | null; testId: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-surface px-2 py-1" data-testid={testId}>
      <div className="truncate text-2xs font-medium uppercase tracking-label text-fg-subtle">{label}</div>
      <div className="text-base font-semibold leading-tight tabular-nums text-fg">{value}</div>
      <div className="truncate text-xs tabular-nums text-fg-muted">{sub ?? " "}</div>
    </div>
  );
}

/** Six tiles, each of the player's figures once in the whole view. */
function Figures({ p, teamKills }: { p: DetailParticipant; teamKills: number }) {
  return (
    // Six across only while the view is one column and at least 37rem wide (each caption whole, "18% of
    // team" included); from 60rem the figures sit in the 33rem left column, where six were cut: 3×2 there, as on a phone.
    <div className="grid grid-cols-3 gap-1.5 @min-[37rem]/pg:@max-[60rem]/pg:grid-cols-6" data-testid="post-game-figures">
      <Tile label="K/D/A" value={`${p.kills} / ${p.deaths} / ${p.assists}`} sub={p.deaths === 0 ? "Perfect KDA" : `${p.kda.toFixed(2)} KDA`} testId="figure-kda" />
      <Tile label="CS" value={p.cs === null ? "—" : formatCount(p.cs)} sub={p.csPerMin === null ? null : `${p.csPerMin.toFixed(1)} / min`} testId="figure-cs" />
      <Tile label="Gold" value={p.gold === null ? "—" : formatKilo(p.gold)} sub={p.goldPerMin === null ? null : `${formatCount(Math.round(p.goldPerMin))} / min`} testId="figure-gold" />
      <Tile label="Damage" value={p.damage === null ? "—" : formatKilo(p.damage)} sub={p.damageShare === null ? null : `${pct(p.damageShare)} of team`} testId="figure-damage" />
      <Tile label="Vision" value={p.vision === null ? "—" : formatCount(p.vision)} sub={p.wardsPlaced === null ? null : `${formatCount(p.wardsPlaced)} wards`} testId="figure-vision" />
      <Tile label="KP" value={pct(p.killParticipation)} sub={teamKills > 0 ? `of ${formatCount(teamKills)} kills` : null} testId="figure-kp" />
    </div>
  );
}

/** One line of the figures the tiles leave out, those that serve supports, tanks and junglers, each only where the record has it. */
function MoreFigures({ p }: { p: DetailParticipant }) {
  const st = p.stats;
  const parts: Array<[string, string]> = [];
  if (p.damageTaken !== null) parts.push(["taken", `${formatKilo(p.damageTaken)} damage taken`]);
  if (typeof st?.damageMitigated === "number") parts.push(["mitigated", `${formatKilo(st.damageMitigated)} mitigated`]);
  if (typeof st?.ccSeconds === "number") parts.push(["cc", `${formatCount(st.ccSeconds)} s crowd control`]);
  const protect = (st?.teamHealing ?? 0) + (st?.teamShielding ?? 0);
  if (typeof st?.teamHealing === "number" || typeof st?.teamShielding === "number") parts.push(["protect", `${formatKilo(protect)} healed and shielded`]);
  if (typeof st?.objectiveDamage === "number") parts.push(["objectives", `${formatKilo(st.objectiveDamage)} objective damage`]);
  if (typeof st?.turretTakedowns === "number") parts.push(["turrets", `${formatCount(st.turretTakedowns)} ${st.turretTakedowns === 1 ? "turret" : "turrets"}`]);
  if (typeof st?.wardsKilled === "number") parts.push(["wardsKilled", `${formatCount(st.wardsKilled)} ${st.wardsKilled === 1 ? "ward" : "wards"} cleared`]);
  if (typeof st?.controlWardsBought === "number") parts.push(["control", `${formatCount(st.controlWardsBought)} control ${st.controlWardsBought === 1 ? "ward" : "wards"}`]);
  if (!parts.length) return null;
  return (
    <p className="text-xs leading-5 text-fg-muted" data-testid="post-game-more">
      {parts.map(([k, t], i) => (
        <React.Fragment key={k}>
          {i ? <span aria-hidden> · </span> : null}
          <span className="whitespace-nowrap tabular-nums">{t}</span>
          {i < parts.length - 1 ? <span className="sr-only">,</span> : null}
        </React.Fragment>
      ))}
    </p>
  );
}

/**
 * The lane by role: the player against the lane opponent at 10:00, 15:00 and the end (signed, plain),
 * and the bot lane's two against two. A tile like the figures above it. The 10:00 and 15:00 columns
 * show while the timeline loads and once it gives a figure; a game without them shows the end
 * alone, and one quiet line says why (`state`: the timeline's answer, "loading" until it comes).
 */
function Lane({ view, champ, me, entry, state }: { view: MatchDetailView; champ: (id: string | null) => PortraitChampion; /** The player inspected. */ me: DetailParticipant; /** Their timeline, every player's in the one answer. */ entry: TimelinePlayerView | null; state: "loading" | "ok" | "missing" }) {
  const opp = me.laneOpponentSlot;
  if (opp === null)
    return (
      <p className="rounded-lg bg-surface px-3 py-2 text-xs text-fg-muted" data-testid="post-game-lane" data-state="unclear">
        Lane opponent not clear in this game
      </p>
    );
  const them = view.teams.flatMap((t) => t.participants).find((x) => x.slot === opp) ?? null;
  const c = champ(them?.championId ?? null);
  // The profile's own role is the ledger's; anyone else's is their recorded position.
  const support = me.isPlayer ? view.role === "SUPPORT" : laneOf(me.position) === "UTILITY";
  const at = (m: number) => entry?.lane?.moments.find((x) => x.minute === m);
  const cell = (m: number, key: "cs" | "gold" | "xp") => {
    const x = at(m);
    return x?.you && x.opponent ? signed(x.you[key] - x.opponent[key]) : "—";
  };
  const end = (a: number | null | undefined, b: number | null | undefined) => (typeof a === "number" && typeof b === "number" ? signed(a - b) : "—");
  const rows: Array<[string, string, string, string]> = [
    ...(support ? [] : [["CS", cell(10, "cs"), cell(15, "cs"), end(me.cs, them?.cs)] as [string, string, string, string]]),
    ["Gold", cell(10, "gold"), cell(15, "gold"), end(me.gold, them?.gold)],
    support ? ["XP · vision", cell(10, "xp"), cell(15, "xp"), end(me.vision, them?.vision)] : ["XP · level", cell(10, "xp"), cell(15, "xp"), end(me.champLevel, them?.champLevel)],
  ];
  // Columns of dashes say nothing: 10:00 and 15:00 only while they may still fill, or once one has a figure.
  const timed = state === "loading" || rows.some(([, a, b]) => a !== "—" || b !== "—");
  const pair = entry?.pair ?? null;
  const name = (slot: number) => champ(view.teams.flatMap((t) => t.participants).find((x) => x.slot === slot)?.championId ?? null).name;
  return (
    <section aria-label="Lane" className="@container/lane space-y-1.5 rounded-lg bg-surface px-3 py-2" data-testid="post-game-lane" data-state="clear" data-timed={timed || undefined}>
      {/* Under 20rem (a phone at large text) each row's name stands on a line of its own, its three figures under it, so nothing runs past the screen. */}
      <table className={cn("w-full text-sm leading-6 tabular-nums", timed && "@max-[20rem]/lane:block @max-[20rem]/lane:[&_tbody]:block @max-[20rem]/lane:[&_td]:block @max-[20rem]/lane:[&_th]:block @max-[20rem]/lane:[&_th]:w-auto @max-[20rem]/lane:[&_thead]:block @max-[20rem]/lane:[&_tr]:grid @max-[20rem]/lane:[&_tr]:grid-cols-3 @max-[20rem]/lane:[&_tr>th:first-child]:col-span-3")}>
        <thead>
          <tr className="text-2xs text-fg-subtle">
            <th className="pb-1 text-left font-semibold">
              <span className="flex items-center gap-1.5 uppercase tracking-label">
                Lane vs
                <ChampionPortrait champion={c} size="xs" className="h-5 w-5 rounded" />
                <span className="text-xs font-semibold normal-case tracking-normal text-fg">{c.name}</span>
                <span className="sr-only">: you minus them</span>
              </span>
            </th>
            {timed ? (
              <>
                <th className="w-16 pb-1 text-right font-medium">10:00</th>
                <th className="w-16 pb-1 text-right font-medium">15:00</th>
              </>
            ) : null}
            <th className="w-16 pb-1 text-right font-medium">End</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, a, b, e]) => (
            <tr key={label}>
              <th scope="row" className="text-left text-xs font-normal text-fg-muted">
                {label}
              </th>
              {timed ? (
                <>
                  <td className="text-right text-fg">{a}</td>
                  <td className="text-right text-fg">{b}</td>
                </>
              ) : null}
              <td className="text-right font-medium text-fg">{e}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {pair ? (
        <p className="text-xs text-fg-muted" data-testid="post-game-pair">
          Bot lane at 10:00, with {name(pair.allySlot)} against {name(pair.opponentSlots[0])} and {name(pair.opponentSlots[1])}: <span className="font-semibold tabular-nums text-fg">{signed(pair.gold)}</span> gold
        </p>
      ) : null}
      {state === "missing" ? (
        <p className="text-xs text-fg-subtle" data-testid="timeline-missing">
          Timeline not available for this game
        </p>
      ) : !timed ? (
        <p className="text-xs text-fg-subtle" data-testid="timeline-missing">
          No lane figures at 10:00 and 15:00 in this game&apos;s timeline
        </p>
      ) : null}
    </section>
  );
}

const POSITION_WORDS: Record<string, string> = { TOP: "Top", JUNGLE: "Jungle", MIDDLE: "Mid", BOTTOM: "Bottom", UTILITY: "Support" };

export function PostGame({ playerId, view, champ, variant, encounterLinks = false }: { playerId: string; view: MatchDetailView; champ: (id: string | null) => PortraitChampion; variant: "inline" | "window"; /** A window over the list itself (a phone's whole-screen game): its marks may lead to the list's Encounters, as under a card. */ encounterLinks?: boolean }) {
  const cache = React.useContext(MatchDetailCacheContext);
  const id = view.matchId;
  // The timeline first (the lane, the build path, the skill order and the scores read it), then the possible groups, the rank check and the players met, each after the view is on screen.
  const timeline = useResult<MatchTimelineResult>(() => (cache ? cache.timeline(playerId, id) : getMatchTimelineAction(playerId, id)), { status: "error", message: "" }, [cache, playerId, id]);
  const groups = useResult<MatchGroupsResult>(() => (cache ? cache.groups(playerId, id) : getMatchGroupsAction(playerId, id)), { status: "unavailable", message: "" }, [cache, playerId, id]);
  const ranks = useResult<MatchRanksResult>(view.rankCheck ? () => (cache ? cache.ranks(playerId, id) : getMatchRanksAction(playerId, id)) : null, { status: "not-found", message: "" }, [cache, playerId, id, view.rankCheck]);
  const link = React.useContext(EncounterLinkContext);
  const meetScope = variant === "inline" || encounterLinks ? (link?.scope ?? null) : null;
  const meetings = useResult<MatchMeetingsResult>(meetScope ? () => (cache ? cache.meetings(playerId, id, meetScope) : getMatchMeetingsAction(playerId, id, meetScope)) : null, { status: "not-found", message: "" }, [cache, playerId, id, meetScope]);
  const checked = React.useMemo(() => new Map(ranks?.status === "ok" ? ranks.ranks.map((r) => [r.slot, r.rank]) : []), [ranks]);
  const met = React.useMemo(() => new Map(meetings?.status === "ok" ? meetings.players.map((m) => [m.slot, m]) : []), [meetings]);
  const meetHref = link && meetScope ? link.href : null;
  const rankOf = React.useCallback((x: DetailParticipant) => checked.get(x.slot) ?? x.rank, [checked]);
  const checking = view.rankCheck && !ranks;
  const tl = timeline?.status === "ok" ? timeline.timeline : null;
  const state = !timeline ? "loading" : timeline.status === "ok" ? "ok" : "missing";
  // The player inspected (the profile's own as the game opens) and the one compared with them: client state only.
  const [selected, setSelected] = React.useState(view.player.slot);
  const [compareSlot, setCompare] = React.useState<number | null>(null);
  const [panel, setPanel] = React.useState<PanelKey>("build");
  // A phone folds the secondary parts (the support figures; the score's why, tiles and chart) to keep its window within two screens.
  const phone = usePhone();
  const all = React.useMemo(() => view.teams.flatMap((t) => t.participants), [view.teams]);
  const subject = all.find((p) => p.slot === selected && !p.removed) ?? view.player;
  const compare = compareSlot !== null && compareSlot !== subject.slot ? (all.find((p) => p.slot === compareSlot && !p.removed) ?? null) : null;
  const entry = tl?.players.find((p) => p.slot === subject.slot) ?? null;
  // The scores, once the timeline has answered (its lane at 10:00 and 15:00 is one of their figures), from what is loaded.
  const { scores, points } = React.useMemo(() => (timeline ? gameScoresOf(view, tl) : { scores: null, points: null }), [timeline, tl, view]);
  const scoreOf = React.useCallback((slot: number) => scores?.players.find((p) => p.slot === slot) ?? null, [scores]);
  const subjectTeam = view.teams.find((t) => t.participants.some((p) => p.slot === subject.slot)) ?? view.teams[0];
  const nameOf = React.useCallback((p: DetailParticipant) => (p.teamMember && !p.isPlayer ? p.teamMember : p.name ? p.name.split("#")[0]! : champ(p.championId).name), [champ]);
  const own = subject.isPlayer;
  const mine = scoreOf(subject.slot);
  const yours = React.useRef<HTMLElement>(null);
  // The row pressed stays under the finger as the player above it changes height: measured before
  // the switch and after it, and its scroller moved by the difference. Done here, not by the browser's
  // scroll anchoring, which Safari does not have (the breakdown opts out of it below, so Chromium and
  // Firefox do not correct twice).
  const anchor = React.useRef<{ el: Element; top: number } | null>(null);
  const select = React.useCallback((slot: number, from?: Element | null) => {
    anchor.current = from ? { el: from, top: from.getBoundingClientRect().top } : null;
    setSelected(slot);
  }, []);
  React.useLayoutEffect(() => {
    const a = anchor.current;
    anchor.current = null;
    if (!a || !a.el.isConnected) return;
    const moved = a.el.getBoundingClientRect().top - a.top;
    if (Math.abs(moved) < 0.5) return;
    scrollerOf(a.el).scrollBy(0, moved);
  }, [subject.slot]);
  // ↑ and ↓ between the ten rows (both teams), Home and End to the first and last; Enter and Space are the rows' own buttons.
  const onRowKeys = (e: React.KeyboardEvent<HTMLElement>) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
    const rows = [...e.currentTarget.querySelectorAll<HTMLButtonElement>("[data-testid=participant-select]")];
    const at = rows.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0) return;
    e.preventDefault();
    const next = e.key === "Home" ? 0 : e.key === "End" ? rows.length - 1 : Math.max(0, Math.min(rows.length - 1, at + (e.key === "ArrowDown" ? 1 : -1)));
    rows.forEach((r, i) => (r.tabIndex = i === next ? 0 : -1));
    rows[next]!.focus();
  };
  const others = all.filter((p) => !p.removed && p.slot !== subject.slot).sort((a, b) => (a.slot === subject.laneOpponentSlot ? -1 : b.slot === subject.laneOpponentSlot ? 1 : 0));
  const position = subject.position ? POSITION_WORDS[laneOf(subject.position) ?? ""] : undefined;
  return (
    <div className="@container/pg [overflow-anchor:none]" data-testid="match-breakdown" data-variant={variant} data-met={meetings ? (meetings.status === "ok" ? meetings.players.length : 0) : undefined} data-timeline={timeline ? timeline.status : "loading"} data-selected={subject.slot}>
      <div className="grid gap-x-6 gap-y-4 @min-[60rem]/pg:grid-cols-[minmax(0,33rem)_minmax(0,1fr)]">
        <section ref={yours} aria-label={own && view.own ? "Your game" : `${nameOf(subject)}'s game`} className="min-w-0 scroll-mt-24 space-y-2.5" data-testid="post-game-yours" data-own={own || undefined}>
          {/* Who is inspected, their score, and the way back to the profile's player. */}
          <div className="flex min-h-7 flex-wrap items-center gap-x-2 gap-y-1 pointer-coarse:min-h-11" data-testid="inspected">
            {/* Truncated on one line where it fits a phone at 100%; wrapped under 20rem (large text), so the score is never cut off. */}
            <p className="min-w-0 flex-1 truncate text-sm leading-tight @max-[20rem]/pg:whitespace-normal" aria-live="polite">
              <span className="font-semibold text-fg" data-testid="inspected-name">
                {nameOf(subject)}
              </span>
              <span className="text-fg-muted">
                {" "}
                · {champ(subject.championId).name}
                {position ? ` · ${position}` : ""}
              </span>
              {mine ? (
                <span className="text-fg-muted" data-testid="inspected-score">
                  {" "}
                  · <span className="font-semibold tabular-nums text-fg">{formatNumber(mine.score, 1)}</span>
                  <span className="sr-only"> performance score,</span> {formatOrdinal(mine.rank)}
                  {mine.mvp ? " · MVP" : mine.ace ? " · ACE" : ""}
                </span>
              ) : null}
            </p>
            {!own ? (
              <button type="button" onClick={() => select(view.player.slot)} className="inline-flex min-h-7 shrink-0 items-center gap-1 rounded-md border border-border-control px-2 text-xs font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:min-h-11" data-testid="inspect-back">
                <Undo2 className="h-3.5 w-3.5" aria-hidden />
                Back to {nameOf(view.player)}
              </button>
            ) : null}
          </div>
          {/* On a phone the why goes with the score's fold, under the scoreboard (PhoneFold). */}
          {!phone ? <ScoreWhy score={mine} points={points} slot={subject.slot} /> : null}
          <Loadout key={subject.slot} p={subject} champ={champ(subject.championId)} small={variant === "window"} />
          <Figures p={subject} teamKills={subjectTeam?.kills ?? 0} />
          <PhoneFold phone={phone} summary="More figures: crowd control, healing, objectives, wards" testId="more-fold">
            <MoreFigures p={subject} />
          </PhoneFold>
          <ParticipantPanels panel={panel} onPanel={setPanel} result={timeline} entry={entry} page={subject.runePage} />
          <Lane view={view} champ={champ} me={subject} entry={entry} state={state} />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-subtle empty:hidden">
            <span className={cn("tabular-nums", variant === "window" && "hidden")} data-testid="match-breakdown-when">
              {formatDateTime(new Date(view.playedAt))}
              {view.patch ? ` · Patch ${publicPatchName(view.patch)}` : ""}
            </span>
            {view.share.eligible ? <BookmarkButton matchId={view.matchId} bookmarked={view.share.shared} share /> : null}
            {view.player.opgg ? <OpggHistoryLink href={view.player.opgg} account={view.player.name?.split("#")[0]?.trim() || null} /> : null}
          </div>
        </section>
        <section aria-label="Scoreboard" className="@container/sb min-w-0 space-y-1.5" data-testid="post-game-scoreboard" onKeyDown={onRowKeys}>
          {view.teams.map((t) => (
            <TeamTable key={t.teamId} compact team={t} champ={champ} maxDamage={view.maxDamage} groups={groups?.status === "ok" ? (groups.teams.find((g) => g.teamId === t.teamId) ?? null) : null} laneSlot={subject.laneOpponentSlot} rankOf={rankOf} queueId={view.queueId} checking={checking} met={met} meetHref={meetHref} selection={{ selected: subject.slot, onSelect: select, score: scoreOf, scoring: !timeline, scored: scores?.scored ?? 0 }} />
          ))}
          {/* The two notes run on as one paragraph (each its own <p>, shown inline), so they share their
              lines: a long groups note takes the rest of the ranks note's line before a new one, which
              keeps the open game within 1440 × 900 (the Production check; it ran 18px over with a side
              clause on its own line, 24 Nov 2026). */}
          <div className="text-2xs [&>p]:inline [&>p+p]:ms-1.5" data-testid="scoreboard-notes">
            <RanksNote ranks={view.teams.flatMap((t) => t.participants.filter((x) => !x.removed).map(rankOf))} queueId={view.queueId} checking={checking} result={ranks} />
            <GroupsNote result={groups} teams={view.teams} />
          </div>
          {/* Stacked (a phone, a tablet), the player inspected is above the scoreboard: one press takes the reader there, nothing scrolls by itself. */}
          {!own ? (
            <button type="button" onClick={() => yours.current?.scrollIntoView({ block: "start", behavior: "smooth" })} className="inline-flex min-h-8 items-center gap-1 rounded-md px-1 text-xs font-medium text-accent underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:min-h-11 @min-[60rem]/pg:hidden" data-testid="inspected-jump">
              <ArrowUp className="h-3.5 w-3.5" aria-hidden />
              Show {nameOf(subject)}&apos;s game
            </button>
          ) : null}
          <PerformancePanel scores={scores} points={points} timeline={state} subject={subject} compare={compare} onCompare={setCompare} others={others} nameOf={nameOf} teams={view.teams} champ={champ} onSelect={select} phone={phone} />
        </section>
      </div>
    </div>
  );
}

/** The nearest ancestor that scrolls vertically (the game's window on a phone), else the page. */
function scrollerOf(el: Element): Element | Window {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const y = getComputedStyle(p).overflowY;
    if ((y === "auto" || y === "scroll") && p.scrollHeight > p.clientHeight) return p;
  }
  return window;
}
