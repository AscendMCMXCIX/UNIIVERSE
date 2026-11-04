"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight } from "lucide-react";
import { ENCOUNTER_MINIMUMS, ENCOUNTER_PAGE, ESTABLISHED_GAMES, INSIGHT_LABELS, INSIGHT_RELATION, RELATIONS, defaultMinimum, encounterFocusParams, encounterListParams, recordFor, sortsFor, type EncounterInsight, type EncounterListChoice, type EncounterRelation, type EncounterSort, type EncounterSummary, type Relation, type RelationRecord, type WinLoss } from "@/domain/encounters";
import { statsQuery, type SeasonMode, type StatsFilter } from "@/domain/season-stats";
import { seasonLabel } from "@/domain/season";
import { WIN_RATE_TONE_CLASS, winRateTone } from "@/domain/stats/win-rate";
import type { EncounterPage } from "@/server/players/encounters";
import { InfoTip } from "@/components/ui/info-tip";
import { DataStatusNote, RefreshButton, type DataRefreshTarget } from "@/components/ui/data-status";
import type { DataStatus } from "@/domain/data-status";
import { Select } from "@/components/ui/input";
import { SearchInput } from "@/components/ui/search-input";
import { segmentClass, segmentedGroupClass } from "@/components/ui/segmented";
import { ModeElsewhere, OverviewFilters } from "@/components/players/overview-filters";
import { formatCount, formatDate, percent } from "@/lib/format";
import { cn } from "@/lib/cn";
import { MatchHistoryHeader, scopeText } from "./match-history-header";

/*
  Match History → Encounters: the players this profile's player keeps meeting in their recorded
  games. One list, filtered at the top of its table:
    All        everyone met, the record against them and the record alongside them side by side
               (never added together): the default;
    Against    players on the other team, with the player's record against them;
    Alongside  players on the player's team, with the player's record alongside them.
  A player met on both sides is in both lists. The same header, season, game mode and account
  filters as the games list (one choice for both views); every count and highlight follows them.
  Counted in the database for this player only (server/players/encounters), a page of players at a
  time. A player opens their games in Match History itself (the games list, filtered to them, with
  their records and a way back here: match-history-view), so a game looks and opens the same
  whichever way it was reached. Against is always marked with the word and a warm colour, alongside
  with the word and a cool one, so colour is never the only sign. A win rate from fewer than
  ESTABLISHED_GAMES games with a result is shown in grey and said to be a small sample.
*/

export interface EncountersData {
  filter: StatsFilter;
  seasons: number[];
  currentSeason: number;
  accountOptions: Array<{ id: string; riotId: string; label: string }>;
  accountsLinked: number;
  modes: { counts: Record<SeasonMode, number>; elsewhere: Array<{ season: number; games: number }> };
  choice: EncounterListChoice;
  page: EncounterPage;
}

export const ENCOUNTERS_CAVEAT = `From this player's stored Riot games (no extra Riot requests). Against: the other player was on the other team; alongside: on the player's team. A player met both ways has both records and is listed under Against and Alongside. Every result is the player's own. A player is recognised by their Riot account, not their name (the latest Riot ID is shown), and teammates with a profile here are left out. Historical encounters only: not parties, friendships or every game they played. Games that were not recorded are not counted, so a missing game is not proof two players never met. Win rates from fewer than ${ESTABLISHED_GAMES} games with a result are a small sample, shown in grey and ranked after the rest. Highlights cover the whole season and game mode: most games needs 3 games; the best record alongside and the toughest record against need ${ESTABLISHED_GAMES} games with a result, and appear only when you won (or lost) more often than not. Ties go to the larger sample, then the most recent.`;

const PERSPECTIVE: Record<EncounterRelation, { label: string; none: string }> = {
  all: { label: "All", none: "No one met" },
  against: { label: "Against", none: "No one met against" },
  alongside: { label: "Alongside", none: "No one met alongside" },
};
const SORT_LABEL: Record<EncounterSort, string> = { games: "Most games", recent: "Most recent", best: "Highest win rate", worst: "Lowest win rate" };

