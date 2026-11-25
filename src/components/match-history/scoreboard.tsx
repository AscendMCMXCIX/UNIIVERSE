"use client";

import Link from "next/link";
import { Clock3, Swords, UserX } from "lucide-react";
import type { MatchGroupsResult, MatchGroupsTeam, MatchGroupView } from "@/server/matches/possible-groups";
import { groupEvidenceText } from "@/domain/possible-groups";
import type { DetailParticipant, DetailTeam, MatchRanksResult } from "@/server/players/match-history";
import type { MatchMeeting } from "@/server/players/encounters";
import { metSides } from "@/lib/tip-words";
import { ChampionPortrait, type PortraitChampion } from "@/components/champion-portrait";
import { formatCount, formatDate, formatKilo, formatNumber, formatOrdinal } from "@/lib/format";
import type { PlayerScore } from "@/domain/performance-score";
import { RankChip } from "./performance-panel";
import { cn } from "@/lib/cn";
import { Fold } from "@/components/ui/fold";
import { matchRankQueue, rankBadgeLabel, rankShortLabel, rankTimingCounts, type ParticipantRank } from "@/domain/known-rank";
import { InfoTip } from "@/components/ui/info-tip";
import { RankEmblem } from "@/components/players/rank-emblem";
import { TIER_TEXT } from "./rank-short";
import { PlayerLink } from "./player-link";
import { ItemRow } from "./icon-img";

/*
  A game's scoreboard in the post-game view: both teams as one component (one surface, one row
  grid), the player's team first, each in lane order. Every row is one player, its columns at the
  same places on both teams: the portrait with the level; the name over the champion, the lane
  opponent's mark and the rank (read around the game; a clock marks one read away from it); the
  K/D/A; the build (six items and the trinket); CS over damage; the performance score over its
  place among the ten (MVP and ACE as chips). Each team's band says its side and result in words
  and its totals; a possible group is one line under it. The row is the button that inspects its
  player; the name stays the player's link. The profile's own player has the accent tint, the
  player inspected an inset accent ring, so the two are told apart when they differ.

  The names are the ones the collapsed card's teams show: a team member's profile name, else the
  Riot name without its tag, else the champion (team-composition.tsx, compositionOf).

  Widths (the scoreboard's own, @container/sb): from 30rem one line of columns, two text lines a
  row (about 34px); under it (a phone's window) two lines: the name, the K/D/A and the score; the
  build, the rank and CS with damage. From 17.5rem to 21rem (a 320–360px phone) the score and its
  place stand beside the K/D/A on the first line, so the build, the rank and CS have the whole
  second line, CS without its word (it stays for screen readers); under 17.5rem (a phone at 200%
  text) each part wraps whole.
  Every row is the same height in a layout, so the ten line up.
*/

const OBJECTIVES: Array<[string, string, string]> = [
  ["tower", "tower", "towers"],
  ["dragon", "dragon", "dragons"],
  ["baron", "baron", "barons"],
];

/** The two possible groups a team can hold at most (5 players), told apart by colour. */
const GROUP_MARK = ["bg-accent", "bg-warn"];

export interface RankProps {
  /** Null: a team member whose statistics this viewer may not see (players/game-audience); no badge at all. */
  rankOf: (x: DetailParticipant) => ParticipantRank | null;
  queueId: number | null;
  /** The rank check is still answering. */
  checking: boolean;
}

/** The players met in the player's other games, by place in the record, and the address of one's games (Match History → Encounters). */
export interface MeetProps {
  met?: ReadonlyMap<number, MatchMeeting>;
  meetHref?: ((key: string) => string) | null;
}

/**
 * The post-game view's inspection (post-game.tsx): any row selects its player (a click, a tap, Enter
 * or Space on the row; ↑ and ↓ move between the ten rows), and each row carries its player's
 * performance score (domain/performance-score), its place among the ten and MVP or ACE.
 */
export interface RowSelection {
  selected: number;
  /** `from`: the row pressed, kept under the pointer as the player above it changes (post-game.tsx). */
  onSelect: (slot: number, from?: Element | null) => void;
  score: (slot: number) => PlayerScore | null;
  /** The scores wait for the game's timeline (the lane at 10:00 and 15:00 is one of their figures). */
  scoring: boolean;
  /** How many players were scored (a removed player is not). */
  scored: number;
}

