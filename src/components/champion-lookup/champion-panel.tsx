"use client";

import * as React from "react";
import { ChevronDown, LoaderCircle, X } from "lucide-react";
import type { ChampionChoice } from "@/domain/champion-lookup/types";
import type { LookupChampion } from "@/domain/champion-lookup/view";
import { championArtUrl } from "@/domain/player-card";
import { ChampionPortrait } from "@/components/champion-portrait";
import { RemoteImage } from "@/components/ui/remote-image";
import { cn } from "@/lib/cn";
import { AbilityList, RankHeading } from "./ability-list";
import { BaseStatsFold, BaseStatsPanel, type StatLine } from "./base-stats";
import { ChampionFacts } from "./champion-facts";
import { HasteField } from "./haste-field";

/*
  One champion in Champion Intel (docs/CHAMPION_INTEL.md, "The page" and "Compare"): its header (the
  portrait, the name, which opens the window of every champion to change it, Riot's title, the
  champion's facts, its own ability haste and, in Compare, ✕ to remove it), its five abilities under
  their heading, the builds slot, and its base statistics. One <section> per champion
  (data-testid="lookup-panel"), so a champion being loaded is out of reach on its own (inert) and
  each keeps its own haste and folds.

  - One champion ("single"): the header across the board; the abilities, and beside them where the
    board is 64rem wide (a desktop) the base statistics open (narrower, after the abilities,
    folded); then the builds slot across the board's whole width, under both, where its rows have
    the room to sit side by side (docs/CHAMPION_INTEL.md, "Builds and runes").
  - Compare ("compare"): the section is one column of the board's grid, a subgrid of its ten rows
    (header, facts, the abilities' heading, the five abilities, builds, statistics), so the same row
    of both champions has the same height and their values line up side by side.

  The builds slot (`builds`) is empty by default and renders nothing: the builds section is handed
  in by the page and sits under the abilities and the statistics (single) or in its own row after
  R (Compare).
*/

export type ColumnMode = "single" | "compare";

/** The champion's own splash art, faint, fading in from the header's right: decoration only (a static, lazy image). */
function Splash({ id, className }: { id: string; className?: string }) {
  return (
    <span aria-hidden className={cn("pointer-events-none absolute -z-10 overflow-hidden [mask-image:linear-gradient(to_left,black_30%,transparent)]", className)} data-testid="lookup-art">
      <RemoteImage key={id} src={championArtUrl({ championId: id, skinNum: 0 }, "splash")} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover object-[60%_22%] opacity-15" />
    </span>
  );
}

/** The portrait, the name (the way to change the champion: a chevron says so) and Riot's title, on one baseline system. */
function Identity({ shown, onChange, headingId, pending, compact }: { shown: ChampionChoice; onChange: (e: React.MouseEvent<HTMLButtonElement>) => void; headingId: string; pending: boolean; compact: boolean }) {
  return (
    // Never narrower than the name needs while the header has room: the name stays on one line, and
    // wraps between words only where the header itself is narrower than it (a phone at 200% text).
    // In a narrow Compare column (a phone) the portrait sits above the name, so the name has the column's whole width.
    // So does one champion's narrow header (a small phone at a large text size), its name a size smaller there.
    <div className={cn("flex min-w-0 max-w-full flex-none items-center gap-3", compact ? "@max-[40rem]/board:flex-col @max-[40rem]/board:items-start @max-[40rem]/board:gap-1.5" : "@max-[16rem]/panel:flex-col @max-[16rem]/panel:items-start @max-[16rem]/panel:gap-1.5")}>
      <span aria-hidden className="shrink-0">
        <ChampionPortrait champion={{ id: shown.id, name: shown.name, portraitUrl: shown.portrait }} size="md" className={cn(compact && "@max-[40rem]/board:h-9 @max-[40rem]/board:w-9")} />
      </span>
      <div className="min-w-0">
        <h2 className={cn("text-xl font-semibold leading-tight text-fg", compact ? "@max-[40rem]/board:text-base" : "@max-[16rem]/panel:text-base")}>
          <button
            type="button"
            onClick={onChange}
            aria-haspopup="dialog"
            aria-label={`${shown.name}: change champion`}
            className="group/name -mx-1 inline-flex min-h-11 items-center gap-1.5 rounded-md px-1 text-left transition-colors hover:text-accent-strong focus-visible:outline-2 focus-visible:outline-accent md:pointer-fine:min-h-0"
            data-testid="lookup-change"
          >
            <span id={headingId} className="min-w-0 break-words" data-testid="lookup-name">
              {shown.name}
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-fg-subtle transition-colors group-hover/name:text-accent-strong" aria-hidden />
          </button>
        </h2>
        {shown.title ? (
          <p className="break-words text-sm text-fg-muted first-letter:uppercase" data-testid="lookup-title">
            {shown.title}
          </p>
        ) : null}
      </div>
      {pending ? <LoaderCircle className="h-5 w-5 shrink-0 animate-spin text-fg-subtle" aria-hidden /> : null}
    </div>
  );
}

