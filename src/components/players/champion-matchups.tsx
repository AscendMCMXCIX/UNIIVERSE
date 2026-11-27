"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronLeft, ScanSearch } from "lucide-react";
import type { Role } from "@/domain/roles";
import { ROLE_LABELS } from "@/domain/roles";
import { OPPONENT_MIN_GAMES, OPPONENT_SEARCH_FROM, OPPONENT_SORTS, OPPONENT_TONED_GAMES, aboutOpponents, arrangeOpponents, opponentCoverage, opponentFootLine, opponentSentence, pairingKda, searchOpponents, smallSample, type ArrangedOpponents, type OpponentSort, type OpponentTally } from "@/domain/champion-preview";
import type { ChampionPreviewData, PairingGamesData } from "@/server/players/champion-preview";
import type { PreviewResult } from "@/server/actions/champion-preview";
import { WIN_RATE_TONE_CLASS, winRateTone } from "@/domain/stats/win-rate";
import { ChampionPortrait, type PortraitChampion } from "@/components/champion-portrait";
import { normalise } from "@/components/champions/types";
import { intelHref } from "@/components/champion-lookup/address";
import { SearchInput } from "@/components/ui/search-input";
import { InfoTip } from "@/components/ui/info-tip";
import { segmentClass, segmentedGroupClass } from "@/components/ui/segmented";
import { Pager } from "@/components/ui/pager";
import { SiblingSteps } from "@/components/ui/preview-window";
import { useRowBudget } from "@/components/ui/fit-rows";
import { columnRows, pageCount, pageRange, slotPageOf, slotPages, usePagedList, type Slot } from "@/components/ui/row-budget";
import { rootPx } from "@/components/ui/posture";
import { formatCount, formatDayMonth, percent } from "@/lib/format";
import { cn } from "@/lib/cn";
import { useAnswer, type PreviewData } from "./preview-data";

/*
  The preview's lane opponents (the owner's request of 25 Nov 2026): every lane opponent the
  champion met in the chosen position, however few the games (no folds, no "more" toggles, no
  Best/Worst tabs), with a search by name and three orders: most games, highest win rate and lowest
  win rate. Under 3 games an opponent is a small sample: its win rate is quiet and the win-rate
  orders list it after the ranked ones, past a divider (domain/champion-preview).

  Two layouts (docs/MATCHUPS.md, "Where it opens"):
  - the flow (phones, tablets, short or narrow windows, large text; the sheet everywhere): ONE table,
    and an opponent's detail (its games, their KDA, the lane at 10:00, the link to Matchup Intel in
    Champion Intel's Compare, with the position as its lane) beside it where the preview has room (a
    38rem preview), or one step in place of the table in a narrower one, with "All opponents" to go back;
  - the workspace (All Champions' one-screen desktop, the owner's request of 27 Nov 2026): one
    toolbar line (the heading, the search, the orders), the opponents in two columns read down the
    first then the second, in pages of the rows that fit above the card's footer (useRowBudget), and an
    opponent's detail in place of the grid, its games in two columns and paged too, with ‹ n of N ›
    to the next opponent and "All opponents" (or Escape) back to the grid on the page holding it.
  The opponent is `vs` in the address, replaced (the preview's one history entry: Back closes the
  preview, as everywhere else).
*/

/** The table's columns: the opponent, its games, its record and its win rate. */
const ROWS = "grid grid-cols-[minmax(0,1fr)_2.75rem_3.75rem_3.25rem] items-center gap-x-2";
/**
 * The opponent's games: the result, K/D/A, CS, the gold difference at 10:00 and the date, each cell on
 * one line. K/D/A keeps 4.25rem at least ("10/10/10" is 65px), the gold 5.25rem (its heading "Gold at
 * 10:00" is 79px) and the date 2.75rem ("25 Nov" is 42px): 288px with the button's padding, the
 * narrowest detail column (until 27 Nov 2026 K/D/A took what was left and was cut, "10/…", at 1366
 * with the sidebar open).
 */
const GAMES = "grid grid-cols-[1.5rem_minmax(4.25rem,1fr)_2.25rem_5.25rem_2.75rem] items-center gap-x-1.5";
/**
 * The workspace's opponent cell (two columns): the opponent, its games with the record merged ("9 ·
 * 5W 4L", 74px at most) and the win rate. The name keeps 108px or more beside them at the narrowest
 * two-column region, so "Nunu & Willump" (107px) stays whole.
 */
const OPP_CELL = "ws:grid-cols-[minmax(0,1fr)_4.75rem_3.25rem] ws:px-1.5";
/** Two columns of opponents from this width of the region; below it one (a safety net: the pane opens only where two fit). */
const OPP_TWO_COLUMNS_REM = 38.625;
/** Two columns of an opponent's games from this width of the region. */
const GAMES_TWO_COLUMNS_REM = 37;
const record = (wins: number, games: number) => `${formatCount(wins)}W ${formatCount(games - wins)}L`;
const plural = (n: number, word: string) => `${formatCount(n)} ${word}${n === 1 ? "" : "s"}`;
const SMALL_SAMPLE_TIP = `Fewer than ${OPPONENT_MIN_GAMES} games is a small sample: the win rate is greyed and the win-rate orders list it last.`;
const rateClass = (o: OpponentTally) => (smallSample(o) ? "text-fg-subtle" : o.games >= OPPONENT_TONED_GAMES ? WIN_RATE_TONE_CLASS[winRateTone(o.wins / o.games, o.games, OPPONENT_TONED_GAMES)] : "text-fg");

export interface MatchupsProps {
  playerId: string;
  isOwn: boolean;
  me: PortraitChampion;
  /** The position shown; null for a champion no game of which records one (no lane opponent then). */
  role: Role | null;
  vs: string | null;
  champ: (id: string) => PortraitChampion;
  data: PreviewData;
  onVs: (vs: string | null) => void;
  onMatch: (matchId: string) => void;
  titleId: string;
  /** The opponents from which the table offers its search (OPPONENT_SEARCH_FROM; fewer only for a browser test on the demo). */
  searchFrom?: number;
  /** "workspace": All Champions' one-screen pane (the `ws` variant reshapes it until the page knows); "flow": every other place. */
  layout?: "workspace" | "flow";
  /** The workspace measured (useWorkspace true): the lists show their pages. */
  paged?: boolean;
  /** A browser test's cap on the opponents (and games) a column shows (server/demo/test-hooks.ts). */
  perColumnCap?: number | null;
}

