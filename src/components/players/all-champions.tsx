"use client";

import * as React from "react";
import { Search } from "lucide-react";
import type { OverviewCard, PlayerOverviewData } from "@/server/players/overview";
import { ROLE_LABELS } from "@/domain/roles";
import { seasonLabel } from "@/domain/season";
import { seasonModeInfo } from "@/domain/season-stats";
import { ChampionPortrait, type PortraitChampion } from "@/components/champion-portrait";
import { RoleIcon } from "@/components/role-icon";
import { normalise } from "@/components/champions/types";
import { TierBadge } from "./tier-badge";
import { OverviewFilters } from "./overview-filters";
import { percent } from "@/lib/format";
import { cn } from "@/lib/cn";

type Sort = "games" | "win" | "kda" | "cs";
const SORTS: Array<[Sort, string]> = [
  ["games", "Games"],
  ["win", "Win rate"],
  ["kda", "KDA"],
  ["cs", "CS/min"],
];
const FIRST = 20;
const value = (c: OverviewCard, s: Sort): number => (s === "games" ? c.selected.games : s === "win" ? (c.selected.winRate ?? -1) : s === "kda" ? (c.performance.kdaRatio ?? -1) : (c.performance.csPerMinute ?? -1));

/**
 * My Profile → All Champions: every champion in the filtered games (season, mode, role played,
 * account), configured or not. Search by name, sort by games, win rate, KDA or CS/min; the first
 * twenty, then the rest one click away. The pools on Overview stay the main view; this is for
 * exploring.
 */
export function AllChampions({ data, basePath, championsById }: { data: PlayerOverviewData; basePath: string; championsById: Record<string, PortraitChampion> }) {
  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState<Sort>("games");
  const [all, setAll] = React.useState(false);
  const champ = (id: string): PortraitChampion => championsById[id] ?? { id, name: id, portraitUrl: "" };
  const q = normalise(query.trim());
  const rows = data.topChampions
    .filter((c) => !q || normalise(champ(c.championId).name).includes(q))
    .sort((a, b) => value(b, sort) - value(a, sort) || b.selected.games - a.selected.games || a.championId.localeCompare(b.championId));
  const shown = all || q ? rows : rows.slice(0, FIRST);
  const f = data.filter;
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
        <OverviewFilters basePath={basePath} filter={f} seasons={data.seasons} currentSeason={data.currentSeason} champions={[]} accounts={data.accountOptions} showChampions={false} testId="all-champions-filters" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-md border border-border bg-bg-elevated px-3 sm:max-w-xs md:h-9">
          <Search className="h-4 w-4 shrink-0 text-fg-subtle" aria-hidden />
          <span className="sr-only">Find a champion</span>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a champion…" className="min-w-0 flex-1 bg-transparent text-base text-fg outline-none placeholder:text-fg-subtle md:text-sm" data-testid="all-champions-search" />
        </label>
        <div role="radiogroup" aria-label="Sort by" className="flex gap-0.5 rounded-lg border border-border bg-bg-elevated p-0.5" data-testid="all-champions-sort">
          {SORTS.map(([s, label]) => (
            <button key={s} type="button" role="radio" aria-checked={sort === s} onClick={() => setSort(s)} className={cn("min-h-9 rounded-md px-2.5 text-xs font-medium pointer-coarse:min-h-10", sort === s ? "bg-surface-3 text-fg" : "text-fg-muted hover:text-fg")}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-fg-muted">{q ? `No champion matches “${query}”.` : data.hasHistory ? "No games match these filters." : "No stored games yet: they appear after the first account sync."}</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-surface">
          <div className="hidden grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,0.55fr))_minmax(0,1.1fr)] gap-x-3 border-b border-border px-3 py-2 text-xs font-medium text-fg-subtle sm:grid">
            <span>Champion</span>
            <span>Games</span>
            <span>Win rate</span>
            <span>KDA</span>
            <span title="Creep score per minute">CS/min</span>
            <span>Proficiency in the role</span>
          </div>
          <ul className="divide-y divide-border">
            {shown.map((c) => {
              const ch = champ(c.championId);
              const r = c.selected;
              return (
                <li key={`${c.championId}-${c.role}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-3 py-2 sm:grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,0.55fr))_minmax(0,1.1fr)]" data-testid="top-champion">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <ChampionPortrait champion={ch} size="sm" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-fg">{ch.name}</span>
                      <span className="flex items-center gap-1 text-xs text-fg-subtle">
                        <RoleIcon role={c.role} className="h-3.5 w-3.5" /> {ROLE_LABELS[c.role]}
                        {c.inPool ? <span className="text-accent"> · in pool</span> : ""}
                      </span>
                    </span>
                  </span>
                  <span className="text-right text-sm tabular-nums sm:text-left">
                    <span className="font-semibold text-fg">{r.games}</span> <span className="text-xs text-fg-subtle sm:hidden">games</span>
                  </span>
                  <span className={cn("hidden text-sm font-semibold tabular-nums sm:block", r.winRate === null ? "text-fg-muted" : r.winRate >= 0.5 ? "text-good" : "text-fg")}>{r.winRate === null ? "—" : percent(r.winRate, 0)}</span>
                  <span className="hidden text-sm tabular-nums text-fg sm:block">{c.performance.perfectKda ? "Perfect" : c.performance.kdaRatio === null ? "—" : c.performance.kdaRatio.toFixed(2)}</span>
                  <span className="hidden text-sm tabular-nums text-fg sm:block">{c.performance.csPerMinute === null ? "—" : c.performance.csPerMinute.toFixed(1)}</span>
                  <span className="col-span-2 flex flex-wrap items-center gap-x-2 gap-y-1 sm:col-span-1">
                    <TierBadge tier={c.tier} label={c.tierLabel} why={c.tierWhy} evidence={c.evidence} compact />
                    <span className="text-xs text-fg-subtle sm:hidden">{r.winRate === null ? "" : `${percent(r.winRate, 0)} won · KDA ${c.performance.kdaRatio === null ? "—" : c.performance.kdaRatio.toFixed(2)}`}</span>
                  </span>
                </li>
              );
            })}
          </ul>
          {!all && !q && rows.length > FIRST ? (
            <button type="button" onClick={() => setAll(true)} className="flex min-h-11 w-full items-center justify-center border-t border-border text-sm font-medium text-accent hover:bg-accent/5" data-testid="all-champions-more">
              Show all {rows.length} champions
            </button>
          ) : null}
        </div>
      )}
    </section>
  );
}
