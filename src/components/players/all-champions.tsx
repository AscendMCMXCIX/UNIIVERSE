"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import type { OverviewCard, PlayerOverviewData } from "@/server/players/overview";
import type { ChampionPreviewData, PairingGamesData } from "@/server/players/champion-preview";
import { ROLE_LABELS } from "@/domain/roles";
import { seasonLabel } from "@/domain/season";
import { seasonModeInfo } from "@/domain/season-stats";
import { ChampionPortrait, type PortraitChampion } from "@/components/champion-portrait";
import { normalise } from "@/components/champions/types";
import { ModeElsewhere, OverviewFilters } from "./overview-filters";
import { SearchInput } from "@/components/ui/search-input";
import { Select } from "@/components/ui/select";
import { percent, formatCount, formatCompactCount } from "@/lib/format";
import { cn } from "@/lib/cn";
import { WIN_RATE_MIN_GAMES, WIN_RATE_TONE_CLASS, winRateSampleNote, winRateTone } from "@/domain/stats/win-rate";
import { SampleNote } from "./sample-note";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Peek, type PeekControl } from "@/components/ui/peek";
import { useAddressItem } from "@/components/ui/address-item";
import { isTyping, modalOpen, useWindowPosture } from "@/components/ui/posture";
import { PREVIEW_KEYS, PreviewContent, cardFor, usePreviewAddress, usePreviewData, type ListScope } from "./champion-preview";
import { MatchDetailModal } from "@/components/match-history/match-detail";
import { MULTIKILL_KINDS, compareMultikills, multikillCoverage, rarestMultikill, type MultikillCounts, type MultikillSummary } from "@/domain/multikills";
import { MULTIKILL_HELP, MULTIKILL_SHORT } from "./multikill-summary";
import { InfoTip } from "@/components/ui/info-tip";
import { DataStatusNote, RefreshButton, type DataRefreshTarget } from "@/components/ui/data-status";
import { SectionHeader } from "@/components/ui/section-header";
import { COMPACT_SEARCH, FiltersControl, PageToolbar } from "@/components/ui/page-toolbar";
import { QuietBar } from "@/components/ui/quiet-bar";
import type { DataStatus } from "@/domain/data-status";
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
const COLUMNS: Array<{ key: SortKey; label: string; layout?: "medium" | "wide" }> = [
  { key: "champion", label: "Champion" },
  { key: "games", label: "Games" },
  { key: "win", label: "Win rate" },
  { key: "kda", label: "KDA" },
  { key: "cs", label: "CS/min" },
  { key: "kills", label: "Kills", layout: "medium" },
  { key: "multikills", label: "Multikills", layout: "medium" },
  ...MULTIKILL_KINDS.map((k) => ({ key: k.key, label: MULTIKILL_SHORT[k.key], layout: "wide" as const })),
  { key: "mastery", label: "Mastery" },
];
const isSortKey = (v: string | null): v is SortKey => !!v && COLUMNS.some((c) => c.key === v);
/** Which layout a column belongs to: shown only in that one (phones show neither as a column). */
const LAYOUT_CLASS = { medium: "@min-[76rem]:hidden", wide: "hidden @min-[76rem]:block" } as const;
const FIRST = 20;
/**
 * The columns after Win rate, while the preview unfolds over them: hidden, not removed, so the grid
 * keeps every width and Champion, Games and Win rate never move (CM §4.1).
 */
const FOLD = "group-data-[folded=true]/card:invisible";
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
  "@min-[44rem]:grid-cols-[minmax(11.75rem,1fr)_minmax(3.25rem,4.5rem)_minmax(4.5rem,6rem)_minmax(3.25rem,4.25rem)_minmax(3.5rem,4.5rem)_minmax(3rem,4.25rem)_minmax(5.25rem,6.5rem)_minmax(4.375rem,5.25rem)] @min-[44rem]:gap-x-2 @min-[44rem]:px-3 @min-[76rem]:grid-cols-[minmax(14rem,1fr)_minmax(4rem,4.5rem)_minmax(4.75rem,5.25rem)_minmax(5.5rem,6.25rem)_minmax(4rem,4.5rem)_minmax(6rem,6.5rem)_repeat(3,minmax(4rem,4.5rem))_minmax(6.5rem,7.25rem)] @min-[76rem]:gap-x-2 @min-[76rem]:px-5";
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