/** A player's name as the post-game view and the collapsed card show it: the profile name of a team member, else the Riot name without its tag, else the champion. */
export function shownName(x: Pick<DetailParticipant, "teamMember" | "name">, champion: string): string {
  return x.teamMember ?? (x.name ? x.name.split("#")[0]!.trim() || champion : champion);
}

/** Both teams, one component. */
export function Scoreboard({ teams, champ, groups, laneSlot, rankOf, queueId, checking, met, meetHref, selection }: { teams: DetailTeam[]; champ: (id: string | null) => PortraitChampion; groups: MatchGroupsResult | null; /** The inspected player's lane opponent, by place in the record. */ laneSlot: number | null; selection: RowSelection } & RankProps & MeetProps) {
  return (
    <div className="@container/sb rounded-panel border border-border bg-surface" data-testid="scoreboard">
      {teams.map((t, i) => (
        <TeamTable key={t.teamId} first={i === 0} last={i === teams.length - 1} team={t} champ={champ} groups={groups?.status === "ok" ? (groups.teams.find((g) => g.teamId === t.teamId) ?? null) : null} laneSlot={laneSlot} rankOf={rankOf} queueId={queueId} checking={checking} met={met} meetHref={meetHref} selection={selection} />
      ))}
    </div>
  );
}

function TeamTable({ team, champ, groups, laneSlot, rankOf, queueId, checking, met, meetHref, selection, first, last }: { team: DetailTeam; champ: (id: string | null) => PortraitChampion; groups: MatchGroupsTeam | null; laneSlot: number | null; selection: RowSelection; first: boolean; last: boolean } & RankProps & MeetProps) {
  const objectives = OBJECTIVES.filter(([k]) => team.objectives[k] !== undefined);
  const found = groups?.groups ?? [];
  const groupOf = new Map(found.flatMap((g, i) => g.slots.map((s) => [s, { index: i, label: g.label }] as const)));
  const nameOf = (slot: number) => {
    const x = team.participants.find((p) => p.slot === slot);
    if (x?.removed) return "Removed player";
    return x ? shownName(x, champ(x.championId).name) : "Player";
  };
  const total = (n: number | string, one: string, many: string, count = Number(n)) => (
    <span className="whitespace-nowrap">
      <span className="font-semibold tabular-nums text-fg">{n}</span> {count === 1 ? one : many}
    </span>
  );
  return (
    <section className={cn(!first && "border-t border-border")} data-testid={`team-${team.side}`} aria-label={`${team.side === "blue" ? "Blue" : "Red"} team, ${team.win ? "victory" : "defeat"}`}>
      {/* The team's band: its side and result in words (never the colour alone), then its totals, each number brighter than its word. One line, as tall on both teams. */}
      <header className={cn(first && "rounded-t-panel", "flex min-h-6 flex-wrap items-center justify-between gap-x-3 px-2.5 text-xs leading-4", team.side === "blue" ? "bg-blue/10" : "bg-red/10")}>
        <span className="flex items-baseline gap-1.5">
          <span className={cn("text-2xs font-semibold uppercase tracking-label", team.side === "blue" ? "text-blue" : "text-red")}>{team.side === "blue" ? "Blue side" : "Red side"}</span>
          <span className="font-semibold text-fg" data-testid="team-result">
            {team.win ? "Victory" : "Defeat"}
          </span>
        </span>
        <span className="flex flex-wrap items-center gap-x-2.5 text-fg-muted" data-testid="team-totals">
          {total(team.kills, "kill", "kills")}
          {team.gold !== null ? total(formatKilo(team.gold), "gold", "gold") : null}
          {objectives.map(([k, one, many]) => (
            <span key={k} className="@max-[30rem]/sb:hidden">
              {total(team.objectives[k]!, one, many)}
            </span>
          ))}
        </span>
      </header>
      {found.length ? (
        <div className="px-2.5" data-testid="possible-groups">
          {found.map((g, i) => (
            <GroupLine key={g.slots.join()} group={g} mark={GROUP_MARK[i] ?? GROUP_MARK[0]!} names={g.slots.map(nameOf)} />
          ))}
        </div>
      ) : null}
      {/* The last row keeps the panel's corners (no clipping box around the scoreboard). */}
      <ul className={cn(last && "[&>li:last-child]:rounded-b-panel")}>
        {team.participants.map((x, i) => (
          <Row key={i} x={x} champ={champ} group={groupOf.get(x.slot) ?? null} lane={laneSlot !== null && x.slot === laneSlot} rank={rankOf(x)} queueId={queueId} checking={checking} met={meetHref ? (met?.get(x.slot) ?? null) : null} meetHref={meetHref ?? null} selection={selection} />
        ))}
      </ul>
    </section>
  );
}

