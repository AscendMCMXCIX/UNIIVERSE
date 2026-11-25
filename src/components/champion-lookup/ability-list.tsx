"use client";

import * as React from "react";
import type { LookupAbility } from "@/domain/champion-lookup/view";
import type { CostDisplay } from "@/domain/champion-lookup/cost";
import { cooldownAtHaste } from "@/domain/champion-lookup/haste";
import type { MechanicFact } from "@/domain/champion-lookup/mechanics";
import { SLOT_NAMES, changedWords, cooldownWords } from "@/domain/champion-lookup/words";
import { formatPerRank, formatSeconds } from "@/lib/format";
import { Fold } from "@/components/ui/fold";
import { RemoteImage } from "@/components/ui/remote-image";
import { cn } from "@/lib/cn";

/*
  Champion Intel's five abilities (docs/CHAMPION_INTEL.md, "Abilities"): each one row, a fold of its
  own (the shared Fold, a native <details>, so it opens by keyboard, by find-in-page and before the
  page's code runs). Folded, the row is the quick reference: the icon, the key and the name, the
  cost where Riot's data fills Riot's own cost line, and the cooldown at every rank, the base and,
  at a haste above 0, the cooldown at that haste by Riot's general rule; or, where Riot's data gives
  no cooldown that passed the guard, why not, in words, with no number made up and no haste applied.
  Opened, Riot's whole description, the words that name each mechanic marked in it and listed, why
  a cooldown has no number in full, and what Riot changed in its last patch where that is known.

  Each row measures itself (@container/ab): from 42rem the name has a column of its own and the
  ranks line up as columns under the list's "Rank 1 2 3 4 5" heading (the icon, the name's 9rem,
  the kind's 6rem label and 3.5rem a rank for the most ranks any ability here has, Udyr's six,
  with their gaps and the fold's chevron, fit 42rem; the ranks never wrap there); narrower, the
  cooldown goes under the name as one line per kind ("7 / 7 / 7 / 7 / 7 s"), wrapping between
  ranks only.
*/

/** One rank's value: a column of its own from 42rem, inline with " / " between ranks below it. */
const CELL = "tabular-nums @min-[42rem]/ab:inline-block @min-[42rem]/ab:w-14 @min-[42rem]/ab:text-right";
const SEP = "@min-[42rem]/ab:hidden";
/** The kind's label ("Base", "At 20"): its own column from 42rem. */
const LABEL = "text-xs text-fg-muted @min-[42rem]/ab:w-24 @min-[42rem]/ab:shrink-0";
/** The row's columns from 42rem: the icon, the name, the ranks (the list sets --lookup-ranks). */
const COLUMNS = "@min-[42rem]/ab:grid-cols-[2.25rem_minmax(8.5rem,1fr)_var(--lookup-ranks)]";

/** Values per rank, each a cell with its rank and unit for screen readers. */
function Ranks({ values, strong, testId }: { values: readonly number[]; strong: boolean; testId: string }) {
  return (
    <span className={cn("min-w-0 @min-[42rem]/ab:whitespace-nowrap", strong ? "font-semibold text-fg" : "text-fg-muted")} data-testid={testId} data-values={values.join(",")}>
      {values.map((v, i) => (
        <React.Fragment key={i}>
          {i > 0 ? (
            <span aria-hidden className={SEP}>
              {" / "}
            </span>
          ) : null}
          <span className={CELL}>
            <span className="sr-only">{values.length > 1 ? `Rank ${i + 1}: ` : ""}</span>
            {formatSeconds(v)}
            <span className="sr-only"> seconds</span>
          </span>
        </React.Fragment>
      ))}
      <span aria-hidden className={cn(SEP, "text-fg-muted")}>
        {" s"}
      </span>
    </span>
  );
}

/** The icon, or the key as a plain tile where Riot gives none or it fails to load. */
function AbilityIcon({ ability }: { ability: LookupAbility }) {
  const standIn = (
    <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-border bg-surface-2 text-sm font-semibold text-fg-subtle" data-testid="lookup-icon-standin">
      {ability.slot}
    </span>
  );
  if (!ability.icon) return standIn;
  return <RemoteImage src={ability.icon} fallback={standIn} alt="" width={36} height={36} decoding="async" className="h-9 w-9 shrink-0 rounded-md border border-border bg-surface-2 object-cover" />;
}

