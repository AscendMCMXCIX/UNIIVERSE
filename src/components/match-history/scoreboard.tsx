"use client";

import { ChevronRight, Clock3, UserX } from "lucide-react";
import type { MatchGroupsResult, MatchGroupsTeam, MatchGroupView } from "@/server/matches/possible-groups";
import { groupEvidenceText, groupsNoteState } from "@/domain/possible-groups";
import type { DetailParticipant, DetailTeam, MatchRanksResult } from "@/server/players/match-history";
import type { MatchMeeting } from "@/server/players/encounters";
import { ChampionPortrait, type PortraitChampion } from "@/components/champion-portrait";
import { formatCount, formatDate, formatKilo } from "@/lib/format";
import { cn } from "@/lib/cn";
import { matchRankQueue, rankBadgeLabel, rankTimingCounts, type ParticipantRank } from "@/domain/known-rank";
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
  rankOf: (x: DetailParticipant) => ParticipantRank;
  queueId: number | null;
  /** The rank check is still answering. */
  checking: boolean;
}

/** The players met in the player's other games, by place in the record, and how to open one's Encounters window. */
export interface MeetProps {
  met?: ReadonlyMap<number, MatchMeeting>;
  onMeet?: ((x: DetailParticipant, key: string) => void) | null;
}

export function TeamTable({ team, champ, maxDamage, groups, laneSlot, rankOf, queueId, checking, met, onMeet }: { team: DetailTeam; champ: (id: string | null) => PortraitChampion; maxDamage: number; groups: MatchGroupsTeam | null; /** The player's lane opponent, by place in the record. */ laneSlot: number | null } & RankProps & MeetProps) {
  const objectives = OBJECTIVES.filter(([k]) => team.objectives[k] !== undefined);
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
      <header className={cn("flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-b px-3 py-2 text-xs", team.win ? "border-blue/25 bg-blue/10" : "border-red/25 bg-red/10")}>
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
          {team.bans.length ? (
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
          <ParticipantRow key={i} x={x} champ={champ} maxDamage={maxDamage} group={groupOf.get(x.slot) ?? null} lane={laneSlot !== null && x.slot === laneSlot} rank={rankOf(x)} queueId={queueId} checking={checking} met={onMeet ? (met?.get(x.slot) ?? null) : null} onMeet={onMeet ?? null} />
        ))}
      </ul>
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
  const base = "inline-flex h-4 shrink-0 items-center gap-1 rounded border px-1 text-2xs font-medium leading-4";
  if (checking && rank.state === "unknown")
    return (
      <span className={cn(base, "w-10 animate-pulse border-dashed border-border motion-reduce:animate-none")} data-testid="participant-rank" data-state="checking">
        <span className="sr-only">Checking rank</span>
      </span>
    );
  const { text, queueMark, spoken, title, aroundGame } = rankBadgeLabel(rank, queueId);
  // The tier in its own colour (5:1 or more on the panels) when it is the rank around the game; one read away from it stays in the quiet caption colour.
  const tierColour = rank.state === "ranked" && rank.tier && aroundGame !== false ? (TIER_TEXT[rank.tier] ?? "text-fg-muted") : null;
  return (
    <span className={cn(base, rank.state === "ranked" ? cn("border-border-strong/70", tierColour ?? "text-fg-muted") : rank.state === "unranked" ? "border-border text-fg-subtle" : "border-dashed border-border text-fg-subtle")} title={title} data-testid="participant-rank" data-state={rank.state} data-queue={rank.queue ?? undefined} data-timing={rank.timing ?? undefined}>
      {rank.state === "ranked" ? <RankEmblem tier={rank.tier} className="-ml-px h-3 w-3" /> : null}
      <span aria-hidden className="whitespace-nowrap" data-testid="participant-rank-text">
        {queueMark ? <span className="text-fg-subtle">{queueMark} </span> : null}
        {text}
      </span>
      {aroundGame === false ? <Clock3 className="-mr-px h-2.5 w-2.5 text-fg-subtle" aria-hidden data-testid="rank-read-later" /> : null}
      <span className="sr-only">{spoken}</span>
    </span>
  );
}

/**
 * Under the scoreboard, one line: whether the ranks are the ones around this game or were read
 * away from it (the clock), and the state of a rank check that could not ask for every player. What
 * a rank is, and is not, is in its (i).
 */
