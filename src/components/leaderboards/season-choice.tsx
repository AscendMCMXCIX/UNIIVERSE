"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/cn";

/**
 * The season of the records, multikills and champion games (the current one by default), at the end
 * of the season records' title row; Recent form, which counts the last 60 days, and all-time mastery
 * take none. The app's Select (a phone keeps its own picker); the choice is kept in the address (`?season=`) and the page shows it at once while the season loads.
 */
export function SeasonChoice({ seasons, current }: { seasons: ReadonlyArray<{ value: number; label: string; href: string }>; current: number }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [shown, show] = React.useOptimistic(current, (_: number, next: number) => next);
  if (seasons.length < 2) return null;
  return (
    <div className="flex min-w-0 items-center gap-2 text-sm text-fg-muted" data-testid="records-season">
      <Select
        aria-label="Season"
        className={cn("w-full sm:w-auto", pending && "opacity-70")}
        value={String(shown)}
        onValueChange={(v) => {
          const next = seasons.find((s) => s.value === Number(v));
          if (!next) return;
          start(() => {
            show(next.value);
            // Replaces the history entry, as a filter does: Back leaves the page.
            router.replace(next.href, { scroll: false });
          });
        }}
        data-testid="records-season-select"
        aria-busy={pending || undefined}
        options={seasons.map((s) => ({ value: String(s.value), label: s.label }))}
      />
    </div>
  );
}
