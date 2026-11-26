"use client";

import * as React from "react";
import type { StatKey, StatRow } from "@/domain/champion-lookup/stats";
import { statsTipWords } from "@/domain/champion-lookup/words";
import { formatSeconds } from "@/lib/format";
import { Fold } from "@/components/ui/fold";
import { InfoTip } from "@/components/ui/info-tip";
import { cn } from "@/lib/cn";

/*
  Champion Intel's base statistics (docs/CHAMPION_INTEL.md, "Base statistics"): Riot's base value
  of each statistic at level 1 and its growth per level as Riot gives it (statRows: a growth of 0 or
  Riot's placeholder 0 is shown as none, never "+0"; no value at a later level is computed), in one
  small table: the statistic, "Level 1", "Per level". Attack range is not in it: the champion's facts
  say it once (listedStats). What the numbers are is in the ⓘ over the table.

  - One champion on a wide board: the table in the column beside the abilities, open (no fold).
  - Narrower, and in Compare: a fold after the abilities. In Compare each column has one, on the
    same rows (alignedStats: a statistic only one champion has gets "—" in the other's), and the
    two open and close together, so their rows stay side by side.
*/

/** One row as a column lists it: the statistic, its label, and the champion's numbers (null: none in its data). */
export interface StatLine {
  key: StatKey;
  label: string;
  row: StatRow | null;
}

/** The table; its ⓘ in its first heading cell where no heading of its own carries it (a fold's summary cannot hold a button). */
function StatsTable({ lines, name, tip }: { lines: readonly StatLine[]; name: string; tip: string | null }) {
  return (
    <table className="w-full border-collapse text-sm" aria-label={`${name}'s base statistics`}>
      <thead>
        <tr>
          <th scope="col" className="pb-1 text-left font-normal">
            <span className="sr-only">Statistic</span>
            {tip ? <InfoTip label="About these numbers" text={tip} testId="lookup-stats-tip" /> : null}
          </th>
          <th scope="col" className="label-text pb-1 pl-3 text-right">
            Level 1
          </th>
          <th scope="col" className="label-text pb-1 pl-3 text-right">
            Per level
          </th>
        </tr>
      </thead>
      <tbody>
        {lines.map((l) => (
          <tr key={l.key} className="border-t border-border/60" data-testid="lookup-stat" data-stat={l.key}>
            <th scope="row" className="py-1 text-left font-normal text-fg-muted">
              {l.label}
            </th>
            <td className="whitespace-nowrap py-1 pl-3 text-right font-semibold tabular-nums text-fg">{l.row ? formatSeconds(l.row.base) : <span className="font-normal text-fg-subtle">—</span>}</td>
            <td className="whitespace-nowrap py-1 pl-3 text-right tabular-nums text-fg-muted">
              {l.row && l.row.growth !== null ? (
                <>
                  +{formatSeconds(l.row.growth)}
                  {l.row.growthUnit}
                </>
              ) : (
                <span className="sr-only">none</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** The ⓘ's words for a champion's table: what the numbers are, and attack damage's missing growth where Riot's data gives none. */
export function statsTip(lines: readonly StatLine[]): string {
  return statsTipWords(lines.some((l) => l.key === "attackdamage" && l.row && l.row.growth === null));
}

/** "Changed since 26.22", where Riot changed the champion's base statistics in its last patch. */
function Changed({ since }: { since: string | null }) {
  if (!since) return null;
  return <span className="text-xs text-fg-muted">Changed since {since}</span>;
}

/** The table open, under a heading of its own: one champion's column beside the abilities. */
export function BaseStatsPanel({ lines, name, changedSince, className }: { lines: readonly StatLine[]; name: string; changedSince: string | null; className?: string }) {
  if (!lines.length) return null;
  return (
    <section aria-label="Base stats" className={cn("space-y-1.5", className)} data-testid="lookup-stats" data-open="true">
      <h3 className="flex flex-wrap items-center gap-x-2 text-sm font-semibold text-fg">
        Base stats
        <InfoTip label="About these numbers" text={statsTip(lines)} testId="lookup-stats-tip" />
        <Changed since={changedSince} />
      </h3>
      <StatsTable lines={lines} name={name} tip={null} />
    </section>
  );
}

/** The table in a fold: one champion's narrower page, and each column of Compare (`open`/`onToggle` keep the two together). */
export function BaseStatsFold({ lines, name, changedSince, id, open, onToggle, className }: { lines: readonly StatLine[]; name: string; changedSince: string | null; id: string; open?: boolean; onToggle?: (open: boolean) => void; className?: string }) {
  // Compare: the other column's fold opened or closed, so this one follows (a native <details>, opened in place).
  React.useEffect(() => {
    const el = document.getElementById(id);
    if (open === undefined || !(el instanceof HTMLDetailsElement) || el.open === open) return;
    el.open = open;
  }, [id, open]);
  if (!lines.length) return null;
  return (
    <Fold
      variant="row"
      id={id}
      className={className}
      onToggle={onToggle}
      summary={
        <span className="flex flex-wrap items-baseline gap-x-2 py-1 text-sm font-semibold text-fg">
          Base stats <Changed since={changedSince} />
        </span>
      }
      testId="lookup-stats"
      summaryTestId="lookup-stats-summary"
    >
      <StatsTable lines={lines} name={name} tip={statsTip(lines)} />
    </Fold>
  );
}
