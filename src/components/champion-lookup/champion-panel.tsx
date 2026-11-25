"use client";

import * as React from "react";
import { ChevronDown, LoaderCircle, X } from "lucide-react";
import type { ChampionChoice } from "@/domain/champion-lookup/types";
import type { LookupChampion } from "@/domain/champion-lookup/view";
import { championArtUrl } from "@/domain/player-card";
import { ChampionPortrait } from "@/components/champion-portrait";
import { RemoteImage } from "@/components/ui/remote-image";
import { cn } from "@/lib/cn";
import { AbilityList } from "./ability-list";
import { BaseStats } from "./base-stats";
import { HasteField } from "./haste-field";
import { KeyMechanics } from "./key-mechanics";

/*
  One champion's panel in Champion Intel (docs/CHAMPION_INTEL.md, "The page"): its header (the
  champion's splash art faint along its right side, as All Champions' pool rows show it, under the
  portrait, the name, which opens the window of every champion to change it, Riot's title, the haste
  field and, for a second champion, the way to remove it), its key mechanics and folded base
  statistics, then its five abilities, each a fold. The panel measures itself (@container/panel):
  where it is 68rem wide (one champion on a desktop) the key mechanics and the statistics take a
  20rem column beside the abilities, so the abilities keep one screen; narrower (two champions side
  by side, a tablet, a phone) they sit above the abilities. Two panels are the same component, each
  with its own haste and folds.
*/

export function ChampionPanel({
  lookup,
  shown,
  pending,
  haste,
  onHaste,
  onChange,
  onRemove,
  idPrefix,
  className,
  second = false,
}: {
  lookup: LookupChampion | null;
  /** The champion the header shows: the one loading while a change is on its way, else the panel's own. */
  shown: ChampionChoice;
  pending: boolean;
  haste: number;
  onHaste: (haste: number) => void;
  onChange: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onRemove?: () => void;
  idPrefix: string;
  className?: string;
  second?: boolean;
}) {
  const headingId = `${idPrefix}-name`;
  return (
    <section
      aria-labelledby={headingId}
      aria-busy={pending || undefined}
      className={cn("@container/panel panel-depth min-w-0 overflow-hidden rounded-panel border border-border bg-surface transition-opacity", pending && "pointer-events-none opacity-60", className)}
      inert={pending || undefined}
      data-testid="lookup-panel"
      data-champion={shown.id}
      data-panel={second ? "2" : "1"}
    >
      <header className="relative isolate border-b border-border px-3 py-2.5 sm:px-4">
        {/* The champion's own splash art, faint along the header's right side and fading into the panel (a static, lazy image; decoration only). */}
        <span aria-hidden className="pointer-events-none absolute inset-y-0 right-0 -z-10 w-2/3 overflow-hidden [mask-image:linear-gradient(to_left,black_30%,transparent)]" data-testid="lookup-art">
          <RemoteImage key={shown.id} src={championArtUrl({ championId: shown.id, skinNum: 0 }, "splash")} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover object-[60%_22%] opacity-20" />
        </span>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex min-w-0 items-center gap-3">
            <span aria-hidden className="shrink-0">
              <ChampionPortrait champion={{ id: shown.id, name: shown.name, portraitUrl: shown.portrait }} size="md" />
            </span>
            <div className="min-w-0">
              <h2 className="text-xl font-semibold leading-tight text-fg">
                <button
                  type="button"
                  onClick={onChange}
                  aria-haspopup="dialog"
                  aria-label={`${shown.name}: change champion`}
                  className="group/name -mx-1 inline-flex min-h-11 max-w-full items-center gap-1 rounded-md px-1 text-left transition-colors hover:text-accent-strong focus-visible:outline-2 focus-visible:outline-accent md:pointer-fine:min-h-0"
                  data-testid="lookup-change"
                >
                  <span id={headingId} className="min-w-0 [overflow-wrap:anywhere]" data-testid="lookup-name">
                    {shown.name}
                  </span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-fg-subtle transition-colors group-hover/name:text-accent-strong" aria-hidden />
                </button>
              </h2>
              <p className="text-sm text-fg-muted first-letter:uppercase">{shown.title}</p>
            </div>
            {pending ? <LoaderCircle className="h-5 w-5 shrink-0 animate-spin text-fg-subtle" aria-hidden /> : null}
          </div>
          <div className="ml-auto flex items-start gap-1">
            {lookup?.abilities ? <HasteField haste={haste} onChange={onHaste} champion={shown.name} /> : null}
            {onRemove ? (
              <button type="button" onClick={onRemove} className="-mr-1.5 grid h-11 w-11 shrink-0 place-items-center rounded-md text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent md:pointer-fine:h-8 md:pointer-fine:w-8" aria-label={`Remove ${shown.name}`} data-testid="lookup-remove">
                <X className="h-4 w-4" aria-hidden />
              </button>
            ) : null}
          </div>
        </div>
      </header>
      {lookup?.abilities ? (
        <div className="grid grid-cols-1 @min-[68rem]/panel:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="space-y-1 border-b border-border px-3 py-1.5 sm:px-4 @min-[68rem]/panel:order-last @min-[68rem]/panel:border-b-0 @min-[68rem]/panel:border-l @min-[68rem]/panel:py-3">
            <KeyMechanics lookup={lookup} idPrefix={idPrefix} />
            {lookup.facts ? (
              <div className="hidden @min-[68rem]/panel:block">
                <BaseStats facts={lookup.facts} name={lookup.champion.name} idPrefix={`${idPrefix}-aside`} />
              </div>
            ) : null}
          </div>
          <AbilityList key={lookup.champion.id} abilities={lookup.abilities} haste={haste} idPrefix={idPrefix} />
          {/* Narrower, the statistics come after the abilities, so the five rows keep the first screen. */}
          {lookup.facts ? (
            <div className="border-t border-border px-3 py-1 sm:px-4 @min-[68rem]/panel:hidden">
              <BaseStats facts={lookup.facts} name={lookup.champion.name} idPrefix={idPrefix} />
            </div>
          ) : null}
        </div>
      ) : lookup ? (
        <p className="px-3 py-4 text-sm text-fg-muted sm:px-4" data-testid="lookup-no-abilities">
          {lookup.unreadable ? `Riot's ability data for ${lookup.champion.name} could not be read.` : `${lookup.champion.name}'s abilities aren't stored yet: they arrive with the next game-data update.`}
        </p>
      ) : null}
    </section>
  );
}
