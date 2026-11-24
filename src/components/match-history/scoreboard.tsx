"use client";

import Link from "next/link";
import { Clock3, Swords, UserX } from "lucide-react";
import type { MatchGroupsResult, MatchGroupsTeam, MatchGroupView } from "@/server/matches/possible-groups";
import { groupEvidenceText, groupsNoteState } from "@/domain/possible-groups";
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
import { Badge } from "@/components/ui/badge";
import { TIER_TEXT } from "./rank-short";
import { PlayerLink } from "./player-link";
import { IconImg, ItemRow } from "./icon-img";

/*
  A game's scoreboard: both teams, the player's first, each in lane order. Every row is one player:
  champion (level, spells, keystone), name and rank (read around the game, or marked), KDA with kill
  participation, damage to champions with its share of the team's, gold, CS and vision, and the
  final items. The player's row is lit, team members carry their profile name in the accent colour
  and the lane opponent is marked. Under a card, a player the player met in other games of the
  list's season and game mode carries "Met N×", which opens their Encounters window. The columns
  follow the room the breakdown has (a container query, so the same scoreboard fits a match card's
  expansion and the match window): every figure on one line from 60rem, the figures grouped under
  the damage bar from 36rem, and on a phone the items and the damage on one line under each player,
  the other figures on the next.
*/

const OBJECTIVES: Array<[string, string, string]> = [
  ["tower", "tower", "towers"],
  ["dragon", "dragon", "dragons"],
  ["baron", "baron", "barons"],
  ["horde", "voidgrub", "voidgrubs"],
  ["riftHerald", "herald", "heralds"],
  ["inhibitor", "inhibitor", "inhibitors"],
];

/** The two possible groups a team can hold at most (5 players), told apart by colour. */
const GROUP_MARK = ["bg-accent", "bg-warn"];

/** One row's grid at each width of the breakdown (see the note above). */
// The items take a fixed width on the one-line layout (seven 24px icons), so the column names line up.
const ROW = "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 @min-[36rem]/bd:grid-cols-[minmax(0,1.4fr)_5.5rem_minmax(7rem,1fr)_auto] @min-[60rem]/bd:grid-cols-[minmax(0,1.6fr)_6rem_8.5rem_4.5rem_4.5rem_3.5rem_11.5rem] @min-[60rem]/bd:gap-x-4";

const pctText = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);
const intText = (v: number | null) => (v === null ? "—" : formatCount(v));
const decText = (v: number | null, digits = 1) => (v === null ? "—" : v.toFixed(digits));

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