/**
 * A player's rank, without a box (domain/known-rank.ts): the tier's crest and "Gold 2" in the
 * tier's colour (a rank in the match's other ranked queue is marked "Flex" or "Solo"; one read over
 * a month ago carries its month), "Unranked" when a check found no ranked entry, and "—" when
 * nothing is known. A clock marks a rank read away from the game (later, or before it): not the
 * rank at the time of the game. One being checked pulses until the answer arrives.
 */
function RankBadge({ rank, queueId, checking }: { rank: ParticipantRank; queueId: number | null; checking: boolean }) {
  // It may shrink (its text then ends in an ellipsis; the whole rank is in its title and for screen
  // readers), so a long rank never reaches into the column beside it. Under 17.5rem (a phone at 200%
  // text) it wraps onto a second line rather than shorten the rank.
  const base = "inline-flex h-4 min-w-0 items-center gap-1 text-2xs font-medium leading-4 @max-[17.5rem]/sb:h-auto";
  if (checking && rank.state === "unknown")
    return (
      <span className={cn(base, "w-10 shrink animate-pulse rounded bg-surface-3/70 motion-reduce:animate-none")} data-testid="participant-rank" data-state="checking">
        <span className="sr-only">Checking rank</span>
      </span>
    );
  const { text, queueMark, spoken, title, aroundGame } = rankBadgeLabel(rank, queueId);
  const shortLabel = rankShortLabel(rank, queueId);
  const short = shortLabel.text ? shortLabel : null;
  // The tier in its own colour (5:1 or more on the panels) when it is the rank around the game; one read away from it stays in the quiet caption colour.
  const tierColour = rank.state === "ranked" && rank.tier && aroundGame !== false ? (TIER_TEXT[rank.tier] ?? "text-fg-muted") : null;
  return (
    <span className={cn(base, rank.state === "ranked" ? (tierColour ?? "text-fg-muted") : "text-fg-subtle")} title={title} data-testid="participant-rank" data-state={rank.state} data-queue={rank.queue ?? undefined} data-timing={rank.timing ?? undefined}>
      {rank.state === "ranked" ? <RankEmblem tier={rank.tier} className="h-3 w-3 shrink-0" /> : null}
      {/* In a scoreboard 30–36rem wide (a desktop with the sidebar open) the short form a match card uses ("E2"), so the champion beside it is never cut; the whole rank stays in the title and the screen reader's words. */}
      <span aria-hidden className="min-w-0 truncate @max-[17.5rem]/sb:whitespace-normal" data-testid="participant-rank-text" data-text={`${queueMark ? `${queueMark} ` : ""}${text}`}>
        <span className={cn(short && "@max-[36rem]/sb:hidden")}>
          {queueMark ? <span className="text-fg-subtle">{queueMark} </span> : null}
          {text}
        </span>
        {short ? (
          <span className="@min-[36rem]/sb:hidden">
            {short.text}
            {short.queueMark ? <span className="ml-px align-top text-4xs font-medium leading-none text-fg-subtle">{short.queueMark}</span> : null}
          </span>
        ) : null}
      </span>
      {aroundGame === false ? <Clock3 className="h-2.5 w-2.5 shrink-0 text-fg-subtle" aria-hidden data-testid="rank-read-later" /> : null}
      <span className="sr-only">{spoken}</span>
    </span>
  );
}

