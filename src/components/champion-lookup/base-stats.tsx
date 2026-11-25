"use client";

import type { LookupFacts } from "@/domain/champion-lookup/view";
import { formatSeconds } from "@/lib/format";
import { Fold } from "@/components/ui/fold";

/*
  Champion Intel's base statistics (docs/CHAMPION_INTEL.md, "Base statistics"): folded under the key
  mechanics, Riot's base value of each statistic at level 1 and its growth per level as Riot gives
  it (statRows: a growth of 0 or Riot's placeholder 0 is shown as none, never "+0"; no value at a
  later level is computed). One list, two columns where the panel is wide enough.
*/

export function BaseStats({ facts, name, idPrefix }: { facts: LookupFacts; name: string; idPrefix: string }) {
  if (!facts.stats.length) return null;
  return (
    <Fold
      variant="row"
      tone="muted"
      id={`${idPrefix}-stats`}
      summary={<span className="text-xs font-medium">Base statistics and growth per level</span>}
      summaryClassName="text-fg-muted"
      testId="lookup-stats"
      summaryTestId="lookup-stats-summary"
    >
      <div className="@container/stats space-y-1.5">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-0.5 text-sm @min-[26rem]/stats:grid-cols-2" aria-label={`${name}'s base statistics`}>
          {facts.stats.map((s) => (
            <div key={s.key} className="flex items-baseline justify-between gap-3 border-b border-border/60 py-1" data-testid="lookup-stat" data-stat={s.key}>
              <dt className="text-fg-muted">{s.label}</dt>
              <dd className="whitespace-nowrap tabular-nums">
                <span className="font-semibold text-fg">{formatSeconds(s.base)}</span>
                {s.growth !== null ? (
                  <span className="text-xs text-fg-muted">
                    {" "}
                    +{formatSeconds(s.growth)}
                    {s.growthUnit} per level
                  </span>
                ) : null}
              </dd>
            </div>
          ))}
        </dl>
        <p className="text-2xs text-fg-subtle">
          Riot&apos;s numbers at level 1 and per level. Attack speed grows by a share of its base; regeneration is per 5 seconds.
          {facts.stats.some((s) => s.key === "attackdamage" && s.growth === null) ? " Riot's data gives attack damage no growth per level, so none is shown." : ""}
          {facts.statsChangedSincePatch ? ` Riot changed these since patch ${facts.statsChangedSincePatch}.` : ""}
        </p>
      </div>
    </Fold>
  );
}
