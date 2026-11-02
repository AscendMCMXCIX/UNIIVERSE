"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import type { OverviewCard, PlayerOverviewData } from "@/server/players/overview";
import type { MatchupsData } from "@/server/players/matchups";
import { ROLE_LABELS } from "@/domain/roles";
import { seasonLabel } from "@/domain/season";
import { seasonModeInfo } from "@/domain/season-stats";
import { ChampionPortrait, type PortraitChampion } from "@/components/champion-portrait";
import { RoleIcon } from "@/components/role-icon";
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
import type { DataStatus } from "@/domain/data-status";

type KindKey = keyof MultikillCounts;
type SortKey = "champion" | "games" | "win" | "kda" | "cs" | "kills" | "multikills" | KindKey | "mastery";
type Dir = "asc" | "desc";
/**
 * The table's columns, in order. Multikills are one column ("multikills": the rarest kind each
 * champion has) where the list is of medium width, and four (double, triple, quadra, penta) where
 * it is wide; phones sort by any of them from Sort by.
 */
const COLUMNS: Array<{ key: SortKey; label: string; long?: string; title?: string; layout?: "medium" | "wide" }> = [
  { key: "champion", label: "Champion" },
  { key: "games", label: "Games" },
  { key: "win", label: "Win rate" },
  { key: "kda", label: "KDA" },
  { key: "cs", label: "CS/min", title: "Creep score per minute" },
  { key: "kills", label: "Kills", long: "Total kills", title: "Every kill on the champion in these games, each game's own count added up" },
  { key: "multikills", label: "Multikills", title: "The rarest multikill on the champion in these games: pentakills first, then quadra, triple and double kills", layout: "medium" },
  ...MULTIKILL_KINDS.map((k) => ({ key: k.key, label: MULTIKILL_SHORT[k.key], long: k.label, title: `${k.label} in these games`, layout: "wide" as const })),
  { key: "mastery", label: "Mastery", long: "Mastery points", title: "Champion mastery points, summed over your linked Riot accounts" },
];
const isSortKey = (v: string | null): v is SortKey => !!v && COLUMNS.some((c) => c.key === v);
/** Which layout a column belongs to: shown only in that one (phones show neither as a column). */
const LAYOUT_CLASS = { medium: "@min-[76rem]:hidden", wide: "hidden @min-[76rem]:block" } as const;
const FIRST = 20;
/*
  The list's columns follow its own width (a container query), so the open or collapsed sidebar is
  taken into account. Below 36rem: phones, a champion and its games on one line, the rest under it.
  From 36rem: Champion, Games, Win rate, KDA, CS/min, Kills, Multikills (the rarest kind) and
  Mastery share the width out with no minimums, so nothing ever scrolls sideways; the champion
  takes the most, then Win rate (with its record and gauge), the short numbers the least. From
  76rem the four multikills get their own columns (Double, Triple, Quadra, Penta) and every column
  keeps a readable minimum.
*/
const GRID =
  "@xl:grid-cols-[minmax(0,1.75fr)_minmax(0,0.6fr)_minmax(0,0.9fr)_minmax(0,0.5fr)_minmax(0,0.55fr)_minmax(0,0.5fr)_minmax(0,0.7fr)_minmax(0,0.55fr)] @xl:gap-x-4 @xl:px-4 @min-[76rem]:grid-cols-[minmax(14rem,1.9fr)_minmax(4.5rem,0.55fr)_minmax(8rem,0.85fr)_minmax(3.5rem,0.4fr)_minmax(4rem,0.42fr)_minmax(3.5rem,0.4fr)_repeat(4,minmax(3.75rem,0.38fr))_minmax(4.5rem,0.45fr)] @min-[76rem]:px-5";
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
function TotalKills({ c }: { c: OverviewCard }) {
  const p = c.performance;
  return (
    <span className={cn("hidden text-md font-medium tabular-nums @xl:block", p.totalKills === null ? "text-fg-subtle" : "text-fg")} title={killsText(c)} data-testid="champion-kills">
      {p.totalKills === null ? <span aria-label="Not counted yet">—</span> : formatCount(p.totalKills)}
      {p.totalKills !== null && p.detailedGames < c.selected.games ? <PartialMark /> : null}
    </span>
  );
}

