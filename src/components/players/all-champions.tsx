"use client";

import * as React from "react";
import type { OverviewCard, PlayerOverviewData } from "@/server/players/overview";
import type { MatchupsData } from "@/server/players/matchups";
import { ROLE_LABELS } from "@/domain/roles";
import { seasonLabel } from "@/domain/season";
import { seasonModeInfo } from "@/domain/season-stats";
import { ChampionPortrait, type PortraitChampion } from "@/components/champion-portrait";
import { RoleIcon } from "@/components/role-icon";
import { normalise } from "@/components/champions/types";
import { TierBadge } from "./tier-badge";
import { ModeElsewhere, OverviewFilters } from "./overview-filters";
import { SearchInput } from "@/components/ui/search-input";
import { selectClass } from "@/components/ui/input";
import { percent } from "@/lib/format";
import { cn } from "@/lib/cn";
import { WIN_RATE_MIN_GAMES, WIN_RATE_TONE_CLASS, winRateSampleNote, winRateTone } from "@/domain/stats/win-rate";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { ProficiencyTier } from "@/domain/proficiency";
import { ChampionWindow, useChampionWindow } from "./champion-window";

type SortKey = "champion" | "games" | "win" | "kda" | "cs" | "proficiency" | "mastery";
type Dir = "asc" | "desc";
const COLUMNS: Array<{ key: SortKey; label: string; title?: string }> = [
  { key: "champion", label: "Champion" },
  { key: "games", label: "Games" },
  { key: "win", label: "Win rate" },
  { key: "kda", label: "KDA" },
  { key: "cs", label: "CS/min", title: "Creep score per minute" },
  { key: "proficiency", label: "Experience", title: "Experience on the champion in the role, worked out from every stored game (all seasons), recency and mastery; not limited by these filters" },
  { key: "mastery", label: "Mastery points", title: "Champion mastery points, summed over your linked Riot accounts" },
];
/** Experience's own order, most first (never alphabetical). */
const TIER_ORDER: ProficiencyTier[] = ["core", "strong", "comfortable", "moderate", "rusty", "unknown"];
const FIRST = 20;
/** Champion, Games, Win rate, KDA, CS/min, Experience, Mastery points: the champion column is the
 *  widest but shares spare width with the figures, so numbers never float far from their names. */
// Tablets and narrow desktops share the width out (no minimums, so nothing scrolls sideways);
// from xl each column keeps a readable minimum and the champion column stops taking the slack.
const GRID = "sm:grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,0.55fr))_minmax(0,1.1fr)_minmax(0,0.7fr)] sm:gap-x-3 sm:px-3 xl:grid-cols-[minmax(11rem,1.35fr)_minmax(5.5rem,0.75fr)_minmax(8rem,1fr)_minmax(4rem,0.55fr)_minmax(4rem,0.55fr)_minmax(8.5rem,1fr)_minmax(4.5rem,0.6fr)] xl:gap-x-4 xl:px-4";
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
    case "proficiency":
      return c.tier === "unknown" ? null : TIER_ORDER.length - TIER_ORDER.indexOf(c.tier);
    case "mastery":
      return c.mastery?.points ?? null;
    default:
      return null;
  }
}
/** Sorts within the rows already filtered; stable, ties by champion name. */
export function sortChampions(rows: readonly OverviewCard[], key: SortKey, dir: Dir, nameOf: (id: string) => string): OverviewCard[] {
  const sign = dir === "asc" ? 1 : -1;
  const byName = (a: OverviewCard, b: OverviewCard) => nameOf(a.championId).localeCompare(nameOf(b.championId)) || a.role.localeCompare(b.role);
  return [...rows].sort((a, b) => {
    if (key === "champion") return sign * byName(a, b);
    const va = sortValue(a, key);
    const vb = sortValue(b, key);
    if (va === null || vb === null) return va === vb ? byName(a, b) : va === null ? 1 : -1;
    return sign * (va - vb) || byName(a, b);
  });
}
const defaultDir = (key: SortKey): Dir => (key === "champion" ? "asc" : "desc");
const masteryText = (n: number | null | undefined) => (n == null ? "—" : n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 10_000 ? `${Math.round(n / 1000)}K` : n.toLocaleString("en"));

/**
 * My Profile → All Champions: every champion in the filtered games (season, mode, role played,
 * account), configured or not. Search by name; click any column heading to sort (again to reverse);
 * phones get a Sort by control. The first twenty, then the rest one click away. The pools on Overview stay the main view; this is for
 * exploring. A champion opens its window (Overview and Matchups) in the same scope; the window
 * lives in the URL, so it can be linked, and Back closes it.
 */
