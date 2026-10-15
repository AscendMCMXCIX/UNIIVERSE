"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { RoleIcon } from "@/components/role-icon";
import { DEFAULT_LEADERBOARD_QUEUE, LEADERBOARD_QUEUES, LEADERBOARD_ROLES, type LeaderboardQueue } from "@/domain/leaderboards";
import { ROLE_LABELS } from "@/domain/roles";
import type { GameRole } from "@/domain/season-stats";
import { cn } from "@/lib/cn";
import type { LeaderboardFilters } from "@/server/leaderboards/view";

/**
 * Season, games, role and lineup: changing one keeps the others and the selected category and
 * metric (the URL holds them all, so a board can be shared or bookmarked). Inline on wide
 * screens; behind a one-line summary on phones, so the board comes first.
 */
export function LeaderboardFilterBar({ filters: saved, seasons }: { filters: LeaderboardFilters; seasons: Array<{ value: number; label: string }> }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [open, setOpen] = React.useState(false);
  // The controls show the new choice at once, while the board for it loads.
  const [filters, show] = React.useOptimistic(saved, (_: LeaderboardFilters, next: LeaderboardFilters) => next);
  const go = (change: Partial<LeaderboardFilters>) => {
    const n = { ...filters, ...change };
    const q = new URLSearchParams({ category: n.category, metric: n.metricId, season: String(n.season) });
    if (n.queue !== DEFAULT_LEADERBOARD_QUEUE) q.set("queue", n.queue);
    if (n.role) q.set("role", n.role);
    if (n.lineupOnly) q.set("lineup", "1");
    start(() => {
      show(n);
      router.push(`/leaderboards?${q.toString()}`, { scroll: false });
    });
  };
  const select = "h-9 rounded-lg border border-border bg-bg-elevated px-2.5 text-sm text-fg pointer-coarse:h-11";
  const season = seasons.find((s) => s.value === filters.season)?.label ?? String(filters.season);
  const summary = [season, LEADERBOARD_QUEUES[filters.queue].label, filters.role ? ROLE_LABELS[filters.role] : "All roles", filters.lineupOnly ? "Lineup" : null].filter(Boolean).join(" · ");
  return (
    <div className={cn("transition-opacity", pending && "opacity-60")} data-testid="leaderboard-filters" aria-busy={pending}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="lb-filter-controls" className="flex min-h-11 w-full items-center gap-2 rounded-xl border border-border bg-surface px-3 text-left text-sm lg:hidden" data-testid="filter-toggle">
        <SlidersHorizontal className="h-4 w-4 shrink-0 text-accent" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-fg">{summary}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-fg-muted transition-transform motion-reduce:transition-none", open && "rotate-180")} aria-hidden />
      </button>
      <div id="lb-filter-controls" className={cn("flex-wrap items-center gap-2 max-lg:mt-2 lg:flex 2xl:justify-end", open ? "flex" : "hidden")}>
        <label className="sr-only" htmlFor="lb-season">
          Season
        </label>
        <select id="lb-season" className={select} value={filters.season} onChange={(e) => go({ season: Number(e.target.value) })} data-testid="filter-season">
          {seasons.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="lb-queue">
          Games
        </label>
        <select id="lb-queue" className={select} value={filters.queue} onChange={(e) => go({ queue: e.target.value as LeaderboardQueue })} data-testid="filter-queue" title={LEADERBOARD_QUEUES[filters.queue].description}>
          {(Object.keys(LEADERBOARD_QUEUES) as LeaderboardQueue[]).map((k) => (
            <option key={k} value={k}>
              {LEADERBOARD_QUEUES[k].label}
            </option>
          ))}
        </select>
        <div role="radiogroup" aria-label="Role played" className="flex rounded-lg border border-border p-0.5" data-testid="filter-role">
          <RoleButton active={!filters.role} onClick={() => go({ role: null })} label="All roles" />
          {LEADERBOARD_ROLES.map((r) => (
            <RoleButton key={r} active={filters.role === r} onClick={() => go({ role: r })} label={ROLE_LABELS[r]} role={r} />
          ))}
        </div>
        <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border border-border px-2.5 text-sm text-fg-muted has-[:checked]:border-accent/60 has-[:checked]:text-fg pointer-coarse:min-h-11" data-testid="filter-lineup">
          <input type="checkbox" className="accent-[var(--color-accent)]" checked={filters.lineupOnly} onChange={(e) => go({ lineupOnly: e.target.checked })} />
          Active lineup only
        </label>
      </div>
    </div>
  );
}

function RoleButton({ active, onClick, label, role }: { active: boolean; onClick: () => void; label: string; role?: GameRole }) {
  return (
    <button type="button" role="radio" aria-checked={active} onClick={onClick} aria-label={label} title={label} className={cn("inline-flex min-h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors pointer-coarse:min-h-10", active ? "bg-accent/15 text-accent" : "text-fg-muted hover:text-fg")} data-value={role ?? "ALL"}>
      {role ? <RoleIcon role={role} className="h-3.5 w-3.5" /> : null}
      <span className={cn(role && "sr-only")}>{label}</span>
    </button>
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
