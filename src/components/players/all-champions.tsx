"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import type { OverviewCard, PlayerOverviewData } from "@/server/players/overview";
import type { MatchupsData } from "@/server/players/matchups";
import { ROLE_LABELS } from "@/domain/roles";
import { seasonLabel } from "@/domain/season";
import { seasonModeInfo } from "@/domain/season-stats";
import { ChampionPortrait, type PortraitChampion } from "@/components/champion-portrait";
import { normalise } from "@/components/champions/types";
import { ModeElsewhere, OverviewFilters } from "./overview-filters";
import { SearchInput } from "@/components/ui/search-input";
import { selectClass } from "@/components/ui/input";
import { percent, formatCount, formatCompactCount } from "@/lib/format";
import { cn } from "@/lib/cn";
import { WIN_RATE_MIN_GAMES, WIN_RATE_TONE_CLASS, winRateSampleNote, winRateTone } from "@/domain/stats/win-rate";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { ChampionWindow, useChampionWindow } from "./champion-window";
import { MULTIKILL_KINDS, compareMultikills, multikillCoverage, rarestMultikill, type MultikillCounts, type MultikillSummary } from "@/domain/multikills";
import { MULTIKILL_HELP, MULTIKILL_SHORT } from "./multikill-summary";
import { InfoTip } from "@/components/ui/info-tip";
import { DataStatusNote, RefreshButton, type DataRefreshTarget } from "@/components/ui/data-status";
import { SectionHeader } from "@/components/ui/section-header";
import { COMPACT_SEARCH, FiltersControl, PageToolbar } from "@/components/ui/page-toolbar";
import { QuietBar } from "@/components/ui/quiet-bar";
import type { DataStatus } from "@/domain/data-status";
import type { CardLook } from "@/domain/card-style";
import { RoleTag } from "@/components/role-icon";

type KindKey = keyof MultikillCounts;
type SortKey = "champion" | "games" | "win" | "kda" | "cs" | "kills" | "multikills" | KindKey | "mastery";
type Dir = "asc" | "desc";
/**
 * The table's columns, in order. Multikills are one column ("multikills": the rarest kind each
 * champion has) where the list is of medium width, and four (double, triple, quadra, penta) where
 * it is wide; phones sort by any of them from Sort by, which names them as the headings do. Figures
 * are right-aligned, so they compare down the column.
 */
const COLUMNS: Array<{ key: SortKey; label: string; title?: string; layout?: "medium" | "wide" }> = [
  { key: "champion", label: "Champion" },
  { key: "games", label: "Games" },
  { key: "win", label: "Win rate" },
  { key: "kda", label: "KDA" },
  { key: "cs", label: "CS/min", title: "Creep score per minute" },
  { key: "kills", label: "Kills", title: "Every kill on the champion in these games, each game's own count added up" },
  { key: "multikills", label: "Multikills", title: "The rarest multikill on the champion in these games: pentakills first, then quadra, triple and double kills", layout: "medium" },
  ...MULTIKILL_KINDS.map((k) => ({ key: k.key, label: MULTIKILL_SHORT[k.key], title: `${k.label} in these games`, layout: "wide" as const })),
  { key: "mastery", label: "Mastery", title: "Mastery points from all of the player's Riot accounts" },
];
const isSortKey = (v: string | null): v is SortKey => !!v && COLUMNS.some((c) => c.key === v);
/** Which layout a column belongs to: shown only in that one (phones show neither as a column). */
const LAYOUT_CLASS = { medium: "@min-[76rem]:hidden", wide: "hidden @min-[76rem]:block" } as const;
const FIRST = 20;
/*
  The list's columns follow its own width (a container query), so the open or collapsed sidebar is
  taken into account. Below 44rem: phones and narrow windows, one compact row per champion (its win
  rate and games at the right, the other figures as labelled pairs under it). From 44rem: Champion,
  Games, Win rate, KDA, CS/min, Kills, Multikills (the rarest kind) and Mastery, each column wide
  enough for its name, so headings are never cut. From 76rem the four multikills get their own
  columns (Double, Triple, Quadra, Penta). The figure columns grow only to a little more than their
  heading needs and the champion takes the rest, so on a wide screen the figures stay together
  (compared down the column and along the row) instead of spreading across the page.

  The 44rem tier holds tablets from 752px wide and computers up to 1535px with the sidebar open. A
  grid grows its fixed columns to their maxima before a 1fr column gets anything, so the champion
  column keeps its minimum until the figures are full: 11.75rem, room for the portrait, the name
  and "Support · In pool" on one line (rows of about 51px for every role, in Chromium and WebKit
  from 752 to 891px). Each figure column's minimum is its heading plus room for the sort arrow
  beside it (0.875rem with its margin): at least 0.375rem more than the heading, which with the
  0.5rem gap keeps the arrow clear of the heading before it (Games follows the champion column,
  whose heading sits at its far left). With a 0.75rem padding the minimums add up to exactly 44rem,
  the card's border included, so the champion column cannot take more without a heading's arrow
  or a figure ("Perfect") losing its room.

  From 76rem the figures are grouped, as they are read: the record (Games, Win rate), the play (KDA,
  CS/min, Kills), the four multikills, and Mastery. Inside a group the columns are 0.5rem apart and
  little wider than their heading and its sort arrow (Win rate 4.75rem, each kind 4rem); the first
  column of the next group is 2rem wider, so the space before a group's first heading and figure is
  clearly larger than any space inside a group.
*/
const GRID =
  "@min-[44rem]:grid-cols-[minmax(11.75rem,1fr)_minmax(3.25rem,4.5rem)_minmax(4.5rem,6rem)_minmax(3.25rem,4.25rem)_minmax(3.5rem,4.5rem)_minmax(3rem,4.25rem)_minmax(5.25rem,6.5rem)_minmax(4.375rem,5.25rem)] @min-[44rem]:gap-x-2 @min-[44rem]:px-3 @min-[76rem]:grid-cols-[minmax(14rem,1fr)_minmax(4rem,4.5rem)_minmax(4.75rem,5.25rem)_minmax(5.5rem,6.25rem)_minmax(4rem,4.5rem)_minmax(3.5rem,4.25rem)_minmax(6rem,6.5rem)_repeat(3,minmax(4rem,4.5rem))_minmax(6.5rem,7.25rem)] @min-[76rem]:gap-x-2 @min-[76rem]:px-5";
