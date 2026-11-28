import * as React from "react";
import Link from "next/link";
import { IntentLink } from "@/components/ui/intent-link";
import { Bookmark, ChevronRight } from "lucide-react";
import { ROLE_LABELS, type Role } from "@/domain/roles";
import { SOLO_DUO_QUEUE, togetherEntry, type TogetherGame, type TogetherSummary } from "@/domain/played-together";
import { seasonLabel } from "@/domain/season";
import { WIN_RATE_MIN_GAMES, WIN_RATE_TONE_CLASS, winRateTone } from "@/domain/stats/win-rate";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterBar, FilterField } from "@/components/ui/filter-bar";
import { FiltersControl, PageToolbar, ToolbarChip } from "@/components/ui/page-toolbar";
import { chipClass } from "@/components/ui/segmented";
import { queueLabel } from "@/server/players/match-history";
import type { PlayedTogether } from "@/server/matches/played-together";
import { ChampionPortrait, type PortraitChampion } from "@/components/champion-portrait";
import { CardAvatar } from "@/components/players/card-look";
import { RoleIcon } from "@/components/role-icon";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";
import { TogetherCardFrame, TogetherList, TogetherPager, TogetherWorkspace, type TogetherPaging } from "./together-details";
import { BookmarkButton } from "./bookmark-button";
import { LinkSelect, MemberPicker } from "./match-filters";
import { MatchRail, MatchResult, matchCardClass } from "@/components/match-history/match-card";
import { TeamComposition } from "@/components/match-history/team-composition";
import { MultikillTag } from "@/components/match-history/multikill-tag";
import { InfoTip } from "@/components/ui/info-tip";
import { ScoreMark, ScoreMarkEmpty } from "@/components/match-history/score-mark";
import type { Composition } from "@/server/matches/compositions";
import type { CardPerformance } from "@/server/players/match-history";

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
  /** The one-screen workspace's page size (its row budget) and page; null `per` in the flow (the first `limit` and Show more). */
  per: number | null;
  page: number;
}

/** A listed game with its bookmark state (and, for a member's own game, who shared it). */
export type TogetherListGame = TogetherGame & { bookmark: { on: boolean; canRemove: boolean } | null; sharedBy: string | null };

/** Why a Solo/Duo game's members did not all queue together (Riot's Solo/Duo takes parties of two at most). */
const SOLO_CAVEAT = "Ranked Solo/Duo allows parties of two at most, so not all of them queued together.";