/**
 * Under the scoreboard, one quiet line: "Ranks" with its (i), the state of a rank check that is
 * running or could not ask for every player, and "Possible groups" with its (i) where a side has
 * one. Nothing is said about groups that could not be assessed (the owner's brief, §5): the absence
 * of a group's mark claims nothing. The two status holders keep their data for the specs and the
 * Production check (`data-state`), whatever they show.
 */
export function ScoreboardNotes({ ranks, queueId, checking, result, groups }: { ranks: ReadonlyArray<ParticipantRank | null>; queueId: number | null; checking: boolean; result: MatchRanksResult | null; groups: MatchGroupsResult | null }) {
  const { around, away } = rankTimingCounts(ranks.filter((r): r is ParticipantRank => r !== null));
  const check = result?.status === "ok" ? result.check : null;
  const status = checking
    ? "checking…"
    : check?.reason === "budget"
      ? "some older or missing today"
      : check?.reason === "busy"
        ? "some not checked yet"
        : check?.failed
          ? `${formatCount(check.failed)} not checked`
          : null;
  const flex = matchRankQueue(queueId) === "flex";
  const anyGroup = groups?.status === "ok" && groups.teams.some((t) => t.groups.length > 0);
  return (
    <>
      <span className="inline-flex items-center gap-1" data-testid="ranks-note" data-state={checking ? "checking" : (check?.reason ?? (check?.failed ? "failed" : "done"))} data-around={around} data-away={away}>
        Ranks
        <InfoTip label="About the ranks" testId="ranks-info" text={flex ? "Rank recorded near match time; older readings may differ. Flex unless marked Solo/Duo." : "Rank recorded near match time; older readings may differ. Solo/Duo unless marked Flex."} />
        {status ? (
          <span className="text-fg-muted" data-testid="ranks-status">
            {status}
          </span>
        ) : null}
      </span>
      <span className={cn("inline-flex items-center gap-1", !anyGroup && "hidden")} data-testid="possible-groups-note" data-state={!groups ? "loading" : groups.status === "ok" ? "ok" : groups.status} data-groups={anyGroup ? "yes" : undefined}>
        {anyGroup ? (
          <>
            Possible groups
            <InfoTip label="About possible groups" testId="groups-info" text="Players frequently seen together in earlier games. Not confirmed premades." />
          </>
        ) : null}
      </span>
    </>
  );
}

/**
 * One possible group under its team's band: who, and how many earlier stored games back it (the
 * games themselves open from the line: date, queue and the group's result, newest first).
 */
function GroupLine({ group: g, mark, names }: { group: MatchGroupView; mark: string; names: string[] }) {
  const more = g.games - g.evidence.length;
  return (
    <Fold
      variant="inline"
      className="text-xs"
      testId="possible-group"
      data-size={g.slots.length}
      summary={
        <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <span className={cn("h-3 w-[3px] shrink-0 rounded-full", mark)} aria-hidden />
          <span className="font-semibold text-fg">{g.label}</span>
          <span className="text-fg-muted">{names.join(", ")}</span>
          <span className="text-fg-subtle" data-testid="possible-group-count">
            · {formatCount(g.games)} {g.games === 1 ? "game" : "games"} together
          </span>
          <span className="sr-only">Show the games</span>
        </span>
      }
    >
      <p className="pb-0.5 pl-3 text-2xs text-fg-subtle" data-testid="possible-group-games">
        {groupEvidenceText(g.slots.length, g.games, g.opposed)}
      </p>
      <ul className="space-y-0.5 pb-0.5 pl-3 text-2xs tabular-nums text-fg-muted" data-testid="possible-group-evidence">
        {g.evidence.map((e, i) => (
          <li key={i}>
            {formatDate(new Date(e.playedAt))} · {e.queue} · <span className={e.win ? "text-blue" : "text-red"}>{e.win ? "Won" : "Lost"}</span>
          </li>
        ))}
        {more > 0 ? <li className="text-fg-subtle">and {more} earlier</li> : null}
      </ul>
    </Fold>
  );
}