export function RanksNote({ ranks, queueId, checking, result }: { ranks: ParticipantRank[]; queueId: number | null; checking: boolean; result: MatchRanksResult | null }) {
  const { around, away } = rankTimingCounts(ranks);
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
  const queue = matchRankQueue(queueId) === "flex" ? "Ranked Flex ranks, as this is a Flex game (Solo/Duo where marked)" : "Ranked Solo/Duo ranks (Flex where marked)";
  return (
    <p className="text-2xs text-fg-subtle" data-testid="ranks-note" data-state={checking ? "checking" : (check?.reason ?? (check?.failed ? "failed" : "done"))} data-around={around} data-away={away}>
      {lead ? <span data-testid="ranks-note-lead">{lead}</span> : null}{" "}
      <InfoTip
        label="About the ranks"
        testId="ranks-info"
        text={`Riot's game records hold no ranks, so each rank is a reading: a member's last rank recorded before the game, or another player's rank checked with Riot within a day after it (the players of members' games are checked when a game is collected). A clock marks a rank read later than that, or before the game: the player's rank then, not at the time of this game. ${queue}. Unranked: no ranked entry when checked. —: not read.`}
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
    <details className="group/ev text-xs" data-testid="possible-group" data-size={g.slots.length}>
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded focus-visible:outline-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
        <span className={cn("h-3 w-[3px] shrink-0 rounded-full", mark)} aria-hidden />
        <span className="font-semibold text-fg">{g.label}</span>
        <span className="text-fg-muted">{names.join(", ")}</span>
        <span className="basis-full pl-[9px] text-fg-subtle sm:basis-auto sm:pl-0" data-testid="possible-group-games">
          {groupEvidenceText(g.slots.length, g.games, g.opposed)}
        </span>
        <ChevronRight className="h-3 w-3 shrink-0 text-fg-subtle transition-transform group-open/ev:rotate-90" aria-hidden />
        <span className="sr-only">Show the games</span>
      </summary>
      <ul className="mt-1 space-y-0.5 pb-0.5 pl-3 text-2xs tabular-nums text-fg-muted" data-testid="possible-group-evidence">
        {g.evidence.map((e, i) => (
          <li key={i}>
            {formatDate(new Date(e.playedAt))} · {e.queue} · <span className={e.win ? "text-blue" : "text-red"}>{e.win ? "Won" : "Lost"}</span>
          </li>
        ))}
        {more > 0 ? <li className="text-fg-subtle">and {more} earlier</li> : null}
      </ul>
    </details>
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
        text={`Possible groups only cover players who are not members: the same players all on one team in at least three of the earlier recorded games found for them (the ${result.windowDays} days before this match), and far more often as teammates than as opponents. They are an inference, not confirmed parties; members are never labelled, and players who rarely share a game with a member cannot be assessed.`}
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
 * game mode, this one included (the count their Encounters window shows), and the window on a press.
 */
function MetChip({ met, onOpen }: { met: MatchMeeting; onOpen: () => void }) {
  const sides = [met.opponent ? `${formatCount(met.opponent)} against` : null, met.ally ? `${formatCount(met.ally)} alongside` : null].filter(Boolean).join(", ");
  return (
    <button
      type="button"
      onClick={onOpen}
      title={`Met in ${formatCount(met.games)} recorded games, this one included (${sides}). Opens their encounters.`}
      className="relative shrink-0 rounded border border-border px-1 text-2xs font-medium leading-4 tabular-nums text-fg-muted transition-colors hover:border-accent/50 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:after:absolute pointer-coarse:after:-inset-2 pointer-coarse:after:content-['']"
      data-testid="participant-met"
      data-games={met.games}
    >
      {/* Read as "Met 4 times, this game included (3 against, 1 alongside). Open their encounters". */}
      Met {formatCount(met.games)}
      <span aria-hidden>×</span>
      <span className="sr-only"> times, this game included ({sides}). Open their encounters</span>
    </button>
  );
}

function ParticipantRow({ x, champ, maxDamage, group, lane, rank, queueId, checking, met, onMeet }: { x: DetailParticipant; champ: (id: string | null) => PortraitChampion; maxDamage: number; group: { index: number; label: string } | null; lane: boolean; rank: ParticipantRank; queueId: number | null; checking: boolean; met: MatchMeeting | null; onMeet: ((x: DetailParticipant, key: string) => void) | null }) {
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
            {met && onMeet ? <MetChip met={met} onOpen={() => onMeet(x, met.key)} /> : null}
          </span>
          <span className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-fg-muted">
            <span className="truncate">
              {c.name}
              {x.teamMember && !x.isPlayer ? <span className="text-accent"> · {x.teamMember}</span> : null}
            </span>
            {lane ? (
              <span className="shrink-0 rounded border border-border px-1 text-2xs leading-4 text-fg-muted" title="The enemy in the same recorded position" data-testid="lane-opponent-mark">
                Lane
              </span>
            ) : null}
            <RankBadge rank={rank} queueId={queueId} checking={checking && rank.stale} />
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
      <span className="leading-tight @max-[36rem]/bd:col-span-2" title={x.damage !== null ? `${formatCount(x.damage)} damage to champions${share ? `, ${share} of the team's` : ""}` : undefined}>
        <span className="flex items-center gap-1.5 text-xs tabular-nums text-fg-muted">
          <span className="shrink-0 @min-[36rem]/bd:hidden" data-testid="participant-items-phone">
            <ItemRow items={x.items} size={18} />
          </span>
          <span className="whitespace-nowrap">
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
      <span className="hidden leading-tight @min-[60rem]/bd:block" title={x.wardsPlaced !== null ? `${x.wardsPlaced} wards placed${x.stats?.wardsKilled !== undefined ? `, ${x.stats.wardsKilled} destroyed` : ""}` : undefined}>
        <span className="block text-sm font-medium tabular-nums text-fg">{intText(x.vision)}</span>
        <span className="block text-2xs tabular-nums text-fg-subtle">{x.wardsPlaced === null ? "" : `${x.wardsPlaced} wards`}</span>
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
