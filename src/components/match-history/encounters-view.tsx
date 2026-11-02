"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight, ExternalLink } from "lucide-react";
import { ENCOUNTER_MINIMUMS, ENCOUNTER_PAGE, ESTABLISHED_GAMES, INSIGHT_LABELS, INSIGHT_RELATION, defaultMinimum, encounterListParams, recordFor, sortsFor, type EncounterInsight, type EncounterListChoice, type EncounterRelation, type EncounterSort, type EncounterSummary, type Relation, type RelationRecord, type WinLoss } from "@/domain/encounters";
import { seasonModeInfo, statsQuery, type SeasonMode, type StatsFilter } from "@/domain/season-stats";
import { seasonLabel } from "@/domain/season";
import { WIN_RATE_TONE_CLASS, winRateTone } from "@/domain/stats/win-rate";
import type { EncounterPage } from "@/server/players/encounters";
import { getEncounterDetailAction, type EncounterDetailResult } from "@/server/actions/encounters";
import { ChampionPortrait, type PortraitChampion } from "@/components/champion-portrait";
import { CLEAR_OF_CONTROLS, DetailModal } from "@/components/ui/detail-modal";
import { InfoTip } from "@/components/ui/info-tip";
import { DataStatusNote, RefreshButton, type DataRefreshTarget } from "@/components/ui/data-status";
import { SectionHeader } from "@/components/ui/section-header";
import type { DataStatus } from "@/domain/data-status";
import { Select } from "@/components/ui/input";
import { SearchInput } from "@/components/ui/search-input";
import { segmentClass, segmentedGroupClass } from "@/components/ui/segmented";
import { ModeElsewhere, OverviewFilters } from "@/components/players/overview-filters";
import { formatCount, formatDate, percent } from "@/lib/format";
import { cn } from "@/lib/cn";
import { MatchDetailModal } from "./match-detail";

/*
  Match History → Encounters: the players this profile's player keeps meeting in their recorded
  games, seen from one of three sides, chosen at the top of the list:
    Against    players on the other team, with the player's record against them;
    Alongside  players on the player's team, with the player's record alongside them;
    All        everyone met, the two records side by side (never added together).
  A player met on both sides is in both lists. The same season, game mode and account filters as
  the games list (one choice for both views); every count, highlight and window follows them.
  Counted in the database for this player only (server/players/encounters), a page of players at a
  time. A player opens their window (both records and the games, newest first), and a game opens
  the shared match window, with Back to the player. Against is always marked with the word and a
  warm colour, alongside with the word and a cool one, so colour is never the only sign. A win rate
  from fewer than ESTABLISHED_GAMES games with a result is shown in grey and said to be a small sample.
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

const CAVEAT = `From this player's stored Riot games (no extra Riot requests). Against: the other player was on the other team; alongside: on the player's team. A player met both ways has both records and is listed under Against and Alongside. Every result is the player's own. A player is recognised by their Riot account, not their name (the latest Riot ID is shown), and teammates with a profile here are left out. Historical encounters only: not parties, friendships or every game they played. Games that were not recorded are not counted, so a missing game is not proof two players never met. Win rates from fewer than ${ESTABLISHED_GAMES} games with a result are a small sample, shown in grey and ranked after the rest. Highlights cover the whole season and game mode: most games needs 3 games; the best record alongside and the toughest record against need ${ESTABLISHED_GAMES} games with a result, and appear only when you won (or lost) more often than not. Ties go to the larger sample, then the most recent.`;

const PERSPECTIVE: Record<EncounterRelation, { label: string; who: string; none: string }> = {
  against: { label: "Against", who: "faced", none: "No one met against" },
  alongside: { label: "Alongside", who: "played alongside", none: "No one met alongside" },
  all: { label: "All", who: "met", none: "No one met" },
};
const SORT_LABEL: Record<EncounterSort, string> = { games: "Most games", recent: "Most recent", best: "Highest win rate", worst: "Lowest win rate" };

/** Against reads warm and alongside cool, always with the word: colour is never the only sign. */
const REL: Record<Relation, { word: string; tag: string; dot: string; text: string; rail: string }> = {
  opponent: { word: "Against", tag: "border-red/30 bg-red/10 text-red", dot: "bg-red", text: "text-red", rail: "bg-red/70" },
  ally: { word: "Alongside", tag: "border-blue/30 bg-blue/10 text-blue", dot: "bg-blue", text: "text-blue", rail: "bg-blue/70" },
};
const relationOf = (r: Exclude<EncounterRelation, "all">): Relation => (r === "against" ? "opponent" : "ally");

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
const gamesText = (n: number) => `${formatCount(n)} game${n === 1 ? "" : "s"}`;
const recordText = (wl: WinLoss) => `${formatCount(wl.wins)}W ${formatCount(wl.losses)}L`;