export function TeamTable({ team, champ, maxDamage, groups, laneSlot, rankOf, queueId, checking, met, meetHref, compact = false, selection = null }: { team: DetailTeam; champ: (id: string | null) => PortraitChampion; maxDamage: number; groups: MatchGroupsTeam | null; /** The player's lane opponent, by place in the record. */ laneSlot: number | null; /** The post-game view's scoreboard (CompactRow): K/D/A, the build, CS and damage, the player's other figures left to their tiles. */ compact?: boolean; selection?: RowSelection | null } & RankProps & MeetProps) {
  // The post-game scoreboard keeps the band to one line: kills, gold, towers, dragons and barons.
  const objectives = OBJECTIVES.filter(([k]) => team.objectives[k] !== undefined && (!compact || k === "tower" || k === "dragon" || k === "baron"));
  const found = groups?.groups ?? [];
  const groupOf = new Map(found.flatMap((g, i) => g.slots.map((s) => [s, { index: i, label: g.label }] as const)));
  const nameOf = (slot: number) => {
    const x = team.participants.find((p) => p.slot === slot);
    if (x?.removed) return "Removed player";
    return x ? (x.teamMember ?? x.name?.split("#")[0] ?? champ(x.championId).name) : "Player";
  };
  return (
    <section className={cn("overflow-hidden rounded-panel border bg-surface", team.win ? "border-blue/35" : "border-red/35")} data-testid={`team-${team.side}`} aria-label={`${team.side === "blue" ? "Blue" : "Red"} team, ${team.win ? "victory" : "defeat"}`}>
      {/* The team's band: its side and result first (the word, never the colour alone), then its totals, each number brighter than its word. */}
      <header className={cn("flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-b px-3 text-xs", compact ? "py-1.5" : "py-2", team.win ? "border-blue/25 bg-blue/10" : "border-red/25 bg-red/10")}>
        <span className="flex items-center gap-2">
          <span className={cn("font-semibold uppercase tracking-label", team.side === "blue" ? "text-blue" : "text-red")}>{team.side === "blue" ? "Blue side" : "Red side"}</span>
          <Badge tone={team.win ? "blue" : "red"} className="font-semibold">
            {team.win ? "Victory" : "Defeat"}
          </Badge>
        </span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-fg-muted">
          <span>
            <span className="font-semibold tabular-nums text-fg">{team.kills}</span> kills
          </span>
          {team.gold !== null ? (
            <span>
              <span className="font-semibold tabular-nums text-fg">{formatKilo(team.gold)}</span> gold
            </span>
          ) : null}
          {objectives.map(([k, one, many]) => (
            <span key={k}>
              <span className="font-semibold tabular-nums text-fg">{team.objectives[k]}</span> {team.objectives[k] === 1 ? one : many}
            </span>
          ))}
          {team.bans.length && !compact ? (
            <span className="flex items-center gap-1" data-testid="team-bans">
              Bans
              {team.bans.map((b) => (
                <ChampionPortrait key={b} champion={champ(b)} size="xs" dimmed title={`Banned: ${champ(b).name}`} className="h-5 w-5 rounded text-4xs" />
              ))}
            </span>
          ) : null}
        </span>
      </header>
      {found.length ? (
        <div className="space-y-1 border-b border-border/70 px-3 py-1.5" data-testid="possible-groups">
          {found.map((g, i) => (
            <GroupLine key={g.slots.join()} group={g} mark={GROUP_MARK[i] ?? GROUP_MARK[0]!} names={g.slots.map(nameOf)} />
          ))}
        </div>
      ) : null}
      {compact ? (
        <ul className="divide-y divide-border/70">
          {team.participants.map((x, i) => (
            <CompactRow key={i} x={x} champ={champ} group={groupOf.get(x.slot) ?? null} lane={laneSlot !== null && x.slot === laneSlot} rank={rankOf(x)} queueId={queueId} checking={checking} met={meetHref ? (met?.get(x.slot) ?? null) : null} meetHref={meetHref ?? null} selection={selection} />
          ))}
        </ul>
      ) : null}
      {compact ? null : (
        <>
          {/* Column names over the one-line layout only: below it each figure says what it is. */}
          <div className={cn(ROW, "hidden border-b border-border bg-surface-2/60 px-3 py-1.5 text-2xs font-semibold uppercase tracking-label text-fg-subtle @min-[60rem]/bd:grid")} aria-hidden>
            <span>Player</span>
            <span>KDA · KP</span>
            <span>Damage</span>
            <span>Gold</span>
            <span>CS</span>
            <span>Vision</span>
            <span>Items</span>
          </div>
          <ul className="divide-y divide-border">
            {team.participants.map((x, i) => (
              <ParticipantRow key={i} x={x} champ={champ} maxDamage={maxDamage} group={groupOf.get(x.slot) ?? null} lane={laneSlot !== null && x.slot === laneSlot} rank={rankOf(x)} queueId={queueId} checking={checking} met={meetHref ? (met?.get(x.slot) ?? null) : null} meetHref={meetHref ?? null} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/**
 * A player's rank, compact (domain/known-rank.ts): the tier's crest and "Gold 2" (a rank in the
 * match's other ranked queue is marked "Flex" or "Solo"; one read over a month ago carries its
 * month), "Unranked" when a check found no ranked entry, and "—" when nothing is known. A clock
 * marks a rank read away from the game (later, or before it): not the rank at the time of the game.
 * One being checked pulses until the answer arrives.
 */
function RankBadge({ rank, queueId, checking }: { rank: ParticipantRank; queueId: number | null; checking: boolean }) {
  // It may shrink (its text then ends in an ellipsis; the whole rank is in its title and for screen
  // readers), so on a narrow phone a long rank, or the pulsing stand-in while ranks are checked, never
  // reaches into the KDA column beside it.
  // Under 16rem (a phone at 200% text) it wraps onto a second line rather than shorten the rank.
  const base = "inline-flex h-4 min-w-0 items-center gap-1 rounded border px-1 text-2xs font-medium leading-4 @max-[16rem]/sb:h-auto";
  if (checking && rank.state === "unknown")
    return (
      <span className={cn(base, "w-10 shrink animate-pulse border-dashed border-border motion-reduce:animate-none")} data-testid="participant-rank" data-state="checking">
        <span className="sr-only">Checking rank</span>
      </span>
    );
  const { text, queueMark, spoken, title, aroundGame } = rankBadgeLabel(rank, queueId);
  const shortLabel = rankShortLabel(rank, queueId);
  const short = shortLabel.text ? shortLabel : null;
  // The tier in its own colour (5:1 or more on the panels) when it is the rank around the game; one read away from it stays in the quiet caption colour.
  const tierColour = rank.state === "ranked" && rank.tier && aroundGame !== false ? (TIER_TEXT[rank.tier] ?? "text-fg-muted") : null;
  return (
    <span className={cn(base, rank.state === "ranked" ? cn("border-border-strong/70", tierColour ?? "text-fg-muted") : rank.state === "unranked" ? "border-border text-fg-subtle" : "border-dashed border-border text-fg-subtle")} title={title} data-testid="participant-rank" data-state={rank.state} data-queue={rank.queue ?? undefined} data-timing={rank.timing ?? undefined}>
      {rank.state === "ranked" ? <RankEmblem tier={rank.tier} className="-ml-px h-3 w-3 shrink-0" /> : null}
      {/* In a post-game scoreboard 30–36rem wide (a desktop with the sidebar open) the short form a match card uses ("E2"), so the champion beside it is never cut; the whole rank stays in the title and the screen reader's words. */}
      <span aria-hidden className="min-w-0 truncate @max-[16rem]/sb:whitespace-normal" data-testid="participant-rank-text" data-text={`${queueMark ? `${queueMark} ` : ""}${text}`}>
        <span className={cn(short && "@min-[30rem]/sb:@max-[36rem]/sb:hidden")}>
          {queueMark ? <span className="text-fg-subtle">{queueMark} </span> : null}
          {text}
        </span>
        {short ? (
          <span className="hidden @min-[30rem]/sb:@max-[36rem]/sb:inline">
            {short.text}
            {short.queueMark ? <span className="ml-px align-top text-4xs font-medium leading-none text-fg-subtle">{short.queueMark}</span> : null}
          </span>
        ) : null}
      </span>
      {aroundGame === false ? <Clock3 className="-mr-px h-2.5 w-2.5 shrink-0 text-fg-subtle" aria-hidden data-testid="rank-read-later" /> : null}
      <span className="sr-only">{spoken}</span>
    </span>
  );
}

/**
 * Under the scoreboard, one line: whether the ranks are the ones around this game or were read
 * away from it (the clock), and the state of a rank check that could not ask for every player. What
 * a rank is, and is not, is in its (i).
 */
export function RanksNote({ ranks, queueId, checking, result }: { ranks: ReadonlyArray<ParticipantRank | null>; queueId: number | null; checking: boolean; result: MatchRanksResult | null }) {
  const { around, away } = rankTimingCounts(ranks.filter((r): r is ParticipantRank => r !== null));
  const check = result?.status === "ok" ? result.check : null;
  const status = checking
    ? "Checking ranks with Riot…"
    : check?.reason === "budget"
      ? "Today's rank checks are used up, so some ranks are older or missing."
      : check?.reason === "busy"
        ? "Riot was busy, so some ranks were not checked; they are checked when this game is next opened."
        : check?.failed
          ? `Riot did not answer for ${check.failed === 1 ? "one player" : `${check.failed} players`}; they are checked again later.`
          : null;
  // The clock as on the badges; screen readers hear words in its place.
  const clock = (words: string) => (
    <>
      <Clock3 className="inline h-2.5 w-2.5 align-[-1px]" aria-hidden />
      <span className="sr-only">{words}</span>
    </>
  );
  const lead =
    around + away === 0 ? (
      checking ? null : (
        "No ranks read for these players yet."
      )
    ) : away === 0 ? (
      "Ranks around the time of this game."
    ) : around === 0 ? (
      <>Ranks read later {clock("(marked)")}, not at the time of this game.</>
    ) : (
      <>Ranks around the time of this game; {clock("marked ones were")} read later.</>
    );
  const queue = matchRankQueue(queueId) === "flex" ? "Flex ranks, as this is a Flex game, unless marked Solo/Duo" : "Solo/Duo ranks unless marked Flex";
  return (
    <p className="text-2xs text-fg-subtle" data-testid="ranks-note" data-state={checking ? "checking" : (check?.reason ?? (check?.failed ? "failed" : "done"))} data-around={around} data-away={away}>
      {lead ? <span data-testid="ranks-note-lead">{lead}</span> : null}{" "}
      <InfoTip
        label="About the ranks"
        testId="ranks-info"
        text={`Ranks were checked around the time of this game. A clock means it was checked well before or after, so it may differ. ${queue}.`}
      />
      {status ? <span className="text-fg-muted"> {status}</span> : null}
    </p>
  );
}

/**
 * One possible group above its team's rows: who, and how many earlier stored games back it (the
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
          <span className="basis-full pl-[9px] text-fg-subtle sm:basis-auto sm:pl-0" data-testid="possible-group-games">
            {groupEvidenceText(g.slots.length, g.games, g.opposed)}
          </span>
          <span className="sr-only">Show the games</span>
        </span>
      }
    >
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

/**
 * What the possible groups are based on, under the scoreboard, in one line: which sides could not be
 * assessed and how many stored games were searched, with the rules in its (i). Absence of a group is
 * never presented as "no premade": most players appear in stored games only when they shared a game
 * with a member.
 */
export function GroupsNote({ result, teams }: { result: MatchGroupsResult | null; teams: DetailTeam[] }) {
  if (!result) return <p className="text-2xs text-fg-subtle" data-testid="possible-groups-note" data-state="loading">Checking stored games for players who may have queued together…</p>;
  if (result.status !== "ok") return null;
  const side = (teamId: number) => (teams.find((t) => t.teamId === teamId)?.side === "blue" ? "Blue side" : "Red side");
  if (result.teams.some((t) => t.note === "clash")) return <p className="text-2xs text-fg-subtle" data-testid="possible-groups-note" data-state="clash">Clash: each side is a registered team of five, so no groups are inferred.</p>;
  if (result.teams.every((t) => t.note === "not-assessed")) return <p className="text-2xs text-fg-subtle" data-testid="possible-groups-note" data-state="not-assessed">Possible groups are only assessed for matchmade queues.</p>;
  // One statement: the inference (only when a side has a group) and then the sides it could not
  // cover, or that there was not enough recorded history, or that there was nobody to assess.
  const note = groupsNoteState(result.teams);
  const sides = (ids: number[]) => ids.map(side).join(" and ");
  return (
    <p className="text-2xs text-fg-subtle" data-testid="possible-groups-note" data-state="ok" data-kind={note.kind}>
      {note.kind === "inferred" ? (
        <>
          Possible groups: an inference from {formatCount(result.gamesSearched)} earlier recorded {result.gamesSearched === 1 ? "game" : "games"}.
          {note.thin.length ? (
            <span className="text-fg-muted" data-testid="possible-groups-insufficient">
              {" "}
              {sides(note.thin)}: not enough recorded history to assess possible groups.
            </span>
          ) : null}
        </>
      ) : note.kind === "insufficient" ? (
        <span className="text-fg-muted" data-testid="possible-groups-insufficient">
          Possible groups: not enough recorded history to assess.
        </span>
      ) : (
        <span className="text-fg-muted">Possible groups: no other players to assess.</span>
      )}
      {note.kind !== "nobody" && note.nobody.length ? <span className="text-fg-muted"> {sides(note.nobody)}: no other players to assess.</span> : null}{" "}
      <InfoTip
        label="About possible groups"
        testId="groups-info"
        text={`Non-members on one team in 3+ earlier games (the ${result.windowDays} days before), rarely opposed. A guess, not a confirmed party; members never labelled.`}
      />
    </p>
  );
}

/** A player whose personal data was erased: their place in the game, and nothing about them. */
function RemovedRow() {
  return (
    <li className="flex items-center gap-2 px-3 py-1.5" data-testid="participant" data-removed>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface-3 text-fg-subtle" aria-hidden>
        <UserX className="h-4 w-4" />
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-sm text-fg-muted" data-testid="participant-name">
          Removed player
        </span>
        <span className="block text-2xs text-fg-subtle">Their personal data was erased; nothing about them is kept.</span>
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
      className="relative shrink-0 rounded border border-border px-1 text-2xs font-medium leading-4 tabular-nums text-fg-muted transition-colors hover:border-accent/50 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:after:absolute pointer-coarse:after:-inset-2 pointer-coarse:after:content-['']"
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

/**
 * One player in the post-game scoreboard, about 37px on a wide column and two lines of about 48px
 * on a phone (@container/sb under 30rem): the portrait with its level, the name over the champion
 * and rank, the K/D/A, the build (six items and the trinket), and CS over damage. Each figure of
 * the player's own is said once in the view, in its tiles, so the rows carry no ratio, share or
 * per-minute figure. Team members are marked by weight and a ring on the portrait, not by colour.
 */
/** A row's performance score: the score over its place among the ten, or MVP / ACE; a quiet stand-in while the timeline answers. */
function RowScore({ score, scoring, scored }: { score: PlayerScore | null; scoring: boolean; scored: number }) {
  if (scoring)
    return (
      <span className="block h-4 w-9 animate-pulse rounded bg-surface-3/60 motion-reduce:animate-none @min-[30rem]/sb:h-7" data-testid="participant-score" data-state="loading">
        <span className="sr-only">Scoring</span>
      </span>
    );
  if (!score) return <span className="block w-9" data-testid="participant-score" data-state="none" aria-hidden />;
  return (
    <span className="flex items-center gap-1 leading-tight @min-[30rem]/sb:w-10 @min-[30rem]/sb:flex-col @min-[30rem]/sb:gap-0.5" data-testid="participant-score" data-score={score.score} data-rank={score.rank} data-mvp={score.mvp || undefined} data-ace={score.ace || undefined}>
      <span className="text-sm font-semibold leading-none tabular-nums text-fg">{formatNumber(score.score, 1)}</span>
      <RankChip score={score} marks />
      <span className="sr-only">
        {`: performance score ${formatNumber(score.score, 1)}, ${formatOrdinal(score.rank)} of ${scored}`}
        {score.mvp ? ", MVP (the winning team's highest)" : score.ace ? ", ACE (the losing team's highest)" : ""}
      </span>
    </span>
  );
}

function CompactRow({ x, champ, group, lane, rank, queueId, checking, met, meetHref, selection }: { x: DetailParticipant; champ: (id: string | null) => PortraitChampion; group: { index: number; label: string } | null; lane: boolean; rank: ParticipantRank | null; queueId: number | null; checking: boolean; met: MatchMeeting | null; meetHref: ((key: string) => string) | null; selection: RowSelection | null }) {
  if (x.removed) return <RemovedRow />;
  const c = champ(x.championId);
  const member = !!x.teamMember && !x.isPlayer;
  const selected = !!selection && selection.selected === x.slot;
  const who = x.teamMember && !x.isPlayer ? x.teamMember : x.name ? x.name.split("#")[0] : c.name;
  // One grid, placed by the scoreboard's width: from 30rem one row (the portrait, the name over the
  // champion and rank, the K/D/A, the build, CS over damage, the score). Under it, with the score
  // (Release 16), three lines: the name, the K/D/A and the score; the build and CS with damage; the
  // lane mark and the rank across the row, so the rank is never squeezed to a letter. Under 16rem (a
  // phone at 200% text) everything stacks: the name; the K/D/A and the score; the build; the rank;
  // CS with damage. The champion is left to its portrait under 30rem.
  const p = (wide: string, phone: string, narrow: string) => (selection ? cn(phone, narrow, wide) : null);
  return (
    <li
      className={cn(
        "relative grid items-center gap-x-2 gap-y-0.5 px-2.5 py-1 @max-[16rem]/sb:px-1.5 @min-[36rem]/sb:gap-x-3 @min-[30rem]/sb:gap-y-0 @min-[30rem]/sb:py-px",
        selection ? "grid-cols-[auto_minmax(0,1fr)_auto_auto] @max-[16rem]/sb:grid-cols-[auto_minmax(0,1fr)] @min-[30rem]/sb:grid-cols-[auto_minmax(0,1fr)_auto_auto_auto_auto]" : "grid-cols-[auto_auto_minmax(0,1fr)_auto] @min-[30rem]/sb:grid-cols-[auto_minmax(0,1fr)_auto_auto_auto]",
        // The links, the "Met" chip and the rank stay their own targets above the row's one button.
        selection && "transition-colors [&_[data-testid=participant-met]]:z-20 [&_[data-testid=participant-rank]]:relative [&_[data-testid=participant-rank]]:z-20 [&_a]:relative [&_a]:z-20",
        selected ? "bg-surface-3 ring-1 ring-inset ring-accent/70" : x.isPlayer ? "bg-accent/10" : selection && "hover:bg-surface-2/70",
      )}
      data-testid="participant"
      data-player={x.isPlayer || undefined}
      data-group={group ? group.index : undefined}
      data-lane={lane || undefined}
      data-member={member || undefined}
      data-slot={x.slot}
      data-selected={selected || undefined}
    >
      {selection ? (
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
      ) : null}
      {group ? <span className={cn("absolute inset-y-1 left-0 w-[3px] rounded-r-full", GROUP_MARK[group.index] ?? GROUP_MARK[0])} aria-hidden /> : null}
      <span className={p("", "relative row-span-2 shrink-0 self-center col-start-1 row-start-1", "@max-[16rem]/sb:row-span-1") ?? "relative row-span-2 shrink-0 self-center"}>
        <ChampionPortrait champion={c} size="xs" className={cn(member && "ring-2 ring-fg-muted/70")} />
        {x.champLevel !== null ? <span className="absolute -bottom-1 -right-1 rounded bg-bg px-0.5 text-4xs font-semibold tabular-nums leading-3 text-fg-muted">{x.champLevel}</span> : null}
      </span>
      <span className={p("@min-[30rem]/sb:self-end", "flex min-w-0 items-center gap-1.5 leading-tight col-start-2 row-start-1", "") ?? "col-span-2 flex min-w-0 items-center gap-1.5 leading-tight @min-[30rem]/sb:col-span-1 @min-[30rem]/sb:self-end"}>
        <span className={cn("min-w-0 truncate text-xs leading-tight @min-[30rem]/sb:text-sm @min-[30rem]/sb:leading-tight", x.isPlayer || member ? "font-semibold text-fg" : "text-fg")} title={x.name ?? undefined} data-testid="participant-name">
          <PlayerLink memberId={x.memberId} opgg={x.opgg} label={x.teamMember ?? x.name?.split("#")[0] ?? c.name}>
            {x.teamMember && !x.isPlayer ? x.teamMember : x.name ? x.name.split("#")[0] : c.name}
          </PlayerLink>
          {group ? <span className="sr-only"> ({group.label.toLowerCase()})</span> : null}
        </span>
        {met && meetHref ? <MetChip met={met} href={meetHref(met.key)} /> : null}
      </span>
      <span className={p("@min-[30rem]/sb:col-start-3 @min-[30rem]/sb:row-span-2", "text-right text-sm font-semibold tabular-nums text-fg col-start-3 row-start-1", "@max-[16rem]/sb:col-start-1 @max-[16rem]/sb:col-span-2 @max-[16rem]/sb:row-start-2 @max-[16rem]/sb:justify-self-start") ?? "col-start-4 row-start-1 text-right text-sm font-semibold tabular-nums text-fg @min-[30rem]/sb:col-start-3 @min-[30rem]/sb:row-span-2"} data-testid="participant-kda">
        {x.kills}/{x.deaths}/{x.assists}
      </span>
      <span className={p("@min-[30rem]/sb:col-start-4 @min-[30rem]/sb:row-span-2 @min-[30rem]/sb:row-start-1 @min-[30rem]/sb:[--icon-size:1.125rem] @min-[36rem]/sb:[--icon-size:1.25rem]", "min-w-0 col-start-2 row-start-2 [--icon-size:1rem]", "@max-[16rem]/sb:col-start-1 @max-[16rem]/sb:col-span-2 @max-[16rem]/sb:row-start-3 @max-[16rem]/sb:[&>[role=img]]:flex-wrap") ?? "col-start-2 row-start-2 [--icon-size:1rem] @min-[30rem]/sb:col-start-4 @min-[30rem]/sb:row-span-2 @min-[30rem]/sb:row-start-1 @min-[30rem]/sb:[--icon-size:1.25rem]"} data-testid="participant-items">
        <ItemRow items={x.items} size={20} />
      </span>
      <span className={p("@min-[30rem]/sb:col-span-1 @min-[30rem]/sb:col-start-2 @min-[30rem]/sb:row-start-2 @min-[30rem]/sb:self-start", "flex min-w-0 items-center gap-1 text-2xs leading-tight text-fg-muted col-start-2 col-span-3 row-start-3 empty:hidden", "@max-[16rem]/sb:col-start-1 @max-[16rem]/sb:col-span-2 @max-[16rem]/sb:row-start-4 @max-[16rem]/sb:flex-wrap") ?? "col-start-3 row-start-2 flex min-w-0 items-center gap-1 text-2xs leading-tight text-fg-muted @min-[30rem]/sb:col-start-2 @min-[30rem]/sb:self-start"}>
        {/* The champion whole, always (it shrinks for nothing); the rank beside it gives way. */}
        <span className="hidden shrink-0 whitespace-nowrap @min-[30rem]/sb:inline" data-testid="participant-champion">
          {c.name}
        </span>
        {lane ? (
          // Under a 36rem scoreboard an icon (its words for screen readers), from 36rem "Lane", from 40rem "Lane opponent".
          <span className="inline-flex shrink-0 items-center rounded border border-border px-1 leading-4 text-fg-muted" data-testid="lane-opponent-mark">
            <Swords className="h-3 w-3 @min-[36rem]/sb:hidden" aria-hidden />
            <span className="sr-only @min-[36rem]/sb:not-sr-only">Lane</span>
            <span className="sr-only @min-[40rem]/sb:not-sr-only @min-[40rem]/sb:ml-1"> opponent</span>
          </span>
        ) : null}
        {rank ? <RankBadge rank={rank} queueId={queueId} checking={checking && rank.stale} /> : null}
      </span>
      <span className={p("@min-[30rem]/sb:col-span-1 @min-[30rem]/sb:col-start-5 @min-[30rem]/sb:row-span-2 @min-[30rem]/sb:row-start-1 @min-[30rem]/sb:w-16", "whitespace-nowrap text-right text-2xs leading-tight tabular-nums text-fg-muted col-start-3 col-span-2 row-start-2", "@max-[16rem]/sb:col-start-1 @max-[16rem]/sb:col-span-2 @max-[16rem]/sb:row-start-5 @max-[16rem]/sb:text-left") ?? "col-start-4 row-start-2 whitespace-nowrap text-right text-2xs leading-tight tabular-nums text-fg-muted @min-[30rem]/sb:col-start-5 @min-[30rem]/sb:row-span-2 @min-[30rem]/sb:row-start-1 @min-[30rem]/sb:w-16"} data-testid="participant-cs">
        <span className="font-medium text-fg">{intText(x.cs)}</span> CS
        <span className="@max-[30rem]/sb:hidden">
          <br />
        </span>
        <span className="@min-[30rem]/sb:hidden"> · </span>
        <span className="font-medium text-fg">{x.damage === null ? "—" : formatKilo(x.damage)}</span>
        <span className="@max-[30rem]/sb:hidden"> dmg</span>
      </span>
      {/* On a phone the score sits on the first line beside the K/D/A (CS and damage under both); from 30rem its own column over both lines. */}
      {selection ? (
        <span className="col-start-4 row-start-1 self-center justify-self-end @max-[16rem]/sb:col-start-1 @max-[16rem]/sb:col-span-2 @max-[16rem]/sb:row-start-2 @min-[30rem]/sb:col-start-6 @min-[30rem]/sb:row-span-2">
          <RowScore score={selection.score(x.slot)} scoring={selection.scoring} scored={selection.scored} />
        </span>
      ) : null}
    </li>
  );
}

function ParticipantRow({ x, champ, maxDamage, group, lane, rank, queueId, checking, met, meetHref }: { x: DetailParticipant; champ: (id: string | null) => PortraitChampion; maxDamage: number; group: { index: number; label: string } | null; lane: boolean; rank: ParticipantRank | null; queueId: number | null; checking: boolean; met: MatchMeeting | null; meetHref: ((key: string) => string) | null }) {
  if (x.removed) return <RemovedRow />;
  const c = champ(x.championId);
  const kda = x.deaths === 0 ? "Perfect" : x.kda.toFixed(2);
  const share = x.damageShare === null ? null : pctText(x.damageShare);
  return (
    <li className={cn("relative px-3 py-2 transition-colors", ROW, x.isPlayer ? "bg-accent/10" : "hover:bg-surface-2/70")} data-testid="participant" data-player={x.isPlayer || undefined} data-group={group ? group.index : undefined} data-lane={lane || undefined}>
      {group ? <span className={cn("absolute inset-y-1.5 left-0 w-[3px] rounded-r-full", GROUP_MARK[group.index] ?? GROUP_MARK[0])} aria-hidden /> : null}
      <span className="flex min-w-0 items-center gap-2">
        <span className="relative shrink-0">
          <ChampionPortrait champion={c} size="sm" />
          {x.champLevel !== null ? (
            <span className="absolute -bottom-1 -right-1 rounded bg-bg px-0.5 text-2xs font-semibold tabular-nums text-fg-muted" title={`Level ${x.champLevel}`}>
              {x.champLevel}
            </span>
          ) : null}
        </span>
        <span className="hidden flex-col gap-0.5 @min-[28rem]/bd:flex">
          <span className="flex gap-0.5">{x.spells?.map((s, i) => <IconImg key={i} icon={s} size={14} />)}</span>
          <IconImg icon={x.keystone} size={14} rounded="rounded-full" />
        </span>
        <span className="min-w-0 leading-tight">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className={cn("min-w-0 truncate text-sm", x.isPlayer ? "font-semibold text-fg" : "text-fg")} title={x.name ?? undefined} data-testid="participant-name">
              <PlayerLink memberId={x.memberId} opgg={x.opgg} label={x.teamMember ?? x.name?.split("#")[0] ?? c.name}>
                {x.name ? x.name.split("#")[0] : c.name}
              </PlayerLink>
              {group ? <span className="sr-only"> ({group.label.toLowerCase()})</span> : null}
            </span>
            {met && meetHref ? <MetChip met={met} href={meetHref(met.key)} /> : null}
          </span>
          <span className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-fg-muted">
            <span className="truncate">
              {c.name}
              {x.teamMember && !x.isPlayer ? <span className="text-accent"> · {x.teamMember}</span> : null}
            </span>
            {lane ? (
              <span className="shrink-0 rounded border border-border px-1 text-2xs leading-4 text-fg-muted" data-testid="lane-opponent-mark">
                Lane<span className="sr-only"> opponent</span>
              </span>
            ) : null}
            {rank ? <RankBadge rank={rank} queueId={queueId} checking={checking && rank.stale} /> : null}
          </span>
        </span>
      </span>
      <span className="text-right leading-tight @min-[36rem]/bd:text-left" data-testid="participant-kda">
        <span className="block text-sm font-semibold tabular-nums">
          {x.kills}/{x.deaths}/{x.assists}
        </span>
        <span className="block whitespace-nowrap text-xs tabular-nums text-fg-muted">
          {kda}
          {x.deaths === 0 ? "" : " KDA"}
          {x.killParticipation !== null ? ` · ${pctText(x.killParticipation)}` : ""}
          {x.killParticipation !== null ? <span className="sr-only"> kill participation</span> : null}
        </span>
      </span>
      {/* Damage, then (one-line layout) gold, CS and vision in their own columns; grouped under the
          bar below it. On a phone the items lead the damage's line, so a row is three lines. */}
      <span className="leading-tight @max-[36rem]/bd:col-span-2">
        <span className="flex items-center gap-1.5 text-xs tabular-nums text-fg-muted">
          <span className="shrink-0 @min-[36rem]/bd:hidden" data-testid="participant-items-phone">
            <ItemRow items={x.items} size={18} />
          </span>
          <span className="whitespace-nowrap" title={x.damage === null ? undefined : `${formatCount(x.damage)} damage to champions`}>
            <span className="font-medium text-fg">{x.damage === null ? "—" : formatKilo(x.damage)}</span> dmg{share ? ` · ${share}` : ""}
          </span>
          {/* Everyone's bar in a quiet grey, the player's own in the accent: who did the most stands out by length, the player by colour and their bold name. */}
          <span className="h-1.5 min-w-6 flex-1 overflow-hidden rounded-full bg-surface-3" aria-hidden>
            <span className={cn("block h-full rounded-full", x.isPlayer ? "bg-accent" : "bg-fg-muted/55")} style={{ width: `${Math.round(((x.damage ?? 0) / maxDamage) * 100)}%` }} />
          </span>
        </span>
        <span className="block truncate text-xs tabular-nums text-fg-subtle @min-[60rem]/bd:hidden">
          {x.gold === null ? "—" : formatKilo(x.gold)} gold · {intText(x.cs)} CS ({decText(x.csPerMin)}) · {intText(x.vision)} vision
        </span>
      </span>
      <span className="hidden leading-tight @min-[60rem]/bd:block" data-testid="participant-gold">
        <span className="block text-sm font-medium tabular-nums text-fg">{x.gold === null ? "—" : formatKilo(x.gold)}</span>
        <span className="block text-2xs tabular-nums text-fg-subtle">{decText(x.goldPerMin, 0)}/min</span>
      </span>
      <span className="hidden leading-tight @min-[60rem]/bd:block" data-testid="participant-cs">
        <span className="block text-sm font-medium tabular-nums text-fg">{intText(x.cs)}</span>
        <span className="block text-2xs tabular-nums text-fg-subtle">{decText(x.csPerMin)}/min</span>
      </span>
      <span className="hidden leading-tight @min-[60rem]/bd:block">
        <span className="block text-sm font-medium tabular-nums text-fg">{intText(x.vision)}</span>
        <span className="block text-2xs tabular-nums text-fg-subtle">
          {x.wardsPlaced === null ? "" : `${x.wardsPlaced} wards`}
          {x.wardsPlaced !== null && x.stats?.wardsKilled !== undefined ? <span className="sr-only">{` placed, ${x.stats.wardsKilled} destroyed`}</span> : null}
        </span>
      </span>
      <span className="hidden @min-[36rem]/bd:block">
        <span className="@min-[60rem]/bd:hidden">
          <ItemRow items={x.items} size={20} />
        </span>
        <span className="hidden @min-[60rem]/bd:block">
          <ItemRow items={x.items} size={24} />
        </span>
      </span>
    </li>
  );
}
