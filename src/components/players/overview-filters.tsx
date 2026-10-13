"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { GAME_MODES, PATCH_WINDOWS, overviewQuery, type GameMode, type PatchWindow } from "@/domain/player-stats";
import { Label, Select } from "@/components/ui/input";

/** Game-mode and patch-window dropdowns: plain GET parameters, applied on change. */
export function OverviewFilters({ basePath, mode, window, others }: { basePath: string; mode: GameMode; window: PatchWindow; others: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const go = (next: Partial<{ mode: string; window: string }>) => {
    const query = overviewQuery((next.mode ?? mode) as GameMode, (next.window ?? String(window)) as unknown as PatchWindow, others);
    startTransition(() => router.replace(`${basePath}?${query}`, { scroll: false }));
  };
  return (
    <form method="get" action={basePath} className="flex flex-wrap items-end gap-2" onSubmit={(e) => e.preventDefault()} data-testid="overview-filters">
      <div>
        <Label htmlFor="overview-mode">Game mode</Label>
        <Select id="overview-mode" name="mode" value={mode} disabled={pending} onChange={(e) => go({ mode: e.target.value })} className="sm:w-56">
          {GAME_MODES.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="overview-window">Patch window</Label>
        <Select id="overview-window" name="window" value={String(window)} disabled={pending} onChange={(e) => go({ window: e.target.value })} className="sm:w-56">
          {PATCH_WINDOWS.map((w) => (
            <option key={String(w.key)} value={String(w.key)}>
              {w.label}
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