/** A win rate, coloured as the rest of the app colours win rates; grey and said to be a small sample under ESTABLISHED_GAMES. */
function Rate({ wl, className }: { wl: WinLoss; className?: string }) {
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
function RiotId({ name, className }: { name: string; className?: string }) {
  const i = name.lastIndexOf("#");
  return (
    <span className={cn("min-w-0 truncate", className)} title={name}>
      <span className="font-semibold text-fg">{i > 0 ? name.slice(0, i) : name}</span>
      {i > 0 ? <span className="text-fg-subtle">{name.slice(i)}</span> : null}
    </span>
  );
}
const shortName = (name: string) => (name.lastIndexOf("#") > 0 ? name.slice(0, name.lastIndexOf("#")) : name);

/** The switch between the games and the players met in them; the season, game mode and account carry over. */
export function MatchViewSwitch({ view, basePath, filter }: { view: "games" | "encounters"; basePath: string; filter: Pick<StatsFilter, "season" | "mode" | "accountId"> }) {
  const shared = { season: filter.season, mode: filter.mode, accountId: filter.accountId };
  const items = [
    { key: "games", label: "Games", href: `${basePath}?${statsQuery(shared)}` },
    { key: "encounters", label: "Encounters", href: `${basePath}?${statsQuery(shared, { view: "encounters" })}` },
  ] as const;
  return (
    <nav aria-label="Match History views" className={segmentedGroupClass()} data-testid="match-views">
      {items.map((v) => (
        <Link key={v.key} href={v.href} scroll={false} aria-current={view === v.key ? "page" : undefined} className={segmentClass(view === v.key)} data-testid={`match-view-${v.key}`}>
          {v.label}
        </Link>
      ))}
    </nav>
  );
}

const noopSubscribe = () => () => {};

/*
  The list's columns follow its own width (a container query), so the open or collapsed sidebar is
  allowed for. Narrow, each player is a short stack (name and date, then each record on a line of
  its own); wider, a table: the player, then the figures in fixed columns, numbers right-aligned so
  they compare down the list. One side's table needs 40rem; All's, with both records, 56rem.
*/
const ONE_SIDE_GRID = "@min-[40rem]/enc:grid-cols-[minmax(0,1fr)_4.5rem_6rem_5.5rem_7rem]";
const BOTH_SIDES_GRID = "@min-[56rem]/enc:grid-cols-[minmax(0,1fr)_4.5rem_minmax(0,12rem)_minmax(0,12rem)_7rem]";

export function EncountersView({ data, basePath, playerId, playerName, championsById, status, refresh }: { data: EncountersData; basePath: string; playerId: string; playerName: string; championsById: Record<string, PortraitChampion>; /** The page's data status (domain/data-status), as on the games list. */ status?: DataStatus | null; /** Offered to the player and to those who manage Riot accounts, where Riot can be asked. */ refresh?: DataRefreshTarget | null }) {
  const router = useRouter();
  // The list's controls work once the page is interactive: it says so (data-ready) and browser tests wait for it.
  const interactive = React.useSyncExternalStore(noopSubscribe, () => true, () => false);
  const [pending, startTransition] = React.useTransition();
  const { filter: f, choice: c, page } = data;
  const [open, setOpen] = React.useState<{ key: string; name: string } | null>(null);
  const [query, setQuery] = React.useState(c.q);
  // The search the box last asked for: the box follows the address only when something else
  // changed it (Back, a link), never mid-typing when its own request comes back.
  const requested = React.useRef(c.q);
  React.useEffect(() => {
    if (pending || c.q === requested.current) return;
    requested.current = c.q;
    setQuery(c.q);
  }, [c.q, pending]);

  /** The address with these list choices (a new choice starts again from the first page of players). */
  const href = React.useCallback(
    (change: Partial<EncounterListChoice>) => {
      const next = { ...c, limit: ENCOUNTER_PAGE, ...change };
      // A minimum left at its default follows the search's default (once while searching, else twice).
      if (change.q !== undefined && change.min === undefined && c.min === defaultMinimum(c.q)) next.min = defaultMinimum(next.q);
      // Win rates are ranked within one side only: All keeps the most games or the most recent.
      if (!sortsFor(next.relation).includes(next.sort)) next.sort = "games";
      return `${basePath}?${statsQuery({ season: f.season, mode: f.mode, accountId: f.accountId }, { view: "encounters", ...encounterListParams(next) })}`;
    },
    [basePath, c, f.season, f.mode, f.accountId],
  );
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
  const account = f.accountId ? data.accountOptions.find((a) => a.id === f.accountId) : null;
  const scope = [seasonLabel(f.season), seasonModeInfo(f.mode).label, account ? account.riotId : data.accountsLinked > 1 ? "All accounts" : null].filter(Boolean).join(" · ");
  // Highlights about the side in view (both sides' in All), hidden while searching for someone.
  const insights = c.q ? [] : page.insights.filter((i) => c.relation === "all" || INSIGHT_RELATION[i.kind] === relationOf(c.relation));
  const shownSmall = page.list.some((s) => (c.relation === "all" ? [s.opponent, s.ally].some((wl) => wl.games > 0 && isSmall(wl)) : isSmall(recordFor(s, c.relation))));
  const sorts = sortsFor(c.relation);
  return (
    <section className="space-y-3" aria-labelledby="match-history" data-testid="encounters" data-ready={interactive ? "true" : undefined} data-relation={c.relation}>
      {/* The games list's heading, Refresh included, so switching views moves nothing. */}
      <SectionHeader
        id="match-history"
        title="Match History"
        aside={<MatchViewSwitch view="encounters" basePath={basePath} filter={f} />}
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
        <div className={cn("space-y-3 transition-opacity", pending && "opacity-60")} aria-busy={pending}>
          {/* What the list counts: the games it reads (the filters above), in one line. */}
          <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-fg-muted" data-testid="encounters-scope">
            <span>
              {page.withPlayers === page.games ? `Players in ${formatCount(page.games)} recorded game${page.games === 1 ? "" : "s"}` : `Players in ${formatCount(page.withPlayers)} of ${formatCount(page.games)} games (the others have no recorded players yet)`}
            </span>
            <span aria-hidden>·</span>
            <span>{scope}</span>
            <InfoTip text={CAVEAT} label="How encounters are counted" testId="encounters-caveat" />
          </p>

          {insights.length ? (
            <ul className={cn("grid grid-cols-1 gap-2 sm:grid-cols-2", insights.length > 2 && "xl:grid-cols-4")} data-testid="encounter-insights">
              {insights.map((i) => (
                <Insight key={i.kind} insight={i} onOpen={() => setOpen({ key: i.summary.key, name: i.summary.name })} />
              ))}
            </ul>
          ) : null}

          {/* One card: its toolbar (the side, the search, the minimum, Sort by on phones), the
              column names (each sorts), the players, then the next page one press away. */}
          <div className="@container/enc rounded-card border border-border bg-surface panel-depth" data-testid="encounter-table">
            <div className="flex flex-wrap items-center gap-2 border-b border-border/70 px-3 py-2.5 @min-[40rem]/enc:px-4">
              <nav aria-label="Which encounters" className={segmentedGroupClass("@max-[40rem]/enc:w-full")} data-testid="encounter-relations">
                {(["against", "alongside", "all"] as const).map((r) => (
                  <Link key={r} href={href({ relation: r })} replace scroll={false} aria-current={c.relation === r ? "page" : undefined} className={segmentClass(c.relation === r, { className: "@max-[40rem]/enc:flex-1" })} data-testid={`encounter-relation-${r}`}>
                    {r !== "all" ? <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", REL[relationOf(r)].dot)} aria-hidden /> : null}
                    {PERSPECTIVE[r].label}
                    <span className="tabular-nums text-fg-subtle" data-testid="encounter-relation-count">
                      {formatCount(page.counts[r])}
                    </span>
                    <span className="sr-only"> players</span>
                  </Link>
                ))}
              </nav>
              <SearchInput value={query} onChange={setQuery} label="Find a player by name or Riot ID" placeholder="Find a player or Riot ID" className="flex-[1_1_12rem] @min-[40rem]/enc:max-w-64" maxLength={32} testId="encounter-search" />
              {/* The minimum and, where the column names are not shown, their orders as one Sort by control: one line. */}
              <div className="flex w-full gap-2 @min-[40rem]/enc:w-auto">
                <Select aria-label="Minimum games" value={String(c.min)} disabled={pending} onChange={(e) => go({ min: Number(e.target.value) })} className="min-w-0 flex-1 @min-[40rem]/enc:w-auto @min-[40rem]/enc:flex-none" data-testid="encounter-min">
                  {ENCOUNTER_MINIMUMS.map((n) => (
                    <option key={n} value={n}>
                      {n === 1 ? "Any number of games" : `${n}+ games`}
                    </option>
                  ))}
                </Select>
                <Select aria-label="Sort by" value={c.sort} disabled={pending} onChange={(e) => go({ sort: e.target.value as EncounterSort })} className={cn("min-w-0 flex-1", c.relation === "all" ? "@min-[56rem]/enc:hidden" : "@min-[40rem]/enc:hidden")} data-testid="encounter-sort">
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
                    <EncounterRow key={s.key} s={s} relation={c.relation} onOpen={() => setOpen({ key: s.key, name: s.name })} />
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
          <p className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1 text-xs text-fg-subtle">
            <span data-testid="encounter-count">{page.total ? `${formatCount(page.list.length)} of ${formatCount(page.total)} player${page.total === 1 ? "" : "s"} shown` : ""}</span>
            {shownSmall ? (
              <span data-testid="encounter-small-legend">
                Grey win rates come from fewer than {ESTABLISHED_GAMES} games with a result: a small sample.
              </span>
            ) : null}
          </p>
        </div>
      )}
      {open ? <EncounterWindow target={open} perspective={c.relation} playerId={playerId} playerName={playerName} filters={{ season: f.season, mode: f.mode, accountId: f.accountId }} championsById={championsById} onClose={() => setOpen(null)} /> : null}
    </section>
  );
}

