"use client";

import * as React from "react";
import { CircleDot, Swords, TrendingDown, TrendingUp } from "lucide-react";
import Link from "next/link";
import { getMatchGroupsAction, getMatchMeetingsAction, getMatchRanksAction, getMatchTimelineAction, type MatchMeetingsResult } from "@/server/actions/match-history";
import type { MatchGroupsResult } from "@/server/matches/possible-groups";
import type { MatchTimelineResult, MatchTimelineView } from "@/server/accounts/match-timeline";
import type { DetailParticipant, Icon, MatchDetailView, MatchRanksResult } from "@/server/players/match-history";
import { ChampionPortrait, type PortraitChampion } from "@/components/champion-portrait";
import { BookmarkButton } from "@/components/matches/bookmark-button";
import { matchNotes, type MatchNotes, type NotesInput } from "@/domain/match-notes";
import { isGameRole } from "@/domain/season-stats";
import { formatCount, formatDateTime, formatKilo } from "@/lib/format";
import { cn } from "@/lib/cn";
import { MatchDetailCacheContext, type MeetingScope } from "./match-detail-cache";
import { OpggHistoryLink } from "./opgg-history-link";
import { GroupsNote, RanksNote, TeamTable } from "./scoreboard";
import { TimelinePanel } from "./match-timeline-panel";
import { BuildPanel } from "./build-panel";
import { IconImg } from "./icon-img";
import { lineupHref } from "@/components/matchup-intel/address";
import type { Role } from "@/domain/matchup-intel/types";

/*
  One game after it was played, in one view, the same wherever a game opens: under its card in
  Match History and Team → Matches, and in the match window (a phone's whole screen, Matchups,
  Encounters, a link to a game not on the page). No subtabs, read top down:
  - "Your game": the loadout as the client draws it (the portrait and level; spells and runes two
    by two; the six items two rows of three with the trinket beside the first row), the rune page
    on one line (shards where stored), six figure tiles (each of the player's figures once in the
    whole view), the lane by role, and the notes (domain/match-notes: Went well, Went wrong, and
    Focus next on the viewer's own game only).
  - "Scoreboard": both teams, the player's first, in compact rows (TeamTable compact), with the
    ranks note and the possible groups on a line under them.
  - Two folds, closed: "Gold over the game" and "Build order and skill order". A game whose timeline
    is not available says so once, quietly, in their place.
  The two columns sit side by side from a 60rem view (desktop) and stack below it (tablets, the
  sidebar open at 1280, phones). The timeline is asked for as the game opens: the lane and the
  notes read it (stored, about 10–20 KB; Riot is asked at most once per game, ever).
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

/** Games shorter than this are remakes: never analysed. */
const REMAKE_S = 300;

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

/** The loadout, as the client's scoreboard and HUD draw it, and the rune page on one line. */
function Loadout({ p, champ, small }: { p: MatchDetailView["player"]; champ: PortraitChampion; small: boolean }) {
  const [name, setName] = React.useState<string | null>(null);
  const icon = small ? 24 : 30;
  const item = small ? 32 : 40;
  const two = p.spells?.length ? p.spells.slice(0, 2) : [null, null];
  const page = p.runePage;
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
      </div>
      {page ? (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Rune page" data-testid="rune-page">
          <Named icon={page.primaryTree} size={18} rounded="rounded-full" onName={setName} />
          {page.primary.map((r, i) => (
            <Named key={i} icon={r} size={i === 0 ? 28 : 22} rounded="rounded-full" onName={setName} />
          ))}
          <span className="mx-1 h-5 w-px bg-border" aria-hidden />
          <Named icon={page.secondaryTree} size={18} rounded="rounded-full" onName={setName} />
          {page.secondary.map((r, i) => (
            <Named key={i} icon={r} size={22} rounded="rounded-full" onName={setName} />
          ))}
          {page.shards.length ? (
            <>
              <span className="mx-1 h-5 w-px bg-border" aria-hidden />
              {page.shards.map((r, i) => (
                <IconImg key={i} icon={r} size={16} rounded="rounded-full" className="bg-black/35" />
              ))}
            </>
          ) : null}
          <span className="min-h-4 min-w-24 flex-1 truncate text-right text-xs leading-4 text-fg-muted" aria-hidden data-testid="loadout-name">
            {name ?? ""}
          </span>
        </div>
      ) : (
        <p className="min-h-4 text-xs leading-4 text-fg-muted" aria-hidden data-testid="loadout-name">
          {name ?? ""}
        </p>
      )}
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
    <div className="grid grid-cols-3 gap-1.5 @min-[34rem]/pg:grid-cols-6" data-testid="post-game-figures">
      <Tile label="K/D/A" value={`${p.kills} / ${p.deaths} / ${p.assists}`} sub={p.deaths === 0 ? "Perfect KDA" : `${p.kda.toFixed(2)} KDA`} testId="figure-kda" />
      <Tile label="CS" value={p.cs === null ? "—" : formatCount(p.cs)} sub={p.csPerMin === null ? null : `${p.csPerMin.toFixed(1)} / min`} testId="figure-cs" />
      <Tile label="Gold" value={p.gold === null ? "—" : formatKilo(p.gold)} sub={p.goldPerMin === null ? null : `${formatCount(Math.round(p.goldPerMin))} / min`} testId="figure-gold" />
      <Tile label="Damage" value={p.damage === null ? "—" : formatKilo(p.damage)} sub={p.damageShare === null ? null : `${pct(p.damageShare)} of team`} testId="figure-damage" />
      <Tile label="Vision" value={p.vision === null ? "—" : formatCount(p.vision)} sub={p.wardsPlaced === null ? null : `${formatCount(p.wardsPlaced)} wards`} testId="figure-vision" />
      <Tile label="KP" value={pct(p.killParticipation)} sub={teamKills > 0 ? `of ${formatCount(teamKills)} kills` : null} testId="figure-kp" />
    </div>
  );
}