const fmtDuration = (s: number | null) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}` : null);
const toggle = (ids: readonly string[], id: string) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
const MEMBER_COUNTS: Record<number, string> = { 2: "2+ members", 3: "3+ members", 4: "4+ members", 5: "All five" };
/** The filters in a few words, for the folded filter button on phones. */
const filterSummary = (f: TogetherFilters, names: string[]) =>
  [seasonLabel(f.season), TOGETHER_QUEUES[f.queue]?.label ?? "All supported games", f.saved ? "Bookmarked" : MEMBER_COUNTS[f.min], names.length ? `with ${names.join(", ")}` : null].filter(Boolean).join(" · ");

/**
 * The Played together tab. One toolbar (season when there is a choice, game mode, members played
 * with, members in the game, and Clear when anything is narrowed), folded behind one button on
 * phones, with Bookmarked at its end (beside Filters on phones); then the games. The count of games
 * is the page header's scope line, and the rule of what "played together" proves, with any games
 * left out, is behind its (i).
 */
export function PlayedTogetherView({ data, seasons, currentSeason, shown, teams = {}, scores = {}, total, filters, champions, href, summary, savedCount, elsewhere = [], paging = FLOW_PAGING }: { /** The one-screen workspace's pages (together-details.tsx, TogetherWorkspace). */ paging?: TogetherPaging; data: PlayedTogether; seasons: number[]; currentSeason: number; shown: TogetherListGame[]; /** Both teams of each shown game (by match id), when its full record is stored. */ teams?: Record<string, Composition | null>; /** Each member's performance score and place, by listed entry and member (server/matches/together-scores). */ scores?: Record<string, Record<string, CardPerformance>>; total: number; filters: TogetherFilters; champions: Record<string, PortraitChampion>; href: (change: Partial<TogetherFilters>) => string; summary: TogetherSummary | null; savedCount: number; elsewhere?: Array<{ season: number; games: number }> }) {
  const p = (id: string) => data.players[id];
  const champ = (id: string) => champions[id] ?? { id, name: id, portraitUrl: "" };
  const narrowed = (filters.season !== currentSeason ? 1 : 0) + (filters.queue !== "all" ? 1 : 0) + (!filters.saved && filters.min !== 2 ? 1 : 0) + (filters.with.length ? 1 : 0);
  return (
    // The filters and the list take Team's whole column (--content-wide, centred by the page as every
    // Team section is), so they start under the first tab and end under the team's name, with the
    // same margin either side of the room beside the sidebar, open or folded (the owner's review of
    // 25 Nov 2026: at 80rem, left-aligned, the list ended far short of its tabs at 1920 folded, 2560
    // and 3440). docs/STANDARDS.md, Page layout.
    <TogetherWorkspace paging={paging} total={total} listKey={href({ per: null })} ids={shown.map((g) => g.matchId)}>
      {/* From md, once the filters have scrolled away: Filters and Bookmarked at the pinned tabs' end (ui/page-toolbar.tsx). */}
      <PageToolbar label="Matches controls" land="[data-testid=together-card]">
        <FiltersControl />
        <ToolbarChip href={href({ saved: !filters.saved, limit: 20 })} on={filters.saved} label="Bookmarked" count={savedCount} testId="toolbar-together-saved">
          <Bookmark className="h-3.5 w-3.5" aria-hidden />
        </ToolbarChip>
      </PageToolbar>
      {/* The filters, then the page's own action at the row's end: Bookmarked (on phones the bar's
          own end, beside Filters; FilterBar shows `end` only while folded). */}
      <div className="flex min-w-0 items-start gap-2">
        <FilterBar
          className="min-w-0 flex-1"
          testId="together-filters"
          toggleTestId="together-filters-toggle"
          summary={filterSummary(filters, filters.with.map((id) => p(id)?.name ?? "Player"))}
          activeCount={narrowed}
          resetHref={href({ season: currentSeason, queue: "all", min: 2, with: [], limit: 20 })}
          resetLabel="Clear filters"
          end={
            <Link href={href({ saved: !filters.saved, limit: 20 })} replace aria-current={filters.saved ? "page" : undefined} className={chipClass(filters.saved, "shrink-0")} data-testid="together-saved-phone">
              <Bookmark className="h-3.5 w-3.5" aria-hidden /> Bookmarked{savedCount ? ` · ${savedCount}` : ""}
            </Link>
          }
          chips={[
            ...(filters.season !== currentSeason ? [{ key: "season", text: seasonLabel(filters.season), href: href({ season: currentSeason, limit: 20 }) }] : []),
            ...(filters.queue !== "all" ? [{ key: "queue", text: TOGETHER_QUEUES[filters.queue]?.label ?? filters.queue, href: href({ queue: "all", limit: 20 }) }] : []),
            ...(!filters.saved && filters.min !== 2 ? [{ key: "min", text: MEMBER_COUNTS[filters.min] ?? `${filters.min}+ members`, href: href({ min: 2, limit: 20 }) }] : []),
            ...filters.with.map((pid) => ({ key: `with-${pid}`, text: `With ${p(pid)?.name ?? "player"}`, href: href({ with: filters.with.filter((x) => x !== pid), limit: 20 }) })),
          ]}
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
        {/* The workspace's pager: on this row, before Bookmarked (TogetherPager draws nothing elsewhere). */}
        <TogetherPager />
        <Link href={href({ saved: !filters.saved, limit: 20 })} replace aria-current={filters.saved ? "page" : undefined} className={chipClass(filters.saved, "max-md:hidden")} data-testid="together-saved">
          <Bookmark className="h-3.5 w-3.5" aria-hidden /> Bookmarked{savedCount ? ` · ${savedCount}` : ""}
        </Link>
      </div>

      {summary ? <TogetherSummaryPanel summary={summary} players={data.players} champ={champ} /> : null}

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
                  <Link href={href({ season: e.season, limit: 20 })} replace className="font-medium text-accent hover:underline">
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
        <TogetherList total={total} offset={paging.per ? paging.offset : 0} entries={shown.map((g) => ({ entry: togetherEntry(g.matchId, g.teamId), matchId: g.matchId, playerId: g.members[0]!.playerId, said: `${g.win === null ? "Game" : g.win ? "Victory" : "Defeat"} on ${champions[g.members[0]!.championId]?.name ?? g.members[0]!.championId}` }))} championsById={champions} className="@container/tm space-y-2.5">
          {shown.map((g) => (
            <TogetherCard key={togetherEntry(g.matchId, g.teamId)} g={g} p={p} champions={champions} teams={teams[togetherEntry(g.matchId, g.teamId)] ?? teams[g.matchId] ?? null} scores={scores[togetherEntry(g.matchId, g.teamId)] ?? {}} />
          ))}
        </TogetherList>
      )}
      {/* The flow's Show more (the workspace pages the list instead). */}
      {!paging.per && shown.length < total ? (
        <Link href={href({ limit: filters.limit + 20 })} replace scroll={false} className="block rounded-panel border border-border py-2.5 text-center text-sm text-fg-muted hover:border-border-strong hover:text-fg ws:hidden" data-testid="together-more">
          Show more ({total - shown.length} more)
        </Link>
      ) : null}
    </TogetherWorkspace>
  );
}

/** No workspace pages (the flow's, and a caller that draws none). */
const FLOW_PAGING: TogetherPaging = { per: null, page: 1, pages: 1, offset: 0, perFrom: "address", cap: null, before: null, after: null };

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
    // In the one-screen workspace the panel is one band (about 120px where it was 200–260): the four tiles under the title,
    // what each member played most and the combinations beside them, so the list keeps its room (docs/PLAYED_TOGETHER.md).
    <section aria-labelledby="together-summary-title" className="space-y-3 rounded-card border border-accent/40 bg-surface p-3.5 ws:grid ws:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] ws:items-start ws:gap-x-5 ws:gap-y-2 ws:space-y-0" data-testid="together-summary">
      <h2 id="together-summary-title" className="text-sm font-semibold text-fg ws:col-span-full">
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

/*
  One game per card, read in the order a team cares about: the result and the game (its length,
  game mode and date), the members who played it with what they played and how it went, then both
  teams in full. Each member is one row: the champion's portrait with the member's picture as a
  badge on its corner, the name with the K/D/A (and the game's largest multikill) right after it,
  then the role and champion, and their performance score with its place (the shared mark of Match
  History's cards: MVP gold, ACE violet, any other place restrained; a quiet dash where the game has
  no score): at the end of the role's line on a phone and two to a row beside the open sidebar, where
  the name's line has no room to spare; stacked at the row's end where the row also shows the CS and
  damage (a tablet, one to a row), as a scoreboard row shows its player's. The members go two to a row once their column is 34rem wide (a
  tablet's card, or the four columns at about 70rem), and three once it is 60rem (Team's whole 100rem
  column, from about 1800px with the sidebar open: each row still 19rem, so its CS and damage show,
  and a score never sits a third of the card away from its member); both teams sit beside them on wide cards, as
  in a player's Match History, and under them otherwise. The bookmark is a small control in the
  card's corner. The whole card opens the game under it, as in Match History (TogetherCardFrame);
  names and the bookmark keep their own action.
*/
function TogetherCard({ g, p, champions, teams, scores }: { g: TogetherListGame; p: (id: string) => PlayedTogether["players"][string] | undefined; champions: Record<string, PortraitChampion>; teams: Composition | null; scores: Record<string, CardPerformance> }) {
  const champ = (id: string) => champions[id] ?? { id, name: id, portraitUrl: "" };
  const champOrUnknown = (id: string | null) => (id ? champ(id) : { id: "unknown", name: "Unknown champion", portraitUrl: "" });
  const bookmark = g.bookmark ? <BookmarkButton matchId={g.matchId} bookmarked={g.bookmark.on} canRemove={g.bookmark.canRemove} share={!!g.sharedBy} iconOnly /> : null;
  // Riot's Solo/Duo queue takes parties of two at most: with three or more members, not all of them queued together.
  const soloCaveat = g.queueId === SOLO_DUO_QUEUE && g.members.length > 2;
  return (
    <TogetherCardFrame entry={togetherEntry(g.matchId, g.teamId)} playerId={g.members[0]!.playerId} matchId={g.matchId} championsById={champions} label={`${g.win === null ? "Game" : g.win ? "Victory" : "Defeat"}, ${queueLabel(g.queueId)}, ${formatDate(new Date(g.gameCreation))}, ${g.members.map((m) => p(m.playerId)?.name ?? "Player").join(", ")}`} className={matchCardClass(g.win, { interactive: true })} data-testid="together-game" data-match-id={g.matchId} data-members={g.members.length} data-result={g.win === null ? undefined : g.win ? "W" : "L"}>
      <MatchRail win={g.win} />
      {/* Four columns (the result, the members, both teams, the bookmark) once the list is 58rem wide
          (@container/tm, on the list): the list's width, not the window's, since the sidebar beside
          it takes 4.5 or 16rem. The result keeps 8.5rem ("Ranked Solo/Duo" whole) and the columns are
          0.75rem apart, so beside the open sidebar of a 1440px window the members' column is 35rem
          and its members go two to a row; narrower lists stack the card. */}
      <div className="relative grid gap-x-3 gap-y-2.5 px-3 py-2.5 @min-[58rem]/tm:grid-cols-[8.5rem_minmax(0,1fr)_minmax(0,20rem)_auto] @min-[58rem]/tm:items-center @min-[58rem]/tm:py-3">
        {/* The result and the game, then how many members played it: one line of words on narrower
            cards, wrapping where they must (the result's own parts join this line: display:
            contents), clear of the bookmark in the corner (more room on a touch screen, where the
            bookmark is larger). On four columns the bookmark has its own, so the result keeps its
            column. The Solo/Duo caveat is an ⓘ after the count. On a phone's card the count of
            members is read out only: the rows under it are the members. */}
        <div className={cn("min-w-0 @max-[58rem]/tm:flex @max-[58rem]/tm:flex-wrap @max-[58rem]/tm:items-baseline @max-[58rem]/tm:gap-x-2", bookmark && "@max-[58rem]/tm:pr-9 @max-[58rem]/tm:pointer-coarse:pr-12")}>
          <MatchResult win={g.win} queue={queueLabel(g.queueId)} when={formatDate(new Date(g.gameCreation))} duration={fmtDuration(g.durationS)} lineBelow="teamMatches" className="@max-[58rem]/tm:contents" />
          {/* Who shared it, or how many members played, with the Solo/Duo caveat's ⓘ after it (S6b's TM2, built in Release 19: a line
              of text under every such card's result repeated it game after game; its sentence is the ⓘ's description, read out with it). */}
          <span className="inline-flex min-w-0 items-center gap-1 @min-[58rem]/tm:mt-1 @min-[58rem]/tm:flex">
            <span className={cn("text-xs text-fg-subtle", !g.sharedBy && "@max-[30rem]/tm:sr-only")}>
              {g.sharedBy ? (
                <span data-testid="together-shared-by">
                  Shared by {p(g.sharedBy)?.name ?? "a member"}
                </span>
              ) : (
                <span data-testid="together-size">
                  {g.members.length} team members
                </span>
              )}
            </span>
            {soloCaveat ? <InfoTip label="Not all queued together" text={SOLO_CAVEAT} testId="together-solo-caveat" /> : null}
          </span>
        </div>
        <div className="@container/members min-w-0">
          <ul className="grid gap-x-5 gap-y-1.5 @min-[34rem]/members:grid-cols-2 @min-[60rem]/members:grid-cols-3">
            {g.members.map((m) => {
              const pl = p(m.playerId);
              const c = champ(m.championId);
              const kda = m.kills === null ? "—" : `${m.kills}/${m.deaths}/${m.assists}`;
              const extra = `${m.cs ?? "—"} CS${m.damage ? ` · ${(m.damage / 1000).toFixed(1)}k dmg` : ""}`;
              const role = m.role && m.role in ROLE_LABELS ? (m.role as Role) : null;
              // The member's score and place, the same as their own Match History card and the opened game: one of two places in the row is shown (below).
              const s = scores[m.playerId];
              const mark = (layout: "stack" | "inline") => (s?.state === "ok" ? <ScoreMark score={s} layout={layout} value="sm" badge="row" className={layout === "stack" ? "w-full" : undefined} testId="together-score" badgeTestId="together-placement" /> : <ScoreMarkEmpty layout={layout} value="sm" badge="row" className={layout === "stack" ? "w-full" : undefined} testId="together-score-empty" />);
              return (
                <li key={m.playerId} className="@container/member flex min-w-0 items-center gap-2.5" data-testid="together-member" data-player-id={m.playerId}>
                  {/* The champion (36px), the member's picture a 16px badge on its corner. */}
                  <span className="relative shrink-0">
                    <ChampionPortrait champion={c} size="sm" title={c.name} className="h-9 w-9 rounded-md" />
                    {pl ? (
                      <span className="absolute -bottom-1 -right-1 flex" data-testid="together-member-avatar">
                        <CardAvatar look={pl.look} name={pl.name} src={pl.avatarUrl} size="2xs" />
                      </span>
                    ) : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    {/* The name whole (a long one wraps, never cut), the K/D/A and the largest multikill right after it. */}
                    {/* The name, K/D/A and multikill 4px apart (25 Nov 2026): with the score's column at the row's end, a 19rem
                        row's first line held "Demo Sub (Top) 5/4/7 Double kill" with 2px to spare, and a browser that sets the
                        text a hair wider put the multikill on a line of its own, the row past its 56px. */}
                    <span className="flex min-w-0 flex-wrap items-baseline gap-x-1">
                      <IntentLink href={`/players/${m.playerId}`} className="relative min-w-0 break-words py-0.5 text-sm font-semibold text-fg hover:underline pointer-coarse:-my-2.5 pointer-coarse:py-3">
                        {pl?.name ?? "Player"}
                      </IntentLink>
                      <span className="whitespace-nowrap text-sm font-semibold tabular-nums text-fg" title={extra} data-testid="together-kda">
                        {kda}
                      </span>
                      {/* The game's largest multikill, beside the K/D/A as in Match History. */}
                      {m.multikill ? <MultikillTag size={m.multikill} testId="together-multikill" /> : null}
                    </span>
                    {/* The role and champion (the icon stays with its words), then, from sm in a row of
                        19rem (one member a row, or a tablet's two), the CS and damage: beside them where
                        both fit whole, on a line of their own under them otherwise, so they never cut
                        the champion's name. Their "·" sits in the gap before them, so a line of their
                        own (clipped at its start) does not begin with it. On narrower rows they are the
                        K/D/A's title and in the game's breakdown, as on a phone. */}
                    <span className="flex min-w-0 flex-wrap items-center gap-x-2.5 overflow-hidden text-xs text-fg-muted">
                      <span className="flex min-w-0 max-w-full items-center gap-1" data-testid="together-member-role">
                        {role ? <RoleIcon role={role} className="h-3 w-3 shrink-0" /> : null}
                        <span className="min-w-0 truncate">
                          {role ? ROLE_LABELS[role] : "Role unknown"} · {c.name}
                        </span>
                      </span>
                      <span className="relative hidden whitespace-nowrap tabular-nums text-fg-subtle sm:@min-[19rem]/member:inline" data-testid="together-member-extra">
                        <span aria-hidden className="absolute right-full w-2.5 text-center">
                          ·
                        </span>
                        {extra}
                      </span>
                      {/* The score and place at the end of this line where the row has no CS and damage (a phone, two to a row beside the open sidebar): the name's line keeps its room. */}
                      <span className="ml-auto flex shrink-0 sm:@min-[19rem]/member:hidden">{mark("inline")}</span>
                    </span>
                  </span>
                  {/* Where it has them, the score over its place at the row's end, as a scoreboard row shows its player's. */}
                  <span className="-ml-1.5 hidden w-9 shrink-0 self-center sm:@min-[19rem]/member:flex">{mark("stack")}</span>
                </li>
              );
            })}
          </ul>
        </div>
        {/* Both teams, the same preview as a player's Match History: everyone else in the game, and
            any member on the other side, without opening the match. A phone's card keeps to the
            members who played (what the list is for) and leaves both teams to the game's own screen,
            where the scoreboard lists all ten. */}
        {teams ? (
          <div className="relative min-w-0 border-t border-border/60 pt-2.5 max-md:hidden @min-[58rem]/tm:border-l @min-[58rem]/tm:border-t-0 @min-[58rem]/tm:pl-3 @min-[58rem]/tm:pt-0">
            <TeamComposition teams={teams} champion={champOrUnknown} keepNames />
          </div>
        ) : (
          <span className="hidden @min-[58rem]/tm:block" />
        )}
        {/* One bookmark: in the card's top corner on narrower cards, above the chevron in the last
            column on wide ones. */}
        <span className="absolute right-1.5 top-1.5 @min-[58rem]/tm:relative @min-[58rem]/tm:inset-auto @min-[58rem]/tm:flex @min-[58rem]/tm:flex-col @min-[58rem]/tm:items-center @min-[58rem]/tm:gap-1">
          {bookmark}
          <ChevronRight className="hidden h-4 w-4 text-fg-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-fg group-data-[expanded=true]/together:translate-x-0 group-data-[expanded=true]/together:rotate-90 group-data-[expanded=true]/together:text-fg motion-reduce:transition-none @min-[58rem]/tm:block" aria-hidden />
        </span>
      </div>
      {g.opponents.length && !teams ? <p className="relative border-t border-border/60 px-3 py-1.5 text-xs text-fg-subtle">Also in this game, on the other team: {g.opponents.join(", ")}.</p> : null}
    </TogetherCardFrame>
  );
}
