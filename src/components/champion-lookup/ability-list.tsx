"use client";

import * as React from "react";
import type { LookupAbility } from "@/domain/champion-lookup/view";
import { mechanicChips, type MechanicChip } from "@/domain/champion-lookup/board";
import { cooldownAtHaste } from "@/domain/champion-lookup/haste";
import type { MechanicFact } from "@/domain/champion-lookup/mechanics";
import { rangeStatus, shownReach } from "@/domain/champion-lookup/range";
import type { Slot } from "@/domain/champion-lookup/types";
import { DATA_LIMIT_WORDS, SLOT_NAMES, changedWords, cooldownWords, rangeNoteWords, type RangeWithPatch } from "@/domain/champion-lookup/words";
import { formatCount, formatSeconds } from "@/lib/format";
import { Fold } from "@/components/ui/fold";
import { InfoTip } from "@/components/ui/info-tip";
import { RemoteImage } from "@/components/ui/remote-image";
import { cn } from "@/lib/cn";

/*
  Champion Intel's abilities (docs/CHAMPION_INTEL.md, "Abilities"; the owner's request of 25 Nov
  2026): one row per ability, each a fold of its own (the shared Fold, a native <details>, so it opens
  by keyboard, by find-in-page and before the page's code runs). Folded, the row is the quick
  reference: the slot's key tile (P, Q, W, E, R) and the icon, the ability's name and the mechanics
  Riot's description names as chips (crowd control first), its range where the review of what Riot's
  number measures is current ("Range 970", "Global": a short muted item after the chips, under them
  where the row has no room, never a grid line of its own; docs/CHAMPION_INTEL.md, "Ranges"), and on
  one grid of rank columns the
  cooldown at every rank (at the champion's haste when it is above 0, the base under it, smaller),
  then the cost at every rank in the champion's resource. A cooldown Riot's data does not give is
  said in words instead (a passive's is a quiet dash, the ⓘ over the abilities says why). Opened,
  Riot's whole description with the words behind each chip marked, why a cooldown has no number in
  full, where the range comes from (or why it waits for a review), and what Riot changed in its last
  patch where that is known.

  Each row measures itself (@container/cell) and takes one of three forms, the same in every row of
  a champion's column, so rank n always sits in the same place:
  - wide: the name and chips, then the rank grid beside them, at the row's right;
  - stacked: the name and chips, the rank grid under them, at the row's right;
  - line (a phone, a narrow column): the values as one line per kind, "13 / 12 / 11 / 10 / 9 s",
    wrapping between ranks only.
  The rank grid is a label column (the base line's "base", the cost's resource) and one 3.25rem
  column per rank (4rem on a wide row), as many as the champion's abilities have at most
  (rankColumns: Udyr's six); the heading over the rows has the same grid and right edge.
*/

export type BoardMode = "single" | "compare";

/**
 * The forms of a champion's rows, by mode and by its rank columns (five, or six for Udyr's and
 * Jayce's basic abilities). The widths are the cell's content (@container/cell measures inside its
 * padding): the fold's chevron and the icon, and on one champion's board the slot's key tile (in
 * Compare it is in the board's own column). Stacked from the rank grid's width (3rem of label and
 * 3.25rem a rank) beside the icon: the grid under the name, its columns at the right (a free column
 * on their left, so a reason in words takes the row's whole width); wide from 7rem of name
 * beside the grid: the grid at the top right, the name and chips flowing beside and under it
 * (a float, so a long name or many chips use the row's whole width under the grid); 4rem rank
 * columns once 11rem of name fits beside them. A narrow Compare column (a phone) leaves the icon
 * out: the slot's key in the board's own column says which ability it is. Compare's columns stacked
 * (a board under 22rem) read as one champion's rows, the key beside the icon. One champion's row
 * under 14rem (a small phone at a large text size), and a stacked Compare column's, put the name and
 * values under the key and the icon. A Compare row under 15rem (a phone's column) sets
 * the name and the cooldown a size smaller, so a long word fits its line. Written out whole, so the
 * stylesheet has every class.
 */
