"use client";

import { ChevronRight, UserX } from "lucide-react";
import type { MatchGroupsResult, MatchGroupsTeam, MatchGroupView } from "@/server/matches/possible-groups";
import { groupEvidenceText } from "@/domain/possible-groups";
import type { DetailParticipant, DetailTeam, MatchRanksResult } from "@/server/players/match-history";
import { ChampionPortrait, type PortraitChampion } from "@/components/champion-portrait";
import { formatCount, formatDate, formatKilo } from "@/lib/format";
import { cn } from "@/lib/cn";
import { matchRankQueue, rankBadgeLabel, rankChecksWhen, type ParticipantRank } from "@/domain/known-rank";
import { RankEmblem } from "@/components/players/rank-emblem";
import { PlayerLink } from "./player-link";
import { IconImg, ItemRow } from "./icon-img";

/*
  A game's scoreboard: both teams, the player's first, each in lane order. Every row is one player:
  champion (level, spells, keystone), name and current or last-known rank, KDA with kill
  participation, damage to champions with its share of the team's, gold, CS and vision, and the
  final items. The player's row is lit, team members carry their profile name in the accent colour
  and the lane opponent is marked. The columns follow the room the breakdown has (a container query,
  so the same scoreboard fits a match card's expansion and the match window): every figure on one
  line from 60rem, the figures grouped under the damage bar from 36rem, and on a phone a line of
  figures and a line of items under each player.
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

export function TeamTable({ team, champ, maxDamage, groups, laneSlot, rankOf, queueId, checking }: { team: DetailTeam; champ: (id: string | null) => PortraitChampion; maxDamage: number; groups: MatchGroupsTeam | null; /** The player's lane opponent, by place in the record. */ laneSlot: number | null } & RankProps) {
  const objectives = OBJECTIVES.filter(([k]) => team.objectives[k] !== undefined);
  const found = groups?.groups ?? [];
  const groupOf = new Map(found.flatMap((g, i) => g.slots.map((s) => [s, { index: i, label: g.label }] as const)));
  const nameOf = (slot: number) => {
    const x = team.participants.find((p) => p.slot === slot);
    if (x?.removed) return "Removed player";
    return x ? (x.teamMember ?? x.name?.split("#")[0] ?? champ(x.championId).name) : "Player";
  };
  return (
    <section className={cn("overflow-hidden rounded-panel border", team.win ? "border-blue/30" : "border-red/30")} data-testid={`team-${team.side}`} aria-label={`${team.side === "blue" ? "Blue" : "Red"} team, ${team.win ? "victory" : "defeat"}`}>
      <header className={cn("flex flex-wrap items-center justify-between gap-x-2 gap-y-1 px-3 py-1.5 text-xs", team.win ? "bg-blue/10" : "bg-red/10")}>
        <span className="font-semibold uppercase tracking-label">
          <span className={team.side === "blue" ? "text-blue" : "text-red"}>{team.side === "blue" ? "Blue side" : "Red side"}</span> · {team.win ? "Victory" : "Defeat"}
        </span>
        <span className="flex flex-wrap gap-x-3 text-fg-muted">
          <span>{team.kills} kills</span>
          {team.gold !== null ? <span>{formatKilo(team.gold)} gold</span> : null}
          {objectives.map(([k, one, many]) => (
            <span key={k}>
              {team.objectives[k]} {team.objectives[k] === 1 ? one : many}
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
      <div className={cn(ROW, "hidden border-b border-border/70 px-3 py-1 text-3xs font-medium uppercase tracking-label text-fg-subtle @min-[60rem]/bd:grid")} aria-hidden>
        <span>Player</span>
        <span>KDA · KP</span>
        <span>Damage</span>
        <span>Gold</span>
        <span>CS</span>
        <span>Vision</span>
        <span>Items</span>
      </div>
      <ul className="divide-y divide-border/70">
        {team.participants.map((x, i) => (
          <ParticipantRow key={i} x={x} champ={champ} maxDamage={maxDamage} group={groupOf.get(x.slot) ?? null} lane={laneSlot !== null && x.slot === laneSlot} rank={rankOf(x)} queueId={queueId} checking={checking} />
        ))}
      </ul>
    </section>
  );
}

/**
 * A player's current or last-checked rank, compact (domain/known-rank.ts): the tier's crest and
 * "Gold 2" (a rank in the match's other ranked queue is marked "Flex" or "Solo"; one read over a
 * month ago carries its month), "Unranked" when a check found no ranked entry, and "—" when
 * nothing is known. One being checked pulses until the answer arrives.
 */
function RankBadge({ rank, queueId, checking }: { rank: ParticipantRank; queueId: number | null; checking: boolean }) {
  const base = "inline-flex h-4 shrink-0 items-center gap-1 rounded border px-1 text-3xs font-medium leading-4";
  if (checking && rank.state === "unknown")
    return (
      <span className={cn(base, "w-10 animate-pulse border-dashed border-border motion-reduce:animate-none")} data-testid="participant-rank" data-state="checking">
        <span className="sr-only">Checking rank</span>
      </span>
    );
  const { text, queueMark, spoken, title } = rankBadgeLabel(rank, queueId);
  return (
    <span className={cn(base, rank.state === "ranked" ? "border-border text-fg-muted" : rank.state === "unranked" ? "border-border text-fg-subtle" : "border-dashed border-border text-fg-subtle")} title={title} data-testid="participant-rank" data-state={rank.state} data-queue={rank.queue ?? undefined}>
      {rank.state === "ranked" ? <RankEmblem tier={rank.tier} className="-ml-px h-3 w-3" /> : null}
      <span aria-hidden className="whitespace-nowrap" data-testid="participant-rank-text">
        {queueMark ? <span className="text-fg-subtle">{queueMark} </span> : null}
        {text}
      </span>
      <span className="sr-only">{spoken}</span>
    </span>
  );
}

/**
 * Under the scoreboard: what the badges are (current or last-known ranks, never the rank in the
 * game, which Riot's match records do not hold), when they were checked, and what a missing one
 * means; plus the state of the rank check when it could not ask for every player.
 */
export function RanksNote({ ranks, queueId, checking, result }: { ranks: ParticipantRank[]; queueId: number | null; checking: boolean; result: MatchRanksResult | null }) {
  const queue = matchRankQueue(queueId);
  const when = rankChecksWhen(ranks);
  // "Current" only while every rank shown was checked in the last three days.
  const lead = ranks.some((r) => r.state !== "unknown" && r.stale) ? "Last-known" : "Current";
  const unranked = ranks.some((r) => r.state === "unranked");
  // A rank still being checked shows the pulse, not "—".
  const unknown = ranks.some((r) => r.state === "unknown" && !(checking && r.stale));
  const check = result?.status === "ok" ? result.check : null;
  const status = checking
    ? "Checking ranks with Riot…"
    : check?.reason === "budget"
      ? "Today's rank checks are used up, so some ranks are older or missing."
      : check?.reason === "busy"
        ? "Riot was busy, so some ranks were not checked; they are checked when this match is next opened."
        : check?.failed
          ? `Riot did not answer for ${check.failed === 1 ? "one player" : `${check.failed} players`}; they are checked again later.`
          : null;
  return (
    <p className="text-2xs text-fg-subtle" data-testid="ranks-note" data-state={checking ? "checking" : (check?.reason ?? (check?.failed ? "failed" : "done"))}>
      {lead} {queue === "flex" ? "Ranked Flex ranks (Solo/Duo where marked)" : "Ranked Solo/Duo ranks (Flex where marked)"}
      {when ? `, checked ${when}` : ""}: not the ranks players had in this game, which Riot&apos;s match records do not include.
      {unranked || unknown ? ` ${[unranked ? "Unranked: no ranked entry." : null, unknown ? "—: not available." : null].filter(Boolean).join(" ")}` : ""}
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
 * What the possible groups are based on, under the scoreboard: an inference from stored games, the
 * window searched, and which sides could not be assessed. Absence of a group is never presented as
 * "no premade": most players appear in stored games only when they shared a game with a member.
 */
export function GroupsNote({ result, teams }: { result: MatchGroupsResult | null; teams: DetailTeam[] }) {
  if (!result) return <p className="text-2xs text-fg-subtle" data-testid="possible-groups-note" data-state="loading">Checking stored games for players who may have queued together…</p>;
  if (result.status !== "ok") return null;
  const side = (teamId: number) => (teams.find((t) => t.teamId === teamId)?.side === "blue" ? "Blue side" : "Red side");
  if (result.teams.some((t) => t.note === "clash")) return <p className="text-2xs text-fg-subtle" data-testid="possible-groups-note" data-state="clash">Clash: each side is a registered team of five, so no groups are inferred.</p>;
  if (result.teams.every((t) => t.note === "not-assessed")) return <p className="text-2xs text-fg-subtle" data-testid="possible-groups-note" data-state="not-assessed">Possible groups are only assessed for matchmade queues.</p>;
  const open = result.teams.filter((t) => t.groups.length === 0);
  // A side made up of team members (or with one other player) has nobody to group.
  const nobody = (t: MatchGroupsTeam) => t.assessed < 2;
  const sides = (list: MatchGroupsTeam[]) => list.map((t) => side(t.teamId)).join(" and ");
  const members = open.filter(nobody);
  const thin = open.filter((t) => !nobody(t));
  return (
    <p className="text-2xs text-fg-subtle" data-testid="possible-groups-note" data-state="ok">
      {thin.length ? (
        <span className="text-fg-muted" data-testid="possible-groups-insufficient">
          {thin.length === result.teams.length ? "Possible groups: not enough recorded history to assess." : `${sides(thin)}: not enough recorded history to assess possible groups.`}{" "}
        </span>
      ) : null}
      {members.length ? <span className="text-fg-muted">{sides(members)}: no other players to assess. </span> : null}
      Possible groups only cover players who are not members: the same players all on one team in at least three of the {formatCount(result.gamesSearched)} earlier recorded {result.gamesSearched === 1 ? "game" : "games"} found for them (the {result.windowDays} days before this match), and far more often as teammates than as opponents. They are an inference, not confirmed parties; members are never labelled, and players who rarely share a game with a member cannot be assessed.
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

function ParticipantRow({ x, champ, maxDamage, group, lane, rank, queueId, checking }: { x: DetailParticipant; champ: (id: string | null) => PortraitChampion; maxDamage: number; group: { index: number; label: string } | null; lane: boolean; rank: ParticipantRank; queueId: number | null; checking: boolean }) {
  if (x.removed) return <RemovedRow />;
  const c = champ(x.championId);
  const kda = x.deaths === 0 ? "Perfect" : x.kda.toFixed(2);
  const share = x.damageShare === null ? null : pctText(x.damageShare);
  return (
    <li className={cn("relative px-3 py-1.5", ROW, x.isPlayer && "bg-accent/10")} data-testid="participant" data-player={x.isPlayer || undefined} data-group={group ? group.index : undefined} data-lane={lane || undefined}>
      {group ? <span className={cn("absolute inset-y-1.5 left-0 w-[3px] rounded-r-full", GROUP_MARK[group.index] ?? GROUP_MARK[0])} aria-hidden /> : null}
      <span className="flex min-w-0 items-center gap-2">
        <span className="relative shrink-0">
          <ChampionPortrait champion={c} size="sm" />
          {x.champLevel !== null ? (
            <span className="absolute -bottom-1 -right-1 rounded bg-bg px-0.5 text-3xs font-semibold tabular-nums text-fg-muted" title={`Level ${x.champLevel}`}>
              {x.champLevel}
            </span>
          ) : null}
        </span>
        <span className="hidden flex-col gap-0.5 @min-[28rem]/bd:flex">
          <span className="flex gap-0.5">{x.spells?.map((s, i) => <IconImg key={i} icon={s} size={14} />)}</span>
          <IconImg icon={x.keystone} size={14} rounded="rounded-full" />
        </span>
        <span className="min-w-0 leading-tight">
          <span className={cn("block truncate text-sm", x.isPlayer ? "font-semibold text-fg" : "text-fg")} title={x.name ?? undefined} data-testid="participant-name">
            <PlayerLink memberId={x.memberId} opgg={x.opgg} label={x.teamMember ?? x.name?.split("#")[0] ?? c.name}>
              {x.name ? x.name.split("#")[0] : c.name}
            </PlayerLink>
            {group ? <span className="sr-only"> ({group.label.toLowerCase()})</span> : null}
          </span>
          <span className="flex min-w-0 items-center gap-1 text-2xs text-fg-subtle">
            <span className="truncate">
              {c.name}
              {x.teamMember && !x.isPlayer ? <span className="text-accent"> · {x.teamMember}</span> : null}
            </span>
            {lane ? (
              <span className="shrink-0 rounded border border-border px-1 text-3xs leading-4 text-fg-muted" title="The enemy in the same recorded position" data-testid="lane-opponent-mark">
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
        <span className="block whitespace-nowrap text-2xs tabular-nums text-fg-subtle">
          {kda}
          {x.deaths === 0 ? "" : " KDA"}
          {x.killParticipation !== null ? ` · ${pctText(x.killParticipation)}` : ""}
          {x.killParticipation !== null ? <span className="sr-only"> kill participation</span> : null}
        </span>
      </span>
      {/* Damage, then (one-line layout) gold, CS and vision in their own columns; grouped under the bar below it. */}
      <span className="leading-tight @max-[36rem]/bd:col-span-2" title={x.damage !== null ? `${formatCount(x.damage)} damage to champions${share ? `, ${share} of the team's` : ""}` : undefined}>
        <span className="flex items-center gap-1.5 text-2xs tabular-nums text-fg-muted">
          <span className="whitespace-nowrap">
            <span className="font-medium text-fg">{x.damage === null ? "—" : formatKilo(x.damage)}</span> dmg{share ? ` · ${share}` : ""}
          </span>
          <span className="h-1.5 min-w-6 flex-1 overflow-hidden rounded-full bg-surface-3" aria-hidden>
            <span className="block h-full rounded-full bg-accent/70" style={{ width: `${Math.round(((x.damage ?? 0) / maxDamage) * 100)}%` }} />
          </span>
        </span>
        <span className="block truncate text-2xs tabular-nums text-fg-subtle @min-[60rem]/bd:hidden">
          {x.gold === null ? "—" : formatKilo(x.gold)} gold · {intText(x.cs)} CS ({decText(x.csPerMin)}) · {intText(x.vision)} vision
        </span>
      </span>
      <span className="hidden leading-tight @min-[60rem]/bd:block" data-testid="participant-gold">
        <span className="block text-xs font-medium tabular-nums text-fg">{x.gold === null ? "—" : formatKilo(x.gold)}</span>
        <span className="block text-2xs tabular-nums text-fg-subtle">{decText(x.goldPerMin, 0)}/min</span>
      </span>
      <span className="hidden leading-tight @min-[60rem]/bd:block" data-testid="participant-cs">
        <span className="block text-xs font-medium tabular-nums text-fg">{intText(x.cs)}</span>
        <span className="block text-2xs tabular-nums text-fg-subtle">{decText(x.csPerMin)}/min</span>
      </span>
      <span className="hidden leading-tight @min-[60rem]/bd:block" title={x.wardsPlaced !== null ? `${x.wardsPlaced} wards placed${x.stats?.wardsKilled !== undefined ? `, ${x.stats.wardsKilled} destroyed` : ""}` : undefined}>
        <span className="block text-xs font-medium tabular-nums text-fg">{intText(x.vision)}</span>
        <span className="block text-2xs tabular-nums text-fg-subtle">{x.wardsPlaced === null ? "" : `${x.wardsPlaced} wards`}</span>
      </span>
      <span className="@max-[36rem]/bd:col-span-2">
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