/** Phones: the kills in the row's summary line ("41 kills"). */
function killsPhrase(c: OverviewCard): string | null {
  const p = c.performance;
  if (p.totalKills === null) return c.selected.games ? "kills not counted yet" : null;
  return `${formatCount(p.totalKills)} kill${p.totalKills === 1 ? "" : "s"}${p.detailedGames < c.selected.games ? "*" : ""}`;
}

/** The medium layout's one Multikills column: the rarest kind with its count ("1 penta"). */
function RarestMultikill({ c }: { c: OverviewCard }) {
  const m = countedMultikills(c);
  const top = m ? rarestMultikill(m) : null;
  return (
    <span className={cn("hidden min-w-0 text-sm @xl:block", LAYOUT_CLASS.medium)} title={multikillText(c)} data-testid="champion-multikills">
      {!m ? (
        <span className="text-fg-subtle" aria-label="Not counted yet">
          —
        </span>
      ) : top ? (
        <>
          <span className="text-md font-semibold tabular-nums text-fg">{formatCount(top.count)}</span> <span className="text-xs text-fg-muted">{MULTIKILL_SHORT[top.key].toLowerCase()}</span>
        </>
      ) : (
        <span className="text-xs text-fg-subtle">None</span>
      )}
      {m && m.counted < m.games ? <PartialMark /> : null}
    </span>
  );
}

/** The wide layout's four columns: each kind's count, a dash when none of the games has counts. */
function KindCount({ c, kind }: { c: OverviewCard; kind: KindKey }) {
  const m = countedMultikills(c);
  return (
    <span className={cn("text-md font-medium tabular-nums", LAYOUT_CLASS.wide, m && m[kind] ? "text-fg" : "text-fg-subtle")} title={multikillText(c)} data-testid={`champion-${kind}`}>
      {m ? (
        formatCount(m[kind])
      ) : (
        <span aria-label="Not counted yet">—</span>
      )}
      {m && m.counted < m.games ? <PartialMark /> : null}
    </span>
  );
}

