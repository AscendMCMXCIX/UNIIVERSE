import * as React from "react";
import type { LookupAbility } from "@/domain/champion-lookup/view";
import { cooldownAtHaste } from "@/domain/champion-lookup/haste";
import { SLOT_NAMES, cooldownWords } from "@/domain/champion-lookup/words";
import { formatSeconds } from "@/lib/format";
import { RemoteImage } from "@/components/ui/remote-image";
import { cn } from "@/lib/cn";

/*
  Champion Lookup's five abilities (docs/CHAMPION_LOOKUP.md, "The page"): each a row with its icon,
  key and name, then its cooldown per rank, the base and, at a haste above 0, the cooldown at that
  haste by Riot's general rule; or, where Riot's data gives no cooldown that passed the guard, why
  not, in words, with no number made up and no haste applied. Each row measures itself
  (@container/ab): from 36rem the name has a column of its own and the ranks line up as columns
  under the list's "Rank 1 2 3 4 5" heading; narrower, the cooldown goes under the name as one line
  per kind ("7 / 7 / 7 / 7 / 7 s"), wrapping between ranks only. Riot's short description, when
  asked for, takes the row's full width under it.
*/

/** One rank's value: a column of its own from 36rem, inline with " / " between ranks below it. */
const CELL = "tabular-nums @min-[36rem]/ab:inline-block @min-[36rem]/ab:w-16 @min-[36rem]/ab:text-right @min-[36rem]/ab:text-md";
const SEP = "@min-[36rem]/ab:hidden";
/** The kind's label ("Base", "At 20 haste"): its own column from 36rem. */
const LABEL = "text-xs text-fg-muted @min-[36rem]/ab:w-24 @min-[36rem]/ab:shrink-0";

/** Values per rank, each a cell with its rank and unit for screen readers. */
function Ranks({ values, strong, testId }: { values: readonly number[]; strong: boolean; testId: string }) {
  return (
    <span className={cn("min-w-0", strong ? "font-semibold text-fg" : "text-fg-muted")} data-testid={testId} data-values={values.join(",")}>
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
        {" s"}
      </span>
    </span>
  );
}

/** The icon, or the key as a plain tile where Riot gives none or it fails to load. */
function AbilityIcon({ ability }: { ability: LookupAbility }) {
  const standIn = (
    <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-border bg-surface-2 text-sm font-semibold text-fg-subtle" data-testid="lookup-icon-standin">
      {ability.slot}
    </span>
  );
  if (!ability.icon) return standIn;
  return <RemoteImage src={ability.icon} fallback={standIn} alt="" width={40} height={40} decoding="async" className="h-10 w-10 shrink-0 rounded-md border border-border bg-surface-2 object-cover" />;
}

function AbilityRow({ ability, haste, descriptions }: { ability: LookupAbility; haste: number; descriptions: boolean }) {
  const at = cooldownAtHaste(ability.cooldown, haste);
  const words = cooldownWords(ability.cooldown);
  const hasted = haste > 0 && at !== null;
  return (
    <li className="@container/ab border-b border-border px-3 py-2 last:border-b-0 sm:px-4" data-testid="lookup-ability" data-slot={ability.slot} data-cooldown={ability.cooldown.kind === "per-rank" ? "per-rank" : ability.cooldown.reason}>
      <div className="grid grid-cols-1 items-center gap-x-3 gap-y-1.5 @min-[16rem]/ab:grid-cols-[2.5rem_minmax(0,1fr)] @min-[36rem]/ab:grid-cols-[2.5rem_minmax(9rem,15rem)_minmax(0,1fr)]">
        <span className="relative w-10">
          <AbilityIcon ability={ability} />
          <span aria-hidden className="absolute -bottom-1 -right-1 grid h-4 min-w-4 place-items-center rounded-sm border border-border-strong bg-bg-elevated px-0.5 text-4xs font-bold leading-none text-fg">
            {ability.slot}
          </span>
        </span>
        <h3 className="min-w-0 text-sm font-semibold leading-snug text-fg @min-[36rem]/ab:text-md">
          <span className="label-caps mr-0.5 text-fg-muted">{SLOT_NAMES[ability.slot]}</span>{" "}
          <span data-testid="lookup-ability-name">{ability.name}</span>
        </h3>
        <div className="col-span-full min-w-0 text-sm @min-[36rem]/ab:col-span-1" data-testid="lookup-cooldown">
          {at !== null && ability.cooldown.kind === "per-rank" ? (
            <dl className="space-y-0.5">
              <div className="flex flex-wrap items-baseline gap-x-2 @min-[36rem]/ab:flex-nowrap">
                <dt className={LABEL}>Base</dt>
                <dd className="min-w-0">
                  <Ranks values={ability.cooldown.seconds} strong={!hasted} testId="lookup-base" />
                </dd>
              </div>
              {hasted ? (
                <div className="flex flex-wrap items-baseline gap-x-2 @min-[36rem]/ab:flex-nowrap">
                  <dt className={cn(LABEL, "text-accent")}>At {haste} haste</dt>
                  <dd className="min-w-0">
                    <Ranks values={at} strong testId="lookup-hasted" />
                  </dd>
                </div>
              ) : null}
            </dl>
          ) : words ? (
            <div>
              <p className="text-fg-muted" data-testid="lookup-no-number">
                {words.line}
                {haste > 0 ? <span className="text-fg-subtle"> · no haste applied</span> : null}
              </p>
              {words.more ? <p className="text-xs text-fg-subtle">{words.more}</p> : null}
            </div>
          ) : null}
        </div>
      </div>
      {descriptions ? (
        <p className="mt-1.5 text-sm leading-relaxed text-fg-muted @min-[36rem]/ab:pl-[3.25rem]" data-testid="lookup-description">
          {ability.description || <span className="text-fg-subtle">Riot&apos;s description isn&apos;t shown: it relies on numbers Riot&apos;s data leaves out.</span>}
        </p>
      ) : null}
    </li>
  );
}

/** The heading over the ranks' columns, where the rows are wide enough for them (36rem). */
function RankHeading({ ranks }: { ranks: number }) {
  return (
    <div aria-hidden className="@container/ab">
      <div className="hidden grid-cols-[2.5rem_minmax(9rem,15rem)_minmax(0,1fr)] items-baseline gap-x-3 border-b border-border px-3 py-1.5 sm:px-4 @min-[36rem]/ab:grid">
        <span />
        <span className="label-caps">Ability</span>
        <span className="flex items-baseline gap-x-2">
          <span className="label-caps w-24 shrink-0">Cooldown, s</span>
          <span className="label-caps">
            {Array.from({ length: ranks }, (_, i) => (
              <span key={i} className="inline-block w-16 text-right">
                {i === 0 ? `Rank ${i + 1}` : i + 1}
              </span>
            ))}
          </span>
        </span>
      </div>
    </div>
  );
}

export function AbilityList({ abilities, haste, descriptions }: { abilities: readonly LookupAbility[]; haste: number; descriptions: boolean }) {
  const ranks = Math.max(...abilities.map((a) => (a.cooldown.kind === "per-rank" ? a.cooldown.seconds.length : 0)), 5);
  return (
    <div data-testid="lookup-abilities">
      <RankHeading ranks={ranks} />
      <ul aria-label="Abilities">
        {abilities.map((a) => (
          <AbilityRow key={a.slot} ability={a} haste={haste} descriptions={descriptions} />
        ))}
      </ul>
    </div>
  );
}