/** A sortable number, or null when the figure is missing (missing rows always sort last). */
function sortValue(c: OverviewCard, key: SortKey): number | null {
  switch (key) {
    case "games":
      return c.selected.games;
    case "win":
      return c.selected.games > 0 ? c.selected.winRate : null;
    case "kda":
      return c.performance.kdaRatio;
    case "cs":
      return c.performance.csPerMinute;
    case "kills":
      return c.performance.totalKills;
    case "mastery":
      return c.mastery?.points ?? null;
    default:
      return null;
  }
}
/** A champion's multikills when any of its games has counts, else null (unknown, never zero). */
const countedMultikills = (c: OverviewCard): MultikillSummary | null => (c.multikills?.counted ? c.multikills : null);
const isKind = (key: SortKey): key is KindKey => MULTIKILL_KINDS.some((k) => k.key === key);
/** Sorting by the rarest multikill and by pentakills give the same order: either heading shows it. */
const sortsAs = (column: SortKey, key: SortKey) => column === key || (column === "penta" && key === "multikills") || (column === "multikills" && key === "penta");

/** A champion's multikills in words, for its cells' hover text and screen readers. */
function multikillText(c: OverviewCard): string {
  const m = c.multikills;
  if (!m || !m.games) return "No games";
  const coverage = multikillCoverage(m);
  if (!m.counted) return coverage.label;
  return `${MULTIKILL_KINDS.map((k) => `${m[k.key]} ${k.label.toLowerCase()}`).join(", ")} · ${coverage.label}`;
}

/** Marks a figure from only some of the champion's games (the rest still to come from Riot). */
function PartialMark() {
  return (
    <>
      <span className="ml-0.5 align-super text-2xs font-semibold text-warn" aria-hidden>
        *
      </span>
      <span className="sr-only"> (from some of its games only)</span>
    </>
  );
}

/** A champion's kills in words, for the cell's hover text and screen readers. */
function killsText(c: OverviewCard): string {
  const p = c.performance;
  if (p.totalKills === null) return "Kills not counted yet: Riot's full record of these games is still being collected";
  const counted = p.detailedGames < c.selected.games ? ` · from ${formatCount(p.detailedGames)} of ${formatCount(c.selected.games)} games (the others' records are still being collected)` : "";
  return `${formatCount(p.totalKills)} kill${p.totalKills === 1 ? "" : "s"} in ${formatCount(p.detailedGames)} game${p.detailedGames === 1 ? "" : "s"}${counted}`;
}

/** Every kill on the champion in these games (each game's own count added up), in both layouts. */
function TotalKills({ c, strong }: { c: OverviewCard; strong: boolean }) {
  const p = c.performance;
  return (
    <span className={cn("hidden text-right text-sm tabular-nums @min-[44rem]:block", p.totalKills === null ? "text-fg-subtle" : strong ? "font-semibold text-fg" : "text-fg-muted")} title={killsText(c)} data-testid="champion-kills">
      {p.totalKills === null ? <span aria-label="Not counted yet">—</span> : formatCount(p.totalKills)}
      {p.totalKills !== null && p.detailedGames < c.selected.games ? <PartialMark /> : null}
    </span>
  );
}