/** Phones: the rarest multikill as words in the row's summary line. */
function multikillPhrase(c: OverviewCard): string | null {
  const m = c.multikills;
  if (!m || !m.games) return null;
  if (!m.counted) return "multikills not counted yet";
  const top = rarestMultikill(m);
  const partial = m.counted < m.games ? "*" : "";
  return top ? `${formatCount(top.count)} ${MULTIKILL_SHORT[top.key].toLowerCase()}${partial}` : `no multikills${partial}`;
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
export function AllChampions({ data, basePath, championsById, playerId, detail, status, refresh }: { data: PlayerOverviewData; basePath: string; championsById: Record<string, PortraitChampion>; playerId: string; detail: MatchupsData | null; /** The page's data status (domain/data-status). */ status?: DataStatus | null; /** Offered to the player and to those who manage Riot accounts, where Riot can be asked. */ refresh?: DataRefreshTarget | null }) {
  const [query, setQuery] = React.useState("");
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
        data.topChampions.filter((c) => !q || normalise(champ(c.championId).name).includes(q)),
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
  // Games are drawn against the most-played champion in view, so the busiest ones stand out.
  const maxGames = Math.max(1, ...rows.map((c) => c.selected.games));
  const f = data.filter;

  // The champion window (shared with Roles & champion pools): its state lives in the URL.
  const win = useChampionWindow();
  const openChampion = (c: OverviewCard) => win.open(c.championId, c.role);
  // The list does not change when a window opens or moves (it is kept as it was rendered).
  const openRef = React.useRef(openChampion);
  React.useLayoutEffect(() => {
    openRef.current = openChampion;
  });
  const list = React.useMemo(
    () => (
    <ul className="divide-y divide-border/60">
      {shown.map((c, i) => {
        const ch = champ(c.championId);
        const r = c.selected;
        return (
          // A row lights up while pointed at or focused: a tint, the portrait's ring, and a short bar
          // in the brand gradient at its left edge (the whole row opens the champion's window).
          <li key={`${c.championId}-${c.role}`} className={cn("group/row relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-3 py-2 transition-colors duration-150 before:pointer-events-none before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-r-full before:bg-gradient-to-b before:from-accent before:to-accent-2 before:opacity-0 before:transition-opacity before:duration-150 hover:bg-surface-2/60 hover:before:opacity-100 has-[[data-open-champion]:focus-visible]:bg-surface-2/60 has-[[data-open-champion]:focus-visible]:outline has-[[data-open-champion]:focus-visible]:outline-2 has-[[data-open-champion]:focus-visible]:-outline-offset-2 has-[[data-open-champion]:focus-visible]:outline-accent has-[[data-open-champion]:focus-visible]:before:opacity-100", GRID)} data-testid="top-champion" data-champion={c.championId} data-games={r.games} data-kills={c.performance.totalKills ?? ""} data-mastery={c.mastery?.points ?? ""} data-multikills={c.multikills?.counted ? MULTIKILL_KINDS.map((k) => c.multikills![k.key]).join(",") : ""} data-multikill-coverage={c.multikills ? multikillCoverage(c.multikills).state : ""}>
            <span className="flex min-w-0 items-center gap-3">
              <span className="hidden w-5 shrink-0 text-right text-xs tabular-nums text-fg-subtle @4xl:block" aria-hidden>
                {i + 1}
              </span>
              <ChampionPortrait champion={ch} size="sm" className="h-10 w-10 rounded-lg ring-1 ring-border-strong/60 transition-[box-shadow] duration-150 group-hover/row:ring-accent/60" />
              <span className="min-w-0">
                {/* The whole row opens the champion's window (the button covers it). */}
                <button type="button" onClick={() => openRef.current(c)} className="block max-w-full truncate text-left text-md font-semibold leading-tight text-fg outline-none after:absolute after:inset-0 after:content-[''] focus-visible:underline" aria-label={`${ch.name}, ${ROLE_LABELS[c.role]}: open the champion's overview and matchups`} data-open-champion data-testid="open-champion">
                  {ch.name}
                </button>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-fg-subtle">
                  <span className="inline-flex min-w-0 items-center gap-1">
                    <RoleIcon role={c.role} className="h-3.5 w-3.5 shrink-0" /> {ROLE_LABELS[c.role]}
                  </span>
                  {c.inPool ? (
                    <span className="whitespace-nowrap rounded-full border border-accent/40 bg-accent/10 px-1.5 text-2xs font-medium leading-4 text-accent" title="In the player's champion pool for this role: their own choice, not worked out from games" data-testid="in-pool">
                      In pool
                    </span>
                  ) : null}
                </span>
              </span>
            </span>
            <span className="text-right text-sm tabular-nums @xl:text-left">
              <span className="font-semibold text-fg @xl:text-base">{r.games}</span> <span className="text-xs text-fg-subtle @xl:hidden">games</span>
              <span className="mt-1.5 hidden h-1 w-full max-w-[6rem] overflow-hidden rounded-full bg-surface-3 @xl:block" aria-hidden>
                <span className="block h-full rounded-full bg-accent/75" style={{ width: `${Math.max(4, Math.round((r.games / maxGames) * 100))}%` }} />
              </span>
            </span>
            <span className="hidden min-w-0 @xl:block" title={winRateSampleNote(r.winRate, r.games, WIN_RATE_MIN_GAMES.champion) ?? undefined}>
              <span className={cn("text-base font-semibold tabular-nums", WIN_RATE_TONE_CLASS[winRateTone(r.winRate, r.games, WIN_RATE_MIN_GAMES.champion)])}>{r.winRate === null ? "—" : percent(r.winRate, 0)}</span>
              {r.games > 0 ? <span className="ml-1.5 text-xs tabular-nums text-fg-subtle">{r.wins}W {r.games - r.wins}L</span> : null}
              {r.winRate !== null ? (
                // A small gauge with a mark at 50%, so the win rates compare at a glance.
                <span className="relative mt-1.5 block h-1 w-full max-w-[7rem] overflow-hidden rounded-full bg-surface-3" aria-hidden>
                  <span className={cn("block h-full rounded-full", r.winRate >= 0.5 ? "bg-good/75" : "bg-bad/65")} style={{ width: `${Math.round(r.winRate * 100)}%` }} />
                  <span className="absolute inset-y-0 left-1/2 w-px bg-fg-subtle/70" />
                </span>
              ) : null}
            </span>
            <span className="hidden text-md font-medium tabular-nums text-fg @xl:block">{c.performance.perfectKda ? "Perfect" : c.performance.kdaRatio === null ? "—" : c.performance.kdaRatio.toFixed(2)}</span>
            <span className="hidden text-md font-medium tabular-nums text-fg @xl:block">{c.performance.csPerMinute === null ? "—" : c.performance.csPerMinute.toFixed(1)}</span>
            <TotalKills c={c} />
            <RarestMultikill c={c} />
            {MULTIKILL_KINDS.map((k) => (
              <KindCount key={k.key} c={c} kind={k.key} />
            ))}
            <span className="hidden text-sm tabular-nums text-fg-muted @xl:block" title={c.mastery?.points ? `${formatCount(c.mastery.points)} mastery points` : "No mastery recorded"} data-testid="mastery-points">
              {masteryText(c.mastery?.points)}
            </span>
            {/* Phones: the figures the columns show, in one line under the champion. */}
            <span className="col-span-2 text-xs text-fg-muted @xl:hidden" data-testid="champion-summary">
              {[r.winRate === null ? null : `${percent(r.winRate, 0)} won`, `KDA ${c.performance.kdaRatio === null ? "—" : c.performance.kdaRatio.toFixed(2)}`, `${c.performance.csPerMinute === null ? "—" : c.performance.csPerMinute.toFixed(1)} CS/min`, killsPhrase(c), multikillPhrase(c), `${masteryText(c.mastery?.points)} mastery`].filter(Boolean).join(" · ")}
            </span>
          </li>
        );
      })}
    </ul>
    ),
    [shown, maxGames, champ],
  );
  return (
    <section className="@container space-y-3" aria-labelledby="all-champions" data-testid="all-champions">
      {/* The profile's one heading layout (as Season performance and Match History). */}
      <SectionHeader
        id="all-champions"
        title="All champions"
        description={
          <p className="text-sm text-fg-muted" data-testid="all-champions-scope">
            {data.topChampions.length} champion{data.topChampions.length === 1 ? "" : "s"} played · {seasonLabel(data.season)} · {seasonModeInfo(data.mode).label}
            {f.role ? ` · as ${ROLE_LABELS[f.role]}` : ""}
          </p>
        }
        status={status ? <DataStatusNote status={status} refresh={refresh} /> : null}
        refresh={status ? <RefreshButton status={status} refresh={refresh} /> : null}
        controls={<OverviewFilters basePath={basePath} filter={f} seasons={data.seasons} currentSeason={data.currentSeason} champions={[]} accounts={data.accountOptions} showChampions={false} modeCounts={data.modes.counts} testId="all-champions-filters" />}
      />
      {/* One card: its toolbar (the search, how many champions, Sort by on phones), the column
          names (each sorts, again to reverse), the rows, then the rest one click away. */}
      <div className="rounded-card border border-border bg-surface panel-depth" data-testid="all-champions-table">
        {data.topChampions.length ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-border/70 px-3 py-2.5 @xl:px-4">
            {/* The search keeps at least 12rem: on narrow phones it takes its own line above Sort by. */}
            <SearchInput value={query} onChange={setQuery} placeholder="Find a champion…" label="Find a champion" className="flex-[1_1_12rem] @xl:max-w-xs" testId="all-champions-search" />
            <span className="ml-auto hidden text-xs tabular-nums text-fg-subtle @xl:inline" aria-live="polite" data-testid="all-champions-count">
              {q ? `${rows.length} of ${data.topChampions.length}` : data.topChampions.length} champion{(q ? rows.length : data.topChampions.length) === 1 ? "" : "s"}
            </span>
            {/* Phones: the table's columns as one compact Sort by control and a direction toggle. */}
            <div className="flex items-center gap-1.5 @xl:hidden" data-testid="all-champions-sort-mobile">
              <label htmlFor="all-champions-sort-by" className="text-xs text-fg-muted">
                Sort by
              </label>
              <select id="all-champions-sort-by" value={sort.key} onChange={(e) => setSort({ key: e.target.value as SortKey, dir: defaultDir(e.target.value as SortKey) })} className={selectClass("w-auto")}>
                {COLUMNS.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.long ?? c.label}
                  </option>
                ))}
              </select>
              <button type="button" onClick={() => setSort((cur) => ({ ...cur, dir: cur.dir === "asc" ? "desc" : "asc" }))} className="grid h-11 w-11 shrink-0 place-items-center rounded-md border border-border-control bg-bg-elevated text-fg transition-colors hover:border-fg-subtle" aria-label={`${label}, ${sort.dir === "asc" ? "ascending" : "descending"}: reverse`} data-testid="all-champions-sort-dir">
                {sort.dir === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
              </button>
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
            <div className={cn("sticky top-0 z-[1] hidden gap-x-4 border-b border-border/70 bg-surface px-3 @xl:grid", GRID)} role="group" aria-label="Sort the champions" data-testid="all-champions-header">
              {COLUMNS.map((c) => {
                const active = sortsAs(c.key, sort.key);
                return (
                  <span key={c.key} className={cn("min-w-0", c.layout && LAYOUT_CLASS[c.layout])} data-sort={active ? sort.dir : undefined}>
                    <button type="button" onClick={() => sortBy(c.key)} title={c.title ? `${c.title} · click to sort` : "Click to sort"} className={cn("group/sort relative -mx-1 inline-flex max-w-full items-center gap-1 rounded px-1 py-2.5 text-left text-2xs font-semibold uppercase tracking-label transition-colors duration-150", active ? "text-fg" : "text-fg-subtle hover:text-fg-muted")} data-testid={`sort-${c.key}`}>
                      <span className="truncate">{c.label}</span>
                      {active ? <span className="sr-only">, sorted {sort.dir === "asc" ? "ascending" : "descending"}</span> : null}
                      {active ? sort.dir === "asc" ? <ArrowUp className="h-3 w-3 shrink-0 text-accent" aria-hidden /> : <ArrowDown className="h-3 w-3 shrink-0 text-accent" aria-hidden /> : <ArrowUpDown className="h-3 w-3 shrink-0 opacity-0 transition-opacity duration-150 group-hover/sort:opacity-60 group-focus-visible/sort:opacity-60" aria-hidden />}
                      {/* The sorted column: a short bar in the brand gradient on the header's lower edge. */}
                      {active ? <span aria-hidden className="absolute inset-x-1 bottom-0 h-0.5 rounded-full bg-gradient-to-r from-accent to-accent-2" /> : null}
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
      <ChampionWindow state={win} data={data} detail={detail} championsById={championsById} playerId={playerId} />
    </section>
  );
}
