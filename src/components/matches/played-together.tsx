import * as React from "react";
import Link from "next/link";
import { Bookmark, ChevronRight } from "lucide-react";
import { ROLE_LABELS, type Role } from "@/domain/roles";
import { SOLO_DUO_QUEUE, type TogetherGame, type TogetherSummary } from "@/domain/played-together";
import { seasonLabel } from "@/domain/season";
import { WIN_RATE_MIN_GAMES, WIN_RATE_TONE_CLASS, winRateTone } from "@/domain/stats/win-rate";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterBar, FilterField } from "@/components/ui/filter-bar";
import { InfoTip } from "@/components/ui/info-tip";
import { chipClass } from "@/components/ui/segmented";
import { queueLabel } from "@/server/players/match-history";
import type { PlayedTogether } from "@/server/matches/played-together";
import { ChampionPortrait, type PortraitChampion } from "@/components/champion-portrait";
import { CardAvatar } from "@/components/players/card-look";
import { RoleIcon } from "@/components/role-icon";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";
import { TogetherCardFrame } from "./together-details";
import { BookmarkButton } from "./bookmark-button";
import { LinkSelect, MemberPicker } from "./match-filters";
import { MatchRail, MatchResult, matchCardClass } from "@/components/match-history/match-card";
import { TeamComposition } from "@/components/match-history/team-composition";
import { MultikillTag } from "@/components/match-history/multikill-tag";
import type { Composition } from "@/server/matches/compositions";

/*
  Team → Matches → Played together: Riot games with two or more team members on the same side,
  newest first. Each game shows who played, on which champion and in which role, and how it went.
  "Played together" means the same team in the same game: Riot's match data does not say who
  queued together, so no game is labelled a premade party.
*/

export const TOGETHER_QUEUES: Record<string, { label: string; queues: number[] | null }> = {
  all: { label: "All supported games", queues: null },
  solo: { label: "Ranked Solo/Duo", queues: [420] },
  flex: { label: "Ranked Flex", queues: [440] },
  normal: { label: "Normal games", queues: [400, 430, 480, 490] },
  clash: { label: "Clash", queues: [700] },
};

export interface TogetherFilters {
  /** A season (game-version major) from 2026 on; the current season by default. */
  season: number;
  queue: string;
  min: number;
  /** Members who must all be in the game, on the same side ("played with"). */
  with: string[];
  limit: number;
  /** Only the team's bookmarked games (and games members shared). */
  saved: boolean;
}

/** A listed game with its bookmark state (and, for a member's own game, who shared it). */
export type TogetherListGame = TogetherGame & { bookmark: { on: boolean; canRemove: boolean } | null; sharedBy: string | null };