export function Matchups({ playerId, isOwn, me, role, vs, champ, data, onVs, onMatch, titleId, searchFrom = OPPONENT_SEARCH_FROM, layout = "flow", paged = false, perColumnCap = null }: MatchupsProps) {
  const key = role ? `${data.scopeKey}|${me.id}|${role}` : null;
  const init = data.initial.preview;
  const seed = init && role && init.champion === me.id && init.role === role ? init : null;
  const answer = useAnswer(key, data.generation, role ? () => data.preview(me.id, role) : null, seed);
  const preview = answer?.status === "ok" ? answer.data : null;
  // The order is a reading preference, kept across positions; the search belongs to the position it
  // was typed in (another position's table starts whole: a word left behind never hides an opponent).
  const [sort, setSort] = React.useState<OpponentSort>("games");
  const [search, setSearch] = React.useState<{ role: Role | null; text: string }>({ role, text: "" });
  // Another position: its search starts empty (React's "state from the previous render" pattern).
  if (search.role !== role) setSearch({ role, text: "" });
  const query = search.role === role ? search.text : "";
  const setQuery = (text: string) => setSearch({ role, text });
  const all = React.useMemo(() => preview?.opponents ?? [], [preview]);
  const searchable = all.length >= searchFrom;
  const found = React.useMemo(() => searchOpponents(all, { words: normalise(query.trim()), typedIn: search.role, role, name: (o) => normalise(champ(o.championId).name), from: searchFrom }), [all, query, search.role, role, champ, searchFrom]);
  const arranged = React.useMemo(() => arrangeOpponents(found, sort), [found, sort]);
  const open = vs ? (all.find((o) => o.championId === vs) ?? null) : null;
  const detailId = `opponent-${playerId.slice(0, 8)}-detail`;
  // What the region holds, for the Production check (scripts/champion-preview-facts.mjs).
  const state = !role ? "no-position" : !preview ? (answer?.status === "not-found" ? "not-found" : "loading") : !all.length ? "none" : "answered";
  if (layout === "workspace")
    return (
      <WorkspaceMatchups
        {...{ playerId, isOwn, me, role, vs, champ, data, onVs, onMatch, titleId, searchable, sort, setSort, query, setQuery, all, arranged, open, detailId, state, answer, paged, perColumnCap }}
        preview={preview}
      />
    );
  return <FlowMatchups {...{ playerId, isOwn, me, role, vs, champ, data, onVs, onMatch, titleId, searchable, sort, setSort, query, setQuery, all, arranged, open, detailId, state, answer }} preview={preview} />;
}

interface SharedProps {
  playerId: string;
  isOwn: boolean;
  me: PortraitChampion;
  role: Role | null;
  vs: string | null;
  champ: (id: string) => PortraitChampion;
  data: PreviewData;
  onVs: (vs: string | null) => void;
  onMatch: (matchId: string) => void;
  titleId: string;
  searchable: boolean;
  sort: OpponentSort;
  setSort: (sort: OpponentSort) => void;
  query: string;
  setQuery: (text: string) => void;
  all: OpponentTally[];
  arranged: ArrangedOpponents;
  open: OpponentTally | null;
  detailId: string;
  state: string;
  answer: PreviewResult<ChampionPreviewData> | null;
  preview: ChampionPreviewData | null;
}