/** The cost as the row says it: Riot's cost per rank and resource, "No cost", or Riot's own words. */
export function costWords(cost: CostDisplay | null): string | null {
  if (!cost) return null;
  if (cost.kind === "none") return "No cost";
  if (cost.kind === "words") return cost.text;
  return `${formatPerRank(cost.values, "", null)} ${cost.resource}`;
}

/** Riot's description with the words that name each mechanic marked (an underline, never colour alone: the list under it names them too). */
function MarkedDescription({ text, facts }: { text: string; facts: readonly MechanicFact[] }) {
  const spans = [...facts].sort((a, b) => a.at[0] - b.at[0]).filter((f, i, all) => i === 0 || f.at[0] >= all[i - 1]!.at[1]);
  const parts: React.ReactNode[] = [];
  let from = 0;
  for (const f of spans) {
    if (f.at[0] < from || f.at[1] > text.length) continue;
    parts.push(text.slice(from, f.at[0]));
    parts.push(
      <span key={`${f.kind}-${f.at[0]}`} className="text-fg underline decoration-accent/60 decoration-1 underline-offset-[3px]" data-mechanic={f.kind}>
        {text.slice(f.at[0], f.at[1])}
      </span>,
    );
    from = f.at[1];
  }
  parts.push(text.slice(from));
  return <>{parts}</>;
}

function AbilityRow({ ability, haste, foldId }: { ability: LookupAbility; haste: number; foldId: string }) {
  const at = cooldownAtHaste(ability.cooldown, haste);
  const words = cooldownWords(ability.cooldown);
  const hasted = haste > 0 && at !== null;
  const cost = costWords(ability.cost);
  const changed = changedWords(ability.changed);
  const summary = (
    <span className={cn("grid min-w-0 flex-1 grid-cols-1 items-center gap-x-3 gap-y-0.5 py-1 @min-[16rem]/ab:grid-cols-[2.25rem_minmax(0,1fr)] @min-[42rem]/ab:py-1.5", COLUMNS)}>
      <span className="relative w-9">
        <AbilityIcon ability={ability} />
        <span aria-hidden className="absolute -bottom-1 -right-1 grid h-4 min-w-4 place-items-center rounded-sm border border-border-strong bg-bg-elevated px-0.5 text-4xs font-bold leading-none text-fg">
          {ability.slot}
        </span>
      </span>
      {/* The name and the cost share a line where both fit (a narrow row); from 42rem the cost goes under the name. */}
      <span className="min-w-0">
        <h3 className="inline text-sm font-semibold leading-snug text-fg @min-[42rem]/ab:block">
          <span className="label-caps mr-0.5 text-fg-muted">{SLOT_NAMES[ability.slot]}</span> <span data-testid="lookup-ability-name">{ability.name}</span>
          {ability.changed ? (
            <span className="ml-1.5 whitespace-nowrap text-2xs font-normal text-fg-subtle" data-testid="lookup-changed-mark">
              · changed{ability.changed.sincePatch ? ` since ${ability.changed.sincePatch}` : ""}
            </span>
          ) : null}
        </h3>
        {cost ? (
          <span className="ml-2 inline-block text-xs leading-snug text-fg-muted @min-[42rem]/ab:ml-0 @min-[42rem]/ab:block" data-testid="lookup-cost" data-cost={ability.cost?.kind}>
            {cost}
          </span>
        ) : null}
      </span>
      <span className="col-span-full block min-w-0 text-sm @min-[16rem]/ab:col-span-1 @min-[16rem]/ab:col-start-2 @min-[42rem]/ab:col-start-auto" data-testid="lookup-cooldown">
        {at !== null && ability.cooldown.kind === "per-rank" ? (
          <span className="block space-y-0.5">
            {/* Narrow, at a haste above 0, the row keeps the line at that haste; the base moves into the opened row. */}
            <span className={cn("flex-wrap items-baseline gap-x-2 @min-[42rem]/ab:flex @min-[42rem]/ab:flex-nowrap", hasted ? "hidden" : "flex")}>
              <span className={LABEL}>Base</span>
              <span className="min-w-0">
                <Ranks values={ability.cooldown.seconds} strong={!hasted} testId="lookup-base" />
              </span>
            </span>
            {hasted ? (
              <span className="flex flex-wrap items-baseline gap-x-2 @min-[42rem]/ab:flex-nowrap">
                <span className={cn(LABEL, "text-accent")}>At {haste}</span>
                <span className="min-w-0">
                  <Ranks values={at} strong testId="lookup-hasted" />
                </span>
              </span>
            ) : null}
          </span>
        ) : words ? (
          <span className="block text-fg-muted" data-testid="lookup-no-number">
            {words.line}
            {haste > 0 ? <span className="text-fg-subtle"> · no haste applied</span> : null}
          </span>
        ) : null}
      </span>
    </span>
  );
  const named = ability.mechanics;
  return (
    <li className="@container/ab border-b border-border px-3 last:border-b-0 sm:px-4" data-testid="lookup-ability" data-slot={ability.slot} data-cooldown={ability.cooldown.kind === "per-rank" ? "per-rank" : ability.cooldown.reason}>
      <Fold variant="row" summary={summary} id={foldId} summaryClassName="hover:[&_h3]:text-accent-strong" bodyClassName="pb-3 @min-[16rem]/ab:pl-12" testId="lookup-ability-fold" summaryTestId="lookup-ability-summary">
        <div className="space-y-2 text-sm leading-relaxed" data-testid="lookup-ability-details">
          {hasted && ability.cooldown.kind === "per-rank" ? (
            <p className="text-fg-muted @min-[42rem]/ab:hidden" data-testid="lookup-base-detail">
              Base cooldown {formatPerRank(ability.cooldown.seconds, "s")}
            </p>
          ) : null}
          {words?.more ? <p className="text-fg-muted">{words.more}</p> : null}
          <p className="text-fg-muted" data-testid="lookup-description">
            {ability.description ? <MarkedDescription text={ability.description} facts={named} /> : <span className="text-fg-subtle">Riot&apos;s description isn&apos;t shown: it relies on numbers Riot&apos;s data leaves out.</span>}
          </p>
          {named.length ? (
            <p className="text-xs text-fg-muted" data-testid="lookup-named">
              <span className="label-caps mr-1.5">Named in it</span>
              {named.map((f, i) => (
                <React.Fragment key={f.kind}>
                  {i > 0 ? <span aria-hidden> · </span> : null}
                  <span className="text-fg">
                    {f.group === "damage" ? `${f.word} damage` : f.word}
                  </span>
                </React.Fragment>
              ))}
            </p>
          ) : null}
          {changed ? (
            <p className="text-xs text-fg-subtle" data-testid="lookup-changed">
              {changed}
            </p>
          ) : null}
        </div>
      </Fold>
    </li>
  );
}