/** Narrow rows: the kills as a labelled figure ("65", "65*" from some games, "—" not counted yet). */
function killsValue(c: OverviewCard): string {
  const p = c.performance;
  if (p.totalKills === null) return "—";
  return `${formatCount(p.totalKills)}${p.detailedGames < c.selected.games ? "*" : ""}`;
}

/** The medium layout's one Multikills column: the rarest kind with its count ("1 penta"). */
function RarestMultikill({ c, strong }: { c: OverviewCard; strong: boolean }) {
  const m = countedMultikills(c);
  const top = m ? rarestMultikill(m) : null;
  return (
    <span className={cn("hidden min-w-0 whitespace-nowrap text-right text-sm @min-[44rem]:block", LAYOUT_CLASS.medium)} title={multikillText(c)} data-testid="champion-multikills">
      {!m ? (
        <span className="text-fg-subtle" aria-label="Not counted yet">
          —
        </span>
      ) : top ? (
        <>
          <span className={cn("tabular-nums", strong ? "font-semibold text-fg" : "font-medium text-fg-muted")}>{formatCount(top.count)}</span> <span className="text-xs text-fg-subtle">{MULTIKILL_SHORT[top.key].toLowerCase()}</span>
        </>
      ) : (
        <span className="text-xs text-fg-subtle">None</span>
      )}
      {m && m.counted < m.games ? <PartialMark /> : null}
    </span>
  );
}

/** The wide layout's four columns: each kind's count, a dash when none of the games has counts. */
function KindCount({ c, kind, strong }: { c: OverviewCard; kind: KindKey; strong: boolean }) {
  const m = countedMultikills(c);
  return (
    <span className={cn("text-right text-sm tabular-nums", LAYOUT_CLASS.wide, m && m[kind] ? (strong ? "font-semibold text-fg" : "text-fg-muted") : "text-fg-subtle")} title={multikillText(c)} data-testid={`champion-${kind}`}>
      {m ? (
        formatCount(m[kind])
      ) : (
        <span aria-label="Not counted yet">—</span>
      )}
      {m && m.counted < m.games ? <PartialMark /> : null}
    </span>
  );
}

/** Narrow rows: the rarest multikill ("1 triple", "none", "—" not counted yet), with * from some games only. */
function multikillValue(c: OverviewCard): string | null {
  const m = c.multikills;
  if (!m || !m.games) return null;
  if (!m.counted) return "—";
  const top = rarestMultikill(m);
  const partial = m.counted < m.games ? "*" : "";
  return top ? `${formatCount(top.count)} ${MULTIKILL_SHORT[top.key].toLowerCase()}${partial}` : `none${partial}`;
}

/** Narrow rows, sorted by one kind: that kind's count ("3", "3*" from some games, "—" not counted yet). */
function kindValue(c: OverviewCard, kind: KindKey): string | null {
  const m = c.multikills;
  if (!m || !m.games) return null;
  if (!m.counted) return "—";
  return `${formatCount(m[kind])}${m.counted < m.games ? "*" : ""}`;
}

const kdaText = (p: OverviewCard["performance"]) => (p.perfectKda ? "Perfect" : p.kdaRatio === null ? "—" : p.kdaRatio.toFixed(2));
const csText = (p: OverviewCard["performance"]) => (p.csPerMinute === null ? "—" : p.csPerMinute.toFixed(1));

/** One labelled figure under a narrow row's champion; `sorted` when the list is sorted by it. */
export interface SummaryPair {
  key: string;
  label: string;
  value: string;
  sorted: boolean;
}

/**
 * Narrow rows: the figures that are not at the row's right, as labelled pairs. The pair the list is
 * sorted by comes first (in semibold where it is drawn): KDA, CS/min, Kills, the rarest multikill
 * (also for pentakills, which sort the same) or Mastery; sorted by double, triple or quadra kills,
 * that kind's own count leads, before the others. Sorted by champion, games or win rate (the name,
 * and the figures at the row's right), the pairs are as they always were.
 */