/** The flow's opponents: one table, the detail beside it (or a step in its place), exactly as before 27 Nov 2026. */
function FlowMatchups({ isOwn, me, role, vs, champ, data, onVs, onMatch, titleId, searchable, sort, setSort, query, setQuery, all, arranged, open, detailId, state, answer, preview }: SharedProps) {
  // In a narrow preview the detail takes the table's place: the focus follows it there and back.
  const tableRef = React.useRef<HTMLDivElement>(null);
  const backRef = React.useRef<HTMLButtonElement>(null);
  const lastRow = React.useRef<string | null>(null);
  // A row pressed: in a narrow preview its detail takes the table's place, and the focus goes with it.
  const follow = React.useRef(false);
  const stacked = () => !!tableRef.current && getComputedStyle(tableRef.current).display === "none";
  const pick = (id: string) => {
    lastRow.current = id;
    follow.current = vs !== id;
    onVs(vs === id ? null : id);
  };
  // "All opponents": the table back, the focus on the row it left from.
  const returnTo = React.useRef<string | null>(null);
  // Each is also brought into view where it is not (a row far down a long table opens a short step,
  // and the table it goes back to is as long as before): "nearest" scrolls only as far as needed, in
  // the sheet's body or the page (the pane scrolls with the page), clear of the pane's pinned header
  // (scroll-margin: the pane's --preview-head).
  React.useLayoutEffect(() => {
    if (vs && follow.current && stacked()) {
      backRef.current?.focus({ preventScroll: true });
      backRef.current?.scrollIntoView({ block: "nearest" });
    }
    follow.current = false;
    if (!vs && returnTo.current) {
      const row = tableRef.current?.querySelector<HTMLButtonElement>(`[data-opponent-row="${CSS.escape(returnTo.current)}"]`);
      row?.focus({ preventScroll: true });
      row?.scrollIntoView({ block: "nearest" });
    }
    returnTo.current = null;
  }, [vs]);
  const back = () => {
    returnTo.current = lastRow.current ?? vs;
    onVs(null);
  };

  const heading = (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <h3 id={`${titleId}-opponents`} className="text-base font-semibold text-fg">
        Lane opponents
      </h3>
      {preview && all.length ? (
        <span className="text-sm tabular-nums text-fg-muted" data-testid="champion-preview-opponent-count">
          {formatCount(all.length)}
          {role ? <span className="sr-only"> as {ROLE_LABELS[role]}</span> : null}
        </span>
      ) : null}
      {preview && all.some(smallSample) ? <InfoTip text={SMALL_SAMPLE_TIP} label="About small samples" className="self-center" /> : null}
    </div>
  );

  let body: React.ReactNode;
  if (!role) {
    body = <NoPosition />;
  } else if (!preview) {
    body = <Waiting answer={answer} />;
  } else if (!all.length) {
    body = <NoOpponents />;
  } else {
    body = (
      <div className="grid items-start gap-x-6 gap-y-3 @min-[38rem]/detail:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div ref={tableRef} className={cn("flex min-w-0 flex-col gap-2", open && "@max-[38rem]/detail:hidden")} data-testid="champion-preview-opponent-table">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {searchable ? <SearchInput value={query} onChange={setQuery} placeholder="Find an opponent…" label="Find a lane opponent" className="min-w-[9rem] flex-[1_1_10rem]" testId="opponent-search" /> : null}
            {all.length > 1 ? (
              <div role="radiogroup" aria-label="Order the opponents" className={segmentedGroupClass()}>
                {OPPONENT_SORTS.map((s) => (
                  <button key={s.key} type="button" role="radio" aria-checked={sort === s.key} onClick={() => setSort(s.key)} className={segmentClass(sort === s.key, { size: "sm" })} data-testid={`opponent-sort-${s.key}`}>
                    {s.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div>
            <div className={cn(ROWS, "border-b border-border/60 px-2 pb-1.5")} aria-hidden data-testid="champion-preview-opponent-head">
              <span className="label-text">Opponent</span>
              <span className="label-text text-right">Games</span>
              <span className="label-text text-right">Record</span>
              <span className="label-text text-right">Win rate</span>
            </div>
            {arranged.rows.length ? (
              <ul className="flex flex-col" data-testid="champion-preview-opponent-list">
                {arranged.rows.map((o, i) => (
                  <React.Fragment key={o.championId}>
                    {arranged.divider === i ? <SmallDivider /> : null}
                    <OpponentRow o={o} them={champ(o.championId)} selected={vs === o.championId} controls={detailId} onPick={() => pick(o.championId)} />
                  </React.Fragment>
                ))}
              </ul>
            ) : (
              <NoMatch query={query} />
            )}
          </div>
        </div>
        <div className={cn("min-w-0", !open && "hidden @min-[38rem]/detail:block")}>
          {open ? (
            <PairingDetail key={open.championId} id={detailId} me={me} them={champ(open.championId)} o={open} role={role} isOwn={isOwn} data={data} onMatch={onMatch} onBack={back} backRef={backRef} onClose={() => pick(open.championId)} />
          ) : (
            <p className="pt-2 text-sm text-fg-subtle" data-testid="champion-preview-pick-opponent">
              Choose an opponent to see each game against it and the lane at 10:00.
            </p>
          )}
        </div>
      </div>
    );
  }
  return (
    <section aria-labelledby={`${titleId}-opponents`} className="flex flex-col gap-2.5" data-testid="champion-preview-opponents" data-state={state}>
      {heading}
      {body}
      {preview && role ? (
        <p className="text-xs text-fg-subtle" data-testid="champion-preview-foot">
          {opponentFootLine({ isOwn, known: preview.known, games: preview.games })}
        </p>
      ) : null}
    </section>
  );
}

function NoPosition() {
  return (
    <p className="text-sm text-fg-muted" data-testid="champion-preview-no-position">
      No game here records a position, so no lane opponent is known.
    </p>
  );
}

function Waiting({ answer }: { answer: { status: string; message?: string } | null }) {
  return answer?.status === "not-found" ? (
    <p className="text-sm text-fg-muted">{answer.message}</p>
  ) : (
    <div className="flex flex-col gap-1" aria-hidden data-testid="champion-preview-loading">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-8 animate-pulse rounded-md bg-surface-2/70" />
      ))}
    </div>
  );
}

function NoOpponents() {
  return (
    <p className="text-sm text-fg-muted" data-testid="champion-preview-no-opponents">
      No lane opponent is known in these games yet.
    </p>
  );
}

function NoMatch({ query }: { query: string }) {
  return (
    <p className="px-2 py-3 text-sm text-fg-muted" data-testid="champion-preview-no-match">
      No opponent matches “{query.trim()}”.
    </p>
  );
}

/** The quiet line before the small samples in the win-rate orders; in the workspace a cell-high slot of its own. */
function SmallDivider({ workspace = false }: { workspace?: boolean }) {
  return (
    <li className={cn("border-t border-border/60 px-2 pb-1 pt-2 text-xs text-fg-subtle", workspace && "ws:flex ws:min-h-9 ws:items-center ws:px-1.5 ws:py-0")} data-testid="champion-preview-small-divider">
      Fewer than {OPPONENT_MIN_GAMES} games: not ranked by win rate
    </li>
  );
}

/** Its width less its side padding (the region's container width), compared with `rem`: true from it, rechecked as it resizes. */
function useWideAs(ref: React.RefObject<HTMLElement | null>, rem: number, active: boolean): boolean {
  const [wide, setWide] = React.useState(true);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!active || !el) return;
    const check = () => {
      const s = getComputedStyle(el);
      setWide(el.clientWidth - (parseFloat(s.paddingLeft) || 0) - (parseFloat(s.paddingRight) || 0) >= rem * rootPx() - 0.5);
    };
    check();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(check) : null;
    observer?.observe(el);
    return () => observer?.disconnect();
  }, [ref, rem, active]);
  return wide;
}

/** The bands of the preview above its opponents' region (the identity, the positions, the figures): a wrap there moves the rows. */
function bandsAbove(region: HTMLElement | null): Element[] {
  const root = region?.parentElement;
  return root ? [...root.children].filter((el) => el !== region) : [];
}

/** The page's rows' range in words, for the page change the reader made: "Lane opponents 11 to 20 of 40". */
const rangeWords = (noun: string, from: number, to: number, total: number) => `${noun} ${formatCount(from)} to ${formatCount(to)} of ${formatCount(total)}`;

/**
 * The workspace's opponents (docs/MATCHUPS.md, "The workspace"): the toolbar line, the grid in two
 * columns and its pages, or an opponent's detail in its place; the region's footer at the card's foot
 * (the coverage and the pager, or the link to Matchup Intel and the games' pager).
 */