/** The heading over the ranks' columns, where the rows are wide enough for them (42rem). */
function RankHeading({ ranks }: { ranks: number }) {
  return (
    // The rows' own padding on the container too, so the heading and the rows measure the same width and change form together.
    <div aria-hidden className="@container/ab px-3 sm:px-4">
      <div className="hidden items-baseline gap-2 border-b border-border py-1.5 @min-[42rem]/ab:flex" data-testid="lookup-rank-heading">
        <span className={cn("grid flex-1 grid-cols-1 items-baseline gap-x-3", COLUMNS)}>
          <span />
          <span className="label-caps">Ability</span>
          <span className="flex items-baseline gap-x-2">
            <span className="label-caps w-24 shrink-0 whitespace-nowrap">Cooldown, s</span>
            <span className="label-caps whitespace-nowrap">
              {Array.from({ length: ranks }, (_, i) => (
                <span key={i} className="inline-block w-14 text-right">
                  {i === 0 ? `Rank ${i + 1}` : i + 1}
                </span>
              ))}
            </span>
          </span>
        </span>
        {/* The fold's chevron's place, so the columns end where the rows' ranks do. */}
        <span className="w-4 shrink-0" />
      </div>
    </div>
  );
}

export function AbilityList({ abilities, haste, idPrefix }: { abilities: readonly LookupAbility[]; haste: number; idPrefix: string }) {
  const ranks = Math.max(...abilities.map((a) => (a.cooldown.kind === "per-rank" ? a.cooldown.seconds.length : 0)), 5);
  return (
    // The cooldowns' column, the same in every row and the heading: the kind's 6rem label, its
    // 0.5rem gap and 3.5rem a rank for the most ranks any ability here has (Udyr's six), so the ranks
    // line up under the heading and never wrap or clip; the name takes the rest.
    <div data-testid="lookup-abilities" style={{ "--lookup-ranks": `${6.5 + ranks * 3.5}rem` } as React.CSSProperties}>
      <RankHeading ranks={ranks} />
      <ul aria-label="Abilities">
        {abilities.map((a) => (
          <AbilityRow key={a.slot} ability={a} haste={haste} foldId={`${idPrefix}-${a.slot}`} />
        ))}
      </ul>
    </div>
  );
}