export function summaryPairs(c: OverviewCard, sorted: SortKey): SummaryPair[] {
  const p = c.performance;
  const multi = multikillValue(c);
  const pairs: Array<Omit<SummaryPair, "sorted"> & { sortKeys: readonly SortKey[] }> = [
    { key: "kda", label: "KDA", value: kdaText(p), sortKeys: ["kda"] },
    { key: "cs", label: "CS/min", value: csText(p), sortKeys: ["cs"] },
    { key: "kills", label: "Kills", value: killsValue(c), sortKeys: ["kills"] },
    // A champion without any game to count multikills in has no Multikills pair at all.
    ...(multi === null ? [] : [{ key: "multikills", label: "Multikills", value: multi, sortKeys: ["multikills", "penta"] as const }]),
    { key: "mastery", label: "Mastery", value: masteryText(c.mastery?.points), sortKeys: ["mastery"] },
  ];
  if (sorted === "double" || sorted === "triple" || sorted === "quadra") {
    const value = kindValue(c, sorted);
    if (value !== null) pairs.unshift({ key: sorted, label: MULTIKILL_KINDS.find((k) => k.key === sorted)!.label, value, sortKeys: [sorted] });
  }
  const lead = pairs.findIndex((pair) => pair.sortKeys.includes(sorted));
  const ordered = lead > 0 ? [pairs[lead]!, ...pairs.slice(0, lead), ...pairs.slice(lead + 1)] : pairs;
  return ordered.map(({ sortKeys, ...pair }) => ({ ...pair, sorted: sortKeys.includes(sorted) }));
}

/** A champion's games as a share of every game in the list's filters (0 when there are none), for the bar under Games. */
export function gamesShare(games: number, total: number): number {
  return total > 0 ? Math.min(1, Math.max(0, games / total)) : 0;
}

/**
 * A share in words, a whole percent, but never "0%" or "100%" for a share that is neither: a
 * champion played once in 250 games is "under 1%" of them, not 0%, and one that missed a single
 * game of 250 is "over 99%".
 */
export function shareWords(share: number): string {
  if (share > 0 && share < 0.005) return "under 1%";
  if (share < 1 && share >= 0.995) return "over 99%";
  return percent(share, 0);
}

/** Sorts within the rows already filtered; stable, ties by champion name. */
export function sortChampions(rows: readonly OverviewCard[], key: SortKey, dir: Dir, nameOf: (id: string) => string): OverviewCard[] {
  const sign = dir === "asc" ? 1 : -1;
  const byName = (a: OverviewCard, b: OverviewCard) => nameOf(a.championId).localeCompare(nameOf(b.championId)) || a.role.localeCompare(b.role);
  return [...rows].sort((a, b) => {
    if (key === "champion") return sign * byName(a, b);
    if (key === "multikills" || isKind(key)) {
      // One kind, ties broken by the rarer kinds; "multikills" is the rarest kind first (so the
      // same order as pentakills). A champion without counts is unknown, not zero: last.
      const ma = countedMultikills(a);
      const mb = countedMultikills(b);
      if (!ma || !mb) return ma === mb ? byName(a, b) : !ma ? 1 : -1;
      return sign * ((isKind(key) ? ma[key] - mb[key] : 0) || compareMultikills(ma, mb)) || byName(a, b);
    }
    const va = sortValue(a, key);
    const vb = sortValue(b, key);
    if (va === null || vb === null) return va === vb ? byName(a, b) : va === null ? 1 : -1;
    return sign * (va - vb) || byName(a, b);
  });
}
const defaultDir = (key: SortKey): Dir => (key === "champion" ? "asc" : "desc");
const masteryText = (n: number | null | undefined) => (n == null ? "—" : formatCompactCount(n));

/**
 * My Profile → All Champions: every champion in the filtered games (season, mode, role played,
 * account), configured or not. Search by name; click any column heading to sort (again to reverse);
 * phones get a Sort by control. The first twenty, then the rest one click away. The pools on Overview stay the main view; this is for
 * exploring. A champion opens its window (Overview and Matchups) in the same scope; the window
 * lives in the URL, so it can be linked, and Back closes it.
 */