/** A row's grid: the same columns on both teams (see the note at the top). */
const ROW = cn(
  "relative grid min-h-8 items-center gap-x-1 px-1 py-0",
  "grid-cols-[1.5rem_minmax(0,1fr)_auto_2.25rem]",
  "@min-[30rem]/sb:min-h-8 @min-[30rem]/sb:py-0 @min-[30rem]/sb:grid-cols-[1.75rem_minmax(0,1fr)_3.5rem_auto_3.5rem_2.75rem] @min-[30rem]/sb:gap-x-3 @min-[30rem]/sb:px-2.5",
  "@min-[17.5rem]/sb:@max-[21rem]/sb:grid-cols-[1.5rem_minmax(0,1fr)_auto_auto] @min-[17.5rem]/sb:@max-[21rem]/sb:px-0.5",
  "@max-[17.5rem]/sb:flex @max-[17.5rem]/sb:flex-wrap @max-[17.5rem]/sb:gap-y-0.5 @max-[17.5rem]/sb:py-1",
);

/** A player whose personal data was erased: their place in the game, and nothing about them. */
function RemovedRow() {
  return (
    <li className={ROW} data-testid="participant" data-removed>
      <span className="col-start-1 row-span-2 row-start-1 grid h-6 w-6 place-items-center rounded bg-surface-3 text-fg-subtle @min-[30rem]/sb:h-7 @min-[30rem]/sb:w-7" aria-hidden>
        <UserX className="h-3.5 w-3.5" />
      </span>
      <span className="col-span-3 col-start-2 row-span-2 row-start-1 min-w-0 truncate text-xs text-fg-muted @min-[30rem]/sb:col-span-5" data-testid="participant-name">
        Removed player <span className="text-fg-subtle">· personal data erased</span>
      </span>
    </li>
  );
}

/**
 * "Met 4×" after a player's name: the player's recorded games with them in the list's season and
 * game mode, this one included (the count their games show), and those games on a press: Match
 * History's own list, filtered to them (Match History → Encounters).
 */
function MetChip({ met, href }: { met: MatchMeeting; href: string }) {
  const sides = metSides(met);
  return (
    <Link
      href={href}
      className="relative shrink-0 rounded px-0.5 text-2xs font-medium leading-4 tabular-nums text-fg-muted underline decoration-border-strong underline-offset-2 transition-colors hover:text-fg hover:decoration-accent focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:after:absolute pointer-coarse:after:-inset-2 pointer-coarse:after:content-['']"
      data-testid="participant-met"
      data-games={met.games}
    >
      {/* Read as "Met 4 times, this game included (3 against, 1 on the same team). Opens those games" (the sides in sr-only text, never a hover title). */}
      Met {formatCount(met.games)}
      <span aria-hidden>×</span>
      <span className="sr-only"> times, this game included ({sides}). Opens those games</span>
    </Link>
  );
}

/** A row's performance score: the score over its place among the ten, or MVP / ACE; a quiet stand-in while the timeline answers. */
function RowScore({ score, scoring, scored }: { score: PlayerScore | null; scoring: boolean; scored: number }) {
  if (scoring)
    return (
      <span className="block h-7 w-9 animate-pulse rounded bg-surface-3/60 motion-reduce:animate-none @max-[21rem]/sb:h-4" data-testid="participant-score" data-state="loading">
        <span className="sr-only">Scoring</span>
      </span>
    );
  if (!score) return <span className="block w-9" data-testid="participant-score" data-state="none" aria-hidden />;
  return (
    <span className="flex flex-col items-end gap-0.5 leading-none @max-[21rem]/sb:flex-row @max-[21rem]/sb:items-center @max-[21rem]/sb:gap-1" data-testid="participant-score" data-score={score.score} data-rank={score.rank} data-mvp={score.mvp || undefined} data-ace={score.ace || undefined}>
      <span className="text-sm font-semibold leading-none tabular-nums text-fg">{formatNumber(score.score, 1)}</span>
      <RankChip score={score} marks />
      <span className="sr-only">
        {`: performance score ${formatNumber(score.score, 1)}, ${formatOrdinal(score.rank)} of ${scored}`}
        {score.mvp ? ", MVP (the winning team's highest)" : score.ace ? ", ACE (the losing team's highest)" : ""}
      </span>
    </span>
  );
}