const FORMS = {
  single5: {
    narrow: "@max-[14rem]/cell:col-start-1 @max-[14rem]/cell:col-end-[-1] @max-[14rem]/cell:row-start-2 @max-[14rem]/cell:mt-2",
    primary: "",
    cell: "px-3 sm:px-4",
    icon: "h-7 w-7 @min-[26rem]/cell:h-9 @min-[26rem]/cell:w-9",
    iconWrap: "col-start-2 row-start-1 mr-2.5",
    tile: "@min-[26rem]/cell:mt-1",
    body: "mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 @min-[26rem]/cell:mt-1.5 @min-[34rem]/cell:flow-root",
    h3: "@min-[34rem]/cell:inline @min-[34rem]/cell:mr-2",
    chips: "inline-flex min-w-0 max-w-full flex-wrap gap-y-1 @min-[34rem]/cell:inline",
    ranks: "order-last basis-full @min-[26rem]/cell:justify-end @min-[34rem]/cell:float-right @min-[34rem]/cell:ml-4",
    columns: "@min-[26rem]/cell:grid @min-[26rem]/cell:space-y-0",
    line: "@min-[26rem]/cell:grid @min-[26rem]/cell:grid-cols-subgrid @min-[26rem]/cell:col-span-full",
    cellOnly: "@min-[26rem]/cell:hidden",
    label: "@min-[26rem]/cell:col-start-2 @min-[26rem]/cell:mr-0 @min-[26rem]/cell:pr-2 @min-[26rem]/cell:text-right @min-[34rem]/cell:col-start-1",
    rank1: "@min-[26rem]/cell:col-start-3 @min-[34rem]/cell:col-start-2",
    stackCols: "@min-[26rem]/cell:grid-cols-[minmax(0,1fr)_3rem_repeat(var(--lookup-ranks),3.25rem)] @min-[34rem]/cell:grid-cols-[3rem_repeat(var(--lookup-ranks),3.25rem)]",
    value: "@min-[26rem]/cell:text-right",
    fold: "pl-19 @max-[14rem]/cell:pl-0 @min-[26rem]/cell:pl-21",
    head: "@min-[26rem]/cell:grid",
    wideCols: "@min-[42.25rem]/cell:grid-cols-[3.5rem_repeat(var(--lookup-ranks),4rem)]",
  },
  single6: {
    narrow: "@max-[14rem]/cell:col-start-1 @max-[14rem]/cell:col-end-[-1] @max-[14rem]/cell:row-start-2 @max-[14rem]/cell:mt-2",
    primary: "",
    cell: "px-3 sm:px-4",
    icon: "h-7 w-7 @min-[29.25rem]/cell:h-9 @min-[29.25rem]/cell:w-9",
    iconWrap: "col-start-2 row-start-1 mr-2.5",
    tile: "@min-[29.25rem]/cell:mt-1",
    body: "mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 @min-[29.25rem]/cell:mt-1.5 @min-[37.25rem]/cell:flow-root",
    h3: "@min-[37.25rem]/cell:inline @min-[37.25rem]/cell:mr-2",
    chips: "inline-flex min-w-0 max-w-full flex-wrap gap-y-1 @min-[37.25rem]/cell:inline",
    ranks: "order-last basis-full @min-[29.25rem]/cell:justify-end @min-[37.25rem]/cell:float-right @min-[37.25rem]/cell:ml-4",
    columns: "@min-[29.25rem]/cell:grid @min-[29.25rem]/cell:space-y-0",
    line: "@min-[29.25rem]/cell:grid @min-[29.25rem]/cell:grid-cols-subgrid @min-[29.25rem]/cell:col-span-full",
    cellOnly: "@min-[29.25rem]/cell:hidden",
    label: "@min-[29.25rem]/cell:col-start-2 @min-[29.25rem]/cell:mr-0 @min-[29.25rem]/cell:pr-2 @min-[29.25rem]/cell:text-right @min-[37.25rem]/cell:col-start-1",
    rank1: "@min-[29.25rem]/cell:col-start-3 @min-[37.25rem]/cell:col-start-2",
    stackCols: "@min-[29.25rem]/cell:grid-cols-[minmax(0,1fr)_3rem_repeat(var(--lookup-ranks),3.25rem)] @min-[37.25rem]/cell:grid-cols-[3rem_repeat(var(--lookup-ranks),3.25rem)]",
    value: "@min-[29.25rem]/cell:text-right",
    fold: "pl-19 @max-[14rem]/cell:pl-0 @min-[29.25rem]/cell:pl-21",
    head: "@min-[29.25rem]/cell:grid",
    wideCols: "@min-[46.25rem]/cell:grid-cols-[3.5rem_repeat(var(--lookup-ranks),4rem)]",
  },
  compare5: {
    narrow: "@max-[22rem]/board:@max-[14rem]/cell:col-start-1 @max-[22rem]/board:@max-[14rem]/cell:col-end-[-1] @max-[22rem]/board:@max-[14rem]/cell:row-start-2 @max-[22rem]/board:@max-[14rem]/cell:mt-2",
    primary: "@max-[15rem]/cell:text-sm",
    cell: "px-3",
    icon: "h-7 w-7 @min-[23.75rem]/cell:h-9 @min-[23.75rem]/cell:w-9",
    iconWrap: "col-start-2 row-start-1 mr-2.5 hidden @min-[11rem]/cell:block",
    tile: "@min-[23.75rem]/cell:mt-1",
    body: "mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 @min-[23.75rem]/cell:mt-1.5 @min-[31.75rem]/cell:flow-root",
    h3: "@max-[15rem]/cell:text-sm @min-[31.75rem]/cell:inline @min-[31.75rem]/cell:mr-2",
    chips: "inline-flex min-w-0 max-w-full flex-wrap gap-y-1 @min-[31.75rem]/cell:inline",
    ranks: "order-last basis-full @min-[23.75rem]/cell:justify-end @min-[31.75rem]/cell:float-right @min-[31.75rem]/cell:ml-4",
    columns: "@min-[23.75rem]/cell:grid @min-[23.75rem]/cell:space-y-0",
    line: "@min-[23.75rem]/cell:grid @min-[23.75rem]/cell:grid-cols-subgrid @min-[23.75rem]/cell:col-span-full",
    cellOnly: "@min-[23.75rem]/cell:hidden",
    label: "@min-[23.75rem]/cell:col-start-2 @min-[23.75rem]/cell:mr-0 @min-[23.75rem]/cell:pr-2 @min-[23.75rem]/cell:text-right @min-[31.75rem]/cell:col-start-1",
    rank1: "@min-[23.75rem]/cell:col-start-3 @min-[31.75rem]/cell:col-start-2",
    stackCols: "@min-[23.75rem]/cell:grid-cols-[minmax(0,1fr)_3rem_repeat(var(--lookup-ranks),3.25rem)] @min-[31.75rem]/cell:grid-cols-[3rem_repeat(var(--lookup-ranks),3.25rem)]",
    value: "@min-[23.75rem]/cell:text-right",
    fold: "@min-[22rem]/board:@min-[11rem]/cell:pl-10 @min-[22rem]/board:@min-[23.75rem]/cell:pl-12 @max-[22rem]/board:@min-[14rem]/cell:pl-19",
    head: "@min-[23.75rem]/cell:grid",
    wideCols: "@min-[40rem]/cell:grid-cols-[3.5rem_repeat(var(--lookup-ranks),4rem)]",
  },
  compare6: {
    narrow: "@max-[22rem]/board:@max-[14rem]/cell:col-start-1 @max-[22rem]/board:@max-[14rem]/cell:col-end-[-1] @max-[22rem]/board:@max-[14rem]/cell:row-start-2 @max-[22rem]/board:@max-[14rem]/cell:mt-2",
    primary: "@max-[15rem]/cell:text-sm",
    cell: "px-3",
    icon: "h-7 w-7 @min-[27rem]/cell:h-9 @min-[27rem]/cell:w-9",
    iconWrap: "col-start-2 row-start-1 mr-2.5 hidden @min-[11rem]/cell:block",
    tile: "@min-[27rem]/cell:mt-1",
    body: "mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 @min-[27rem]/cell:mt-1.5 @min-[35rem]/cell:flow-root",
    h3: "@max-[15rem]/cell:text-sm @min-[35rem]/cell:inline @min-[35rem]/cell:mr-2",
    chips: "inline-flex min-w-0 max-w-full flex-wrap gap-y-1 @min-[35rem]/cell:inline",
    ranks: "order-last basis-full @min-[27rem]/cell:justify-end @min-[35rem]/cell:float-right @min-[35rem]/cell:ml-4",
    columns: "@min-[27rem]/cell:grid @min-[27rem]/cell:space-y-0",
    line: "@min-[27rem]/cell:grid @min-[27rem]/cell:grid-cols-subgrid @min-[27rem]/cell:col-span-full",
    cellOnly: "@min-[27rem]/cell:hidden",
    label: "@min-[27rem]/cell:col-start-2 @min-[27rem]/cell:mr-0 @min-[27rem]/cell:pr-2 @min-[27rem]/cell:text-right @min-[35rem]/cell:col-start-1",
    rank1: "@min-[27rem]/cell:col-start-3 @min-[35rem]/cell:col-start-2",
    stackCols: "@min-[27rem]/cell:grid-cols-[minmax(0,1fr)_3rem_repeat(var(--lookup-ranks),3.25rem)] @min-[35rem]/cell:grid-cols-[3rem_repeat(var(--lookup-ranks),3.25rem)]",
    value: "@min-[27rem]/cell:text-right",
    fold: "@min-[22rem]/board:@min-[11rem]/cell:pl-10 @min-[22rem]/board:@min-[27rem]/cell:pl-12 @max-[22rem]/board:@min-[14rem]/cell:pl-19",
    head: "@min-[27rem]/cell:grid",
    wideCols: "@min-[44rem]/cell:grid-cols-[3.5rem_repeat(var(--lookup-ranks),4rem)]",
  },
} as const;

