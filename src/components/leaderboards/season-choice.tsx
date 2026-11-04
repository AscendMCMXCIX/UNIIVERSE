"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { selectClass } from "@/components/ui/input";
import { cn } from "@/lib/cn";

/**
 * Records & achievements' one choice: the season (the current one by default). A native select, so
 * keyboards, screen readers and phone pickers behave as expected; the choice is kept in the address
 * and the page shows it at once while the season loads.
 */
export function SeasonChoice({ seasons, current }: { seasons: ReadonlyArray<{ value: number; label: string; href: string }>; current: number }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [shown, show] = React.useOptimistic(current, (_: number, next: number) => next);
  if (seasons.length < 2) return null;
  return (
    <label className="flex min-w-0 items-center gap-2 text-sm text-fg-muted" data-testid="records-season">
      <span className="sr-only">Season</span>
      <select
        className={cn(selectClass("w-full sm:w-auto"), pending && "opacity-70")}
        value={shown}
        onChange={(e) => {
          const next = seasons.find((s) => s.value === Number(e.target.value));
          if (!next) return;
          start(() => {
            show(next.value);
            router.push(next.href, { scroll: false });
          });
        }}
        data-testid="records-season-select"
        aria-busy={pending || undefined}
      >
        {seasons.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
    </label>
  );
}
