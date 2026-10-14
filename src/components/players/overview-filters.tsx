"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { SEASON_MODES, seasonQuery, type SeasonMode } from "@/domain/season-stats";
import { seasonLabel } from "@/domain/season";
import { Label, Select } from "@/components/ui/input";

/** Season and game-mode dropdowns: plain GET parameters, applied on change. */
export function OverviewFilters({ basePath, season, seasons, currentSeason, mode, others }: { basePath: string; season: number; seasons: number[]; currentSeason: number; mode: SeasonMode; others: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const go = (next: Partial<{ season: number; mode: SeasonMode }>) => {
    const query = seasonQuery(next.season ?? season, next.mode ?? mode, others);
    startTransition(() => router.replace(`${basePath}?${query}`, { scroll: false }));
  };
  return (
    <form method="get" action={basePath} className="flex flex-wrap items-end gap-2" onSubmit={(e) => e.preventDefault()} data-testid="overview-filters">
      <div>
        <Label htmlFor="overview-season">Season</Label>
        <Select id="overview-season" name="season" value={String(season)} disabled={pending} onChange={(e) => go({ season: Number(e.target.value) })} className="sm:w-48">
          {seasons.map((s) => (
            <option key={s} value={s}>
              {seasonLabel(s)}
              {s === currentSeason ? " (current)" : ""}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="overview-mode">Game mode</Label>
        <Select id="overview-mode" name="mode" value={mode} disabled={pending} onChange={(e) => go({ mode: e.target.value as SeasonMode })} className="sm:w-56">
          {SEASON_MODES.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </Select>
      </div>
      {others ? <input type="hidden" name="others" value="1" /> : null}
      <noscript>
        <button type="submit" className="text-xs underline">
          Apply
        </button>
      </noscript>
    </form>
  );
}