/** The lane by role: the player against the lane opponent at 10:00, 15:00 and the end (signed, plain), and the bot lane's two against two. */
function Lane({ view, champ, timeline }: { view: MatchDetailView; champ: (id: string | null) => PortraitChampion; timeline: MatchTimelineView | null }) {
  const opp = view.comparison.opponent;
  const me = view.player;
  if (!opp) return <p className="text-xs text-fg-muted" data-testid="post-game-lane" data-state="unclear">Lane opponent not clear in this game</p>;
  const them = view.teams.flatMap((t) => t.participants).find((x) => x.slot === opp.slot) ?? null;
  const c = champ(opp.championId);
  const support = view.role === "SUPPORT";
  const at = (m: number) => timeline?.lane?.moments.find((x) => x.minute === m);
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
  const pair = timeline?.pair ?? null;
  const name = (slot: number) => champ(view.teams.flatMap((t) => t.participants).find((x) => x.slot === slot)?.championId ?? null).name;
  return (
    <section aria-label="Lane" className="space-y-1.5" data-testid="post-game-lane" data-state="clear">
      <table className="w-full max-w-md text-xs leading-4 tabular-nums">
        <thead>
          <tr className="text-2xs text-fg-subtle">
            <th className="text-left font-semibold">
              <span className="flex items-center gap-1.5 uppercase tracking-label">
                Lane vs
                <ChampionPortrait champion={c} size="xs" className="h-5 w-5" />
                <span className="text-xs font-semibold normal-case tracking-normal text-fg">{c.name}</span>
                <span className="sr-only">: you minus them</span>
              </span>
            </th>
            <th className="text-right font-medium">10:00</th>
            <th className="text-right font-medium">15:00</th>
            <th className="text-right font-medium">End</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, a, b, e]) => (
            <tr key={label}>
              <th scope="row" className="text-left font-normal text-fg-muted">
                {label}
              </th>
              <td className="text-right text-fg">{a}</td>
              <td className="text-right text-fg">{b}</td>
              <td className="text-right text-fg">{e}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {pair ? (
        <p className="text-xs text-fg-muted" data-testid="post-game-pair">
          Bot lane at 10:00, with {name(pair.allySlot)} against {name(pair.opponentSlots[0])} and {name(pair.opponentSlots[1])}: <span className="font-semibold tabular-nums text-fg">{signed(pair.gold)}</span> gold
        </p>
      ) : null}
    </section>
  );
}

/** The notes' input from the view and (when it answered) the timeline. */
export function notesInputOf(view: MatchDetailView, champ: (id: string | null) => PortraitChampion, timeline: MatchTimelineView | null): NotesInput {
  const me = view.player;
  const everyone = view.teams.flatMap((t) => t.participants);
  const own = view.teams[0]?.participants.filter((x) => !x.isPlayer && !x.removed) ?? [];
  const enemies = view.teams.slice(1).flatMap((t) => t.participants.filter((x) => !x.removed));
  const nameOf = (slot: number) => champ(everyone.find((x) => x.slot === slot)?.championId ?? null).name;
  const pair = timeline?.pair ? { ally: nameOf(timeline.pair.allySlot), opponents: [nameOf(timeline.pair.opponentSlots[0]), nameOf(timeline.pair.opponentSlots[1])] as [string, string], gold: timeline.pair.gold } : null;
  return {
    own: view.own,
    champion: champ(view.championId).name,
    role: isGameRole(view.role) ? view.role : null,
    queueId: view.queueId,
    durationS: view.durationS,
    win: view.win,
    remake: view.durationS < REMAKE_S,
    me: { kills: me.kills, deaths: me.deaths, assists: me.assists, damageShare: me.damageShare, vision: me.vision, killParticipation: me.killParticipation, controlWardsBought: me.stats?.controlWardsBought, soloKills: me.stats?.soloKills, largestMultiKill: me.stats?.largestMultiKill, turretTakedowns: me.stats?.turretTakedowns },
    allies: own.map((x) => ({ deaths: x.deaths, damageShare: x.damageShare, vision: x.vision })),
    alliesRemoved: view.teams[0]?.participants.filter((x) => !x.isPlayer && x.removed).length ?? 0,
    enemies: enemies.map((x) => ({ vision: x.vision })),
    teamTowers: typeof view.teams[0]?.objectives.tower === "number" ? view.teams[0].objectives.tower : null,
    opponent: view.comparison.opponent ? champ(view.comparison.opponent.championId).name : null,
    lane: timeline?.lane?.moments ?? null,
    pair,
    personal: view.personal,
    deathTimes: timeline?.events?.you?.deaths ?? null,
    gold: timeline?.gold ?? null,
    objectives: timeline?.events?.objectives ?? null,
  };
}