export function AllChampions({ data, basePath, championsById, playerId, look, detail, status, refresh }: { data: PlayerOverviewData; basePath: string; championsById: Record<string, PortraitChampion>; playerId: string; /** The player's card look: the champion window takes their colours. */ look?: CardLook | null; detail: MatchupsData | null; /** The page's data status (domain/data-status). */ status?: DataStatus | null; /** Offered to the player and to those who manage Riot accounts, where Riot can be asked. */ refresh?: DataRefreshTarget | null }) {
  const [query, setQuery] = React.useState("");
  // The table's own search: once it has gone up under the pinned tabs, the row offers a copy (PageToolbar).
  const searchRef = React.useRef<HTMLInputElement>(null);
  // Opened from Overview's multikills (?sort=multikills) or any other link with a sort: that order first.
  const initialSort = useSearchParams().get("sort");
  const [sort, setSort] = React.useState<{ key: SortKey; dir: Dir }>(() => (isSortKey(initialSort) ? { key: initialSort, dir: defaultDir(initialSort) } : { key: "games", dir: "desc" }));
  const [all, setAll] = React.useState(false);
  const champ = React.useCallback((id: string): PortraitChampion => championsById[id] ?? { id, name: id, portraitUrl: "" }, [championsById]);
  const q = normalise(query.trim());
  // Sorting only reorders the champions in the current filters (season, mode, role, account, search).
  const rows = React.useMemo(
    () =>
      sortChampions(
        // A champion's name or the role it was played in ("mid" finds every Mid champion).
        data.topChampions.filter((c) => !q || normalise(champ(c.championId).name).includes(q) || normalise(ROLE_LABELS[c.role]).startsWith(q)),
        sort.key,
        sort.dir,
        (id) => champ(id).name,
      ),
    [data.topChampions, q, sort, champ],
  );
  const sortBy = (key: SortKey) => setSort((cur) => (cur.key === key ? { key, dir: cur.dir === "asc" ? "desc" : "asc" } : { key, dir: defaultDir(key) }));
  const label = COLUMNS.find((c) => c.key === sort.key)!.label;
  const shown = React.useMemo(() => (all || q ? rows : rows.slice(0, FIRST)), [all, q, rows]);
  // Some champions' multikills come from only some of their games (or none yet): the list says how to read them.
  const multikillsIncomplete = rows.some((c) => !!c.multikills && c.multikills.counted < c.multikills.games);
  // Kills come from each game's full record: a champion with games still without it is marked the same way.
  const killsIncomplete = rows.some((c) => c.performance.detailedGames < c.selected.games);
  const f = data.filter;
  // Every game in the filters, the whole the bar under each champion's games is a share of.
  const total = data.summary.record.games;

  // The champion window (shared with Roles & champion pools): its state lives in the URL.
  const win = useChampionWindow();
  const openChampion = (c: OverviewCard) => win.open(c.championId, c.role);
  // The list does not change when a window opens or moves (it is kept as it was rendered).
  const openRef = React.useRef(openChampion);
  React.useLayoutEffect(() => {
    openRef.current = openChampion;
  });
  const sorted = sort.key;
  const list = React.useMemo(
    () => (
      <ul className="divide-y divide-border/60">
        {shown.map((c, i) => {
          const ch = champ(c.championId);
          const r = c.selected;
          const p = c.performance;
          // The sorted column's figures stand out a little; the rest stay quiet, so the numbers never all compete.
          const strong = (key: SortKey) => sortsAs(key, sorted);
          const kda = kdaText(p);
          const cs = csText(p);
          const figure = (key: SortKey) => cn("hidden text-right text-sm tabular-nums @min-[44rem]:block", strong(key) ? "font-semibold text-fg" : "text-fg-muted");
          const share = gamesShare(r.games, total);
          return (
            // A row lights up while pointed at or focused (a quiet tint; the whole row opens the champion's window).
            <li key={`${c.championId}-${c.role}`} className={cn("group/row relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 px-3 py-2.5 @max-[17rem]:grid-cols-[minmax(0,1fr)] transition-colors duration-150 hover:bg-surface-2/50 has-[[data-open-champion]:focus-visible]:bg-surface-2/50 has-[[data-open-champion]:focus-visible]:outline has-[[data-open-champion]:focus-visible]:outline-2 has-[[data-open-champion]:focus-visible]:-outline-offset-2 has-[[data-open-champion]:focus-visible]:outline-accent @min-[44rem]:py-1.5", GRID)} data-testid="top-champion" data-champion={c.championId} data-games={r.games} data-kills={p.totalKills ?? ""} data-mastery={c.mastery?.points ?? ""} data-multikills={c.multikills?.counted ? MULTIKILL_KINDS.map((k) => c.multikills![k.key]).join(",") : ""} data-multikill-coverage={c.multikills ? multikillCoverage(c.multikills).state : ""}>
              <span className="flex min-w-0 items-center gap-3">
                <span className="hidden w-5 shrink-0 text-right text-xs tabular-nums text-fg-subtle @4xl:block" aria-hidden>
                  {i + 1}
                </span>
                <ChampionPortrait champion={ch} size="sm" className="h-10 w-10 rounded-lg ring-1 ring-border-strong/60 transition-[box-shadow] duration-150 group-hover/row:ring-fg-subtle/60 @min-[44rem]:h-8 @min-[44rem]:w-8 @min-[44rem]:rounded-md" />
                <span className="min-w-0">
                  {/* The whole row opens the champion's window (the button covers it). */}
                  {/* The row opens a window: the pointer says so, and the name underlines while pointed at, as the pools' cards do. */}
                  <button type="button" onClick={() => openRef.current(c)} className="block max-w-full cursor-pointer truncate text-left text-md font-semibold leading-tight text-fg outline-none @max-[17rem]:whitespace-normal @max-[17rem]:break-words after:absolute after:inset-0 after:content-[''] focus-visible:underline group-hover/row:underline group-hover/row:decoration-fg-subtle group-hover/row:underline-offset-2 @min-[44rem]:text-sm" aria-label={`${ch.name}, ${ROLE_LABELS[c.role]}: open the champion's overview and matchups`} data-open-champion data-testid="open-champion">
                    {ch.name}
                  </button>
                  {/* Narrow rows let "In pool" go under the role; table rows keep both on one line (the role
                      would shorten before "In pool" moves, though the column leaves room for both). */}
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-fg-subtle @min-[44rem]:flex-nowrap" data-testid="champion-role-line">
                    <RoleTag role={c.role} className="min-w-0" />
                    {c.inPool ? (
                      <span className="shrink-0 whitespace-nowrap rounded-full border border-border-strong px-1.5 text-2xs font-medium leading-4 text-fg-muted" title="In the player's champion pool for this role: their own choice, not worked out from games" data-testid="in-pool">
                        In pool
                      </span>
                    ) : null}
                  </span>
                </span>
              </span>
              {/* Narrow rows: the win rate and the games at the right, as the columns put them first.
                  Under a 17rem list (a large text size on a phone) everything stacks under the name. */}
              <span className="text-right tabular-nums @max-[17rem]:pl-[3.25rem] @max-[17rem]:text-left @min-[44rem]:hidden" title={winRateSampleNote(r.winRate, r.games, WIN_RATE_MIN_GAMES.champion) ?? undefined}>
                <span className={cn("block text-base font-semibold leading-tight", WIN_RATE_TONE_CLASS[winRateTone(r.winRate, r.games, WIN_RATE_MIN_GAMES.champion)])}>{r.winRate === null ? "—" : percent(r.winRate, 0)}</span>
                <span className="block text-xs text-fg-subtle">
                  {formatCount(r.games)} game{r.games === 1 ? "" : "s"}
                  {r.games > 0 ? ` · ${r.wins}W ${r.games - r.wins}L` : ""}
                </span>
              </span>
              {/* Games, with a quiet bar under it: the champion's share of every game in the filters
                  (QuietBar, neutral and continuous), said in words in its title and to screen readers. */}
              <span className="hidden text-right @min-[44rem]:block" title={`${formatCount(r.games)} game${r.games === 1 ? "" : "s"} · ${shareWords(share)} of the ${formatCount(total)} game${total === 1 ? "" : "s"} in these filters`} data-testid="champion-games">
                <span className={cn("block tabular-nums", strong("games") ? "font-semibold text-fg" : "font-medium text-fg")}>{formatCount(r.games)}</span>
                {/* Clicks pass through to the row (its fill's transform would otherwise paint it above the row's button). */}
                <QuietBar value={share} className="pointer-events-none mt-1" testId="champion-games-share" />
                <span className="sr-only">, {shareWords(share)} of the games in these filters</span>
              </span>
              <span className="hidden min-w-0 text-right @min-[44rem]:block" title={winRateSampleNote(r.winRate, r.games, WIN_RATE_MIN_GAMES.champion) ?? undefined}>
                <span className={cn("block text-sm font-semibold tabular-nums leading-tight", WIN_RATE_TONE_CLASS[winRateTone(r.winRate, r.games, WIN_RATE_MIN_GAMES.champion)])}>{r.winRate === null ? "—" : percent(r.winRate, 0)}</span>
                {r.games > 0 ? (
                  <span className="block text-2xs tabular-nums text-fg-subtle">
                    {r.wins}W {r.games - r.wins}L
                  </span>
                ) : null}
              </span>
              <span className={figure("kda")}>{kda}</span>
              <span className={figure("cs")}>{cs}</span>
              <TotalKills c={c} strong={strong("kills")} />
              <RarestMultikill c={c} strong={strong("multikills")} />
              {MULTIKILL_KINDS.map((k) => (
                <KindCount key={k.key} c={c} kind={k.key} strong={strong(k.key)} />
              ))}
              <span className={figure("mastery")} title={c.mastery?.points ? `${formatCount(c.mastery.points)} mastery points` : "No mastery recorded"} data-testid="mastery-points">
                {masteryText(c.mastery?.points)}
              </span>
              {/* Narrow rows: the other figures as labelled pairs under the champion. */}
              <dl className="col-span-2 flex flex-wrap gap-x-4 @max-[17rem]:col-span-1 gap-y-0.5 pl-[3.25rem] text-xs @min-[44rem]:hidden" data-testid="champion-summary">
                {summaryPairs(c, sorted).map((pair) => (
                  // The pair the list is sorted by comes first, in semibold.
                  <div key={pair.key} className="flex min-w-0 flex-wrap items-baseline gap-x-1" data-sorted={pair.sorted || undefined}>
                    <dt className={pair.sorted ? "font-semibold text-fg-muted" : "text-fg-subtle"}>{pair.label}</dt>{" "}
                    <dd className={cn("tabular-nums text-fg", pair.sorted ? "font-semibold" : "font-medium")}>{pair.value}</dd>
                  </div>
                ))}
              </dl>
            </li>
          );
        })}
      </ul>
    ),
    [shown, champ, sorted, total],
  );
  return (
    <section className="@container space-y-3" aria-labelledby="all-champions" data-testid="all-champions">
      {/* The profile's one heading layout (as Season performance and Match History). */}
      <SectionHeader
        id="all-champions"
        title="All champions"
        // On a phone (upright, or held sideways) the current tab says "Champions": the title is left to screen readers.
        titleOnPhones="tab"
        description={
          <p className="text-sm text-fg-muted" data-testid="all-champions-scope">
            {formatCount(data.topChampions.length)} champion{data.topChampions.length === 1 ? "" : "s"} · {seasonLabel(data.season)} · {seasonModeInfo(data.mode).label}
            {f.role ? ` · as ${ROLE_LABELS[f.role]}` : ""}
          </p>
        }
        statusAfterText
        status={status ? <DataStatusNote status={status} refresh={refresh} /> : null}
        refresh={status ? <RefreshButton status={status} refresh={refresh} /> : null}
        controls={<OverviewFilters basePath={basePath} filter={f} seasons={data.seasons} currentSeason={data.currentSeason} champions={[]} accounts={data.accountOptions} showChampions={false} modeCounts={data.modes.counts} testId="all-champions-filters" />}
      />
      <PageToolbar anchor={searchRef} label="All Champions controls" land="[data-testid=top-champion]">
        <SearchInput value={query} onChange={setQuery} placeholder="Find a champion…" label="Find a champion or a role" className={COMPACT_SEARCH} testId="toolbar-all-champions-search" />
        <FiltersControl />
      </PageToolbar>
      {/* One card: its toolbar (the search, how many champions, Sort by on phones), the column
          names (each sorts, again to reverse), the rows, then the rest one click away. */}
      <div className="rounded-card border border-border bg-surface panel-depth" data-testid="all-champions-table">
        {data.topChampions.length ? (
          // Below 76rem the toolbar has the rows' padding, so the search lines up with the champions.
          // From a 20.5rem card (a 360px phone) the search and Sort by share one row; on a narrower
          // card the search takes its own line above Sort by. From 44rem the row holds the search,
          // the count and the bar's key, wrapping only if a larger text size leaves no room.
          <div className="flex flex-wrap items-center gap-2 border-b border-border/70 px-3 py-2.5 @min-[20.5rem]:flex-nowrap @min-[44rem]:flex-wrap @min-[76rem]:px-4">
            <SearchInput ref={searchRef} value={query} onChange={setQuery} placeholder="Find a champion or role…" label="Find a champion or a role" className="flex-[1_1_12rem] @min-[44rem]:max-w-xs" testId="all-champions-search" />
            <span className="ml-auto hidden text-xs tabular-nums text-fg-subtle @min-[44rem]:inline" aria-live="polite" data-testid="all-champions-count">
              {q ? `${rows.length} of ${data.topChampions.length}` : data.topChampions.length} champion{(q ? rows.length : data.topChampions.length) === 1 ? "" : "s"}
            </span>
            {/* What the bar under Games shows, as a chart's key, on screen for every reader where the
                bar is drawn (a cell's title is a mouse's only; screen readers hear each share with
                its figure). In the toolbar's row, so it costs no height. */}
            <span className="hidden items-center gap-1.5 text-xs text-fg-subtle @min-[44rem]:inline-flex" data-testid="games-share-legend">
              <span className="w-5">
                <QuietBar value={0.6} />
              </span>
              share of the {formatCount(total)} game{total === 1 ? "" : "s"} in these filters
            </span>
            {/* Phones: the table's columns as one compact Sort by control and a direction toggle. */}
            {/* Sharing the search's row (from a 20.5rem card), the words "Sort by" are read out only,
                and the control shows the sort mark in their place, before the column's short name (the
                names keep it narrow). At a large text size Sort by takes a line of its own over the
                control and its arrow, and the control narrows, so the toolbar is never wider than the
                phone. */}
            <div className="flex min-w-0 flex-wrap items-center gap-1.5 @min-[20.5rem]:shrink-0 @min-[20.5rem]:flex-nowrap @min-[44rem]:hidden" data-testid="all-champions-sort-mobile">
              <label htmlFor="all-champions-sort-by" className="text-xs text-fg-muted @min-[20.5rem]:sr-only">
                Sort by
              </label>
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="relative flex min-w-0">
                  <ArrowUpDown className="pointer-events-none absolute left-2 top-1/2 hidden h-4 w-4 -translate-y-1/2 text-fg-subtle @min-[20.5rem]:block" aria-hidden data-testid="all-champions-sort-mark" />
                  <select id="all-champions-sort-by" value={sort.key} onChange={(e) => setSort({ key: e.target.value as SortKey, dir: defaultDir(e.target.value as SortKey) })} className={selectClass("w-auto @min-[20.5rem]:pl-7")}>
                    {COLUMNS.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </span>
                <button type="button" onClick={() => setSort((cur) => ({ ...cur, dir: cur.dir === "asc" ? "desc" : "asc" }))} className="grid h-11 w-11 shrink-0 place-items-center rounded-md border border-border-control bg-bg-elevated text-fg transition-colors hover:border-fg-subtle" aria-label={`${label}, ${sort.dir === "asc" ? "ascending" : "descending"}: reverse`} data-testid="all-champions-sort-dir">
                  {sort.dir === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-fg-muted" data-testid="all-champions-empty">
            {q ? `No champion matches “${query}”.` : data.hasHistory ? "No games match these filters." : "No stored games yet: they appear after the first account sync."}
            {q ? null : <ModeElsewhere basePath={basePath} filter={f} elsewhere={data.modes.elsewhere} />}
          </p>
        ) : (
          <>
            {/* Pinned under the profile's section tabs, which stay pinned above it (globals.css: --bar-top, --tabs-top). */}
            <div className={cn("sticky top-[calc(var(--bar-top)+var(--tabs-top))] z-[1] hidden items-center border-b border-border/70 bg-surface px-3 @min-[44rem]:grid", GRID)} role="group" aria-label="Sort the champions" data-testid="all-champions-header">
              {COLUMNS.map((c) => {
                const active = sortsAs(c.key, sort.key);
                const right = c.key !== "champion";
                const Arrow = active ? (sort.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
                return (
                  <span key={c.key} className={cn("min-w-0", right && "text-right", c.layout && LAYOUT_CLASS[c.layout])} data-sort={active ? sort.dir : undefined}>
                    <button type="button" onClick={() => sortBy(c.key)} title={c.title ? `${c.title} · click to sort` : "Click to sort"} className={cn("group/sort relative inline-flex items-center whitespace-nowrap rounded py-2.5 text-2xs font-semibold uppercase tracking-label transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-accent", active ? "text-fg" : "text-fg-subtle hover:text-fg-muted")} data-testid={`sort-${c.key}`}>
                      {/* The arrow sits beside the name without taking its width: the name always fits its column. */}
                      <Arrow className={cn("absolute top-1/2 h-3 w-3 -translate-y-1/2", right ? "right-full mr-0.5" : "left-full ml-0.5", active ? "opacity-100" : "opacity-0 transition-opacity duration-150 group-hover/sort:opacity-60 group-focus-visible/sort:opacity-60")} aria-hidden />
                      {c.label}
                      {active ? <span className="sr-only">, sorted {sort.dir === "asc" ? "ascending" : "descending"}</span> : null}
                    </button>
                  </span>
                );
              })}
            </div>
            {list}
            {!all && !q && rows.length > FIRST ? (
              <button type="button" onClick={() => setAll(true)} className="flex min-h-11 w-full items-center justify-center rounded-b-card border-t border-border/70 text-sm font-medium text-accent transition-colors hover:bg-accent/5" data-testid="all-champions-more">
                Show all {rows.length} champions
              </button>
            ) : null}
          </>
        )}
      </div>
      {rows.length && (multikillsIncomplete || killsIncomplete) ? (
        <p className="flex flex-wrap items-center gap-x-1.5 px-1 text-xs text-fg-muted" data-testid="multikill-legend">
          <span>
            {multikillsIncomplete && killsIncomplete ? "Kills and multikills" : killsIncomplete ? "Kills" : "Multikills"}: <span className="font-semibold text-warn">*</span> from only some of the champion&apos;s games, <span className="text-fg-subtle">—</span> none of its games has counts yet. Those still being fetched from Riot are never counted as zero.
          </span>
          {multikillsIncomplete ? <InfoTip text={MULTIKILL_HELP} label="About multikills" /> : null}
        </p>
      ) : null}
      <ChampionWindow state={win} data={data} detail={detail} championsById={championsById} playerId={playerId} look={look} />
    </section>
  );
}