/** A highlight: what it is, who, and the record behind it in its relation. */
function Insight({ insight: i, onOpen }: { insight: EncounterInsight; onOpen: () => void }) {
  const relation = INSIGHT_RELATION[i.kind];
  return (
    <li>
      <button type="button" onClick={onOpen} className="flex w-full min-w-0 flex-col items-start gap-1 rounded-card border border-border bg-surface px-3 py-2.5 text-left transition-colors hover:border-border-strong hover:bg-surface-2/50 focus-visible:outline-2 focus-visible:outline-accent" data-testid="encounter-insight" data-kind={i.kind}>
        <span className="flex w-full min-w-0 items-center justify-between gap-2">
          <span className="truncate text-2xs font-semibold uppercase tracking-label text-fg-subtle">{INSIGHT_LABELS[i.kind]}</span>
          <RelationTag relation={relation} />
        </span>
        <RiotId name={i.summary.name} className="block w-full text-sm" />
        <span className="flex flex-wrap items-baseline gap-x-2 text-xs tabular-nums text-fg-muted">
          <span>{gamesText(i.record.games)}</span>
          <span>{recordText(i.record)}</span>
          <Rate wl={i.record} className="font-semibold" />
        </span>
      </button>
    </li>
  );
}

/** The column names (from 40rem): each order's own name sorts by it; the win rate reverses on a second press. */
function ColumnHeads({ relation, sort, href }: { relation: EncounterRelation; sort: EncounterSort; href: (change: Partial<EncounterListChoice>) => string }) {
  const head = "whitespace-nowrap text-2xs font-semibold uppercase tracking-label";
  const sortable = (label: string, order: EncounterSort, next: EncounterSort, align: "left" | "right" = "right") => {
    const active = sort === order || (order === "best" && sort === "worst");
    const down = sort !== "worst";
    return (
      <Link href={href({ sort: active && order === "best" ? (sort === "best" ? "worst" : "best") : next })} replace scroll={false} className={cn("group/sort inline-flex items-center gap-1 rounded px-1 py-2.5 transition-colors", head, align === "right" && "justify-end", active ? "text-fg" : "text-fg-subtle hover:text-fg-muted")} data-testid={`encounter-sort-${order === "worst" ? "best" : order}`} data-active={active || undefined}>
        {label}
        {active ? <span className="sr-only">, sorted {order === "best" ? (sort === "best" ? "highest first" : "lowest first") : "first"}</span> : null}
        {active ? down ? <ArrowDown className="h-3 w-3 shrink-0" aria-hidden /> : <ArrowUp className="h-3 w-3 shrink-0" aria-hidden /> : <ArrowUpDown className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover/sort:opacity-60 group-focus-visible/sort:opacity-60" aria-hidden />}
      </Link>
    );
  };
  if (relation === "all")
    return (
      <div className={cn("hidden items-center gap-x-4 border-b border-border/70 px-4 @min-[56rem]/enc:grid", BOTH_SIDES_GRID)} data-testid="encounter-heads">
        <span className={cn(head, "py-2.5 text-fg-subtle")}>Player</span>
        <span className="flex justify-end">{sortable("Games", "games", "games")}</span>
        <span className={cn(head, "flex items-center gap-1.5 py-2.5 text-red")}>
          <span className="h-1.5 w-1.5 rounded-full bg-red" aria-hidden />
          Against
        </span>
        <span className={cn(head, "flex items-center gap-1.5 py-2.5 text-blue")}>
          <span className="h-1.5 w-1.5 rounded-full bg-blue" aria-hidden />
          Alongside
        </span>
        <span className="flex justify-end">{sortable("Last met", "recent", "recent")}</span>
      </div>
    );
  const side = relationOf(relation);
  return (
    <div className={cn("hidden items-center gap-x-4 border-b border-border/70 px-4 @min-[40rem]/enc:grid", ONE_SIDE_GRID)} data-testid="encounter-heads">
      <span className={cn(head, "flex items-center gap-1.5 py-2.5", REL[side].text)}>
        <span className={cn("h-1.5 w-1.5 rounded-full", REL[side].dot)} aria-hidden />
        Players met {REL[side].word.toLowerCase()}
      </span>
      <span className="flex justify-end">{sortable("Games", "games", "games")}</span>
      <span className={cn(head, "py-2.5 text-right text-fg-subtle")}>Record</span>
      <span className="flex justify-end">{sortable("Win rate", "best", "best")}</span>
      <span className="flex justify-end">{sortable("Last game", "recent", "recent")}</span>
    </div>
  );
}

/** One record's figures in a row of the All view: games, wins and losses, win rate. */
function SideFigures({ relation, wl }: { relation: Relation; wl: RelationRecord }) {
  if (!wl.games)
    return (
      <span className="text-xs text-fg-subtle" data-testid="encounter-record" data-relation={relation} data-games={0}>
        <span className="@min-[56rem]/enc:hidden">{REL[relation].word}: </span>never
      </span>
    );
  return (
    <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-sm tabular-nums" data-testid="encounter-record" data-relation={relation} data-games={wl.games}>
      <RelationTag relation={relation} className="@min-[56rem]/enc:hidden" />
      <span className="font-semibold text-fg">
        {formatCount(wl.games)}
        <span className="sr-only"> games {REL[relation].word.toLowerCase()}</span>
      </span>
      <span className="text-xs text-fg-muted">{recordText(wl)}</span>
      <Rate wl={wl} className="text-xs font-semibold" />
    </span>
  );
}

function EncounterRow({ s, relation, onOpen }: { s: EncounterSummary; relation: EncounterRelation; onOpen: () => void }) {
  const lastText = (at: number | null) => (at === null ? "—" : formatDate(new Date(at)));
  const opener = "absolute inset-0 rounded-none outline-none after:content-[''] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent";
  if (relation === "all") {
    return (
      <li className={cn("group/row relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 px-3 py-2.5 transition-colors hover:bg-surface-2/50 @min-[56rem]/enc:px-4", BOTH_SIDES_GRID)} data-testid="encounter-row" data-key={s.key} data-against={s.opponent.games} data-alongside={s.ally.games}>
        <span className="flex min-w-0 flex-col">
          <RiotId name={s.name} className="text-sm" />
          <span className="text-xs tabular-nums text-fg-subtle @min-[56rem]/enc:hidden">{gamesText(s.games)} in all</span>
        </span>
        <span className="text-right text-xs tabular-nums text-fg-subtle @min-[56rem]/enc:order-last @min-[56rem]/enc:text-sm" data-testid="encounter-last">
          <span className="sr-only">Last met </span>
          {lastText(s.lastPlayedAt)}
          <ChevronRight className="ml-1 inline h-3.5 w-3.5 align-[-0.15em] @min-[56rem]/enc:hidden" aria-hidden />
        </span>
        <span className="hidden text-right text-sm font-semibold tabular-nums text-fg @min-[56rem]/enc:block" data-testid="encounter-games-total">
          {formatCount(s.games)}
          <span className="sr-only"> games in all</span>
        </span>
        <span className="col-span-2 flex flex-col gap-1 @min-[56rem]/enc:contents">
          <SideFigures relation="opponent" wl={s.opponent} />
          <SideFigures relation="ally" wl={s.ally} />
        </span>
        <button type="button" onClick={onOpen} className={opener} aria-label={`${s.name}: ${s.opponent.games ? `${gamesText(s.opponent.games)} against, ${recordText(s.opponent)}` : "never against"}; ${s.ally.games ? `${gamesText(s.ally.games)} alongside, ${recordText(s.ally)}` : "never alongside"}. Open their encounters`} data-testid="open-encounter" />
      </li>
    );
  }
  const side = relationOf(relation);
  const other: Relation = side === "opponent" ? "ally" : "opponent";
  const rec = recordFor(s, relation);
  return (
    <li className={cn("group/row relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-3 py-2.5 transition-colors hover:bg-surface-2/50 @min-[40rem]/enc:px-4", ONE_SIDE_GRID)} data-testid="encounter-row" data-key={s.key} data-against={s.opponent.games} data-alongside={s.ally.games}>
      <span className="flex min-w-0 flex-col">
        <RiotId name={s.name} className="text-sm" />
        {/* Met on the other side too: said quietly, so the player is easy to find under both. */}
        {s[other].games ? (
          <span className="truncate text-xs text-fg-subtle" data-testid="encounter-also">
            Also {gamesText(s[other].games)} {REL[other].word.toLowerCase()}
          </span>
        ) : null}
      </span>
      <span className="text-right text-xs tabular-nums text-fg-subtle @min-[40rem]/enc:order-last @min-[40rem]/enc:text-sm" data-testid="encounter-last">
        <span className="sr-only">Last game {REL[side].word.toLowerCase()} </span>
        {lastText(rec.lastPlayedAt)}
        <ChevronRight className="ml-1 inline h-3.5 w-3.5 align-[-0.15em] @min-[40rem]/enc:hidden" aria-hidden />
      </span>
      {/* Phones: the record on one line under the name; from 40rem each figure in its column. */}
      <span className="col-span-2 flex flex-wrap items-baseline gap-x-2 text-sm tabular-nums @min-[40rem]/enc:contents" data-testid="encounter-record" data-relation={side} data-games={rec.games}>
        <RelationTag relation={side} className="@min-[40rem]/enc:hidden" />
        <span className="font-semibold text-fg @min-[40rem]/enc:text-right">
          {formatCount(rec.games)}
          <span className="sr-only"> games {REL[side].word.toLowerCase()}</span>
          <span className="text-xs font-normal text-fg-subtle @min-[40rem]/enc:hidden"> game{rec.games === 1 ? "" : "s"}</span>
        </span>
        <span className="text-xs text-fg-muted @min-[40rem]/enc:text-right @min-[40rem]/enc:text-sm">{recordText(rec)}</span>
        <Rate wl={rec} className="text-xs font-semibold @min-[40rem]/enc:text-right @min-[40rem]/enc:text-sm" />
      </span>
      <button type="button" onClick={onOpen} className={opener} aria-label={`${s.name}: ${gamesText(rec.games)} ${REL[side].word.toLowerCase()}, ${recordText(rec)}. Open their encounters`} data-testid="open-encounter" />
    </li>
  );
}

/**
 * One player's window (also opened from a game's scoreboard in Match History): who they are and
 * their OP.GG profile, how often they were met, the record against them and the record alongside
 * them side by side, then every recorded game, newest first, each saying which side they were on,
 * the champions both played and the player's result. `perspective` is the list's side: the games
 * start filtered to it when the player was met both ways.
 */
export function EncounterWindow({ target, perspective = "all", playerId, playerName, filters, championsById, onClose }: { target: { key: string; name: string }; perspective?: EncounterRelation; playerId: string; playerName: string; filters: { season: number; mode: SeasonMode; accountId: string | null }; championsById: Record<string, PortraitChampion>; onClose: () => void }) {
  const [result, setResult] = React.useState<EncounterDetailResult | null>(null);
  const [match, setMatch] = React.useState<string | null>(null);
  const [only, setOnly] = React.useState<EncounterRelation>(perspective);
  const { season, mode, accountId } = filters;
  React.useEffect(() => {
    let live = true;
    void getEncounterDetailAction(playerId, target.key, { season, mode, accountId })
      .catch((): EncounterDetailResult => ({ status: "not-found", message: "Couldn't load this player right now." }))
      .then((r) => live && setResult(r));
    return () => {
      live = false;
    };
  }, [playerId, target.key, season, mode, accountId]);
  const champ = (id: string | null): PortraitChampion => (id ? (championsById[id] ?? { id, name: id, portraitUrl: "" }) : { id: "unknown", name: "Unknown", portraitUrl: "" });
  // A game opens the shared match window in place of this one; Back returns here.
  if (match) return <MatchDetailModal playerId={playerId} matchId={match} championsById={championsById} onClose={onClose} back={{ label: target.name, onBack: () => setMatch(null) }} />;
  const ok = result?.status === "ok" ? result : null;
  const s = ok?.summary ?? null;
  const both = !!s && s.ally.games > 0 && s.opponent.games > 0;
  // Met one way only: the games are that side's whatever the list showed.
  const filter: EncounterRelation = both ? only : "all";
  const games = ok ? ok.games.filter((g) => filter === "all" || g.relation === relationOf(filter)) : [];
  const total = s ? recordFor(s, filter).games : 0;
  const earlier = Math.max(0, total - games.length);
  const other = shortName(s?.name ?? target.name);
  return (
    <DetailModal
      open
      onClose={onClose}
      size="standard"
      title={target.name}
      titleId="encounter-title"
      testId="encounter-detail"
      header={
        // Who they are and their OP.GG profile, then how often they were met: the close button's corner left to itself.
        <div className={cn("min-w-0 py-4 pl-4 sm:pl-6", CLEAR_OF_CONTROLS)}>
          <p className="text-2xs font-semibold uppercase tracking-label text-fg-subtle">Encounters · {playerName}</p>
          <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
            <h2 id="encounter-title" className="min-w-0 text-xl font-bold">
              <RiotId name={s?.name ?? target.name} />
            </h2>
            {ok?.opgg ? (
              <a href={ok.opgg} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border-strong px-2.5 text-xs font-medium text-fg-muted transition-colors hover:border-fg-subtle hover:text-fg focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-11" data-testid="encounter-opgg">
                OP.GG <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            ) : null}
          </div>
          {ok?.renamed ? (
            <p className="text-xs text-fg-muted" data-testid="encounter-renamed">
              Now {ok.renamed}
            </p>
          ) : null}
          {s ? (
            <p className="mt-1 text-sm text-fg-muted" data-testid="encounter-detail-summary">
              {gamesText(s.games)} with {playerName} · last met {formatDate(new Date(s.lastPlayedAt))}
            </p>
          ) : null}
        </div>
      }
    >
      {!result ? (
        <div className="space-y-2" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-surface-2 motion-reduce:animate-none" />
          ))}
        </div>
      ) : !ok || !s ? (
        <p className="rounded-panel border border-dashed border-border p-4 text-sm text-fg-muted" data-testid="encounter-detail-message">
          {result.status === "not-found" ? result.message : null}
        </p>
      ) : (
        <div className="space-y-5">
          {/* The two records, never added together: against them, then alongside them. */}
          <dl className="grid grid-cols-2 gap-2" data-testid="encounter-detail-records">
            {(["opponent", "ally"] as const).map((relation) => {
              const wl = s[relation];
              return (
                <div key={relation} className="min-w-0 rounded-lg border border-border bg-bg/40 px-3 py-2.5" data-testid="encounter-detail-record" data-relation={relation} data-games={wl.games}>
                  <dt>
                    <RelationTag relation={relation} />
                  </dt>
                  {wl.games ? (
                    <>
                      <dd className="mt-1.5 flex items-baseline gap-2">
                        <Rate wl={wl} className="text-2xl font-bold leading-none" />
                        <span className="text-xs tabular-nums text-fg-muted">{recordText(wl)}</span>
                      </dd>
                      <dd className="mt-1 text-xs tabular-nums text-fg-subtle">
                        {gamesText(wl.games)}
                        {wl.lastPlayedAt !== null ? ` · last ${formatDate(new Date(wl.lastPlayedAt))}` : ""}
                      </dd>
                    </>
                  ) : (
                    <dd className="mt-1.5 text-sm text-fg-subtle">Never met {REL[relation].word.toLowerCase()}</dd>
                  )}
                </div>
              );
            })}
          </dl>

          <section aria-labelledby="encounter-games-title" className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id="encounter-games-title" className="text-sm font-semibold text-fg">
                Games <span className="font-normal tabular-nums text-fg-subtle">{formatCount(total)}</span>
              </h3>
              {both ? (
                <div role="radiogroup" aria-label="Which games" className={segmentedGroupClass()} data-testid="encounter-games-filter">
                  {(["all", "against", "alongside"] as const).map((r) => (
                    <button key={r} type="button" role="radio" aria-checked={only === r} onClick={() => setOnly(r)} className={segmentClass(only === r)} data-testid={`encounter-games-${r}`}>
                      {r !== "all" ? <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", REL[relationOf(r)].dot)} aria-hidden /> : null}
                      {PERSPECTIVE[r].label}
                      <span className="tabular-nums text-fg-subtle">{formatCount(recordFor(s, r).games)}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            {games.length ? (
              <ul className="divide-y divide-border/60 overflow-hidden rounded-lg border border-border" data-testid="encounter-games">
                {games.map((g) => (
                  <li key={g.matchId}>
                    {/* Who played what, which side the other player was on, and the result (the player's own). */}
                    <button type="button" onClick={() => setMatch(g.matchId)} className="relative grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 py-2 pl-4 pr-3 text-left transition-colors hover:bg-surface-2/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent sm:grid-cols-[6.5rem_minmax(0,1fr)_auto]" data-testid="encounter-game" data-relation={g.relation} data-result={g.win === true ? "win" : g.win === false ? "loss" : "unknown"}>
                      <span className={cn("absolute inset-y-1.5 left-0 w-0.5 rounded-r-full", REL[g.relation].rail)} aria-hidden />
                      <span className="flex min-w-0 flex-col text-xs leading-tight">
                        <span className="tabular-nums text-fg" data-testid="encounter-game-date">
                          {formatDate(new Date(g.playedAt))}
                        </span>
                        <span className="truncate text-fg-subtle">{g.queue}</span>
                      </span>
                      <span className={cn("text-right text-sm font-semibold sm:order-last", g.win === true ? "text-blue" : g.win === false ? "text-red" : "text-fg-muted")}>
                        {g.win === true ? "Victory" : g.win === false ? "Defeat" : "—"}
                        <ChevronRight className="ml-1 inline h-3.5 w-3.5 align-[-0.15em] text-fg-subtle" aria-hidden />
                      </span>
                      <span className="col-span-2 flex min-w-0 items-center gap-2 sm:col-span-1">
                        <ChampionCell champion={champ(g.memberChampion)} who={playerName} />
                        <RelationTag relation={g.relation} />
                        <ChampionCell champion={champ(g.otherChampion)} who={other} />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {earlier ? (
              <p className="text-xs text-fg-subtle" data-testid="encounter-games-earlier">
                {games.length ? `and ${formatCount(earlier)} earlier game${earlier === 1 ? "" : "s"}` : `${formatCount(earlier)} game${earlier === 1 ? "" : "s"}, older than the ones listed`}
              </p>
            ) : null}
          </section>
          <p className="text-2xs leading-snug text-fg-subtle" data-testid="encounter-detail-note">
            Only {playerName}&apos;s recorded games in this view&apos;s season, game mode and account; every result is {playerName}&apos;s own. They describe games played together or against each other, not parties or anything else about the player, and a missing game is not proof they never met.
          </p>
        </div>
      )}
    </DetailModal>
  );
}

/** A champion with whose it was: the portrait, then the champion's name over the player's. */
function ChampionCell({ champion, who }: { champion: PortraitChampion; who: string }) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-1.5">
      <ChampionPortrait champion={champion} size="xs" className="h-7 w-7 shrink-0 text-4xs" />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-xs font-medium text-fg">{champion.name}</span>
        <span className="truncate text-2xs text-fg-subtle">{who}</span>
      </span>
    </span>
  );
}