/** A champion's multikills in words, for screen readers (the champion's window shows each kind). */
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

/** A champion's kills in words, for screen readers. */
function killsText(c: OverviewCard): string {
  const p = c.performance;
  if (p.totalKills === null) return "Not counted yet: these games are still loading from Riot";
  const loading = c.selected.games - p.detailedGames;
  return `${formatCount(p.totalKills)} kill${p.totalKills === 1 ? "" : "s"} in ${formatCount(p.detailedGames)} game${p.detailedGames === 1 ? "" : "s"}${loading > 0 ? ` (${formatCount(loading)} game${loading === 1 ? "" : "s"} still loading)` : ""}`;
}

/** Every kill on the champion in these games (each game's own count added up), in both layouts. */
function TotalKills({ c, strong }: { c: OverviewCard; strong: boolean }) {
  const p = c.performance;
  return (
    <span className={cn("hidden text-right text-sm tabular-nums @min-[44rem]:block", LAYOUT_CLASS.medium, FOLD, p.totalKills === null ? "text-fg-subtle" : strong ? "font-semibold text-fg" : "text-fg-muted")} data-testid="champion-kills">
      <span aria-hidden>
        {p.totalKills === null ? "—" : formatCount(p.totalKills)}
        {p.totalKills !== null && p.detailedGames < c.selected.games ? <span className="ml-0.5 align-super text-2xs font-semibold text-warn">*</span> : null}
      </span>
      <span className="sr-only">{killsText(c)}</span>
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
    <span className={cn("hidden min-w-0 whitespace-nowrap text-right text-sm @min-[44rem]:block", LAYOUT_CLASS.medium, FOLD)} data-testid="champion-multikills">
      <span aria-hidden>
      {!m ? (
        <span className="text-fg-subtle">
          <span aria-hidden>—</span>
          <span className="sr-only">Not counted yet</span>
        </span>
      ) : top ? (
        <>
          <span className={cn("tabular-nums", strong ? "font-semibold text-fg" : "font-medium text-fg-muted")}>{formatCount(top.count)}</span> <span className="text-xs text-fg-subtle">{MULTIKILL_SHORT[top.key].toLowerCase()}</span>
        </>
      ) : (
        <span className="text-xs text-fg-subtle">None</span>
      )}
      {m && m.counted < m.games ? <span className="ml-0.5 align-super text-2xs font-semibold text-warn">*</span> : null}
      </span>
      <span className="sr-only">{multikillText(c)}</span>
    </span>
  );
}