/** Against reads warm and alongside cool, always with the word: colour is never the only sign. */
export const REL: Record<Relation, { word: string; tag: string; dot: string; text: string }> = {
  opponent: { word: "Against", tag: "border-red/30 bg-red/10 text-red", dot: "bg-red", text: "text-red" },
  ally: { word: "Alongside", tag: "border-blue/30 bg-blue/10 text-blue", dot: "bg-blue", text: "text-blue" },
};
export const relationOf = (r: Exclude<EncounterRelation, "all">): Relation => (r === "against" ? "opponent" : "ally");

/** "Against" or "Alongside": a small labelled tag in the relation's colour. */
export function RelationTag({ relation, className, children }: { relation: Relation; className?: string; children?: React.ReactNode }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 text-2xs font-semibold leading-4", REL[relation].tag, className)} data-testid="relation-tag" data-relation={relation}>
      <span className={cn("h-1.5 w-1.5 rounded-full", REL[relation].dot)} aria-hidden />
      {REL[relation].word}
      {children}
    </span>
  );
}

const decided = (wl: WinLoss) => wl.wins + wl.losses;
const rateOf = (wl: WinLoss) => (decided(wl) ? wl.wins / decided(wl) : null);
const isSmall = (wl: WinLoss) => decided(wl) < ESTABLISHED_GAMES;
export const gamesText = (n: number) => `${formatCount(n)} game${n === 1 ? "" : "s"}`;
export const recordText = (wl: WinLoss) => `${formatCount(wl.wins)}W ${formatCount(wl.losses)}L`;

/** A win rate, coloured as the rest of the app colours win rates; grey and said to be a small sample under ESTABLISHED_GAMES. */
export function Rate({ wl, className }: { wl: WinLoss; className?: string }) {
  const r = rateOf(wl);
  if (r === null)
    return (
      <span className={cn("tabular-nums text-fg-subtle", className)} title="No result recorded" data-testid="encounter-rate">
        —
      </span>
    );
  const small = isSmall(wl);
  return (
    <span className={cn("tabular-nums", small ? "text-fg-subtle" : WIN_RATE_TONE_CLASS[winRateTone(r, decided(wl), ESTABLISHED_GAMES)], className)} title={small ? `From ${gamesText(decided(wl))} with a result: a small sample` : `From ${gamesText(decided(wl))} with a result`} data-testid="encounter-rate" data-small={small || undefined}>
      {percent(r, 0)}
      {small ? <span className="sr-only"> (small sample)</span> : null}
    </span>
  );
}

/** "Name#TAG" with the tag quieter. */
export function RiotId({ name, className }: { name: string; className?: string }) {
  const i = name.lastIndexOf("#");
  return (
    <span className={cn("min-w-0 truncate", className)} title={name}>
      <span className="font-semibold text-fg">{i > 0 ? name.slice(0, i) : name}</span>
      {i > 0 ? <span className="font-normal text-fg-subtle">{name.slice(i)}</span> : null}
    </span>
  );
}

const noopSubscribe = () => () => {};

/*
  The table's columns follow its own width (a container query), so the open or collapsed sidebar is
  allowed for. Narrow, each player is a short stack: the name and when you last met, then each
  record on a line of its own. Wider, a table whose figures sit in fixed columns, right-aligned so
  they compare down the list: one side's needs 40rem; All's, each side's games, record and win rate
  in a group of its own with a rule between the two, 60rem. Rows pad their cells, not themselves,
  so the rules between the groups run unbroken from row to row.
*/
const ONE_SIDE_GRID = "@min-[40rem]/enc:grid-cols-[minmax(0,1fr)_4.5rem_6rem_5rem_7rem_1rem]";
const BOTH_SIDES_GRID = "@min-[60rem]/enc:grid-cols-[minmax(0,1fr)_4.5rem_minmax(12rem,15rem)_minmax(12rem,15rem)_7rem_1rem]";
const SIDE_GROUP = "grid grid-cols-[2.5rem_minmax(0,1fr)_3.25rem] items-center gap-x-3 self-stretch border-l border-border/60 px-4";
/** SIDE_GROUP from 60rem only (the narrow rows stack each side on a line of its own). */
const SIDE_GROUP_WIDE = "@min-[60rem]/enc:grid @min-[60rem]/enc:grid-cols-[2.5rem_minmax(0,1fr)_3.25rem] @min-[60rem]/enc:items-center @min-[60rem]/enc:gap-x-3 @min-[60rem]/enc:self-stretch @min-[60rem]/enc:border-l @min-[60rem]/enc:border-border/60 @min-[60rem]/enc:px-4 @min-[60rem]/enc:py-2.5";

