"use client";

import * as React from "react";
import type { ColumnStat } from "@/domain/champion-lookup/board";
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
    same rows (columnStats: a statistic only one champion has gets "—" in the other's; none at all
    for a champion whose statistics are not stored), and the two open and close together, so their
    rows stay side by side.

  The table is a grid with a table's roles (role="table"), so it takes the room it has (@container/
  stats): from 15rem the statistic, then "Level 1" and "Per level" in fixed columns, so two Compare
  columns as wide as each other wrap their labels alike; narrower (a Compare column on a phone), each
  statistic's name on a line of its own and its two numbers under their headings, in two halves. Nothing wider
  than its column. A label the other column words otherwise ("Mana" beside "Energy") keeps the room
  of the longer (`twin`, drawn invisibly), so the two tables' rows stay level.
*/

/** One row as a column lists it (columnStats): the statistic, its label, the champion's numbers (null: none in its data), the other column's label where it differs. */
export type StatLine = ColumnStat;

/**
 * The table's columns, by its width; each row a subgrid of them, so every row's columns line up.
 * Narrow: two halves for the two numbers (a statistic's name on the line above them), the ⓘ over
 * the left edge of the headings' line (it takes no column, so "+3.65%" keeps its room on a 390px
 * phone's column). Under 7.5rem (a 320px phone at 200% text) the ⓘ takes a line of its own over the
 * headings and the figures a size smaller, so two of them still fit side by side.
 */
const TABLE = "relative grid grid-cols-2 gap-x-1.5 text-sm @max-[7.5rem]/stats:gap-x-1 @max-[7.5rem]/stats:text-xs @min-[15rem]/stats:grid-cols-[minmax(0,1fr)_3.25rem_3.75rem] @min-[15rem]/stats:gap-x-3";
const ROW = "col-span-full grid grid-cols-subgrid items-baseline";

/** The table; its ⓘ in its first heading cell where no heading of its own carries it (a fold's summary cannot hold a button). */
function StatsTable({ lines, name, tip }: { lines: readonly StatLine[]; name: string; tip: string | null }) {
  return (
    <div className="@container/stats min-w-0">
      <div role="table" aria-label={`${name}'s base statistics`} className={TABLE} data-testid="lookup-stats-table">
        <div role="row" className={cn(ROW, "pb-1")}>
          <span role="columnheader" className="absolute left-0 top-0 text-left @max-[7.5rem]/stats:static @max-[7.5rem]/stats:col-span-full @min-[15rem]/stats:static">
            <span className="sr-only">Statistic</span>
            {tip ? <InfoTip label="About these numbers" text={tip} testId="lookup-stats-tip" /> : null}
          </span>
          <span role="columnheader" className="label-text text-right">
            Level 1
          </span>
          <span role="columnheader" className="label-text text-right">
            Per level
          </span>
        </div>
        {lines.map((l) => (
          <div role="row" key={l.key} className={cn(ROW, "border-t border-border/60 py-1")} data-testid="lookup-stat" data-stat={l.key}>
            {/* The name: a line of its own on a narrow table; the other column's wording held invisibly beside it, so both rows take the same lines. */}
            <span role="rowheader" className="col-span-full grid text-left text-fg-muted @min-[15rem]/stats:col-span-1">
              <span className="col-start-1 row-start-1">{l.label}</span>
              {l.twin ? (
                <span aria-hidden className="invisible col-start-1 row-start-1">
                  {l.twin}
                </span>
              ) : null}
            </span>
            <span role="cell" className="col-start-1 whitespace-nowrap text-right font-semibold tabular-nums text-fg @min-[15rem]/stats:col-start-2">
              {l.row ? formatSeconds(l.row.base) : <span className="font-normal text-fg-subtle">—</span>}
            </span>
            <span role="cell" className="whitespace-nowrap text-right tabular-nums text-fg-muted">
              {l.row && l.row.growth !== null ? (
                <>
                  +{formatSeconds(l.row.growth)}
                  {l.row.growthUnit}
                </>
              ) : (
                <span className="sr-only">none</span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The ⓘ's words for a champion's table: what the numbers are, and attack damage's missing growth where Riot's data gives none. */
export function statsTip(lines: readonly StatLine[]): string {
  return statsTipWords(lines.some((l) => l.key === "attackdamage" && l.row && l.row.growth === null));
}

/**
 * "Changed since 26.22", where Riot changed the champion's base statistics in its last patch. In
 * Compare, a column without the mark holds the other's room invisibly (`twin`), so both folds' lines
 * wrap alike and their tables start level.
 */
function Changed({ since, twin = null }: { since: string | null; twin?: string | null }) {
  if (since) return <span className="text-xs text-fg-muted">Changed since {since}</span>;
  if (!twin) return null;
  return (
    <span aria-hidden className="invisible text-xs">
      Changed since {twin}
    </span>
  );
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
export function BaseStatsFold({ lines, name, changedSince, changedTwin = null, id, open, onToggle, className }: { lines: readonly StatLine[]; name: string; changedSince: string | null; /** Compare: the other column's "Changed since" patch, whose room this fold's summary keeps. */ changedTwin?: string | null; id: string; open?: boolean; onToggle?: (open: boolean) => void; className?: string }) {
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
          Base stats <Changed since={changedSince} twin={changedTwin} />
        </span>
      }
      testId="lookup-stats"
      summaryTestId="lookup-stats-summary"
    >
      <StatsTable lines={lines} name={name} tip={statsTip(lines)} />
    </Fold>
  );
}
