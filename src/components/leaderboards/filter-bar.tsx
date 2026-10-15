"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { RoleIcon } from "@/components/role-icon";
import { LEADERBOARD_QUEUES, LEADERBOARD_ROLES, type LeaderboardQueue } from "@/domain/leaderboards";
import { ROLE_LABELS } from "@/domain/roles";
import type { GameRole } from "@/domain/season-stats";
import { cn } from "@/lib/cn";
import type { LeaderboardFilters } from "@/server/leaderboards/view";

/**
 * Season, games, role and lineup: changing one keeps the others and the selected category and
 * metric (the URL holds them all, so a board can be shared or bookmarked).
 */
export function LeaderboardFilterBar({ filters: saved, seasons }: { filters: LeaderboardFilters; seasons: Array<{ value: number; label: string }> }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  // The controls show the new choice at once, while the board for it loads.
  const [filters, show] = React.useOptimistic(saved, (_: LeaderboardFilters, next: LeaderboardFilters) => next);
  const go = (change: Partial<LeaderboardFilters>) => {
    const n = { ...filters, ...change };
    const q = new URLSearchParams({ category: n.category, metric: n.metricId, season: String(n.season) });
    if (n.queue !== "ranked") q.set("queue", n.queue);
    if (n.role) q.set("role", n.role);
    if (n.lineupOnly) q.set("lineup", "1");
    start(() => {
      show(n);
      router.push(`/leaderboards?${q.toString()}`, { scroll: false });
    });
  };
  const select = "h-9 rounded-lg border border-border bg-bg-elevated px-2.5 text-sm text-fg pointer-coarse:h-11";
  return (
    <div className={cn("flex flex-wrap items-center gap-2 transition-opacity", pending && "opacity-60")} data-testid="leaderboard-filters" aria-busy={pending}>
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
      <div role="radiogroup" aria-label="Role played" className="flex flex-wrap rounded-lg border border-border p-0.5" data-testid="filter-role">
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
  );
}

function RoleButton({ active, onClick, label, role }: { active: boolean; onClick: () => void; label: string; role?: GameRole }) {
  return (
    <button type="button" role="radio" aria-checked={active} onClick={onClick} aria-label={label} title={label} className={cn("inline-flex min-h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors pointer-coarse:min-h-10", active ? "bg-accent/15 text-accent" : "text-fg-muted hover:text-fg")} data-value={role ?? "ALL"}>
      {role ? <RoleIcon role={role} className="h-3.5 w-3.5" /> : null}
      <span className={cn(role && "max-sm:sr-only")}>{label}</span>
    </button>
  );
}