function NoteList({ title, tone, Icon, items, testId }: { title: string; tone: string; Icon: typeof TrendingUp; items: string[]; testId: string }) {
  if (!items.length) return null;
  return (
    <div data-testid={testId}>
      {/* A label, not a heading: the view sits under headings of different levels (a profile's page, Team Matches, the window). */}
      <p className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-label text-fg-subtle" aria-hidden>
        <Icon className={cn("h-3.5 w-3.5", tone)} aria-hidden />
        {title}
      </p>
      <ul className="mt-0.5 space-y-0.5 text-sm text-fg" aria-label={title}>
        {items.map((t) => (
          <li key={t} data-testid="post-game-note">
            {t}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The lane's Focus next, a link to Matchup Intel with that lane's pair (S7a's address: the role, your
 * champion and the lane opponent; the bot lane's four when the Focus follows its two against two,
 * L5). Only a way to the pre-game tool: it adds no claim to the note's. Null for any other Focus, or
 * without the champions the lane needs (no unique opponent, an unknown role).
 */
export function laneIntelLink(view: MatchDetailView, notes: MatchNotes | null, champ: (id: string | null) => PortraitChampion, timeline: MatchTimelineView | null): { href: string; label: string } | null {
  if (notes?.focus?.kind !== "lane" || !isGameRole(view.role)) return null;
  const role = view.role.toLowerCase() as Role;
  const you = view.championId;
  if (notes.focus.cue === "L5") {
    const pair = timeline?.pair;
    const everyone = view.teams.flatMap((t) => t.participants);
    const at = (slot: number | undefined) => everyone.find((x) => x.slot === slot)?.championId ?? null;
    const ally = at(pair?.allySlot);
    const [enemy, enemy2] = [at(pair?.opponentSlots[0]), at(pair?.opponentSlots[1])];
    if (!pair || !ally || !enemy || !enemy2 || (role !== "adc" && role !== "support")) return null;
    return { href: lineupHref({ role, you, ally, enemy, enemy2 }), label: `Prepare ${champ(you).name} and ${champ(ally).name} vs ${champ(enemy).name} and ${champ(enemy2).name} in Matchup Intel` };
  }
  const enemy = view.comparison.opponent?.championId ?? null;
  if (!enemy) return null;
  return { href: lineupHref({ role, you, enemy, ally: null, enemy2: null }), label: `Prepare ${champ(you).name} vs ${champ(enemy).name} in Matchup Intel` };
}

function Notes({ notes, intel }: { notes: MatchNotes | null; intel: { href: string; label: string } | null }) {
  if (!notes) return (
      // A polite status that says what loads; the pulse itself is hidden (a div may not be named: aria-naming.test.ts).
      <div role="status" className="h-16 animate-pulse rounded-lg bg-surface-2 motion-reduce:animate-none" data-testid="post-game-notes-loading">
        <span className="sr-only">Loading the notes</span>
      </div>
    );
  return (
    <section aria-label="Notes" className="space-y-2" data-testid="post-game-notes" data-well={notes.well.length} data-wrong={notes.wrong.length} data-focus={notes.focus ? 1 : 0}>
      <NoteList title="Went well" tone="text-good" Icon={TrendingUp} items={notes.well.map((n) => n.text)} testId="notes-well" />
      <NoteList title="Went wrong" tone="text-warn" Icon={TrendingDown} items={notes.wrong.map((n) => n.text)} testId="notes-wrong" />
      <NoteList title="Focus next" tone="text-accent" Icon={CircleDot} items={notes.focus ? [notes.focus.text] : []} testId="notes-focus" />
      {notes.focus && intel ? (
        <Link href={intel.href} prefetch={false} className="inline-flex min-h-6 items-center gap-1.5 text-xs font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:min-h-11" data-testid="notes-focus-intel">
          <Swords className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {intel.label}
          <span aria-hidden>→</span>
        </Link>
      ) : null}
      {notes.fallback ? (
        <p className="text-xs text-fg-muted" data-testid="notes-fallback">
          {notes.fallback}
        </p>
      ) : null}
    </section>
  );
}

export function PostGame({ playerId, view, champ, variant, encounterLinks = false }: { playerId: string; view: MatchDetailView; champ: (id: string | null) => PortraitChampion; variant: "inline" | "window"; /** A window over the list itself (a phone's whole-screen game): its marks may lead to the list's Encounters, as under a card. */ encounterLinks?: boolean }) {
  const cache = React.useContext(MatchDetailCacheContext);
  const p = view.player;
  const id = view.matchId;
  // The timeline first (the lane and the notes read it), then the possible groups, the rank check and the players met, each after the view is on screen.
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
  const notes = React.useMemo(() => (timeline ? matchNotes(notesInputOf(view, champ, tl)) : null), [timeline, view, champ, tl]);
  const ownTeam = view.teams[0];
  return (
    <div className="@container/pg space-y-2.5" data-testid="match-breakdown" data-variant={variant} data-met={meetings ? (meetings.status === "ok" ? meetings.players.length : 0) : undefined}>
      <div className="grid gap-x-5 gap-y-4 @min-[60rem]/pg:grid-cols-[minmax(0,33rem)_minmax(0,1fr)]">
        <section aria-label={view.own ? "Your game" : `${champ(view.championId).name}'s game`} className="min-w-0 space-y-2.5" data-testid="post-game-yours">
          <Loadout p={p} champ={champ(view.championId)} small={variant === "window"} />
          <Figures p={p} teamKills={ownTeam?.kills ?? 0} />
          <Lane view={view} champ={champ} timeline={tl} />
          <Notes notes={notes} intel={laneIntelLink(view, notes, champ, tl)} />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-subtle empty:hidden">
            <span className={cn("tabular-nums", variant === "window" && "hidden")} data-testid="match-breakdown-when">
              {formatDateTime(new Date(view.playedAt))}
              {view.patch ? ` · Patch ${view.patch}` : ""}
            </span>
            {view.share.eligible ? <BookmarkButton matchId={view.matchId} bookmarked={view.share.shared} share /> : null}
            {p.opgg ? <OpggHistoryLink href={p.opgg} account={p.name?.split("#")[0]?.trim() || null} /> : null}
          </div>
        </section>
        <section aria-label="Scoreboard" className="@container/sb min-w-0 space-y-2" data-testid="post-game-scoreboard">
          {view.teams.map((t) => (
            <TeamTable key={t.teamId} compact team={t} champ={champ} maxDamage={view.maxDamage} groups={groups?.status === "ok" ? (groups.teams.find((g) => g.teamId === t.teamId) ?? null) : null} laneSlot={view.comparison.opponent?.slot ?? null} rankOf={rankOf} queueId={view.queueId} checking={checking} met={met} meetHref={meetHref} />
          ))}
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <RanksNote ranks={view.teams.flatMap((t) => t.participants.filter((x) => !x.removed).map(rankOf))} queueId={view.queueId} checking={checking} result={ranks} />
            <GroupsNote result={groups} teams={view.teams} />
          </div>
        </section>
      </div>
      {timeline && timeline.status !== "ok" ? (
        <p className="text-xs text-fg-subtle" data-testid="timeline-missing">
          Timeline not available for this game
        </p>
      ) : (
        <div className="grid grid-cols-2 items-start gap-2" data-testid="post-game-folds">
          <Fold title="Gold over the game" testId="fold-gold">
            <TimelinePanel result={timeline} />
          </Fold>
          <Fold title="Build and skill order" testId="fold-build">
            <BuildPanel result={timeline} />
          </Fold>
        </div>
      )}
    </div>
  );
}

/** A fold (native details): closed by default, one chevron. */
function Fold({ title, children, testId }: { title: string; children: React.ReactNode; testId: string }) {
  const [opened, setOpened] = React.useState(false);
  return (
    <details className="group rounded-lg border border-border bg-surface open:col-span-2" data-testid={testId} onToggle={(e) => setOpened((e.currentTarget as HTMLDetailsElement).open)}>
      <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-lg px-3 text-sm font-medium text-fg hover:bg-surface-2/60 focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:min-h-11 [&::-webkit-details-marker]:hidden">
        <span className="text-fg-subtle transition-transform group-open:rotate-90" aria-hidden>
          ›
        </span>
        {title}
      </summary>
      {opened ? <div className="border-t border-border p-3">{children}</div> : null}
    </details>
  );
}