/** A champion's row forms: its mode and whether any of its abilities has a sixth rank. */
function formOf(mode: BoardMode, ranks: number): Form {
  return FORMS[`${mode}${ranks > 5 ? 6 : 5}`];
}

type Form = (typeof FORMS)[keyof typeof FORMS];

/** The rank grid's columns: the label, then one per rank (the column sets --lookup-ranks). */
const RANK_COLUMNS = "grid-cols-[3rem_repeat(var(--lookup-ranks),3.25rem)]";

/** The slot's key: a clear tile, the same in a row and in Compare's column of keys (drawn; the row's heading says the slot to a screen reader). */
export function SlotKey({ slot, className }: { slot: Slot; className?: string }) {
  return (
    <span aria-hidden className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-md border border-border-strong bg-surface-2 text-sm font-bold leading-none text-fg", className)} data-testid="lookup-slot-key" data-slot={slot}>
      {slot}
    </span>
  );
}

/** The icon, or the key as a plain tile where Riot gives none or it fails to load. */
function AbilityIcon({ ability, size }: { ability: LookupAbility; size: string }) {
  const standIn = (
    <span aria-hidden className={cn("grid shrink-0 place-items-center rounded-md border border-border bg-surface-2 text-xs font-semibold text-fg-muted", size)} data-testid="lookup-icon-standin">
      {ability.slot}
    </span>
  );
  if (!ability.icon) return standIn;
  return <RemoteImage src={ability.icon} fallback={standIn} alt="" width={36} height={36} decoding="async" className={cn("shrink-0 rounded-md border border-border bg-surface-2 object-cover", size)} />;
}