function Row({ x, champ, group, lane, rank, queueId, checking, met, meetHref, selection }: { x: DetailParticipant; champ: (id: string | null) => PortraitChampion; group: { index: number; label: string } | null; lane: boolean; rank: ParticipantRank | null; queueId: number | null; checking: boolean; met: MatchMeeting | null; meetHref: ((key: string) => string) | null; selection: RowSelection }) {
  if (x.removed) return <RemovedRow />;
  const c = champ(x.championId);
  const member = !!x.teamMember && !x.isPlayer;
  const selected = selection.selected === x.slot;
  const who = shownName(x, c.name);
  // The lane opponent's mark: on a phone the crossed swords after the name (the line under it holds
  // the build and the rank); from 30rem in the line under the name, after the champion: under a 36rem
  // scoreboard the swords, from 36rem "Lane", from 40rem "Lane opponent" (their words for screen
  // readers whatever shows). One of the two is displayed at a time.
  const lanePhone = lane ? (
    <span className="inline-flex shrink-0 items-center text-fg-muted @min-[30rem]/sb:hidden">
      <Swords className="h-3 w-3" aria-hidden />
      <span className="sr-only">Lane opponent</span>
    </span>
  ) : null;
  const laneMark = lane ? (
    <span className="hidden shrink-0 items-center gap-0.5 leading-4 text-fg-muted @min-[30rem]/sb:inline-flex" data-testid="lane-opponent-mark">
      <Swords className="h-3 w-3 @min-[36rem]/sb:hidden" aria-hidden />
      <span className="sr-only @min-[36rem]/sb:not-sr-only">Lane</span>
      <span className="sr-only @min-[40rem]/sb:not-sr-only"> opponent</span>
    </span>
  ) : null;
  return (
    <li
      className={cn(
        ROW,
        // The rank is its own target (its title) for a mouse only: by touch a tap on it is a tap on the row.
        "transition-colors [&_[data-testid=participant-met]]:z-20 pointer-fine:[&_[data-testid=participant-rank]]:relative pointer-fine:[&_[data-testid=participant-rank]]:z-20 [&_a]:relative [&_a]:z-20",
        selected ? "bg-surface-3 ring-1 ring-inset ring-accent/70" : x.isPlayer ? "bg-accent/10" : "hover:bg-surface-2/60",
      )}
      data-testid="participant"
      data-player={x.isPlayer || undefined}
      data-group={group ? group.index : undefined}
      data-lane={lane || undefined}
      data-member={member || undefined}
      data-slot={x.slot}
      data-selected={selected || undefined}
    >
      {/* The row is the button that inspects its player; the links and the "Met" chip stay their own targets above it (and, for a mouse, the rank). */}
      <button
        type="button"
        className="absolute inset-0 z-10 cursor-pointer rounded-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
        aria-current={selected ? "true" : undefined}
        aria-label={`Inspect ${who}, ${c.name}`}
        tabIndex={selected ? 0 : -1}
        onClick={(e) => selection.onSelect(x.slot, e.currentTarget)}
        data-testid="participant-select"
        data-slot={x.slot}
      />
      {group ? <span className={cn("absolute inset-y-1 left-0 w-[3px] rounded-r-full", GROUP_MARK[group.index] ?? GROUP_MARK[0])} aria-hidden /> : null}
      <span className="relative col-start-1 row-span-2 row-start-1 shrink-0 self-center">
        <ChampionPortrait champion={c} size="xs" className={cn("h-6 w-6 @min-[30rem]/sb:h-7 @min-[30rem]/sb:w-7", member && "ring-2 ring-fg-muted/70")} />
        {x.champLevel !== null ? <span className="absolute -bottom-1 -right-1 rounded bg-bg px-0.5 text-4xs font-semibold tabular-nums leading-3 text-fg-muted">{x.champLevel}</span> : null}
      </span>
      <span className="col-start-2 row-start-1 flex min-w-0 items-center gap-1.5 self-end leading-4 @max-[17.5rem]/sb:basis-[calc(100%-2rem)]">
        <span className={cn("min-w-0 truncate text-xs leading-4 @min-[30rem]/sb:text-sm @min-[30rem]/sb:leading-4", x.isPlayer || member ? "font-semibold text-fg" : "text-fg")} title={who} data-testid="participant-name">
          <PlayerLink memberId={x.memberId} opgg={x.opgg} label={who}>
            {who}
          </PlayerLink>
          {group ? <span className="sr-only"> ({group.label.toLowerCase()})</span> : null}
        </span>
        {lanePhone}
        {met && meetHref ? <MetChip met={met} href={meetHref(met.key)} /> : null}
      </span>
      {/* Under the name: on a phone the build and the rank; from 30rem the champion, the lane mark and the rank. */}
      <span className="col-start-2 row-start-2 flex min-w-0 items-center gap-1 self-start text-2xs @min-[17.5rem]/sb:@max-[21rem]/sb:col-end-5 @min-[30rem]/sb:gap-1.5 leading-4 text-fg-muted @max-[17.5rem]/sb:basis-full @max-[17.5rem]/sb:flex-wrap">
        <span className="shrink-0 [--icon-size:1rem] @min-[30rem]/sb:hidden" data-testid="participant-items-phone">
          <ItemRow items={x.items} size={16} />
        </span>
        <span className="hidden shrink-0 whitespace-nowrap @min-[30rem]/sb:inline" data-testid="participant-champion">
          {c.name}
        </span>
        {laneMark}
        {rank ? <RankBadge rank={rank} queueId={queueId} checking={checking && rank.stale} /> : null}
      </span>
      <span className="col-start-3 row-start-1 self-end text-right text-sm font-semibold leading-4 tabular-nums text-fg @min-[30rem]/sb:row-span-2 @min-[30rem]/sb:self-center" data-testid="participant-kda">
        {x.kills}/{x.deaths}/{x.assists}
      </span>
      <span className="col-start-4 row-span-2 row-start-1 hidden @min-[30rem]/sb:block @min-[30rem]/sb:[--icon-size:1.125rem] @min-[36rem]/sb:[--icon-size:1.25rem]" data-testid="participant-items">
        <ItemRow items={x.items} size={20} />
      </span>
      <span className="col-start-3 row-start-2 self-start whitespace-nowrap text-right text-2xs leading-4 tabular-nums text-fg-muted @min-[17.5rem]/sb:@max-[21rem]/sb:col-end-5 @min-[17.5rem]/sb:@max-[21rem]/sb:justify-self-end @min-[30rem]/sb:col-start-5 @min-[30rem]/sb:row-span-2 @min-[30rem]/sb:row-start-1 @min-[30rem]/sb:self-center" data-testid="participant-cs">
        <span className="font-medium text-fg">{x.cs === null ? "—" : formatCount(x.cs)}</span>
        <span className="@min-[17.5rem]/sb:@max-[21rem]/sb:sr-only"> CS</span>
        <span className="hidden @min-[30rem]/sb:inline">
          <br />
        </span>
        <span className="px-0.5 @min-[30rem]/sb:hidden">·</span>
        <span className="font-medium text-fg" title={x.damage === null ? undefined : `${formatCount(x.damage)} damage to champions`}>
          {x.damage === null ? "—" : formatKilo(x.damage)}
        </span>
        <span className="hidden @min-[30rem]/sb:inline"> dmg</span>
        <span className="sr-only @min-[30rem]/sb:hidden"> damage</span>
      </span>
      <span className="col-start-4 row-span-2 row-start-1 self-center justify-self-end @min-[17.5rem]/sb:@max-[21rem]/sb:row-span-1 @min-[17.5rem]/sb:@max-[21rem]/sb:self-end @min-[17.5rem]/sb:@max-[21rem]/sb:pl-1.5 @min-[30rem]/sb:col-start-6">
        <RowScore score={selection.score(x.slot)} scoring={selection.scoring} scored={selection.scored} />
      </span>
    </li>
  );
}