/** The wide layout's four columns: each kind's count, a dash when none of the games has counts. */
function KindCount({ c, kind, strong }: { c: OverviewCard; kind: KindKey; strong: boolean }) {
  const m = countedMultikills(c);
  return (
    <span className={cn("text-right text-sm tabular-nums", LAYOUT_CLASS.wide, FOLD, m && m[kind] ? (strong ? "font-semibold text-fg" : "text-fg-muted") : "text-fg-subtle")} data-testid={`champion-${kind}`}>
      {m ? (
        formatCount(m[kind])
      ) : (
        <>
          <span aria-hidden>—</span>
          <span className="sr-only">Not counted yet</span>
        </>
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
/** An upright phone, as the sm breakpoint (below 40rem): Filters and Refresh join the list's search and sort row there. */
const PHONE_QUERY = "(width < 40rem)";
function subscribePhone(change: () => void) {
  const query = window.matchMedia(PHONE_QUERY);
  query.addEventListener("change", change);
  return () => query.removeEventListener("change", change);
}
const isPhone = () => window.matchMedia(PHONE_QUERY).matches;
const notPhone = () => false;

const defaultDir = (key: SortKey): Dir => (key === "champion" ? "asc" : "desc");
const masteryText = (n: number | null | undefined) => (n == null ? "—" : formatCompactCount(n));

/**
 * My Profile → All Champions: every champion in the filtered games (season, mode, role played,
 * account), configured or not. Search by name; click any column heading to sort (again to reverse);
 * phones get a Sort by control. The first twenty, then the rest one click away. The pools on Overview stay the main view; this is for
 * exploring. A champion opens its preview (champion-preview.tsx) in the same scope: inside the list's
 * card on a wide list, a sheet elsewhere; it lives in the URL, so it can be linked, and Back closes it.
 */
export function AllChampions({ data, basePath, championsById, playerId, isOwn, initialPreview, initialPairing, status, refresh }: { data: PlayerOverviewData; basePath: string; championsById: Record<string, PortraitChampion>; playerId: string; /** The viewer's own profile: the preview says "you". */ isOwn: boolean; /** The server's render of a linked preview (?champion=), so it opens without a request. */ initialPreview?: ChampionPreviewData | null; initialPairing?: PairingGamesData | null; /** The page's data status (domain/data-status). */ status?: DataStatus | null; /** Offered to the player and to those who manage Riot accounts, where Riot can be asked. */ refresh?: DataRefreshTarget | null }) {
  const [query, setQuery] = React.useState("");
  // The table's own search: once it has gone up under the pinned tabs, the row offers a copy (PageToolbar).
  const searchRef = React.useRef<HTMLInputElement>(null);
  // Opened from Overview's multikills (?sort=multikills) or any other link with a sort: that order first.
  const initialSort = useSearchParams().get("sort");
  const [sort, setSort] = React.useState<{ key: SortKey; dir: Dir }>(() => (isSortKey(initialSort) ? { key: initialSort, dir: defaultDir(initialSort) } : { key: "games", dir: "desc" }));
  const [all, setAll] = React.useState(false);
  // Phones: Filters (the bar's own button, drawn here) and Refresh join the search and sort row
  // instead of a row of their own above the scope line (PLAN §S2b). Before the page knows it is a
  // phone (the server's render) they are not drawn below sm, and their place here keeps its room.
  const phone = React.useSyncExternalStore(subscribePhone, isPhone, notPhone);
  const [toolsHost, setToolsHost] = React.useState<HTMLElement | null>(null);
  // Refresh is offered (RefreshButton draws nothing otherwise): the phone's row keeps room for it beside Filters.
  const refreshHere = !!status && !!refresh && status.state !== "none";
  // Only where the list has its row (it has champions): else Filters and Refresh keep the header's row.
  const toolsInRow = data.topChampions.length > 0;
  const toggleOnPhones = React.useMemo(() => (toolsInRow ? { host: phone ? toolsHost : null } : undefined), [toolsInRow, phone, toolsHost]);
  // A row too narrow for the search and the tools side by side (a large text size on a small phone):
  // the tools end the visible "Sort by" line instead of taking a line of their own.
  const toolbarRef = React.useRef<HTMLDivElement>(null);
  const [toolsBesideSort, setToolsBesideSort] = React.useState(false);
  // Before paint, so the row is drawn once where it belongs.
  React.useLayoutEffect(() => {
    const row = toolbarRef.current;
    if (!row || !phone) return setToolsBesideSort(false);
    const check = () => {
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const style = getComputedStyle(row);
      const room = row.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      // The search's least (4.5rem), a gap, Filters (2.75rem), and Refresh and its gap where offered.
      setToolsBesideSort(room < (4.5 + 0.5 + 2.75 + (refreshHere ? 3.25 : 0)) * rem - 0.5);
    };
    check();
    const observer = new ResizeObserver(check);
    observer.observe(row);
    return () => observer.disconnect();
  }, [phone, refreshHere, toolsInRow]);
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

  // The preview: its state lives in the URL; its data comes from two light actions, kept per page.
  const address = usePreviewAddress();
  const scope = React.useMemo<ListScope>(() => ({ season: data.season, mode: data.mode, account: f.accountId ?? "all" }), [data.season, data.mode, f.accountId]);
  // The list's data as the server rendered it names the answers' generation: a refresh with new
  // games brings new data, and the preview asks again rather than keep answers the figures outgrew.
  const previewData = usePreviewData(playerId, scope, React.useMemo(() => ({ preview: initialPreview ?? null, pairing: initialPairing ?? null }), [initialPreview, initialPairing]), data);
  const selected = address.sel ? cardFor(data.topChampions, address.sel) : null;
  const selectedKey = selected ? `${selected.championId}-${selected.role}` : null;
  const cardRef = React.useRef<HTMLDivElement>(null);
  const asideRef = React.useRef<HTMLElement>(null);
  // A game opened from the preview (an opponent's games): the match window, with the game in the
  // address (`?match=`) by the one history rule, so it has a history entry of its own: Back closes
  // the game and leaves the preview as it was, and Back from a page a link in it opened comes back
  // to the game (docs/MOBILE.md, "Back"). Before, Back closed the preview behind it and left the
  // game open.
  const game = useAddressItem("match");
  const match = game.id;
  // Room beside the list: the preview unfolds in the card over the columns after Win rate when that
  // room is 26rem or more, on a pointer (not touch) screen of 1024px or more; otherwise a sheet.
  // Undefined until measured after hydration: nothing is drawn before then, so a linked preview
  // never shows in one place and then moves to another.
  const [room, setRoom] = React.useState<number | null | undefined>(undefined);
  const hasRows = rows.length > 0;
  React.useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const measure = () => {
      const win = card.querySelector<HTMLElement>("[data-testid=sort-win]")?.parentElement;
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      // Tablets and narrower windows get the docked Peek (a drawer) instead.
      if (!win || !win.getClientRects().length || window.innerWidth < 1024) return setRoom(null);
      const left = Math.round(win.getBoundingClientRect().right - card.getBoundingClientRect().left + rem * 0.25);
      setRoom(card.clientWidth - left >= rem * 26 ? left : null);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(card);
    return () => ro.disconnect();
  }, [hasRows]);
  // Touch phones and short windows get the sheet (posture.ts), whatever the room.
  const windowed = useWindowPosture();
  const measured = room !== undefined;
  const inCard = !!selected && typeof room === "number" && !windowed;
  // The card is at least as tall as the preview beside its rows.
  React.useLayoutEffect(() => {
    const card = cardRef.current;
    const aside = asideRef.current;
    if (!card) return;
    if (!inCard || !aside) {
      card.style.minHeight = "";
      return;
    }
    const fit = () => {
      card.style.minHeight = `${aside.offsetHeight}px`;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(aside);
    return () => ro.disconnect();
  }, [inCard]);
  const rowButton = (c: { championId: string; role: string }) => cardRef.current?.querySelector<HTMLButtonElement>(`[data-testid=top-champion][data-champion="${c.championId}"][data-role="${c.role}"] [data-open-champion]`);
  const focusTitle = React.useRef(false);
  const [viaKeys, setViaKeys] = React.useState(false);
  const choose = (c: OverviewCard, keys: boolean) => {
    if (selected && selected.championId === c.championId && selected.role === c.role) return close();
    focusTitle.current = keys;
    setViaKeys(keys);
    address.show(c.championId, c.role);
  };
  const close = () => {
    const back = selected;
    address.close();
    if (back) rowButton(back)?.focus({ preventScroll: true });
  };
  const closeRef = React.useRef(close);
  const chooseRef = React.useRef(choose);
  React.useLayoutEffect(() => {
    closeRef.current = close;
    chooseRef.current = choose;
  });
  // Opened with the keyboard: focus moves to the preview's heading; by a click it stays on the row.
  React.useEffect(() => {
    if (!focusTitle.current) return;
    focusTitle.current = false;
    if (!inCard) return;
    document.getElementById("champion-preview-title")?.focus({ preventScroll: true });
  }, [inCard, selectedKey]);
  // Escape closes the preview beside the list or in the docked panel (a window opened over it
  // closes first, by itself; the sheet is a window).
  const besideList = !!selected && !windowed;
  React.useEffect(() => {
    if (!besideList) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || modalOpen() || isTyping(e.target)) return;
      e.preventDefault();
      closeRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [besideList]);
  /** ↑/↓ (or K/J) on the list move the preview to the row above or below. */
  const step = (from: OverviewCard, d: -1 | 1, focus: boolean) => {
    const i = shown.findIndex((c) => c.championId === from.championId && c.role === from.role);
    if (i < 0) return;
    const next = shown[(i + d + shown.length) % shown.length];
    if (!next || next === from) return;
    address.show(next.championId, next.role);
    if (focus) {
      const b = rowButton(next);
      b?.focus({ preventScroll: true });
      b?.closest("li")?.scrollIntoView({ block: "nearest" });
    }
  };
  const at = selected ? shown.findIndex((c) => c.championId === selected.championId && c.role === selected.role) : -1;
  const peekControl: PeekControl = {
    id: selected && measured && !inCard ? selectedKey : null,
    open: () => undefined,
    toggle: () => undefined,
    close,
    prev: selected && at > 0 ? () => step(selected, -1, false) : null,
    next: selected && at >= 0 && at < shown.length - 1 ? () => step(selected, 1, false) : null,
    rowProps: (id) => ({ "data-peek-row": id, onClick: () => undefined }),
    fromKeyboard: viaKeys,
    param: PREVIEW_KEYS,
  };
  const onListKey = (e: React.KeyboardEvent) => {
    if (!selected || e.altKey || e.ctrlKey || e.metaKey) return;
    const d = e.key === "ArrowDown" || e.key === "j" ? 1 : e.key === "ArrowUp" || e.key === "k" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    step(selected, d, true);
  };
  const listKeyRef = React.useRef(onListKey);
  React.useLayoutEffect(() => {
    listKeyRef.current = onListKey;
  });
  const sorted = sort.key;
  const list = React.useMemo(
    () => (
      <ul className="divide-y divide-border/60" onKeyDown={(e) => listKeyRef.current(e)}>
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
          // Narrow rows: sorted by a figure other than games or win rate, that figure replaces "In pool".
          const narrowFigure = sorted === "champion" || sorted === "games" || sorted === "win" ? null : (summaryPairs(c, sorted).find((pair) => pair.sorted) ?? null);
          return (
            // A row lights up while pointed at or focused (a quiet tint; the whole row opens the champion's window).
            <li key={`${c.championId}-${c.role}`} data-role={c.role} className={cn("group/row relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 px-3 py-2 @max-[17rem]:grid-cols-[minmax(0,1fr)] transition-colors duration-150 hover:bg-surface-2/50 has-[[data-open-champion]:focus-visible]:bg-surface-2/50 has-[[data-open-champion]:focus-visible]:outline has-[[data-open-champion]:focus-visible]:outline-2 has-[[data-open-champion]:focus-visible]:-outline-offset-2 has-[[data-open-champion]:focus-visible]:outline-accent @min-[44rem]:py-1.5 data-[selected=true]:bg-surface-3 data-[selected=true]:before:absolute data-[selected=true]:before:inset-y-0 data-[selected=true]:before:left-0 data-[selected=true]:before:w-0.5 data-[selected=true]:before:bg-accent", GRID)} data-selected={selectedKey === `${c.championId}-${c.role}` || undefined} data-testid="top-champion" data-champion={c.championId} data-games={r.games} data-kills={p.totalKills ?? ""} data-mastery={c.mastery?.points ?? ""} data-multikills={c.multikills?.counted ? MULTIKILL_KINDS.map((k) => c.multikills![k.key]).join(",") : ""} data-multikill-coverage={c.multikills ? multikillCoverage(c.multikills).state : ""}>
              <span className="flex min-w-0 items-center gap-3">
                <span className="hidden w-5 shrink-0 text-right text-xs tabular-nums text-fg-subtle @4xl:block" aria-hidden>
                  {i + 1}
                </span>
                <ChampionPortrait champion={ch} size="sm" className="h-10 w-10 rounded-lg ring-1 ring-border-strong/60 transition-[box-shadow] duration-150 group-hover/row:ring-fg-subtle/60 @min-[44rem]:h-8 @min-[44rem]:w-8 @min-[44rem]:rounded-md" />
                <span className="min-w-0">
                  {/* The whole row opens the champion's window (the button covers it). */}
                  {/* The row opens a window: the pointer says so, and the name underlines while pointed at, as the pools' cards do. */}
                  <button type="button" onClick={(e) => chooseRef.current(c, e.detail === 0)} onPointerDown={(e) => e.pointerType === "mouse" && void previewData.preview(c.championId, c.role)} aria-controls="champion-preview" aria-expanded={selectedKey === `${c.championId}-${c.role}`} aria-current={selectedKey === `${c.championId}-${c.role}` || undefined} className="block max-w-full cursor-pointer truncate text-left text-md font-semibold leading-tight text-fg outline-none @max-[17rem]:whitespace-normal @max-[17rem]:break-words after:absolute after:inset-0 after:content-[''] focus-visible:underline group-hover/row:underline group-hover/row:decoration-fg-subtle group-hover/row:underline-offset-2 @min-[44rem]:text-sm" aria-label={`${ch.name}, ${ROLE_LABELS[c.role]}: preview its games and lane opponents`} data-open-champion data-testid="open-champion">
                    {ch.name}
                  </button>
                  {/* Narrow rows let "In pool" go under the role; table rows keep both on one line (the role
                      would shorten before "In pool" moves, though the column leaves room for both). */}
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-fg-subtle @min-[44rem]:flex-nowrap" data-testid="champion-role-line">
                    <RoleTag role={c.role} className="min-w-0" />
                    {narrowFigure ? (
                      <span className="shrink-0 whitespace-nowrap font-medium text-fg-muted @min-[44rem]:hidden" data-testid="champion-sorted-figure">
                        · {narrowFigure.label} {narrowFigure.value}
                      </span>
                    ) : null}
                    {c.inPool ? (
                      <span className={cn("shrink-0 whitespace-nowrap rounded-full border border-border-strong px-1.5 text-2xs font-medium leading-4 text-fg-muted", narrowFigure && "@max-[44rem]:hidden")} data-testid="in-pool">
                        In pool<span className="sr-only"> (their own pick for this role)</span>
                      </span>
                    ) : null}
                  </span>
                </span>
              </span>
              {/* Narrow rows: the win rate and the games at the right, as the columns put them first.
                  Under a 17rem list (a large text size on a phone) everything stacks under the name. */}
              <span className="text-right tabular-nums @max-[17rem]:pl-[3.25rem] @max-[17rem]:text-left @min-[44rem]:hidden">
                <span className={cn("block text-base font-semibold leading-tight", WIN_RATE_TONE_CLASS[winRateTone(r.winRate, r.games, WIN_RATE_MIN_GAMES.champion)])}>
                  {r.winRate === null ? "—" : percent(r.winRate, 0)}
                  <SampleNote note={winRateSampleNote(r.winRate, r.games, WIN_RATE_MIN_GAMES.champion)} />
                </span>
                <span className="block text-xs text-fg-subtle">
                  {formatCount(r.games)} game{r.games === 1 ? "" : "s"}
                  {r.games > 0 ? ` · ${r.wins}W ${r.games - r.wins}L` : ""}
                </span>
              </span>
              {/* Games, with a quiet bar under it: the champion's share of every game in the filters
                  (QuietBar, neutral and continuous): its value in words in its title (the bar's name) and to screen readers. */}
              <span className="hidden text-right @min-[44rem]:block" title={`${formatCount(r.games)} game${r.games === 1 ? "" : "s"} · ${shareWords(share)} of the ${formatCount(total)} game${total === 1 ? "" : "s"} in these filters`} data-testid="champion-games">
                <span className={cn("block tabular-nums", strong("games") ? "font-semibold text-fg" : "font-medium text-fg")}>{formatCount(r.games)}</span>
                {/* Clicks pass through to the row (its fill's transform would otherwise paint it above the row's button). */}
                <QuietBar value={share} className="pointer-events-none mt-1" testId="champion-games-share" />
                <span className="sr-only">, {shareWords(share)} of the games in these filters</span>
              </span>
              <span className="hidden min-w-0 text-right @min-[44rem]:block">
                <span className={cn("block text-sm font-semibold tabular-nums leading-tight", WIN_RATE_TONE_CLASS[winRateTone(r.winRate, r.games, WIN_RATE_MIN_GAMES.champion)])}>
                  {r.winRate === null ? "—" : percent(r.winRate, 0)}
                  <SampleNote note={winRateSampleNote(r.winRate, r.games, WIN_RATE_MIN_GAMES.champion)} />
                </span>
                {r.games > 0 ? (
                  <span className="block text-2xs tabular-nums text-fg-subtle">
                    {r.wins}W {r.games - r.wins}L
                  </span>
                ) : null}
              </span>
              <span className={cn(figure("kda"), FOLD)}>{kda}</span>
              <span className={cn(figure("cs"), FOLD)}>{cs}</span>
              <TotalKills c={c} strong={strong("kills")} />
              <RarestMultikill c={c} strong={strong("multikills")} />
              {MULTIKILL_KINDS.map((k) => (
                <KindCount key={k.key} c={c} kind={k.key} strong={strong(k.key)} />
              ))}
              <span className={cn(figure("mastery"), FOLD)} title={c.mastery?.points ? `${formatCount(c.mastery.points)} mastery points` : undefined} data-testid="mastery-points">
                {masteryText(c.mastery?.points)}
              </span>
            </li>
          );
        })}
      </ul>
    ),
    [shown, champ, sorted, total, selectedKey, previewData],
  );
  // Phones: Filters (the bar's button is drawn in the host: OverviewFilters' toggleOnPhones; the host keeps its room until then) and Refresh.
  const phoneTools = (
    <div className="flex shrink-0 items-center gap-2 sm:hidden" data-testid="all-champions-phone-tools">
      <span ref={setToolsHost} className="flex min-h-11 min-w-11" />
      {status && phone ? <RefreshButton status={status} refresh={refresh} compact /> : null}
    </div>
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
        // Phones: Filters (and Refresh) on the title's line, the scope under them (SectionHeader's toolbarBesideScope, as Season performance).
        toolbarBesideScope
        status={status ? <DataStatusNote status={status} refresh={refresh} /> : null}
        // Below sm Refresh is in the list's row (with Filters); its place here is drawn from sm only.
        refresh={status && !(phone && toolsInRow) ? <RefreshButton status={status} refresh={refresh} className={toolsInRow ? "max-sm:hidden" : undefined} /> : null}
        controls={<OverviewFilters basePath={basePath} filter={f} seasons={data.seasons} currentSeason={data.currentSeason} champions={[]} accounts={data.accountOptions} showChampions={false} modeCounts={data.modes.counts} testId="all-champions-filters" toggleOnPhones={toggleOnPhones} />}
      />
      <PageToolbar anchor={searchRef} label="All Champions controls" land="[data-testid=top-champion]">
        <SearchInput value={query} onChange={setQuery} placeholder="Find a champion…" label="Find a champion or a role" className={COMPACT_SEARCH} testId="toolbar-all-champions-search" />
        <FiltersControl />
      </PageToolbar>
      {/* One card: its toolbar (the search, how many champions, Sort by on phones), the column
          names (each sorts, again to reverse), the rows, then the rest one click away. */}
      <div ref={cardRef} className="group/card relative rounded-card border border-border bg-surface panel-depth" data-folded={inCard || undefined} data-testid="all-champions-table">
        {data.topChampions.length ? (
          // Below 76rem the toolbar has the rows' padding, so the search lines up with the champions.
          // From a 20.5rem card (a 360px phone) the search and Sort by share one row; on a narrower
          // card the search takes its own line above Sort by. From 44rem the row holds the search,
          // the count and the bar's key, wrapping only if a larger text size leaves no room.
          // Phones (below sm): the search and Filters (and Refresh, where it is offered) keep together,
          // and Sort by joins them where the row has room (8.5rem for the search and Filters: the
          // search then shows its short placeholder "Find…" whole, from a 375px phone), else takes the next line; the search keeps
          // at least 4.5rem and the tools take the line under it only when it would not (a large text size).
          <div ref={toolbarRef} className="flex flex-wrap items-center gap-2 border-b border-border/70 px-3 py-2.5 sm:@min-[20.5rem]:flex-nowrap @min-[44rem]:flex-wrap @min-[76rem]:px-4" data-testid="all-champions-toolbar">
            <div className={cn("flex min-w-0 flex-[1_1_12rem] flex-wrap items-center gap-2 max-sm:flex-[1_1_0%] @min-[44rem]:max-w-xs", refreshHere ? "max-sm:min-w-[min(11.75rem,100%)]" : "max-sm:min-w-[min(8.5rem,100%)]")}>
              <SearchInput ref={searchRef} value={query} onChange={setQuery} placeholder={phone ? "Find…" : "Find a champion or role…"} label="Find a champion or a role" className="flex-[1_1_4.5rem]" testId="all-champions-search" />
              {toolsBesideSort ? null : phoneTools}
            </div>
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
                and from sm the control shows the sort mark in their place, before the column's short
                name (the names keep it narrow); on a phone, where Filters shares the row too, the
                direction button beside it says what it is. At a large text size Sort by takes a line of its own over the
                control and its arrow, and the control narrows, so the toolbar is never wider than the
                phone. */}
            <div className="flex min-w-0 flex-wrap items-center gap-1.5 @min-[20.5rem]:shrink-0 @min-[20.5rem]:flex-nowrap @min-[44rem]:hidden" data-testid="all-champions-sort-mobile">
              {toolsBesideSort ? (
                <div className="flex w-full items-center justify-between gap-2">
                  <label htmlFor="all-champions-sort-by" className="text-xs text-fg-muted">
                    Sort by
                  </label>
                  {phoneTools}
                </div>
              ) : (
                <label htmlFor="all-champions-sort-by" className="text-xs text-fg-muted @min-[20.5rem]:sr-only">
                  Sort by
                </label>
              )}
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="relative flex min-w-0">
                  <ArrowUpDown className="pointer-events-none absolute left-2 top-1/2 hidden h-4 w-4 -translate-y-1/2 text-fg-subtle sm:@min-[20.5rem]:block" aria-hidden data-testid="all-champions-sort-mark" />
                  <Select id="all-champions-sort-by" value={sort.key} onValueChange={(v) => setSort({ key: v as SortKey, dir: defaultDir(v as SortKey) })} className="w-auto sm:@min-[20.5rem]:pl-7" options={COLUMNS.map((c) => ({ value: c.key, label: c.label }))} />
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
                  <span key={c.key} className={cn("min-w-0", right && "text-right", c.layout && LAYOUT_CLASS[c.layout], c.key !== "champion" && c.key !== "games" && c.key !== "win" && FOLD)} data-sort={active ? sort.dir : undefined}>
                    <button type="button" onClick={() => sortBy(c.key)} className={cn("group/sort relative inline-flex items-center whitespace-nowrap rounded py-2.5 text-2xs font-semibold uppercase tracking-label transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-accent", active ? "text-fg" : "text-fg-subtle hover:text-fg-muted")} data-testid={`sort-${c.key}`}>
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
        {inCard && selected ? (
          // The preview, unfolded over the folded columns: pinned under the section tabs while the
          // list scrolls, as tall as its content (it scrolls inside only past the screen's height).
          <div className="pointer-events-none absolute inset-y-0 right-0 z-[2]" style={{ left: room ?? 0 }}>
            <aside ref={asideRef} id="champion-preview" aria-labelledby="champion-preview-title" className="pointer-events-auto sticky top-[calc(var(--bar-top)+var(--tabs-top)+0.5rem)] max-h-[calc(100dvh-var(--bar-top)-var(--tabs-top)-1rem)] max-w-xl overflow-y-auto overscroll-contain rounded-r-card border-l border-border-strong bg-surface p-4 shadow-lg motion-safe:unfold-in" data-testid="champion-preview">
              <span className="sr-only" aria-live="polite">
                {`${champ(selected.championId).name}, ${ROLE_LABELS[selected.role]}. ${formatCount(selected.selected.games)} games${selected.selected.winRate === null ? "" : `, ${percent(selected.selected.winRate, 0)} win rate`}.`}
              </span>
              <PreviewContent key={selectedKey} playerId={playerId} isOwn={isOwn} card={selected} otherRoles={data.topChampions.filter((o) => o.championId === selected.championId && o.role !== selected.role)} vs={address.sel?.vs ?? null} champ={champ} data={previewData} onVs={address.setVs} onSwitch={(o) => address.show(o.championId, o.role)} onClose={close} titleId="champion-preview-title" onMatch={game.open} />
            </aside>
          </div>
        ) : null}
      </div>
      {rows.length && (multikillsIncomplete || killsIncomplete) ? (
        <p className="flex flex-wrap items-center gap-x-1.5 px-1 text-xs text-fg-muted" data-testid="multikill-legend">
          <span>
            {multikillsIncomplete && killsIncomplete ? "Kills and multikills" : killsIncomplete ? "Kills" : "Multikills"}: <span className="font-semibold text-warn">*</span> only some games counted so far · <span className="text-fg-subtle">—</span> not counted yet (never shown as zero)
          </span>
          {multikillsIncomplete ? <InfoTip text={MULTIKILL_HELP} label="About multikills" /> : null}
        </p>
      ) : null}
      {/* Without room in the card: the shared Peek, docked at the right (tablets, narrower windows)
          or a sheet (touch phones, short windows). While a game's window is open over a sheet, the
          sheet steps aside (never two windows) and comes back when the game closes. */}
      <Peek peek={peekControl} title={selected ? champ(selected.championId).name : ""} itemKey={selected && measured && !inCard && !(windowed && match) ? selectedKey : null} label="Champion" testId="champion-preview">
        {selected && !inCard ? <PreviewContent key={selectedKey} compact playerId={playerId} isOwn={isOwn} card={selected} otherRoles={data.topChampions.filter((o) => o.championId === selected.championId && o.role !== selected.role)} vs={address.sel?.vs ?? null} champ={champ} data={previewData} onVs={address.setVs} onSwitch={(o) => address.show(o.championId, o.role)} onClose={close} titleId="champion-preview-title" onMatch={game.open} /> : null}
      </Peek>
      {match ? <MatchDetailModal playerId={playerId} matchId={match} championsById={championsById} onClose={game.close} /> : null}
    </section>
  );
}