/** Riot's description with the words behind each chip marked (an underline, never colour alone: the chips name them too). */
function MarkedDescription({ text, facts }: { text: string; facts: readonly MechanicFact[] }) {
  const spans = [...facts].sort((a, b) => a.at[0] - b.at[0]).filter((f, i, all) => i === 0 || f.at[0] >= all[i - 1]!.at[1]);
  const parts: React.ReactNode[] = [];
  let from = 0;
  for (const f of spans) {
    if (f.at[0] < from || f.at[1] > text.length) continue;
    parts.push(text.slice(from, f.at[0]));
    parts.push(
      <span key={`${f.kind}-${f.at[0]}`} className="underline decoration-accent/60 decoration-1 underline-offset-[3px]" data-mechanic={f.kind}>
        {text.slice(f.at[0], f.at[1])}
      </span>,
    );
    from = f.at[1];
  }
  parts.push(text.slice(from));
  return <>{parts}</>;
}

/**
 * The range where the review of what Riot's number measures is current: "Range 970", one value per
 * rank where they differ ("Range 1,300 / 1,550 / 1,800", wrapping between values only, each "/" kept
 * with the value before it), or "Global". Small and muted after the chips, so it costs a row no line
 * where the row has room (and one short line under the chips where it has none). Nothing for an
 * ability cast on the champion or waiting for a review (the opened row says why).
 */
