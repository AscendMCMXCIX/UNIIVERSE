"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_LEADERBOARD_QUEUE, LEADERBOARD_QUEUES, LEADERBOARD_ROLES, type LeaderboardQueue } from "@/domain/leaderboards";
import { ROLE_LABELS, type Role } from "@/domain/roles";
import type { GameRole } from "@/domain/season-stats";
import { RoleSegmented, chipClass } from "@/components/ui/segmented";
import { FilterBar, FilterField } from "@/components/ui/filter-bar";
import { selectClass } from "@/components/ui/input";
import type { LeaderboardFilters } from "@/server/leaderboards/view";

/**
 * Season, games, role and lineup: changing one keeps the others and the selected category and
 * metric (the URL holds them all, so a board can be shared or bookmarked). The shared filter bar:
 * inline on wide screens, behind one "Filters" summary on phones and tablets, so the board comes first.
 */
export function LeaderboardFilterBar({ filters: saved, seasons, currentSeason, basePath = "/leaderboards" }: { filters: LeaderboardFilters; seasons: Array<{ value: number; label: string }>; currentSeason: number; /** The members' boards or the public ones. */ basePath?: string }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  // The controls show the new choice at once, while the board for it loads.
  const [filters, show] = React.useOptimistic(saved, (_: LeaderboardFilters, next: LeaderboardFilters) => next);
  const go = (change: Partial<LeaderboardFilters>) => {
    const n = { ...filters, ...change };
    // On the Highlights tiles the filters keep the tiles (no single metric is open).
    const q = new URLSearchParams(n.highlights ? { category: "highlights", season: String(n.season) } : { category: n.category, metric: n.metricId, season: String(n.season) });
    if (n.queue !== DEFAULT_LEADERBOARD_QUEUE) q.set("queue", n.queue);
    if (n.role) q.set("role", n.role);
    if (n.lineupOnly) q.set("lineup", "1");
    start(() => {
      show(n);
      router.push(`${basePath}?${q.toString()}`, { scroll: false });
    });
  };
  const select = selectClass("md:w-auto md:max-w-[14rem]");
  const season = seasons.find((s) => s.value === filters.season)?.label ?? String(filters.season);
  const summary = [season, LEADERBOARD_QUEUES[filters.queue].label, filters.role ? ROLE_LABELS[filters.role] : "All roles", filters.lineupOnly ? "Main lineup" : null].filter(Boolean).join(" · ");
  const active = (filters.season !== currentSeason ? 1 : 0) + (filters.queue !== DEFAULT_LEADERBOARD_QUEUE ? 1 : 0) + (filters.role ? 1 : 0) + (filters.lineupOnly ? 1 : 0);
  return (
    <FilterBar
      testId="leaderboard-filters"
      foldBelow="lg"
      summary={summary}
      activeCount={active}
      onReset={() => go({ season: currentSeason, queue: DEFAULT_LEADERBOARD_QUEUE, role: null, lineupOnly: false })}
      pending={pending}
      chips={[
        ...(filters.season !== currentSeason ? [{ key: "season", text: season, clear: () => go({ season: currentSeason }) }] : []),
        ...(filters.queue !== DEFAULT_LEADERBOARD_QUEUE ? [{ key: "queue", text: LEADERBOARD_QUEUES[filters.queue].label, clear: () => go({ queue: DEFAULT_LEADERBOARD_QUEUE }) }] : []),
        ...(filters.role ? [{ key: "role", text: ROLE_LABELS[filters.role], clear: () => go({ role: null }) }] : []),
        ...(filters.lineupOnly ? [{ key: "lineup", text: "Main lineup", clear: () => go({ lineupOnly: false }) }] : []),
      ]}
    >
      <FilterField label="Season" htmlFor="lb-season">
        <select id="lb-season" className={select} value={filters.season} onChange={(e) => go({ season: Number(e.target.value) })} data-testid="filter-season">
          {seasons.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </FilterField>
      <FilterField label="Game mode" htmlFor="lb-queue">
        <select id="lb-queue" className={select} value={filters.queue} onChange={(e) => go({ queue: e.target.value as LeaderboardQueue })} data-testid="filter-queue" title={LEADERBOARD_QUEUES[filters.queue].description}>
          {(Object.keys(LEADERBOARD_QUEUES) as LeaderboardQueue[]).map((k) => (
            <option key={k} value={k}>
              {LEADERBOARD_QUEUES[k].label}
            </option>
          ))}
        </select>
      </FilterField>
      <FilterField label="Role played" labelId="lb-role-label">
        <RoleSegmented label="Role played" roles={LEADERBOARD_ROLES as readonly Role[]} value={filters.role as Role | null} onChange={(r) => go({ role: r as GameRole | null })} allowAll testId="filter-role" />
      </FilterField>
      <FilterField label="Lineup">
        <button type="button" aria-pressed={filters.lineupOnly} onClick={() => go({ lineupOnly: !filters.lineupOnly })} className={chipClass(filters.lineupOnly, "self-start")} data-testid="filter-lineup">
          Main lineup only
        </button>
      </FilterField>
    </FilterBar>
  );
}

/** Scrolls the selected chip of a sideways list into view (a deep link to the 9th statistic). */
export function ScrollCurrentIntoView({ selector }: { selector: string }) {
  React.useEffect(() => {
    const el = document.querySelector<HTMLElement>(selector);
    const list = el?.closest("ul");
    if (!el || !list || list.scrollWidth <= list.clientWidth) return;
    list.scrollLeft += el.getBoundingClientRect().left - list.getBoundingClientRect().left - (list.clientWidth - el.offsetWidth) / 2;
  });
  return null;
}