export function AllChampions({ data, basePath, championsById, playerId, detail }: { data: PlayerOverviewData; basePath: string; championsById: Record<string, PortraitChampion>; playerId: string; detail: MatchupsData | null }) {
  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState<{ key: SortKey; dir: Dir }>({ key: "games", dir: "desc" });
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
    <ul className="divide-y divide-border">
      {shown.map((c, i) => {
        const ch = champ(c.championId);
        const r = c.selected;
        return (
          <li key={`${c.championId}-${c.role}`} className={cn("group/row relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 px-4 py-2.5 transition-colors hover:bg-surface-2/50 has-[[data-open-champion]:focus-visible]:bg-surface-2/50 has-[[data-open-champion]:focus-visible]:outline has-[[data-open-champion]:focus-visible]:outline-2 has-[[data-open-champion]:focus-visible]:-outline-offset-2 has-[[data-open-champion]:focus-visible]:outline-accent", GRID)} data-testid="top-champion" data-champion={c.championId} data-games={r.games} data-mastery={c.mastery?.points ?? ""}>
            <span className="flex min-w-0 items-center gap-3">
              <span className="hidden w-6 shrink-0 text-right text-xs tabular-nums text-fg-subtle sm:block" aria-hidden>
                {i + 1}
              </span>
              <ChampionPortrait champion={ch} size="md" className="rounded-lg ring-1 ring-border transition-[box-shadow] group-hover/row:ring-border-strong" />
              <span className="min-w-0">
                {/* The whole row opens the champion's window (the button covers it); the
                    experience tip stays clickable above it. */}
                <button type="button" onClick={() => openRef.current(c)} className="block max-w-full truncate text-left text-[0.9375rem] font-semibold text-fg outline-none after:absolute after:inset-0 after:content-[''] focus-visible:underline" aria-label={`${ch.name}, ${ROLE_LABELS[c.role]}: open the champion's overview and matchups`} data-open-champion data-testid="open-champion">
                  {ch.name}
                </button>
                <span className="flex items-center gap-1 text-xs text-fg-subtle">
                  <RoleIcon role={c.role} className="h-3.5 w-3.5" /> {ROLE_LABELS[c.role]}
                  {c.inPool ? (
                    <span className="ml-1 rounded-full border border-accent/40 bg-accent/10 px-1.5 text-[0.6875rem] font-medium leading-4 text-accent" title="In the player's champion pool for this role: their own choice, not worked out from games" data-testid="in-pool">
                      In pool
                    </span>
                  ) : null}
                </span>
              </span>
            </span>
            <span className="text-right text-sm tabular-nums sm:text-left">
              <span className="font-semibold text-fg sm:text-base">{r.games}</span> <span className="text-xs text-fg-subtle sm:hidden">games</span>
              <span className="mt-1 hidden h-1.5 w-full max-w-[6rem] overflow-hidden rounded-full bg-surface-3 sm:block" aria-hidden>
                <span className="block h-full rounded-full bg-accent/60" style={{ width: `${Math.max(4, Math.round((r.games / maxGames) * 100))}%` }} />
              </span>
            </span>
            <span className="hidden min-w-0 sm:block" title={winRateSampleNote(r.winRate, r.games, WIN_RATE_MIN_GAMES.champion) ?? undefined}>
              <span className={cn("text-base font-semibold tabular-nums", WIN_RATE_TONE_CLASS[winRateTone(r.winRate, r.games, WIN_RATE_MIN_GAMES.champion)])}>{r.winRate === null ? "—" : percent(r.winRate, 0)}</span>
              {r.games > 0 ? <span className="ml-1.5 text-xs tabular-nums text-fg-subtle">{r.wins}W {r.games - r.wins}L</span> : null}
              {r.winRate !== null ? (
                // A small gauge with a mark at 50%, so the win rates compare at a glance.
                <span className="relative mt-1 block h-1.5 w-full max-w-[6rem] overflow-hidden rounded-full bg-surface-3" aria-hidden>
                  <span className={cn("block h-full rounded-full", r.winRate >= 0.5 ? "bg-good/70" : "bg-bad/60")} style={{ width: `${Math.round(r.winRate * 100)}%` }} />
                  <span className="absolute inset-y-0 left-1/2 w-px bg-fg-subtle/70" />
                </span>
              ) : null}
            </span>
            <span className="hidden text-[0.9375rem] font-medium tabular-nums text-fg sm:block">{c.performance.perfectKda ? "Perfect" : c.performance.kdaRatio === null ? "—" : c.performance.kdaRatio.toFixed(2)}</span>
            <span className="hidden text-[0.9375rem] font-medium tabular-nums text-fg sm:block">{c.performance.csPerMinute === null ? "—" : c.performance.csPerMinute.toFixed(1)}</span>
            <span className="relative z-[1] col-span-2 flex flex-wrap items-center gap-x-2 gap-y-1 sm:col-span-1">
              <TierBadge tier={c.tier} label={c.tierLabel} why={c.tierWhy} evidence={c.evidence} compact />
              <span className="text-xs text-fg-subtle sm:hidden">
                {[r.winRate === null ? null : `${percent(r.winRate, 0)} won`, `KDA ${c.performance.kdaRatio === null ? "—" : c.performance.kdaRatio.toFixed(2)}`, `${c.performance.csPerMinute === null ? "—" : c.performance.csPerMinute.toFixed(1)} CS/min`, `${masteryText(c.mastery?.points)} mastery`].filter(Boolean).join(" · ")}
              </span>
            </span>
            <span className="hidden text-sm tabular-nums text-fg-muted sm:block" title={c.mastery?.points ? `${c.mastery.points.toLocaleString("en")} mastery points` : "No mastery recorded"} data-testid="mastery-points">
              {masteryText(c.mastery?.points)}
            </span>
          </li>
        );
      })}
    </ul>
    ),
    [shown, maxGames, champ],
  );
  return (
    <section className="space-y-3" aria-labelledby="all-champions" data-testid="all-champions">
      <div className="flex flex-col gap-2 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <h2 id="all-champions" className="text-lg font-semibold text-fg">
            All champions
          </h2>
          <p className="text-sm text-fg-muted">
            {data.topChampions.length} champion{data.topChampions.length === 1 ? "" : "s"} played · {seasonLabel(data.season)} · {seasonModeInfo(data.mode).label}
            {f.role ? ` · as ${ROLE_LABELS[f.role]}` : ""}
          </p>
        </div>
        <OverviewFilters basePath={basePath} filter={f} seasons={data.seasons} currentSeason={data.currentSeason} champions={[]} accounts={data.accountOptions} showChampions={false} modeCounts={data.modes.counts} testId="all-champions-filters" />
      </div>
      {/* The search keeps at least 12rem: on narrow phones it takes its own line above Sort by. */}
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={query} onChange={setQuery} placeholder="Find a champion…" label="Find a champion" className="flex-[1_1_12rem] sm:max-w-xs" testId="all-champions-search" />
        {/* Phones: the table's columns as one compact Sort by control and a direction toggle. */}
        <div className="flex items-center gap-1.5 sm:hidden" data-testid="all-champions-sort-mobile">
          <label htmlFor="all-champions-sort-by" className="text-xs text-fg-muted">
            Sort by
          </label>
          <select id="all-champions-sort-by" value={sort.key} onChange={(e) => setSort({ key: e.target.value as SortKey, dir: defaultDir(e.target.value as SortKey) })} className={selectClass("w-auto")}>
            {COLUMNS.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => setSort((cur) => ({ ...cur, dir: cur.dir === "asc" ? "desc" : "asc" }))} className="grid h-11 w-11 shrink-0 place-items-center rounded-md border border-border bg-bg-elevated text-fg" aria-label={`${label}, ${sort.dir === "asc" ? "ascending" : "descending"}: reverse`} data-testid="all-champions-sort-dir">
            {sort.dir === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
          </button>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-panel border border-dashed border-border px-4 py-6 text-center text-sm text-fg-muted">{q ? `No champion matches “${query}”.` : data.hasHistory ? "No games match these filters." : "No stored games yet: they appear after the first account sync."}
          {q ? null : <ModeElsewhere basePath={basePath} filter={f} elsewhere={data.modes.elsewhere} />}
        </p>
      ) : (
        <div className="rounded-card border border-border bg-surface">
          <div className={cn("sticky top-0 z-[1] hidden gap-x-4 rounded-t-card border-b border-border bg-surface/95 px-4 py-2 text-xs font-medium text-fg-subtle backdrop-blur sm:grid", GRID)} role="group" aria-label="Sort the champions" data-testid="all-champions-header">
            {COLUMNS.map((c) => {
              const active = sort.key === c.key;
              return (
                <span key={c.key} className="min-w-0" data-sort={active ? sort.dir : undefined}>
                  <button type="button" onClick={() => sortBy(c.key)} title={c.title ? `${c.title} · click to sort` : "Click to sort"} className={cn("-mx-1 inline-flex max-w-full items-center gap-1 rounded px-1 py-1 text-left hover:text-fg", active && "text-fg")} data-testid={`sort-${c.key}`}>
                    <span className="truncate">{c.label}</span>
                    {active ? <span className="sr-only">, sorted {sort.dir === "asc" ? "ascending" : "descending"}</span> : null}
                    {active ? sort.dir === "asc" ? <ArrowUp className="h-3 w-3 shrink-0 text-accent" aria-hidden /> : <ArrowDown className="h-3 w-3 shrink-0 text-accent" aria-hidden /> : <ArrowUpDown className="h-3 w-3 shrink-0 opacity-40" aria-hidden />}
                  </button>
                </span>
              );
            })}
          </div>
          {list}
          {!all && !q && rows.length > FIRST ? (
            <button type="button" onClick={() => setAll(true)} className="flex min-h-11 w-full items-center justify-center border-t border-border text-sm font-medium text-accent hover:bg-accent/5" data-testid="all-champions-more">
              Show all {rows.length} champions
            </button>
          ) : null}
        </div>
      )}
      <ChampionWindow state={win} data={data} detail={detail} championsById={championsById} playerId={playerId} />
    </section>
  );
}