function RangeItem({ range, ranks }: { range: RangeWithPatch | null; ranks: number }) {
  if (!range || (range.kind !== "reach" && range.kind !== "global")) return null;
  const values = range.kind === "reach" ? shownReach(range.values) : [];
  return (
    <span className="inline-block max-w-full align-middle text-xs leading-5 tabular-nums text-fg-muted" data-testid="lookup-ability-range" data-range={range.kind} data-values={range.kind === "reach" ? range.values.join(",") : ""} data-ranks={ranks}>
      {range.kind === "global" ? (
        "Global"
      ) : (
        values.map((v, i) => (
          <React.Fragment key={i}>
            {i > 0 ? <span aria-hidden>{"\u00a0/ "}</span> : null}
            <span className="whitespace-nowrap" data-range-value={formatCount(v)}>
              {i === 0 ? "Range\u00a0" : null}
              <span className="sr-only">{values.length > 1 ? `rank ${i + 1}: ` : ""}</span>
              {formatCount(v)}
              {i === values.length - 1 ? <span className="sr-only"> units</span> : null}
            </span>
          </React.Fragment>
        ))
      )}
    </span>
  );
}

/** A mechanic's chip: crowd control in the warning tone (the one group a player reacts to), the rest neutral; the word is the chip, never the colour alone. */
function Chip({ chip }: { chip: MechanicChip }) {
  return (
    <span
      className={cn("mr-1 inline-flex max-w-full items-center rounded-sm border px-1.5 align-middle text-xs font-medium leading-5 last:mr-0", chip.group === "crowd-control" ? "border-warn/30 bg-warn/10 text-warn" : "border-border-strong bg-surface-2 text-fg")}
      data-testid="lookup-mechanic"
      data-kind={chip.kind}
      data-group={chip.group}
    >
      {chip.word}
    </span>
  );
}

/**
 * One line of the rank grid: its label ("base", the resource) and one value per rank, a column each,
 * or " / " between them on a narrow row. There the line wraps between values only, each "/" kept at
 * the end of the line it follows (a no-break space before it, a breaking one after), so no line of a
 * series starts with "/"; the seconds' "s" is held to the last value the same way, and the label to
 * the first (nothing breaks between them).
 */
function RankLine({ form, label, srLabel, values, unit, tone, testId, extra }: { form: Form; label: string; srLabel?: string; values: readonly number[]; unit: "s" | string; tone: "primary" | "base" | "cost"; testId: string; extra?: Record<string, string> }) {
  const seconds = unit === "s";
  return (
    <span className={cn("block items-baseline", form.line, tone === "primary" ? cn("text-md font-semibold leading-6 text-fg", form.primary) : tone === "base" ? "text-xs leading-4 text-fg-muted" : "text-sm leading-5 text-fg-muted")} data-testid={testId} data-values={values.join(",")} {...extra}>
      <span className={cn("text-xs font-normal text-fg-muted", label && "mr-1.5", form.label)}>
        {label}
        {srLabel ? <span className="sr-only">{srLabel}</span> : null}
      </span>
      {values.map((v, i) => (
        <React.Fragment key={i}>
          {i > 0 ? (
            <span aria-hidden className={form.cellOnly} data-rank-separator="">
              {"\u00a0/ "}
            </span>
          ) : null}
          <span className={cn("whitespace-nowrap tabular-nums", form.value)} data-rank={i + 1}>
            <span className="sr-only">{values.length > 1 ? `Rank ${i + 1}: ` : ""}</span>
            {formatSeconds(v)}
            <span className="sr-only">{seconds ? " seconds" : ` ${unit}`}</span>
          </span>
        </React.Fragment>
      ))}
      {/* Seconds after the last value on a narrow row; a cost's resource is its label already. */}
      {seconds ? (
        <span aria-hidden className={cn("font-normal text-fg-muted", form.cellOnly)} data-rank-unit="">
          {"\u00a0s"}
        </span>
      ) : null}
    </span>
  );
}