function WorkspaceMatchups({ isOwn, me, role, vs, champ, data, onVs, onMatch, titleId, searchable, sort, setSort, query, setQuery, all, arranged, open, detailId, state, answer, preview, paged = false, perColumnCap = null }: SharedProps & { paged?: boolean; perColumnCap?: number | null }) {
  const regionRef = React.useRef<HTMLElement>(null);
  const toolbarRef = React.useRef<HTMLDivElement>(null);
  const headsRef = React.useRef<HTMLDivElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);
  const footRef = React.useRef<HTMLDivElement>(null);
  const cardRef = React.useRef<HTMLElement | null>(null);
  React.useLayoutEffect(() => {
    cardRef.current = regionRef.current?.closest<HTMLElement>("[data-preview-pane]") ?? regionRef.current;
  });
  const hintId = `${titleId}-opponents-hint`;
  const rangeId = `${titleId}-opponents-range`;
  const twoColumns = useWideAs(regionRef, OPP_TWO_COLUMNS_REM, paged);
  const columns: 1 | 2 = twoColumns ? 2 : 1;
  const grid = !!preview && !!role && all.length > 0 && !open;
  const drawn = grid && arranged.rows.length > 0;
  const budget = useRowBudget(listRef, {
    footRef,
    cardRef,
    rowSelector: "[data-testid=champion-preview-opponent], [data-testid=champion-preview-small-divider]",
    probeRem: 2.25,
    active: paged && drawn,
    observe: () => [...bandsAbove(regionRef.current), toolbarRef.current, headsRef.current],
    key: [all.length, me.id, role, query, sort, columns, arranged.rows.length],
    cap: perColumnCap,
  });
  // The rows a column shows: the last measured while the grid gives way to an opponent's games, so
  // its page follows the opponent stepped to and comes back as it was.
  const perColumn = paged ? budget : null;
  const perPage = perColumn === null ? null : perColumn * columns;
  const divider = sort === "games" ? null : arranged.divider;
  const pages = React.useMemo(() => (perPage === null ? null : slotPages(arranged.rows, perPage, divider)), [arranged.rows, perPage, divider]);
  const firstRow = (slots: ReadonlyArray<Slot<OpponentTally>> | undefined) => slots?.find((x): x is Extract<Slot<OpponentTally>, { kind: "row" }> => x.kind === "row")?.index ?? 0;
  const lastRow = (slots: ReadonlyArray<Slot<OpponentTally>> | undefined) => [...(slots ?? [])].reverse().find((x): x is Extract<Slot<OpponentTally>, { kind: "row" }> => x.kind === "row")?.index ?? 0;
  const { page, go } = usePagedList(
    { perPage, total: arranged.rows.length, selected: vs, selectedIndex: vs ? arranged.rows.findIndex((o) => o.championId === vs) : -1, search: query, order: sort, data: data.scopeKey, reset: role },
    pages ? { pageOfIndex: (i) => slotPageOf(pages, i), firstOf: (p) => firstRow(pages[p - 1]), pages: pages.length } : undefined,
  );
  const slots = pages ? (pages[page - 1] ?? []) : null;
  const [live, setLive] = React.useState("");
  const total = arranged.rows.length;
  const words = (p: number) => (pages ? rangeWords("Lane opponents", firstRow(pages[p - 1]) + 1, lastRow(pages[p - 1]) + 1, total) : "");
  const turn = (p: number) => {
    go(p);
    setLive(words(p));
  };
  // Focus: the heading of the detail an opponent opened; the opponent's cell when the grid comes back.
  const focusTitle = React.useRef(false);
  const focusCell = React.useRef<string | null>(null);
  const was = React.useRef(vs);
  React.useLayoutEffect(() => {
    const left = was.current;
    was.current = vs;
    if (vs && focusTitle.current) document.getElementById(`${detailId}-title`)?.focus({ preventScroll: true });
    focusTitle.current = false;
    if (left && !vs) {
      // All opponents or Escape: back on the cell it left from, where the focus was in the pane or nowhere.
      const at = document.activeElement;
      if (!at || at === document.body || !!at.closest("[data-preview-pane]")) focusCell.current = left;
    }
  }, [vs, detailId]);
  React.useLayoutEffect(() => {
    const id = focusCell.current;
    if (!id) return;
    const cell = listRef.current?.querySelector<HTMLButtonElement>(`[data-opponent-row="${CSS.escape(id)}"]`);
    if (cell) {
      cell.focus({ preventScroll: true });
      focusCell.current = null;
    }
  });
  const pick = (id: string) => {
    focusTitle.current = vs !== id;
    onVs(vs === id ? null : id);
  };
  // The grid's keys (docs/MATCHUPS.md, "Keyboard"): ↑/↓ down the reading order across pages, ←/→ to the
  // same row of the other column, PageUp/PageDown a page, Home/End the first or the last opponent.
  const onGridKey = (e: React.KeyboardEvent) => {
    if (!pages || !slots || e.altKey || e.ctrlKey || e.metaKey) return;
    const cell = (e.target as Element).closest<HTMLElement>("[data-opponent-row]");
    if (!cell) return;
    const i = arranged.rows.findIndex((o) => o.championId === cell.dataset.opponentRow);
    if (i < 0) return;
    let to = -1;
    if (e.key === "ArrowDown") to = i + 1;
    else if (e.key === "ArrowUp") to = i - 1;
    else if (e.key === "Home") to = 0;
    else if (e.key === "End") to = total - 1;
    else if (e.key === "PageDown") to = page < pages.length ? firstRow(pages[page]) : -1;
    else if (e.key === "PageUp") to = page > 1 ? firstRow(pages[page - 2]) : -1;
    else if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && columns === 2) {
      const at = slots.findIndex((x) => x.kind === "row" && x.index === i);
      const rows = columnRows(slots.length, perColumn ?? 1, 2);
      const toColumn = Math.floor(at / rows) + (e.key === "ArrowRight" ? 1 : -1);
      const target = toColumn >= 0 && toColumn < 2 ? slots[toColumn * rows + (at % rows)] : undefined;
      to = target && target.kind === "row" ? target.index : -1;
    } else return;
    e.preventDefault();
    if (to < 0 || to >= total || to === i) return;
    const p = slotPageOf(pages, to);
    focusCell.current = arranged.rows[to]!.championId;
    if (p !== page) turn(p);
    else listRef.current?.querySelector<HTMLButtonElement>(`[data-opponent-row="${CSS.escape(arranged.rows[to]!.championId)}"]`)?.focus({ preventScroll: true });
  };

  const onPage = slots ? slots.length : 0;
  const rowsHere = slots ? columnRows(onPage, perColumn ?? 1, columns) : 2;
  const secondColumn = slots ? columns === 2 && onPage > rowsHere : arranged.rows.length + (divider !== null ? 1 : 0) > 2;
  const range = slots ? { from: firstRow(slots) + 1, to: lastRow(slots) + 1 } : null;
  const onePage = !pages || pages.length <= 1;

  const toolbar = (
    <div ref={toolbarRef} className="flex flex-wrap items-center gap-x-3 gap-y-2" data-fit-fixed="">
      <div className="mr-auto flex items-baseline gap-x-2">
        <h3 id={`${titleId}-opponents`} className="text-base font-semibold text-fg">
          Lane opponents
        </h3>
        {preview && all.length ? (
          <span className="text-sm tabular-nums text-fg-muted" data-testid="champion-preview-opponent-count">
            {formatCount(all.length)}
            {role ? <span className="sr-only"> as {ROLE_LABELS[role]}</span> : null}
          </span>
        ) : null}
        <InfoTip text={aboutOpponents(isOwn)} label="About lane opponents" className="self-center" />
      </div>
      {preview && searchable ? <SearchInput value={query} onChange={setQuery} placeholder="Find an opponent…" label="Find a lane opponent" className="min-w-[9rem] flex-[1_1_9rem]" testId="opponent-search" /> : null}
      {preview && all.length > 1 ? (
        <div role="radiogroup" aria-label="Order the opponents" className={segmentedGroupClass()}>
          {OPPONENT_SORTS.map((s) => (
            <button key={s.key} type="button" role="radio" aria-checked={sort === s.key} onClick={() => setSort(s.key)} className={segmentClass(sort === s.key, { size: "sm" })} data-testid={`opponent-sort-${s.key}`}>
              {/* Below a 43rem region the visible words are short, and the rest is read out after them (the name starts with what is seen). */}
              {s.key === "games" ? (
                s.label
              ) : (
                <span>
                  {s.short}
                  <span className="@max-[43rem]/opp:sr-only"> win rate</span>
                </span>
              )}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );

  let body: React.ReactNode;
  if (!role) body = <div className="ws:mt-2"><NoPosition /></div>;
  else if (!preview) body = <div className="ws:mt-2"><Waiting answer={answer} /></div>;
  else if (!all.length) body = <div className="ws:mt-2"><NoOpponents /></div>;
  else if (open)
    body = (
      <WorkspacePairing
        id={detailId}
        me={me}
        them={champ(open.championId)}
        o={open}
        role={role}
        isOwn={isOwn}
        data={data}
        onMatch={onMatch}
        onBack={() => onVs(null)}
        steps={(() => {
          const at = arranged.rows.findIndex((o) => o.championId === open.championId);
          const prev = at > 0 ? arranged.rows[at - 1]! : null;
          const next = at >= 0 && at < arranged.rows.length - 1 ? arranged.rows[at + 1]! : null;
          return { prev: prev ? () => onVs(prev.championId) : null, next: next ? () => onVs(next.championId) : null, label: "Opponent", prevTestId: "champion-preview-opponent-prev", nextTestId: "champion-preview-opponent-next", at: at >= 0 ? at + 1 : null, of: arranged.rows.length };
        })()}
        paged={paged}
        perColumnCap={perColumnCap}
        regionRef={regionRef}
        cardRef={cardRef}
      />
    );
  else
    body = (
      <div className="ws:mt-2">
        {/* One head per column, as the cells (read out by each cell's own words): the second only where that column has cells. */}
        <div ref={headsRef} className={cn("grid gap-x-4", slots ? (columns === 2 ? "grid-cols-2" : "grid-cols-1") : "grid-cols-1 ws:grid-cols-2 [&>:nth-child(2)]:hidden ws:[&>:nth-child(2)]:grid")} aria-hidden data-testid="champion-preview-opponent-heads">
          {[0, 1].slice(0, secondColumn ? 2 : 1).map((c) => (
            <div key={c} className={cn(ROWS, OPP_CELL, "border-b border-border/60 px-2 pb-1.5")} data-testid="champion-preview-opponent-head">
              <span className="label-text">Opponent</span>
              <span className="label-text text-right">Games</span>
              <span className="label-text text-right ws:hidden">Record</span>
              <span className="label-text text-right">Win rate</span>
            </div>
          ))}
        </div>
        {arranged.rows.length ? (
          <ul
            ref={listRef}
            aria-label="Lane opponents"
            aria-describedby={`${hintId} ${rangeId}`}
            onKeyDown={onGridKey}
            className={cn(
              slots ? cn("relative grid grid-flow-col gap-x-4", columns === 2 ? "grid-cols-2" : "grid-cols-1") : "flex flex-col ws:relative ws:grid ws:grid-flow-col ws:grid-cols-2 ws:gap-x-4 ws:[grid-template-rows:repeat(2,auto)] ws:[&>li:nth-child(n+5)]:hidden",
              // A hairline down the middle of the gap between the columns: a rule, not a box.
              secondColumn && columns === 2 && "ws:before:absolute ws:before:inset-y-0 ws:before:left-1/2 ws:before:w-px ws:before:bg-border/60",
            )}
            style={slots ? { gridTemplateRows: `repeat(${rowsHere}, auto)` } : undefined}
            data-testid="champion-preview-opponent-list"
            data-ws-region="opponents"
            data-per={perPage ?? undefined}
            data-page={pages ? page : undefined}
            data-pages={pages ? pages.length : undefined}
            data-total={total}
          >
            {slots
              ? slots.map((x, n) => (x.kind === "divider" ? <SmallDivider key={`divider-${n}`} workspace /> : <OpponentRow key={x.item.championId} o={x.item} them={champ(x.item.championId)} selected={vs === x.item.championId} controls={detailId} onPick={() => pick(x.item.championId)} workspace strongGames={sort === "games"} />))
              : arranged.rows.map((o, i) => (
                  <React.Fragment key={o.championId}>
                    {arranged.divider === i ? <SmallDivider workspace /> : null}
                    <OpponentRow o={o} them={champ(o.championId)} selected={vs === o.championId} controls={detailId} onPick={() => pick(o.championId)} workspace strongGames={sort === "games"} />
                  </React.Fragment>
                ))}
          </ul>
        ) : (
          <NoMatch query={query} />
        )}
        <span id={hintId} className="sr-only">
          Choose an opponent to see each game against it and the lane at 10:00.
        </span>
      </div>
    );

  const coverage = preview && role ? opponentCoverage(preview.known, preview.games) : null;
  return (
    <section
      ref={regionRef}
      aria-labelledby={`${titleId}-opponents`}
      className="@container/opp flex flex-col gap-2.5 ws:-mx-5 ws:mt-3 ws:flex-1 ws:gap-0 ws:border-t ws:border-border/70 ws:px-5 ws:pt-3"
      data-testid="champion-preview-opponents"
      data-state={state}
    >
      {open && preview && role ? null : toolbar}
      {open && preview && role ? (
        // The opponent's heading stands in the detail; the region keeps a name for screen readers.
        <h3 id={`${titleId}-opponents`} className="sr-only">
          Lane opponents
        </h3>
      ) : null}
      {body}
      {open && preview && role ? null : (
        <div ref={footRef} className="mt-auto hidden min-h-11 items-center gap-3 border-t border-border/70 ws:flex" data-ws-foot="" data-testid="champion-preview-opponents-foot">
          {preview && role ? (
            coverage ? (
              <p className="min-w-0 flex-[0_1_auto] text-xs text-fg-subtle" data-testid="champion-preview-foot">
                {coverage}
              </p>
            ) : (
              <p className="sr-only" data-testid="champion-preview-foot">
                Every game here names its lane opponent.
              </p>
            )
          ) : null}
          {drawn ? (
            <Pager
              layout="inline"
              label="Lane opponent pages"
              page={page}
              pages={pages?.length ?? 1}
              onPage={turn}
              range={
                onePage || !range ? (
                  plural(total, "lane opponent")
                ) : (
                  <>
                    <span className="sr-only">Lane opponents </span>
                    {formatCount(range.from)}–{formatCount(range.to)} of {formatCount(total)}
                  </>
                )
              }
              widest={`${total}–${total} of ${total}`}
              rangeId={rangeId}
              prevLabel="Previous page"
              nextLabel="Next page"
              live={live}
              testId="opponents-pager"
              prevTestId="opponents-prev"
              nextTestId="opponents-next"
            />
          ) : null}
        </div>
      )}
    </section>
  );
}

function OpponentRow({ o, them, selected, controls, onPick, workspace = false, strongGames = false }: { o: OpponentTally; them: PortraitChampion; selected: boolean; controls: string; onPick: () => void; workspace?: boolean; strongGames?: boolean }) {
  const rate = o.wins / o.games;
  const small = smallSample(o);
  return (
    <li data-testid="champion-preview-opponent" data-champion={o.championId} data-games={o.games} data-small={small || undefined}>
      <button
        type="button"
        aria-pressed={selected}
        aria-controls={selected ? controls : undefined}
        onClick={onPick}
        className={cn(
          ROWS,
          "relative min-h-9 w-full scroll-mt-(--preview-head) rounded-md px-2 py-1 text-left transition-colors duration-150 hover:bg-surface-2/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent pointer-coarse:min-h-11",
          workspace && OPP_CELL,
          selected && "bg-surface-3 hover:bg-surface-3 before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:rounded-full before:bg-accent",
        )}
        data-opponent-row={o.championId}
      >
        <span className="flex min-w-0 items-center gap-2">
          <ChampionPortrait champion={them} size="xs" className="shrink-0 rounded" />
          <span className="min-w-0 truncate text-sm font-medium text-fg" title={workspace ? them.name : undefined}>
            {them.name}
          </span>
        </span>
        <span className={cn("text-right text-sm tabular-nums text-fg", workspace && "whitespace-nowrap", workspace && strongGames && "ws:font-semibold")} data-testid="opponent-games">
          {formatCount(o.games)}
          <span className="sr-only"> game{o.games === 1 ? "" : "s"}</span>
          {workspace ? (
            // The workspace's merged cell: the record after the games ("9 · 5W 4L"), in words for screen readers.
            <span className="hidden text-xs font-normal text-fg-muted ws:inline">
              <span aria-hidden> · {record(o.wins, o.games)}</span>
              <span className="sr-only">
                , {formatCount(o.wins)} win{o.wins === 1 ? "" : "s"} {formatCount(o.games - o.wins)} loss{o.games - o.wins === 1 ? "" : "es"}
              </span>
            </span>
          ) : null}
        </span>
        <span className={cn("text-right text-xs tabular-nums text-fg-muted", workspace && "ws:hidden")}>{record(o.wins, o.games)}</span>
        <span className={cn("text-right text-sm font-semibold tabular-nums", small ? "text-fg-subtle" : o.games >= OPPONENT_TONED_GAMES ? WIN_RATE_TONE_CLASS[winRateTone(rate, o.games, OPPONENT_TONED_GAMES)] : "text-fg")} data-testid="opponent-win-rate">
          {percent(rate, 0)}
          {small ? <span className="sr-only"> (small sample)</span> : null}
        </span>
      </button>
    </li>
  );
}

/** One opponent's games against the champion in this position: loaded once per scope (the server's render seeds a linked one). */
function usePairing(me: PortraitChampion, them: PortraitChampion, role: Role, isOwn: boolean, data: PreviewData) {
  const key = `${data.scopeKey}|${me.id}|${role}|${them.id}`;
  const init = data.initial.pairing;
  const seed = init && init.champion === me.id && init.role === role && init.vs === them.id ? init : null;
  const answer = useAnswer<PairingGamesData>(key, data.generation, () => data.pairing(me.id, role, them.id), seed);
  const pairing = answer?.status === "ok" ? answer.data : null;
  const sentence = pairing ? opponentSentence(pairing.ten, { isOwn, champion: me.name, opponent: them.name }) : null;
  const kda = pairing ? pairingKda(pairing.games) : null;
  return { answer, pairing, sentence, kda };
}

/** One game's row: the result, K/D/A, CS, the gold at 10:00 and the date; it opens the game's window. */
function GameRow({ g, onMatch }: { g: PairingGamesData["games"][number]; onMatch: (matchId: string) => void }) {
  return (
    <li>
      <button type="button" onClick={() => onMatch(g.matchId)} className={cn(GAMES, "min-h-8 w-full rounded-md px-1 text-left text-sm tabular-nums transition-colors duration-150 hover:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent pointer-coarse:min-h-11")} data-testid="champion-preview-game">
        <span className={cn("font-semibold", g.win ? "text-good" : "text-bad")}>
          <span aria-hidden>{g.win ? "W" : "L"}</span>
          <span className="sr-only">{g.win ? "Win" : "Loss"}</span>
        </span>
        <span className="whitespace-nowrap text-fg" data-testid="champion-preview-game-kda">
          {g.kills === null ? "—" : `${g.kills}/${g.deaths ?? 0}/${g.assists ?? 0}`}
        </span>
        <span className="whitespace-nowrap text-right text-fg">{g.cs === null ? "—" : formatCount(g.cs)}</span>
        <span className={cn("whitespace-nowrap text-right", g.gold10 === null ? "text-xs text-fg-subtle" : "text-fg")}>{g.gold10 === null ? (g.timeline === "frames" ? "—" : "no timeline") : `${g.gold10 > 0 ? "+" : g.gold10 < 0 ? "−" : "±"}${formatCount(Math.abs(Math.round(g.gold10)))}`}</span>
        <span className="whitespace-nowrap text-right text-xs text-fg-subtle">{formatDayMonth(g.playedAt)}</span>
      </button>
    </li>
  );
}

function GamesHead({ className }: { className?: string }) {
  return (
    <div className={cn(GAMES, "border-b border-border/60 px-1 pb-1.5", className)} aria-hidden>
      <span />
      <span className="label-text">K/D/A</span>
      <span className="label-text text-right">CS</span>
      <span className="label-text whitespace-nowrap text-right">Gold at 10:00</span>
      <span className="label-text text-right">Date</span>
    </div>
  );
}

/** One opponent's games against the champion in this position: their KDA, the lane at 10:00, each game, and Champion Intel. */
function PairingDetail({ id, me, them, o, role, isOwn, data, onMatch, onBack, backRef, onClose }: { id: string; me: PortraitChampion; them: PortraitChampion; o: OpponentTally; role: Role; isOwn: boolean; data: PreviewData; onMatch: (matchId: string) => void; onBack: () => void; backRef: React.Ref<HTMLButtonElement>; onClose: () => void }) {
  const { answer, pairing, sentence, kda } = usePairing(me, them, role, isOwn, data);
  const rate = o.wins / o.games;
  const small = smallSample(o);
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="flex flex-col gap-3" data-testid="champion-preview-pairing" data-champion={them.id}>
      {/* A narrow preview: this step replaces the table, and goes back to it. */}
      <button ref={backRef} type="button" onClick={onBack} className="-ml-1 inline-flex min-h-9 scroll-mt-(--preview-head) items-center gap-1 self-start rounded-md px-1 text-sm font-medium text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:min-h-11 @min-[38rem]/detail:hidden" data-testid="champion-preview-opponents-back">
        <ChevronLeft className="h-4 w-4" aria-hidden />
        All opponents
      </button>
      <header className="flex items-center gap-3">
        <ChampionPortrait champion={them} size="sm" className="h-10 w-10 shrink-0 rounded-lg" />
        <div className="min-w-0 flex-1">
          <h4 id={`${id}-title`} className="text-base font-semibold text-fg">
            <span className="font-normal text-fg-muted">vs </span>
            {them.name}
          </h4>
          <p className="text-sm tabular-nums text-fg-muted" data-testid="champion-preview-pairing-record">
            <span className="font-semibold text-fg">{plural(o.games, "game")}</span> · {record(o.wins, o.games)} · <span className={cn("font-semibold", small ? "text-fg-subtle" : o.games >= OPPONENT_TONED_GAMES ? WIN_RATE_TONE_CLASS[winRateTone(rate, o.games, OPPONENT_TONED_GAMES)] : "text-fg")}>{percent(rate, 0)}</span>
            {small ? <span className="text-fg-subtle"> (small sample)</span> : null}
          </p>
        </div>
        {/* Beside the table: put the opponent back (the row again does the same). */}
        <button type="button" onClick={onClose} className="hidden min-h-9 shrink-0 items-center rounded-md px-2 text-xs font-medium text-fg-muted hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:min-h-11 @min-[38rem]/detail:inline-flex" data-testid="champion-preview-pairing-close">
          Clear
        </button>
      </header>
      {kda && pairing ? (
        <p className="text-sm tabular-nums text-fg-muted" data-testid="champion-preview-pairing-kda">
          <span className="font-semibold text-fg">{kda.perfect ? "Perfect KDA" : `KDA ${kda.ratio.toFixed(2)}`}</span> · {kda.kills.toFixed(1)} / {kda.deaths.toFixed(1)} / {kda.assists.toFixed(1)}{" "}
          <span className="text-fg-subtle">{kda.games === pairing.games.length ? (kda.games === 1 ? "in this game" : `over these ${formatCount(kda.games)} games`) : `over the ${plural(kda.games, "game")} with a full record`}</span>
        </p>
      ) : null}
      {sentence ? (
        <p className="text-sm text-fg-muted" data-testid="champion-preview-sentence">
          {sentence}
        </p>
      ) : null}
      {!pairing ? (
        answer?.status === "not-found" ? (
          <p className="text-sm text-fg-muted">{answer.message}</p>
        ) : (
          <div className="h-24 animate-pulse rounded-md bg-surface-2/70" aria-hidden />
        )
      ) : pairing.games.length ? (
        <div>
          <GamesHead />
          <ul className="flex flex-col" data-testid="champion-preview-games">
            {pairing.games.map((g) => (
              <GameRow key={g.matchId} g={g} onMatch={onMatch} />
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-fg-muted">These games could not be read yet.</p>
      )}
      {/* Matchup Intel is Compare with a lane (docs/MATCHUP_INTEL.md): the two champions and this position as its lane. */}
      <Link href={intelHref({ id: me.id, haste: 0 }, { id: them.id, haste: 0 }, { lane: role })} prefetch={false} className="inline-flex min-h-9 items-center gap-1.5 self-start text-sm font-medium text-accent hover:underline pointer-coarse:min-h-11" data-testid="champion-preview-lookup">
        <ScanSearch className="h-4 w-4 shrink-0" aria-hidden />
        {me.name} vs {them.name} in Matchup Intel
      </Link>
    </section>
  );
}

/**
 * The workspace's detail, in the grid's place (docs/MATCHUPS.md, "An opponent, in place"): one header
 * line ("‹ All opponents", the opponent, its record, ‹ n of N › to the next in the grid's order), the
 * KDA and the lane at 10:00 in one paragraph, and its games in two columns, paged by the rows that
 * fit; the region's footer holds the link to Matchup Intel and the games' pager. Not remounted per
 * opponent: ‹ › keeps the focus on itself, and the games start again at their first page.
 */
function WorkspacePairing({ id, me, them, o, role, isOwn, data, onMatch, onBack, steps, paged, perColumnCap, regionRef, cardRef }: { id: string; me: PortraitChampion; them: PortraitChampion; o: OpponentTally; role: Role; isOwn: boolean; data: PreviewData; onMatch: (matchId: string) => void; onBack: () => void; steps: { prev: (() => void) | null; next: (() => void) | null; label: string; prevTestId: string; nextTestId: string; at: number | null; of: number }; paged: boolean; perColumnCap: number | null; regionRef: React.RefObject<HTMLElement | null>; cardRef: React.RefObject<HTMLElement | null> }) {
  const { answer, pairing, sentence, kda } = usePairing(me, them, role, isOwn, data);
  const headerRef = React.useRef<HTMLElement>(null);
  const paragraphRef = React.useRef<HTMLParagraphElement>(null);
  const headsRef = React.useRef<HTMLDivElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);
  const footRef = React.useRef<HTMLDivElement>(null);
  const stepsRef = React.useRef<HTMLDivElement>(null);
  const twoColumns = useWideAs(regionRef, GAMES_TWO_COLUMNS_REM, paged);
  const columns: 1 | 2 = twoColumns ? 2 : 1;
  const games = React.useMemo(() => pairing?.games ?? [], [pairing]);
  const budget = useRowBudget(listRef, {
    footRef,
    cardRef,
    rowSelector: ":scope > li",
    probeRem: 2,
    active: paged && games.length > 0,
    observe: () => [...bandsAbove(regionRef.current), headerRef.current, paragraphRef.current, headsRef.current],
    key: [games.length, them.id, columns, !!sentence],
    cap: perColumnCap,
  });
  const perColumn = paged ? budget : null;
  const perPage = perColumn === null ? null : perColumn * columns;
  const { page, go } = usePagedList({ perPage, total: games.length, selected: null, selectedIndex: -1, search: "", order: null, data: data.scopeKey, reset: them.id });
  const shown = perPage === null ? games : games.slice((page - 1) * perPage, page * perPage);
  const pages = perPage === null ? 1 : pageCount(games.length, perPage);
  const range = perPage === null ? null : pageRange(page, perPage, games.length);
  const [live, setLive] = React.useState("");
  const turn = (p: number) => {
    go(p);
    if (perPage !== null) {
      const r = pageRange(p, perPage, games.length);
      setLive(rangeWords("Games", r.from, r.to, games.length));
    }
  };
  // ‹ › to the next opponent: the focus stays on the button pressed, or on the other where it is now disabled at an end.
  const stepped = React.useRef(false);
  React.useLayoutEffect(() => {
    if (!stepped.current) return;
    stepped.current = false;
    const at = document.activeElement as HTMLButtonElement | null;
    if (at && at !== document.body && !at.disabled) return;
    [...(stepsRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])].find((b) => !b.disabled)?.focus({ preventScroll: true });
  }, [them.id]);
  const step = (fn: (() => void) | null) =>
    fn
      ? () => {
          stepped.current = true;
          fn();
        }
      : null;
  const rows = perPage === null ? 2 : columnRows(shown.length, perColumn ?? 1, columns);
  const secondColumn = perPage === null ? games.length > 2 : columns === 2 && shown.length > rows;
  const rate = o.wins / o.games;
  const small = smallSample(o);
  return (
    <>
      <section id={id} aria-labelledby={`${id}-title`} className="flex flex-col gap-2" data-testid="champion-preview-pairing" data-champion={them.id}>
        <header ref={headerRef} className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <button type="button" onClick={onBack} className="-ml-1 inline-flex min-h-9 items-center gap-1 rounded-md px-1 text-sm font-medium text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:min-h-11" data-testid="champion-preview-opponents-back">
            <ChevronLeft className="h-4 w-4" aria-hidden />
            All opponents
          </button>
          <span className="flex min-w-0 items-center gap-2">
            <ChampionPortrait champion={them} size="xs" className="h-7 w-7 shrink-0 rounded" />
            <h4 id={`${id}-title`} tabIndex={-1} aria-describedby={`${id}-record ${id}-paragraph`} className="whitespace-nowrap text-base font-semibold text-fg outline-none focus-visible:outline-2 focus-visible:outline-accent">
              <span className="font-normal text-fg-muted">vs </span>
              {them.name}
            </h4>
          </span>
          <p id={`${id}-record`} className="whitespace-nowrap text-sm tabular-nums text-fg-muted" data-testid="champion-preview-pairing-record">
            <span className="font-semibold text-fg">{plural(o.games, "game")}</span> · {record(o.wins, o.games)} · <span className={cn("font-semibold", rateClass(o))}>{percent(rate, 0)}</span>
            {small ? <span className="text-fg-subtle"> (small sample)</span> : null}
          </p>
          <div ref={stepsRef} className="ml-auto flex shrink-0 items-center gap-1" data-testid="champion-preview-opponent-steps">
            <SiblingSteps siblings={{ ...steps, prev: step(steps.prev), next: step(steps.next) }} position={steps.at ? { at: steps.at, of: steps.of } : undefined} />
          </div>
        </header>
        <p ref={paragraphRef} id={`${id}-paragraph`} className="text-sm tabular-nums text-fg-muted" data-testid="champion-preview-pairing-kda">
          {kda && pairing ? (
            <>
              <span className="font-semibold text-fg">{kda.perfect ? "Perfect KDA" : `KDA ${kda.ratio.toFixed(2)}`}</span> · {kda.kills.toFixed(1)} / {kda.deaths.toFixed(1)} / {kda.assists.toFixed(1)}{" "}
              <span className="text-fg-subtle">{kda.games === pairing.games.length ? (kda.games === 1 ? "in this game" : `over these ${formatCount(kda.games)} games`) : `over the ${plural(kda.games, "game")} with a full record`}</span>
            </>
          ) : null}
          {sentence ? (
            <>
              {" "}
              <span data-testid="champion-preview-sentence">
                {sentence}
              </span>
            </>
          ) : null}
        </p>
        {!pairing ? (
          answer?.status === "not-found" ? (
            <p className="text-sm text-fg-muted">{answer.message}</p>
          ) : (
            <div className="h-24 animate-pulse rounded-md bg-surface-2/70" aria-hidden />
          )
        ) : games.length ? (
          <div>
            <div ref={headsRef} className={cn("grid gap-x-4", perPage === null ? "grid-cols-1 ws:grid-cols-2 [&>:nth-child(2)]:hidden ws:[&>:nth-child(2)]:grid" : columns === 2 ? "grid-cols-2" : "grid-cols-1")} aria-hidden>
              {[0, 1].slice(0, secondColumn ? 2 : 1).map((c) => (
                <GamesHead key={c} />
              ))}
            </div>
            <ul
              ref={listRef}
              aria-label={`${them.name}: ${plural(games.length, "game")}`}
              aria-describedby={`${id}-games-range`}
              className={cn(
                perPage === null ? "flex flex-col ws:relative ws:grid ws:grid-flow-col ws:grid-cols-2 ws:gap-x-4 ws:[grid-template-rows:repeat(2,auto)] ws:[&>li:nth-child(n+5)]:hidden" : cn("relative grid grid-flow-col gap-x-4", columns === 2 ? "grid-cols-2" : "grid-cols-1"),
                secondColumn && columns === 2 && "ws:before:absolute ws:before:inset-y-0 ws:before:left-1/2 ws:before:w-px ws:before:bg-border/60",
              )}
              style={perPage === null ? undefined : { gridTemplateRows: `repeat(${rows}, auto)` }}
              data-testid="champion-preview-games"
              data-ws-region="games"
              data-per={perPage ?? undefined}
              data-page={perPage === null ? undefined : page}
              data-pages={perPage === null ? undefined : pages}
              data-total={games.length}
            >
              {shown.map((g) => (
                <GameRow key={g.matchId} g={g} onMatch={onMatch} />
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-fg-muted">These games could not be read yet.</p>
        )}
      </section>
      <div ref={footRef} className="mt-auto hidden min-h-11 items-center gap-3 border-t border-border/70 ws:flex" data-ws-foot="" data-testid="champion-preview-opponents-foot">
        {/* Matchup Intel is Compare with a lane (docs/MATCHUP_INTEL.md): the two champions and this position as its lane. */}
        <Link href={intelHref({ id: me.id, haste: 0 }, { id: them.id, haste: 0 }, { lane: role })} prefetch={false} className="inline-flex min-h-9 min-w-0 flex-[0_1_auto] items-center gap-1.5 text-sm font-medium text-accent hover:underline" data-testid="champion-preview-lookup">
          <ScanSearch className="h-4 w-4 shrink-0" aria-hidden />
          <span className="truncate">
            <span className="sr-only">
              {me.name} vs {them.name} in{" "}
            </span>
            Matchup Intel
          </span>
        </Link>
        {games.length ? (
          <Pager
            layout="inline"
            label={`${them.name}'s games, pages`}
            page={page}
            pages={pages}
            onPage={turn}
            range={pages <= 1 || !range ? plural(games.length, "game") : `Games ${formatCount(range.from)}–${formatCount(range.to)} of ${formatCount(games.length)}`}
            widest={`Games ${games.length}–${games.length} of ${games.length}`}
            rangeId={`${id}-games-range`}
            prevLabel="Previous page"
            nextLabel="Next page"
            live={live}
            testId="games-pager"
            prevTestId="games-prev"
            nextTestId="games-next"
          />
        ) : null}
      </div>
    </>
  );
}