export function EncountersView({ data, basePath, status, refresh }: { data: EncountersData; basePath: string; /** The page's data status (domain/data-status), as on the games list. */ status?: DataStatus | null; /** Offered to the player and to those who manage Riot accounts, where Riot can be asked. */ refresh?: DataRefreshTarget | null }) {
  const router = useRouter();
  // The list's controls work once the page is interactive: it says so (data-ready) and browser tests wait for it.
  const interactive = React.useSyncExternalStore(noopSubscribe, () => true, () => false);
  const [pending, startTransition] = React.useTransition();
  const { filter: f, choice: c, page } = data;
  const [query, setQuery] = React.useState(c.q);
  // The search the box last asked for: the box follows the address only when something else
  // changed it (Back, a link), never mid-typing when its own request comes back.
  const requested = React.useRef(c.q);
  React.useEffect(() => {
    if (pending || c.q === requested.current) return;
    requested.current = c.q;
    setQuery(c.q);
  }, [c.q, pending]);

  const shared = React.useMemo(() => ({ season: f.season, mode: f.mode, accountId: f.accountId }), [f.season, f.mode, f.accountId]);
  /** The address with these list choices (a new choice starts again from the first page of players). */
  const href = React.useCallback(
    (change: Partial<EncounterListChoice>) => {
      const next = { ...c, limit: ENCOUNTER_PAGE, ...change };
      // A minimum left at its default follows the search's default (once while searching, else twice).
      if (change.q !== undefined && change.min === undefined && c.min === defaultMinimum(c.q)) next.min = defaultMinimum(next.q);
      // Win rates are ranked within one side only: All keeps the most games or the most recent.
      if (!sortsFor(next.relation).includes(next.sort)) next.sort = "games";
      return `${basePath}?${statsQuery(shared, { view: "encounters", ...encounterListParams(next) })}`;
    },
    [basePath, c, shared],
  );
  /** A player's games in Match History, starting on the side the list shows; the list's choices ride along for the way back. */
  const gamesOf = React.useCallback((key: string, side: EncounterRelation) => `${basePath}?${statsQuery(shared, { view: "encounters", ...encounterListParams(c), ...encounterFocusParams({ key, side }) })}`, [basePath, c, shared]);
  const go = (change: Partial<EncounterListChoice>) => startTransition(() => router.replace(href(change), { scroll: false }));

  // The search applies a moment after typing stops.
  React.useEffect(() => {
    const q = query.trim().slice(0, 32);
    if (q === c.q) return;
    const t = window.setTimeout(() => {
      requested.current = q;
      startTransition(() => router.replace(href({ q }), { scroll: false }));
    }, 350);
    return () => window.clearTimeout(t);
  }, [query, c.q, href, router]);

  const keep = { view: "encounters", ...encounterListParams({ ...c, limit: ENCOUNTER_PAGE }) };
  const narrowed = f.accountId || f.mode !== "all" || f.season !== data.currentSeason;
  const scope = scopeText(f, data.accountOptions, data.accountsLinked);
  // Highlights about the side in view (both sides' in All), hidden while searching for someone.
  const insights = c.q ? [] : page.insights.filter((i) => c.relation === "all" || INSIGHT_RELATION[i.kind] === relationOf(c.relation));
  const shownSmall = page.list.some((s) => (c.relation === "all" ? [s.opponent, s.ally].some((wl) => wl.games > 0 && isSmall(wl)) : isSmall(recordFor(s, c.relation))));
  const sorts = sortsFor(c.relation);
  return (
    <section className="space-y-3" aria-labelledby="match-history" data-testid="encounters" data-ready={interactive ? "true" : undefined} data-relation={c.relation}>
      <MatchHistoryHeader
        view="encounters"
        basePath={basePath}
        filter={f}
        description={
          page.games > 0 ? (
            // What the list counts: the games it reads (the filters), in one line.
            <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-fg-muted" data-testid="encounters-scope">
              <span>{page.withPlayers === page.games ? `Players met in ${gamesText(page.games)}` : `Players met in ${formatCount(page.withPlayers)} of ${gamesText(page.games)} (the others have no recorded players yet)`}</span>
              <span aria-hidden>·</span>
              <span>{scope}</span>
            </p>
          ) : null
        }
        status={status ? <DataStatusNote status={status} refresh={refresh} /> : null}
        refresh={status ? <RefreshButton status={status} refresh={refresh} /> : null}
        controls={
          <div aria-busy={pending} className="min-w-0">
            <OverviewFilters basePath={basePath} filter={f} seasons={data.seasons} currentSeason={data.currentSeason} champions={[]} accounts={data.accountOptions} keep={keep} resetQuery={new URLSearchParams(keep).toString()} modeCounts={data.modes.counts} showChampions={false} showRole={false} testId="encounter-filters" />
          </div>
        }
      />

      {page.games === 0 ? (
        <p className="rounded-panel border border-dashed border-border px-4 py-6 text-center text-sm text-fg-muted" data-testid="encounters-empty">
          {data.accountsLinked === 0 ? "No Riot account is linked yet: encounters appear once one is linked and synced." : narrowed ? "No stored game matches these filters." : `No games stored for ${seasonLabel(f.season)}.`}
          <ModeElsewhere basePath={basePath} filter={f} elsewhere={data.modes.elsewhere} keep={keep} />
        </p>
      ) : (
        <div className={cn("space-y-3 transition-opacity duration-150", pending && "opacity-60")} aria-busy={pending}>
          {insights.length ? <Highlights insights={insights} gamesOf={gamesOf} /> : null}

          {/* One card: its toolbar (the filter, the search, the minimum, Sort by where the column
              names are not shown), the column names (each sorts), the players, then the next page
              one press away. */}
          <div className="@container/enc rounded-card border border-border bg-surface panel-depth" data-testid="encounter-table">
            <div className="flex flex-wrap items-center gap-2 border-b border-border/70 px-3 py-2.5 @min-[40rem]/enc:px-4">
              <nav aria-label="Which players" className={segmentedGroupClass("@max-[40rem]/enc:w-full")} data-testid="encounter-relations">
                {RELATIONS.map((r) => (
                  <Link key={r} href={href({ relation: r })} replace scroll={false} aria-current={c.relation === r ? "page" : undefined} className={segmentClass(c.relation === r, { size: "md", className: "@max-[40rem]/enc:flex-1" })} data-testid={`encounter-relation-${r}`}>
                    {r !== "all" ? <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", REL[relationOf(r)].dot)} aria-hidden /> : null}
                    {PERSPECTIVE[r].label}
                    <span className={cn("tabular-nums", c.relation === r ? "text-fg-muted" : "text-fg-subtle")} data-testid="encounter-relation-count">
                      {formatCount(page.counts[r])}
                    </span>
                    <span className="sr-only"> players</span>
                  </Link>
                ))}
              </nav>
              {/* What Against and Alongside mean, and what the records count: beside the choice it explains. */}
              <InfoTip text={ENCOUNTERS_CAVEAT} label="How encounters are counted" testId="encounters-caveat" />
              <SearchInput value={query} onChange={setQuery} label="Find a player by name or Riot ID" placeholder="Find a player or Riot ID" className="flex-[1_1_12rem] @min-[40rem]/enc:max-w-72" maxLength={32} testId="encounter-search" />
              {/* The minimum and, where the column names are not shown, their orders as one Sort by control: one line. */}
              <div className="flex w-full gap-2 @min-[40rem]/enc:ml-auto @min-[40rem]/enc:w-auto">
                <Select aria-label="Minimum games" value={String(c.min)} disabled={pending} onChange={(e) => go({ min: Number(e.target.value) })} className="min-w-0 flex-1 @min-[40rem]/enc:w-auto @min-[40rem]/enc:flex-none" data-testid="encounter-min">
                  {ENCOUNTER_MINIMUMS.map((n) => (
                    <option key={n} value={n}>
                      {n === 1 ? "Any number of games" : `${n}+ games`}
                    </option>
                  ))}
                </Select>
                <Select aria-label="Sort by" value={c.sort} disabled={pending} onChange={(e) => go({ sort: e.target.value as EncounterSort })} className={cn("min-w-0 flex-1", c.relation === "all" ? "@min-[60rem]/enc:hidden" : "@min-[40rem]/enc:hidden")} data-testid="encounter-sort">
                  {sorts.map((k) => (
                    <option key={k} value={k}>
                      {SORT_LABEL[k]}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            {page.total === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-fg-muted" data-testid="encounters-none">
                {c.q ? `No player matching “${c.q}” ${c.relation === "all" ? "met" : `met ${PERSPECTIVE[c.relation].label.toLowerCase()}`}${c.min > 1 ? ` ${c.min}+ times` : ""} in these games.` : `${PERSPECTIVE[c.relation].none} ${c.min}+ times in these games yet.`}
                {c.min > 1 || c.relation !== "all" ? <span className="mt-1 block text-xs">Try a lower minimum{c.relation !== "all" ? " or All" : ""}.</span> : null}
              </p>
            ) : (
              <>
                <ColumnHeads relation={c.relation} sort={c.sort} href={href} />
                <ul className="divide-y divide-border/60" data-testid="encounter-list">
                  {page.list.map((s) => (
                    <EncounterRow key={s.key} s={s} relation={c.relation} href={gamesOf(s.key, c.relation)} />
                  ))}
                </ul>
                {page.list.length < page.total ? (
                  <Link href={href({ limit: c.limit + ENCOUNTER_PAGE })} replace scroll={false} className="flex min-h-11 w-full items-center justify-center rounded-b-card border-t border-border/70 text-sm font-medium text-accent transition-colors hover:bg-accent/5" data-testid="encounter-more">
                    Show more ({formatCount(page.list.length)} of {formatCount(page.total)} shown)
                  </Link>
                ) : null}
              </>
            )}
          </div>
          <p className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1 text-xs text-fg-muted">
            <span data-testid="encounter-count">{page.total ? `${formatCount(page.list.length)} of ${formatCount(page.total)} player${page.total === 1 ? "" : "s"} shown` : ""}</span>
            {shownSmall ? (
              <span className="text-fg-subtle" data-testid="encounter-small-legend">
                Grey win rates come from fewer than {ESTABLISHED_GAMES} games with a result: a small sample.
              </span>
            ) : null}
          </p>
        </div>
      )}
    </section>
  );
}

/**
 * The highlights as one line above the table, as the games list has its summary line: what each
 * is, who, and the record behind it. Each opens that player's games on its side.
 */
function Highlights({ insights, gamesOf }: { insights: EncounterInsight[]; gamesOf: (key: string, side: EncounterRelation) => string }) {
  return (
    <section aria-label="Highlights" className="rounded-panel border border-border bg-surface px-1.5 py-1" data-testid="encounter-insights">
      <ul className="flex flex-wrap gap-x-1 gap-y-0">
        {insights.map((i) => {
          const relation = INSIGHT_RELATION[i.kind];
          return (
            <li key={i.kind} className="min-w-0">
              {/* What it is, then who and the record; on a narrow screen the two wrap onto lines of their own rather than cut the name. */}
              <Link href={gamesOf(i.summary.key, relation === "opponent" ? "against" : "alongside")} className="group flex min-h-10 min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg px-2 py-1 transition-colors hover:bg-surface-2/60 focus-visible:outline-2 focus-visible:outline-accent" data-testid="encounter-insight" data-kind={i.kind}>
                <span className="flex items-center gap-x-2">
                  <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", REL[relation].dot)} aria-hidden />
                  <span className="whitespace-nowrap text-xs text-fg-muted">{INSIGHT_LABELS[i.kind]}</span>
                </span>
                <RiotId name={i.summary.name} className="text-sm" />
                <span className="flex items-baseline gap-x-1.5 whitespace-nowrap text-xs tabular-nums text-fg-muted">
                  <span>{formatCount(i.record.games)}</span>
                  <span aria-hidden>·</span>
                  <span>{recordText(i.record)}</span>
                  <Rate wl={i.record} className="font-semibold" />
                </span>
                <span className="sr-only">. Show your games with them</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const HEAD = "whitespace-nowrap text-2xs font-semibold uppercase tracking-label";

/** The column names (from 40rem; All's from 60rem): each order's own name sorts by it; the win rate reverses on a second press. */
function ColumnHeads({ relation, sort, href }: { relation: EncounterRelation; sort: EncounterSort; href: (change: Partial<EncounterListChoice>) => string }) {
  const sortable = (label: string, order: EncounterSort, next: EncounterSort, align: "left" | "right" = "right") => {
    const active = sort === order || (order === "best" && sort === "worst");
    const down = sort !== "worst";
    return (
      <Link href={href({ sort: active && order === "best" ? (sort === "best" ? "worst" : "best") : next })} replace scroll={false} className={cn("group/sort inline-flex items-center gap-1 rounded px-1 py-2.5 transition-colors", HEAD, align === "right" && "justify-end", active ? "text-fg" : "text-fg-subtle hover:text-fg-muted")} data-testid={`encounter-sort-${order === "worst" ? "best" : order}`} data-active={active || undefined}>
        {label}
        {active ? <span className="sr-only">, sorted {order === "best" ? (sort === "best" ? "highest first" : "lowest first") : "first"}</span> : null}
        {active ? down ? <ArrowDown className="h-3 w-3 shrink-0" aria-hidden /> : <ArrowUp className="h-3 w-3 shrink-0" aria-hidden /> : <ArrowUpDown className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover/sort:opacity-60 group-focus-visible/sort:opacity-60" aria-hidden />}
      </Link>
    );
  };
  if (relation === "all") {
    const group = (side: Relation) => (
      <span className={cn(SIDE_GROUP, "py-1.5")}>
        <span className={cn(HEAD, "col-span-3 flex items-center gap-1.5 pt-1", REL[side].text)} data-testid="relation-tag" data-relation={side}>
          <span className={cn("h-1.5 w-1.5 rounded-full", REL[side].dot)} aria-hidden />
          {REL[side].word}
        </span>
        <span className={cn(HEAD, "pb-1 text-right text-fg-subtle")}>Games</span>
        <span className={cn(HEAD, "pb-1 text-right text-fg-subtle")}>Record</span>
        <span className={cn(HEAD, "pb-1 text-right text-fg-subtle")}>Win %</span>
      </span>
    );
    return (
      <div className={cn("hidden items-end gap-x-4 border-b border-border/70 pl-4 pr-3 @min-[60rem]/enc:grid", BOTH_SIDES_GRID)} data-testid="encounter-heads">
        <span className={cn(HEAD, "self-end py-2.5 text-fg-subtle")}>Player</span>
        <span className="flex justify-end self-end">{sortable("Games", "games", "games")}</span>
        {group("opponent")}
        {group("ally")}
        <span className="flex justify-end self-end">{sortable("Last met", "recent", "recent")}</span>
        <span aria-hidden />
      </div>
    );
  }
  const side = relationOf(relation);
  return (
    <div className={cn("hidden items-center gap-x-4 border-b border-border/70 pl-4 pr-3 @min-[40rem]/enc:grid", ONE_SIDE_GRID)} data-testid="encounter-heads">
      <span className={cn(HEAD, "flex items-center gap-1.5 py-2.5", REL[side].text)}>
        <span className={cn("h-1.5 w-1.5 rounded-full", REL[side].dot)} aria-hidden />
        Players met {REL[side].word.toLowerCase()}
      </span>
      <span className="flex justify-end">{sortable("Games", "games", "games")}</span>
      <span className={cn(HEAD, "py-2.5 text-right text-fg-subtle")}>Record</span>
      <span className="flex justify-end">{sortable("Win rate", "best", "best")}</span>
      <span className="flex justify-end">{sortable("Last game", "recent", "recent")}</span>
      <span aria-hidden />
    </div>
  );
}

/** One side's figures in a row of the All table: games, wins and losses, win rate, each in its column (a line of its own when narrow). */
function SideFigures({ relation, wl }: { relation: Relation; wl: RelationRecord }) {
  return (
    // Narrow, a side never met is left out of the stack (the wide table says "never" in its column).
    <span className={cn("flex min-w-0 items-baseline gap-x-2 text-sm tabular-nums", SIDE_GROUP_WIDE, !wl.games && "@max-[60rem]/enc:hidden")} data-testid="encounter-record" data-relation={relation} data-games={wl.games}>
      <span className={cn("flex w-24 shrink-0 items-center gap-1.5 text-xs font-medium @min-[60rem]/enc:hidden", REL[relation].text)} data-testid="relation-tag" data-relation={relation}>
        <span className={cn("h-1.5 w-1.5 rounded-full", REL[relation].dot)} aria-hidden />
        {REL[relation].word}
      </span>
      {wl.games ? (
        <>
          <span className="font-semibold text-fg @min-[60rem]/enc:text-right">
            {formatCount(wl.games)}
            <span className="sr-only"> games {REL[relation].word.toLowerCase()}</span>
          </span>
          <span className="text-fg-muted @min-[60rem]/enc:text-right">{recordText(wl)}</span>
          <Rate wl={wl} className="font-semibold @min-[60rem]/enc:text-right" />
        </>
      ) : (
        <span className="text-fg-subtle @min-[60rem]/enc:col-span-3">
          never<span className="sr-only"> {REL[relation].word.toLowerCase()}</span>
        </span>
      )}
    </span>
  );
}

const lastText = (at: number | null) => (at === null ? "—" : formatDate(new Date(at)));

/** One player: the whole row is a link to their games in Match History (one stop for the keyboard; its outline marks the row). */
function EncounterRow({ s, relation, href }: { s: EncounterSummary; relation: EncounterRelation; href: string }) {
  const rowLink = "absolute inset-0 outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent";
  if (relation === "all") {
    return (
      <li className={cn("group/row relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-3 py-2.5 transition-colors hover:bg-surface-2/50 @min-[60rem]/enc:gap-y-0 @min-[60rem]/enc:py-0 @min-[60rem]/enc:pl-4 @min-[60rem]/enc:pr-3", BOTH_SIDES_GRID)} data-testid="encounter-row" data-key={s.key} data-against={s.opponent.games} data-alongside={s.ally.games}>
        <span className="flex min-w-0 flex-col @min-[60rem]/enc:py-2.5">
          <RiotId name={s.name} className="text-sm" />
        </span>
        <span className="text-right text-xs tabular-nums text-fg-muted @min-[60rem]/enc:order-last @min-[60rem]/enc:col-start-5 @min-[60rem]/enc:row-start-1 @min-[60rem]/enc:text-sm" data-testid="encounter-last">
          <span className="sr-only">Last met </span>
          {lastText(s.lastPlayedAt)}
          <ChevronRight className="ml-1 inline h-3.5 w-3.5 align-[-0.15em] @min-[60rem]/enc:hidden" aria-hidden />
        </span>
        <span className="hidden text-right text-sm font-semibold tabular-nums text-fg @min-[60rem]/enc:block" data-testid="encounter-games-total">
          {formatCount(s.games)}
          <span className="sr-only"> games in all</span>
        </span>
        <span className="col-span-2 flex flex-col gap-0.5 @min-[60rem]/enc:contents">
          <SideFigures relation="opponent" wl={s.opponent} />
          <SideFigures relation="ally" wl={s.ally} />
        </span>
        <ChevronRight className="hidden h-4 w-4 text-fg-subtle transition-colors group-hover/row:text-fg-muted @min-[60rem]/enc:col-start-6 @min-[60rem]/enc:row-start-1 @min-[60rem]/enc:block" aria-hidden />
        <Link href={href} className={rowLink} aria-label={`${s.name}: ${s.opponent.games ? `${gamesText(s.opponent.games)} against, ${recordText(s.opponent)}` : "never against"}; ${s.ally.games ? `${gamesText(s.ally.games)} alongside, ${recordText(s.ally)}` : "never alongside"}. Show your games with them`} data-testid="open-encounter" />
      </li>
    );
  }
  const side = relationOf(relation);
  const other: Relation = side === "opponent" ? "ally" : "opponent";
  const rec = recordFor(s, relation);
  return (
    <li className={cn("group/row relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-3 py-2.5 transition-colors hover:bg-surface-2/50 @min-[40rem]/enc:pl-4 @min-[40rem]/enc:pr-3", ONE_SIDE_GRID)} data-testid="encounter-row" data-key={s.key} data-against={s.opponent.games} data-alongside={s.ally.games}>
      <span className="flex min-w-0 flex-col">
        <RiotId name={s.name} className="text-sm" />
        {/* Met on the other side too: said quietly, so the player is easy to find under both. */}
        {s[other].games ? (
          <span className="truncate text-xs text-fg-muted" data-testid="encounter-also">
            Also {gamesText(s[other].games)} {REL[other].word.toLowerCase()}
          </span>
        ) : null}
      </span>
      <span className="text-right text-xs tabular-nums text-fg-muted @min-[40rem]/enc:order-last @min-[40rem]/enc:col-start-5 @min-[40rem]/enc:row-start-1 @min-[40rem]/enc:text-sm" data-testid="encounter-last">
        <span className="sr-only">Last game {REL[side].word.toLowerCase()} </span>
        {lastText(rec.lastPlayedAt)}
        <ChevronRight className="ml-1 inline h-3.5 w-3.5 align-[-0.15em] @min-[40rem]/enc:hidden" aria-hidden />
      </span>
      {/* Phones: the record on one line under the name; from 40rem each figure in its column. */}
      <span className="col-span-2 flex flex-wrap items-baseline gap-x-2 text-sm tabular-nums @min-[40rem]/enc:contents" data-testid="encounter-record" data-relation={side} data-games={rec.games}>
        <span className="font-semibold text-fg @min-[40rem]/enc:text-right">
          {formatCount(rec.games)}
          <span className="sr-only"> games {REL[side].word.toLowerCase()}</span>
          <span className="text-xs font-normal text-fg-muted @min-[40rem]/enc:hidden"> game{rec.games === 1 ? "" : "s"}</span>
        </span>
        <span className="text-fg-muted @min-[40rem]/enc:text-right">{recordText(rec)}</span>
        <Rate wl={rec} className="font-semibold @min-[40rem]/enc:text-right" />
      </span>
      <ChevronRight className="hidden h-4 w-4 text-fg-subtle transition-colors group-hover/row:text-fg-muted @min-[40rem]/enc:col-start-6 @min-[40rem]/enc:row-start-1 @min-[40rem]/enc:block" aria-hidden />
      <Link href={href} className={rowLink} aria-label={`${s.name}: ${gamesText(rec.games)} ${REL[side].word.toLowerCase()}, ${recordText(rec)}. Show your games with them`} data-testid="open-encounter" />
    </li>
  );
}