function AbilityRow({ ability, haste, mode, ranks, last }: { ability: LookupAbility; haste: number; mode: BoardMode; ranks: number; last: boolean }) {
  const form = formOf(mode, ranks);
  const at = cooldownAtHaste(ability.cooldown, haste);
  const words = cooldownWords(ability.cooldown);
  const hasted = haste > 0 && at !== null;
  const changed = changedWords(ability.changed);
  const rangeNote = rangeNoteWords(ability.range);
  const chips = mechanicChips(ability);
  const passive = ability.cooldown.kind === "unknown" && ability.cooldown.reason === "passive-not-in-ddragon";
  const cost = ability.cost;
  // The resource word stands before the cost's values in the label column (a line on a narrow row says it after).
  const costUnit = cost?.kind === "per-rank" ? cost.resource : "";
  const summary = (
    <span className="grid min-w-0 flex-1 grid-cols-[auto_auto_minmax(0,1fr)] items-start py-2">
      <SlotKey slot={ability.slot} className={cn("col-start-1 row-start-1 mr-2", form.tile, mode === "compare" && "@min-[22rem]/board:hidden")} />
      <span className={form.iconWrap}>
        <AbilityIcon ability={ability} size={form.icon} />
      </span>
      {/* The rank grid first (on a wide row it floats at the top right), then the name and the
          mechanics Riot's description names (crowd control first) beside it and under it. */}
      <span className={cn("col-start-3 row-start-1 min-w-0", form.body, form.narrow)}>
        {/* The cooldown (at the haste in use), the base under it at a haste, the cost; or why there is no number. */}
        <span className={cn("block min-w-0 items-baseline gap-y-0.5 space-y-0.5", form.columns, form.stackCols, form.wideCols, form.ranks)} data-testid="lookup-cooldown">
          {at !== null && ability.cooldown.kind === "per-rank" ? (
            hasted ? (
              <>
                <RankLine form={form} label="" srLabel={`Cooldown at ${haste} haste:`} values={at} unit="s" tone="primary" testId="lookup-hasted" />
                <RankLine form={form} label="base" values={ability.cooldown.seconds} unit="s" tone="base" testId="lookup-base" />
              </>
            ) : (
              <RankLine form={form} label="" srLabel="Cooldown:" values={ability.cooldown.seconds} unit="s" tone="primary" testId="lookup-base" />
            )
          ) : passive ? (
            // A passive: a quiet dash where its cooldown would be, Riot's words for a screen reader (the abilities' ⓘ says why).
            <span className={cn("block items-baseline text-md leading-6 text-fg-subtle", form.line)} data-testid="lookup-no-number">
              <span className={form.label}>
                <span className="sr-only">{words?.line}</span>
              </span>
              <span aria-hidden className={cn(form.value, form.rank1)} data-testid="lookup-dash">
                —
              </span>
            </span>
          ) : words ? (
            <span className={cn("block text-sm leading-5 text-fg-muted", form.line)} data-testid="lookup-no-number">
              <span className="col-span-full">
                {words.line}
                {haste > 0 ? <span className="text-fg-subtle"> · no haste applied</span> : null}
              </span>
            </span>
          ) : null}
          {cost?.kind === "per-rank" ? (
            <RankLine form={form} label={costUnit} values={cost.values} unit={costUnit} tone="cost" testId="lookup-cost" extra={{ "data-cost": cost.kind, "data-resource": cost.resource }} />
          ) : cost ? (
            <span className={cn("block text-sm leading-5 text-fg-muted", form.line)} data-testid="lookup-cost" data-cost={cost.kind}>
              <span className="col-span-full">{cost.kind === "none" ? "No cost" : cost.text}</span>
            </span>
          ) : null}
        </span>
        <h3 className={cn("min-w-0 break-words text-md font-semibold leading-snug text-fg", form.h3)}>
          <span className="sr-only">{SLOT_NAMES[ability.slot]}: </span>
          <span data-testid="lookup-ability-name">{ability.name}</span>
        </h3>
        {chips.length ? (
          <span className={form.chips} data-testid="lookup-chips">
            <span className="sr-only">Named in Riot&apos;s description:</span>
            {chips.map((c) => (
              <Chip key={c.kind} chip={c} />
            ))}
          </span>
        ) : null}
        {/* A space before each short item: the chips' spacing where the name, chips and items flow as
            text beside the floated grid (a wide row), gone where the line wraps; a narrow row's flex
            gap spaces them instead and drops the space. */}
        {ability.range?.kind === "reach" || ability.range?.kind === "global" ? " " : null}
        <RangeItem range={ability.range} ranks={ability.ranks} />
        {ability.changed ? " " : null}
        {ability.changed ? (
          <span className="whitespace-nowrap text-xs text-fg-muted" data-testid="lookup-changed-mark">
            Changed{ability.changed.sincePatch ? ` since ${ability.changed.sincePatch}` : ""}
          </span>
        ) : null}
      </span>
    </span>
  );
  return (
    <li className={cn("@container/cell min-w-0", form.cell, !last && "border-b border-border")} data-testid="lookup-ability" data-slot={ability.slot} data-cooldown={ability.cooldown.kind === "per-rank" ? "per-rank" : ability.cooldown.reason} data-range-status={rangeStatus(ability.range)}>
      <Fold variant="row" summary={summary} summaryClassName="hover:[&_h3]:text-accent-strong" bodyClassName={cn("pb-3", form.fold)} testId="lookup-ability-fold" summaryTestId="lookup-ability-summary">
        <div className="max-w-prose space-y-2 text-sm leading-relaxed" data-testid="lookup-ability-details">
          {words?.more ? <p className="text-fg-muted">{words.more}</p> : null}
          <p className="text-fg" data-testid="lookup-description">
            {ability.description ? <MarkedDescription text={ability.description} facts={ability.mechanics} /> : <span className="text-fg-muted">Riot&apos;s description isn&apos;t shown: it relies on numbers Riot&apos;s data leaves out.</span>}
          </p>
          {rangeNote ? (
            <p className="text-fg-muted" data-testid="lookup-range-note">
              {rangeNote}
            </p>
          ) : null}
          {changed ? (
            <p className="text-fg-muted" data-testid="lookup-changed">
              {changed}
            </p>
          ) : null}
        </div>
      </Fold>
    </li>
  );
}