function NoAbilities({ lookup, className }: { lookup: LookupChampion; className?: string }) {
  return (
    <p className={cn("px-3 py-4 text-sm text-fg-muted sm:px-4", className)} data-testid="lookup-no-abilities">
      {lookup.unreadable ? `Riot's ability data for ${lookup.champion.name} could not be read.` : `${lookup.champion.name}'s abilities aren't stored yet: they arrive with the next game-data update.`}
    </p>
  );
}

/** A subgrid row's place in Compare, from the board's 17rem up (narrower, the column is a plain stack). */
const ROW = {
  head: "@min-[17rem]/board:row-start-1",
  facts: "@min-[17rem]/board:row-start-2",
  heading: "@min-[17rem]/board:row-start-3",
  abilities: "@min-[17rem]/board:row-start-4 @min-[17rem]/board:row-span-5 @min-[17rem]/board:grid @min-[17rem]/board:grid-rows-subgrid",
  missing: "@min-[17rem]/board:row-start-3 @min-[17rem]/board:row-span-6",
  builds: "@min-[17rem]/board:row-start-9",
  stats: "@min-[17rem]/board:row-start-10",
} as const;

export function ChampionPanel({
  mode,
  which,
  lookup,
  shown,
  pending,
  haste,
  onHaste,
  onChange,
  onRemove,
  ranks,
  statLines,
  builds,
  statsOpen,
  onStatsToggle,
  className,
}: {
  mode: ColumnMode;
  which: 0 | 1;
  lookup: LookupChampion | null;
  /** The champion the header shows: the one loading while a change is on its way, else the panel's own. */
  shown: ChampionChoice;
  pending: boolean;
  haste: number;
  onHaste: (haste: number) => void;
  onChange: (e: React.MouseEvent<HTMLButtonElement>) => void;
  /** Compare: removes this champion (the other stays, first). */
  onRemove?: () => void;
  /** Rank columns of this champion's rows (rankColumns). */
  ranks: number;
  /** The base statistics as this column lists them (aligned with the other column's in Compare). */
  statLines: readonly StatLine[];
  /** The builds section for this champion, handed in by the page; nothing by default. */
  builds?: React.ReactNode;
  /** Compare: the two columns' statistics open and close together. */
  statsOpen?: boolean;
  onStatsToggle?: (open: boolean) => void;
  className?: string;
}) {
  const uid = React.useId();
  const headingId = `${uid}-name`;
  const abilities = lookup?.abilities ?? null;
  const facts = lookup?.facts ?? null;
  const section = (body: React.ReactNode, extra?: string) => (
    <section
      aria-labelledby={headingId}
      aria-busy={pending || undefined}
      className={cn("relative isolate min-w-0 transition-opacity", pending && "pointer-events-none opacity-60", extra, className)}
      inert={pending || undefined}
      data-testid="lookup-panel"
      data-champion={shown.id}
      data-panel={which === 0 ? "1" : "2"}
    >
      {body}
    </section>
  );
  const haveStats = !!abilities && statLines.length > 0;

  if (mode === "single") {
    return section(
      <>
        <header className="relative isolate flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-border px-3 py-3 sm:px-4">
          <Splash id={shown.id} className="inset-y-0 right-0 w-2/3" />
          <Identity shown={shown} onChange={onChange} headingId={headingId} pending={pending} compact={false} />
          {facts ? <ChampionFacts facts={facts} /> : null}
          {abilities ? <HasteField haste={haste} onChange={onHaste} champion={shown.name} className="ml-auto" /> : null}
        </header>
        {abilities ? (
          <div className="grid grid-cols-1 @min-[64rem]/panel:grid-cols-[minmax(0,1fr)_19rem] @min-[76rem]/panel:grid-cols-[minmax(0,1fr)_24rem]">
            <div className="min-w-0">
              <RankHeading ranks={ranks} mode="single" className="border-b border-border" />
              <AbilityList abilities={abilities} haste={haste} ranks={ranks} mode="single" />
            </div>
            {haveStats ? (
              <aside aria-label={`${shown.name}: base stats`} className="min-w-0 space-y-4 border-t border-border px-3 py-3 sm:px-4 @min-[64rem]/panel:border-l @min-[64rem]/panel:border-t-0" data-testid="lookup-aside">
                <BaseStatsPanel lines={statLines} name={shown.name} changedSince={facts?.statsChangedSincePatch ?? null} className="hidden @min-[64rem]/panel:block" />
                <BaseStatsFold lines={statLines} name={shown.name} changedSince={facts?.statsChangedSincePatch ?? null} id={`${uid}-stats`} className="@min-[64rem]/panel:hidden" />
              </aside>
            ) : null}
            {builds ? (
              <div className="min-w-0 border-t border-border px-3 py-3 sm:px-4 @min-[64rem]/panel:col-span-2" data-testid="lookup-builds">
                {builds}
              </div>
            ) : null}
          </div>
        ) : lookup ? (
          <NoAbilities lookup={lookup} />
        ) : null}
      </>,
      "@container/panel",
    );
  }

  return section(
    <>
      <Splash id={shown.id} className="inset-0 hidden @min-[17rem]/board:block @min-[17rem]/board:row-start-1 @min-[17rem]/board:row-span-2" />
      <header className={cn("relative flex min-w-0 items-start gap-2 px-3 pt-3", ROW.head)}>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-2">
          <Identity shown={shown} onChange={onChange} headingId={headingId} pending={pending} compact />
          {abilities ? <HasteField haste={haste} onChange={onHaste} champion={shown.name} className="ml-auto" cut={false} /> : null}
        </div>
        {onRemove ? (
          <button type="button" onClick={onRemove} className="-mr-1.5 grid h-11 w-11 shrink-0 place-items-center rounded-md @max-[40rem]/board:absolute @max-[40rem]/board:right-1.5 @max-[40rem]/board:top-1.5 @max-[40rem]/board:mr-0 text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent md:pointer-fine:h-8 md:pointer-fine:w-8" aria-label={`Remove ${shown.name}`} data-testid="lookup-remove">
            <X className="h-4 w-4" aria-hidden />
          </button>
        ) : null}
      </header>
      <div className={cn("min-w-0 border-b border-border px-3 pb-3 pt-2", ROW.facts)}>{facts ? <ChampionFacts facts={facts} /> : null}</div>
      {abilities ? (
        <>
          <RankHeading ranks={ranks} mode="compare" className={cn("border-b border-border", ROW.heading)} />
          <AbilityList abilities={abilities} haste={haste} ranks={ranks} mode="compare" className={cn("min-w-0", ROW.abilities)} />
          {builds ? (
            <div className={cn("min-w-0 border-b border-border px-3 py-3", ROW.builds)} data-testid="lookup-builds">
              {builds}
            </div>
          ) : null}
          {haveStats ? <BaseStatsFold lines={statLines} name={shown.name} changedSince={facts?.statsChangedSincePatch ?? null} id={`${uid}-stats`} open={statsOpen} onToggle={onStatsToggle} className={cn("min-w-0 px-3 py-1.5", ROW.stats)} /> : null}
        </>
      ) : lookup ? (
        <NoAbilities lookup={lookup} className={ROW.missing} />
      ) : null}
    </>,
    cn("@min-[17rem]/board:row-span-full @min-[17rem]/board:grid @min-[17rem]/board:grid-rows-subgrid", which === 0 ? "@min-[17rem]/board:col-start-2" : "border-t border-border @min-[17rem]/board:col-start-3 @min-[17rem]/board:border-l @min-[17rem]/board:border-t-0"),
  );
}