const fmtDuration = (s: number | null) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}` : null);
const toggle = (ids: readonly string[], id: string) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
const MEMBER_COUNTS: Record<number, string> = { 2: "2+ members", 3: "3+ members", 4: "4+ members", 5: "All five" };
/** The filters in a few words, for the folded filter button on phones. */
const filterSummary = (f: TogetherFilters, names: string[]) =>
  [seasonLabel(f.season), TOGETHER_QUEUES[f.queue]?.label ?? "All supported games", f.saved ? "Bookmarked" : MEMBER_COUNTS[f.min], names.length ? `with ${names.join(", ")}` : null].filter(Boolean).join(" · ");

/**
 * The Played together tab. One toolbar (season when there is a choice, game mode, members played
 * with, members in the game, and Clear when anything is narrowed), folded behind one button on
 * phones; then the count with the Bookmarked switch, then the games. The rule of what "played
 * together" proves is behind the (i) in the page header.
 */
export function PlayedTogetherView({ data, seasons, currentSeason, shown, teams = {}, total, filters, champions, href, summary, savedCount, elsewhere = [] }: { data: PlayedTogether; seasons: number[]; currentSeason: number; shown: TogetherListGame[]; /** Both teams of each shown game (by match id), when its full record is stored. */ teams?: Record<string, Composition | null>; total: number; filters: TogetherFilters; champions: Record<string, PortraitChampion>; href: (change: Partial<TogetherFilters>) => string; summary: TogetherSummary | null; savedCount: number; elsewhere?: Array<{ season: number; games: number }> }) {
  const p = (id: string) => data.players[id];
  const champ = (id: string) => champions[id] ?? { id, name: id, portraitUrl: "" };
  const narrowed = (filters.season !== currentSeason ? 1 : 0) + (filters.queue !== "all" ? 1 : 0) + (!filters.saved && filters.min !== 2 ? 1 : 0) + (filters.with.length ? 1 : 0);
  return (
    <div className="space-y-4" data-testid="played-together">
      <FilterBar
        testId="together-filters"
        toggleTestId="together-filters-toggle"
        summary={filterSummary(filters, filters.with.map((id) => p(id)?.name ?? "Player"))}
        activeCount={narrowed}
        resetHref={href({ season: currentSeason, queue: "all", min: 2, with: [], limit: 20 })}
        resetLabel="Clear filters"
      >
        {seasons.length > 1 ? (
          <FilterField label="Season" htmlFor="together-season">
            <LinkSelect id="together-season" label="Season" value={String(filters.season)} options={seasons.map((s) => ({ value: String(s), label: `${seasonLabel(s)}${s === currentSeason ? " (current)" : ""}`, href: href({ season: s, limit: 20 }) }))} testId="together-season" />
          </FilterField>
        ) : null}
        <FilterField label="Game mode" htmlFor="together-queue">
          <LinkSelect id="together-queue" label="Game mode" value={filters.queue} options={Object.entries(TOGETHER_QUEUES).map(([k, q]) => ({ value: k, label: q.label, href: href({ queue: k, limit: 20 }) }))} testId="together-queue" />
        </FilterField>
        <FilterField label="Played with" labelId="together-with-label">
          <MemberPicker
            label="Played with"
            emptyLabel="Anyone"
            multiple
            clearHref={href({ with: [], limit: 20 })}
            members={Object.values(data.players).map((pl) => ({ id: pl.id, name: pl.name, avatarUrl: pl.avatarUrl, look: pl.look, selected: filters.with.includes(pl.id), href: href({ with: toggle(filters.with, pl.id), limit: 20 }) }))}
            testId="together-with"
          />
        </FilterField>
        {filters.saved ? null : (
          <FilterField label="Team members in the game" htmlFor="together-min">
            <LinkSelect id="together-min" label="Team members in the game" value={String(filters.min)} options={[2, 3, 4, 5].map((n) => ({ value: String(n), label: MEMBER_COUNTS[n]!, href: href({ min: n, limit: 20 }) }))} testId="together-min" />
          </FilterField>
        )}
      </FilterBar>

      {summary ? <TogetherSummaryPanel summary={summary} players={data.players} champ={champ} /> : null}

      {/* The list's own header: how many games, and the bookmark switch that narrows them. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="inline-flex items-center gap-1.5 text-sm text-fg-muted" data-testid="together-count">
          <span>
            <span className="font-semibold text-fg">{total}</span> game{total === 1 ? "" : "s"}
          </span>
          {data.unknownSide ? <InfoTip text="Some games with two or more members could not be checked yet: their match details are not stored, so which side each member was on is unknown. They appear once the details are synced." label="Games not checked yet" /> : null}
        </p>
        <Link href={href({ saved: !filters.saved, limit: 20 })} aria-current={filters.saved ? "page" : undefined} className={chipClass(filters.saved)} data-testid="together-saved">
          <Bookmark className="h-3.5 w-3.5" aria-hidden /> Bookmarked{savedCount ? ` · ${savedCount}` : ""}
        </Link>
      </div>

      {shown.length === 0 && filters.saved ? (
        <EmptyState compact icon={Bookmark} title="No bookmarked games yet" testId="together-empty">
          Bookmark a game below with its Bookmark button, or share one of your own games from your Match History.
        </EmptyState>
      ) : shown.length === 0 ? (
        <EmptyState compact title={filters.with.length ? `No games with ${filters.with.map((id) => p(id)?.name ?? "this player").join(" and ")} on the same team${filters.queue !== "all" ? ` in ${TOGETHER_QUEUES[filters.queue]!.label}` : ""} yet.` : `No games with ${filters.min === 5 ? "all five" : `${filters.min} or more`} team members on the same side${filters.queue !== "all" ? ` in ${TOGETHER_QUEUES[filters.queue]!.label}` : ""} yet.`} testId="together-empty">
          {elsewhere.length ? (
            <span data-testid="together-elsewhere">
              The same filters find games in{" "}
              {elsewhere.map((e, i) => (
                <React.Fragment key={e.season}>
                  {i ? ", " : ""}
                  <Link href={href({ season: e.season, limit: 20 })} className="font-medium text-accent hover:underline">
                    {seasonLabel(e.season)} ({e.games})
                  </Link>
                </React.Fragment>
              ))}
              .
            </span>
          ) : (
            "Games appear here once their members' accounts have synced them."
          )}
        </EmptyState>
      ) : (
        <ol className="space-y-2.5" data-testid="together-list">
          {shown.map((g) => (
            <TogetherCard key={`${g.matchId}|${g.teamId}`} g={g} p={p} champions={champions} teams={teams[g.matchId] ?? null} />
          ))}
        </ol>
      )}
      {shown.length < total ? (
        <Link href={href({ limit: filters.limit + 20 })} scroll={false} className="block rounded-panel border border-border py-2.5 text-center text-sm text-fg-muted hover:border-border-strong hover:text-fg" data-testid="together-more">
          Show more ({total - shown.length} more)
        </Link>
      ) : null}
    </div>
  );
}

/**
 * How the chosen members do together: their record (with the sample size always visible), average
 * game length, what each of them played most, and the champion combinations they repeated.
 */
function TogetherSummaryPanel({ summary: s, players, champ }: { summary: TogetherSummary; players: PlayedTogether["players"]; champ: (id: string) => PortraitChampion }) {
  const names = s.members.map((m) => players[m.playerId]?.name ?? "Player");
  const small = s.games < WIN_RATE_MIN_GAMES.season;
  const tile = (label: string, value: React.ReactNode, sub?: React.ReactNode, cls?: string) => (
    <div className="rounded-lg bg-bg-elevated px-3 py-2">
      <dt className="text-xs text-fg-subtle">{label}</dt>
      <dd className={cn("text-lg font-semibold tabular-nums", cls ?? "text-fg")}>{value}</dd>
      {sub ? <dd className="text-2xs text-fg-subtle">{sub}</dd> : null}
    </div>
  );
  return (
    <section aria-labelledby="together-summary-title" className="space-y-3 rounded-card border border-accent/40 bg-surface p-3.5" data-testid="together-summary">
      <h2 id="together-summary-title" className="text-sm font-semibold text-fg">
        {names.length === 1 ? `${names[0]} with any teammate` : `${names.slice(0, -1).join(", ")} and ${names.at(-1)} on the same team`}
      </h2>
      <dl className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {tile("Games", s.games, s.lastPlayedAt ? `last ${formatDate(new Date(s.lastPlayedAt))}` : undefined)}
        {tile("Record", `${s.wins}W ${s.losses}L`)}
        {tile("Win rate", s.winRate === null ? "—" : `${Math.round(s.winRate * 100)}%`, small ? `small sample (${s.games} game${s.games === 1 ? "" : "s"})` : undefined, WIN_RATE_TONE_CLASS[winRateTone(s.winRate, s.games, WIN_RATE_MIN_GAMES.season)])}
        {tile("Average length", fmtDuration(s.avgDurationS === null ? null : Math.round(s.avgDurationS)) ?? "—")}
      </dl>
      {s.games ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="space-y-1.5" data-testid="together-most-played">
            <h3 className="text-xs font-medium text-fg-subtle">Most played in these games</h3>
            <ul className="space-y-1">
              {s.members.map((m) => (
                <li key={m.playerId} className="flex min-w-0 items-center gap-2 text-sm">
                  <span className="w-28 shrink-0 truncate text-fg">{players[m.playerId]?.name ?? "Player"}</span>
                  <span className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
                    {m.champions.map((c) => (
                      <span key={c.championId} className="inline-flex items-center gap-1 text-xs tabular-nums text-fg-muted">
                        <ChampionPortrait champion={champ(c.championId)} size="xs" />
                        {c.games} · {c.wins}W {c.games - c.wins}L
                      </span>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          {s.members.length >= 2 ? (
            <div className="space-y-1.5" data-testid="together-combos">
              <h3 className="text-xs font-medium text-fg-subtle">Champion combinations played more than once</h3>
              {s.combos.length === 0 ? (
                <p className="text-xs text-fg-muted">None repeated yet: every combination so far was played once.</p>
              ) : (
                <ul className="space-y-1">
                  {s.combos.map((c) => (
                    <li key={c.championIds.join("|")} className="flex items-center gap-2 text-xs tabular-nums text-fg-muted">
                      <span className="flex items-center gap-1">
                        {c.championIds.map((id, i) => (
                          <ChampionPortrait key={`${id}-${i}`} champion={champ(id)} size="xs" />
                        ))}
                      </span>
                      <span className="min-w-0 truncate text-fg">{c.championIds.map((id) => champ(id).name).join(" + ")}</span>
                      <span className="ml-auto shrink-0">
                        {c.games} games · {c.wins}W {c.games - c.wins}L
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function TogetherCard({ g, p, champions, teams }: { g: TogetherListGame; p: (id: string) => PlayedTogether["players"][string] | undefined; champions: Record<string, PortraitChampion>; teams: Composition | null }) {
  const champ = (id: string) => champions[id] ?? { id, name: id, portraitUrl: "" };
  const champOrUnknown = (id: string | null) => (id ? champ(id) : { id: "unknown", name: "Unknown champion", portraitUrl: "" });
  return (
    // One band per game: the result and its context on the left, then the members sharing the rest
    // of the width equally, whether two or five of them played (no fixed-width cells, no empty block).
    // The whole card opens the match window (see TogetherCardFrame); names and the bookmark keep their own action.
    <TogetherCardFrame playerId={g.members[0]!.playerId} matchId={g.matchId} championsById={champions} label={`${g.win === null ? "Game" : g.win ? "Victory" : "Defeat"}, ${queueLabel(g.queueId)}, ${formatDate(new Date(g.gameCreation))}, ${g.members.map((m) => p(m.playerId)?.name ?? "Player").join(", ")}`} className={matchCardClass(g.win, { interactive: true })} data-testid="together-game" data-match-id={g.matchId} data-members={g.members.length}>
      <MatchRail win={g.win} />
      <div className="relative lg:grid lg:grid-cols-[13.5rem_minmax(0,1fr)]">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border/60 px-3 py-2 lg:flex-col lg:items-start lg:justify-center lg:border-b-0 lg:border-r lg:py-3">
          {/* The same result column as a player's own match cards */}
          <MatchResult win={g.win} queue={queueLabel(g.queueId)} when={formatDate(new Date(g.gameCreation))} duration={fmtDuration(g.durationS)} lineBelow="lg" />
          <span className="flex flex-wrap items-center gap-1.5">
            {g.sharedBy ? (
              <Badge tone="neutral" title="A member's own game, shared with the team by them">
                <span data-testid="together-shared-by">Shared by {p(g.sharedBy)?.name ?? "a member"}</span>
              </Badge>
            ) : (
              <Badge tone="accent" title="Team members on the same team in this game (who queued together is not recorded)">
                <span data-testid="together-size">{g.members.length} team members</span>
              </Badge>
            )}
          </span>
          <span className="ml-auto flex items-center gap-1 lg:ml-0 lg:-ml-2">
            {g.bookmark ? <BookmarkButton matchId={g.matchId} bookmarked={g.bookmark.on} canRemove={g.bookmark.canRemove} share={!!g.sharedBy} compact /> : null}
            <ChevronRight className="hidden h-4 w-4 text-fg-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-fg motion-reduce:transition-none lg:block" aria-hidden />
          </span>
        </div>
        <div className="@container/members min-w-0 lg:flex">
          <ul className={cn("grid w-full grid-cols-2 gap-px bg-border/40 @max-2xl/members:[&>li:last-child:nth-child(odd)]:col-span-2", MEMBER_COLUMNS[g.members.length] ?? MEMBER_COLUMNS[5])}>
            {g.members.map((m) => {
              const pl = p(m.playerId);
              const c = champ(m.championId);
              const kda = m.kills === null ? "—" : `${m.kills}/${m.deaths}/${m.assists}`;
              const extra = `${m.cs ?? "—"} CS${m.damage ? ` · ${(m.damage / 1000).toFixed(1)}k dmg` : ""}`;
              return (
                <li key={m.playerId} className="@container flex min-w-0 flex-col justify-center bg-surface/95 px-3 py-2.5 max-sm:px-2 max-sm:py-1.5" data-testid="together-member" data-player-id={m.playerId}>
                  <div className="flex min-w-0 items-center gap-2.5 max-sm:gap-2">
                    <span className="relative shrink-0">
                      <ChampionPortrait champion={c} size="md" title={c.name} className="max-sm:h-10 max-sm:w-10" />
                      {pl ? (
                        <span className="absolute -bottom-1 -right-1">
                          <CardAvatar look={pl.look} name={pl.name} src={pl.avatarUrl} size="xs" />
                        </span>
                      ) : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <Link href={`/players/${m.playerId}`} className="block truncate py-0.5 text-sm font-semibold text-fg hover:underline pointer-coarse:-my-2 pointer-coarse:py-2.5">
                        {pl?.name ?? "Player"}
                      </Link>
                      <span className="flex min-w-0 items-center gap-1 text-xs text-fg-muted">
                        {m.role && m.role in ROLE_LABELS ? <RoleIcon role={m.role as Role} className="h-3 w-3 shrink-0" /> : null}
                        <span className="truncate">
                          {m.role && m.role in ROLE_LABELS ? ROLE_LABELS[m.role as Role] : "Role unknown"} · {c.name}
                        </span>
                      </span>
                      {/* Narrow cells: the figures under the name (phones keep the K/D/A only). */}
                      <span className="block truncate text-xs tabular-nums text-fg-subtle @[18rem]:hidden">
                        <span className="font-semibold text-fg">{kda}</span>
                        {m.multikill ? <MultikillTag size={m.multikill} className="ml-1.5" testId="together-multikill" /> : null}
                        <span className="max-sm:hidden"> · {extra}</span>
                      </span>
                    </span>
                    {/* Wide cells (two or three members): the figures as their own column on the right. */}
                    <span className="hidden shrink-0 text-right leading-snug @[18rem]:block">
                      <span className="flex items-baseline justify-end gap-1.5">
                        {/* The game's largest multikill, beside the K/D/A as in Match History. */}
                        {m.multikill ? <MultikillTag size={m.multikill} testId="together-multikill" /> : null}
                        <span className="text-sm font-semibold tabular-nums text-fg">{kda}</span>
                      </span>
                      <span className="block text-xs tabular-nums text-fg-subtle">{extra}</span>
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
      {/* Both teams, the same preview as a player's Match History: everyone else in the game, and
          any member on the other side, without opening the match. */}
      {teams ? (
        <div className="relative border-t border-border/60 px-3 py-2">
          <TeamComposition teams={teams} champion={champOrUnknown} variant="strip" />
        </div>
      ) : null}
      {g.queueId === SOLO_DUO_QUEUE && g.members.length > 2 ? <p className="relative border-t border-border/60 px-3 py-1.5 text-xs text-fg-subtle">Ranked Solo/Duo allows parties of two at most, so not all of them queued together.</p> : null}
      {g.opponents.length && !teams ? <p className="relative border-t border-border/60 px-3 py-1.5 text-xs text-fg-subtle">Also in this game, on the other team: {g.opponents.join(", ")}.</p> : null}
    </TogetherCardFrame>
  );
}

/** Wide screens: one column per member who played, so the band is always filled. */
/**
 * Member columns follow the room the band has (a container query), not the window: one row when
 * every member fits at a readable width, otherwise full rows (five as 3 + 2, four as 2 + 2, an odd
 * last member across both columns), so no cell is left empty and names are not cut to a few letters.
 */
const MEMBER_COLUMNS: Record<number, string> = {
  2: "",
  3: "@2xl/members:grid-cols-3",
  4: "@4xl/members:grid-cols-4",
  5: "@2xl/members:grid-cols-6 @2xl/members:[&>li]:col-span-2 @2xl/members:[&>li:nth-child(n+4)]:col-span-3 @6xl/members:grid-cols-5 @6xl/members:[&>li]:col-span-1 @6xl/members:[&>li:nth-child(n+4)]:col-span-1",
};