/**
 * The heading over the rows: "Abilities" with the ⓘ for what Riot's data holds, and over the rank
 * columns the cooldown's unit and each rank's number. Same padding, chevron room and grid as the
 * rows, so its rank numbers stand over the rows' values; the line form has no columns to head.
 */
export function RankHeading({ ranks, mode, className }: { ranks: number; mode: BoardMode; className?: string }) {
  const form = formOf(mode, ranks);
  return (
    <div className={cn("@container/cell", form.cell, className)} style={{ "--lookup-ranks": ranks } as React.CSSProperties} data-testid="lookup-rank-heading">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-1.5 pr-6">
        <span className="label-text inline-flex items-center gap-1.5" data-testid="lookup-data-limit">
          Abilities
          <InfoTip label="What Riot's data holds" text={DATA_LIMIT_WORDS} testId="lookup-data-limit-tip" />
        </span>
        {/* The extra room on its left takes "Cooldown (s)", right-aligned over the narrow label column. */}
        <span aria-hidden className={cn("ml-auto hidden items-baseline pl-10", form.head, RANK_COLUMNS, form.wideCols)} data-testid="lookup-rank-head">
          <span className="label-text justify-self-end whitespace-nowrap pr-2">Cooldown (s)</span>
          {Array.from({ length: ranks }, (_, i) => (
            <span key={i} className="label-text text-right tabular-nums" data-testid="lookup-rank-head-cell">
              {i + 1}
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}

/** A champion's five abilities, each a row; in Compare the list takes the board's five ability rows (its own subgrid). */
export function AbilityList({ abilities, haste, ranks, mode, className }: { abilities: readonly LookupAbility[]; haste: number; ranks: number; mode: BoardMode; className?: string }) {
  return (
    <ul aria-label="Abilities" className={className} style={{ "--lookup-ranks": ranks } as React.CSSProperties} data-testid="lookup-abilities">
      {abilities.map((a, i) => (
        <AbilityRow key={a.slot} ability={a} haste={haste} mode={mode} ranks={ranks} last={mode === "single" && i === abilities.length - 1} />
      ))}
    </ul>
  );
}
