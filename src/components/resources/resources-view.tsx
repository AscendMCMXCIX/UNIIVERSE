"use client";

import * as React from "react";
import { Star } from "lucide-react";
import { RESOURCE_SECTIONS, resourceHost, searchResources, type Resource, type ResourceSection } from "@/domain/resource-entry";
import { SearchInput } from "@/components/ui/search-input";
import { ScrollRow } from "@/components/ui/scroll-row";
import { segmentClass, segmentedGroupClass } from "@/components/ui/segmented";
import { formatCount } from "@/lib/format";
import { cn } from "@/lib/cn";
import { ResourceIcon } from "./resource-icon";
import { useFavourites } from "./favourites";

/*
  Player Mode → Resources: the Library. A search, then the library's index: All, ★ Favourites and
  each section with its count (the counts follow the search), one choice that filters the list, the
  live count at the row's end. Then the sites grouped by section, an h2 each: on a phone one panel
  with a heading per section and hairlines between the rows; wider, a panel per section, packed
  into columns. Each site is a row with its icon, title (it wraps; it is never cut), host (cut first,
  then ↗) and one or two lines of description; at a larger text size, where a row is too narrow for
  that, the icon and the star take a line of their own over the rest (ResourceRow). A whole row is
  the link (a new tab, without access back to this page and without sending this page's address);
  the star keeps a favourite in this browser (at the row's end, or at its top right, beside the icon,
  where the two take a line of their own). Managing the library is Admin Mode's
  (Platform Settings → Resources), never this page's.
*/

type Filter = ResourceSection | "all" | "favourites";

export function ResourcesView({ entries }: { entries: Resource[] }) {
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<Filter>("all");
  const { ids: favouriteIds, known, toggle } = useFavourites();
  const favourites = new Set(favouriteIds);
  const inFilter = (e: Resource, f: Filter) => f === "all" || (f === "favourites" ? favourites.has(e.id) : e.section === f);
  const matching = searchResources(entries, query);
  const shown = matching.filter((e) => inFilter(e, filter));
  const count = (f: Filter) => matching.filter((e) => inFilter(e, f)).length;
  const sections = RESOURCE_SECTIONS.filter((s) => entries.some((e) => e.section === s.key));
  const groups = sections.map((s) => ({ ...s, entries: shown.filter((e) => e.section === s.key) })).filter((g) => g.entries.length);
  const index: Array<{ key: Filter; label: string }> = [{ key: "all", label: "All" }, { key: "favourites", label: "Favourites" }, ...sections.map((s) => ({ key: s.key as Filter, label: s.label }))];

  return (
    <div className="space-y-4">
      {/* Phones: the search, then the index under it, scrolling sideways (a ScrollRow); tablets the same,
          the count at the index's end; a phone held sideways (from sm in a window 480px tall or less)
          puts both on one row. From lg the index is whole wherever it is shown: beside the search where
          the row has room for all of it and the count's longest form, else on a row of its own, and
          where even that row is too narrow (1024px) its segments wrap onto a second line. */}
      <div className="flex flex-col gap-3 sm:short:flex-row sm:short:items-center lg:flex-row lg:flex-wrap lg:items-center">
        <SearchInput value={query} onChange={setQuery} placeholder="Search resources" label="Search resources by name, site or description" testId="resources-search" className="sm:max-w-md lg:w-64 lg:max-w-none lg:shrink-0 sm:short:w-56 sm:short:max-w-none sm:short:shrink-0" />
        <div className="flex min-w-0 flex-1 items-center gap-3 lg:basis-auto">
          <ScrollRow role="radiogroup" aria-label="Show" className={segmentedGroupClass("min-w-0 lg:flex-wrap lg:overflow-visible")} data-testid="resources-index">
            {index.map(({ key, label }) => {
              const on = filter === key;
              const n = count(key);
              // Favourites are read from this browser once the page has hydrated: the server draws
              // the segment with an empty slot of the count's width, so nothing moves when it fills.
              const shownCount = key === "favourites" && !known ? null : n;
              return (
                <button key={key} type="button" role="radio" aria-checked={on} onClick={() => setFilter(key)} className={segmentClass(on)} title={key === "favourites" ? "The sites you starred, kept on this device" : undefined} data-testid={`resources-index-${key}`}>
                  {key === "favourites" ? <Star className={cn("h-3.5 w-3.5 shrink-0", on || n ? "fill-current text-warn" : "text-fg-subtle")} aria-hidden /> : null}
                  {label}
                  <span className={cn("min-w-6 rounded px-1 text-center text-2xs tabular-nums", shownCount === null ? "bg-transparent" : n ? "bg-surface-3 text-fg-muted" : "text-fg-subtle")} data-testid="resources-index-count">
                    {shownCount === null ? "" : formatCount(shownCount)}
                  </span>
                </button>
              );
            })}
          </ScrollRow>
          {/* The live count: on a phone each segment's count says it, so it is left to screen readers.
              From lg it keeps the room of its longest form ("11 of 11 resources", an invisible copy
              in the same cell), so a section chosen or a search typed never changes whether the index
              fits beside the search, or moves it. */}
          <div className="ml-auto grid shrink-0 max-sm:contents">
            <p className="col-start-1 row-start-1 whitespace-nowrap text-right text-sm tabular-nums text-fg-muted max-sm:sr-only" aria-live="polite" data-testid="resources-count">
              {entries.length === 0 ? "No resources yet." : shown.length === entries.length ? `${formatCount(entries.length)} resource${entries.length === 1 ? "" : "s"}` : `${formatCount(shown.length)} of ${formatCount(entries.length)} resources`}
            </p>
            <span aria-hidden className="invisible col-start-1 row-start-1 hidden whitespace-nowrap text-sm tabular-nums lg:block">
              {`${formatCount(entries.length)} of ${formatCount(entries.length)} resources`}
            </span>
          </div>
        </div>
      </div>

      {/* With nothing in the library, a phone says so on screen too (its live count is read out only). */}
      {entries.length === 0 ? (
        <p className="text-sm text-fg-muted sm:hidden" aria-hidden data-testid="resources-empty">
          No resources yet.
        </p>
      ) : null}
      {entries.length > 0 && shown.length === 0 ? (
        filter === "favourites" && known && !entries.some((e) => favourites.has(e.id)) ? (
          <p className="text-sm text-fg-muted" data-testid="resources-favourites-empty">
            No favourites yet: star a site to keep it here, on this device.
          </p>
        ) : (
          <p className="text-sm text-fg-muted" data-testid="resources-nothing">
            Nothing matches. Try another word or section.
          </p>
        )
      ) : null}

      {/* A phone: one panel, a heading per section, hairlines between the rows. From sm (a phone held
          sideways, tablets, desktops): a panel per section, packed into columns, each kept whole. */}
      {groups.length ? (
        <div className="max-sm:panel-depth max-sm:divide-y max-sm:divide-border max-sm:overflow-hidden max-sm:rounded-panel max-sm:border max-sm:border-border max-sm:bg-surface sm:-mb-3 sm:columns-2 sm:gap-3 xl:columns-3 xl:gap-4" data-testid="resources-list">
          {groups.map((g) => (
            <section key={g.key} className="min-w-0 sm:panel-depth sm:mb-3 sm:break-inside-avoid sm:overflow-hidden sm:rounded-panel sm:border sm:border-border sm:bg-surface" data-testid="resources-section-group" data-section={g.key}>
              <div className="flex items-baseline justify-between gap-3 border-b border-border bg-surface-2/40 px-3 py-1.5 sm:px-4">
                <h2 className="min-w-0 text-sm font-semibold text-fg md:text-base">
                  {g.label}
                </h2>
                <span className="text-xs tabular-nums text-fg-subtle">{formatCount(g.entries.length)}</span>
              </div>
              {/* The rows' container (@container/resources): their layout follows the list's width in rem (ResourceRow). */}
              <ul className="@container/resources divide-y divide-border">
                {g.entries.map((e) => (
                  <ResourceRow key={e.id} resource={e} favourite={favourites.has(e.id)} onToggle={() => toggle(e.id)} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/*
  A row: the tile, then the title with the host beside it and the description under them, then the
  star. With a larger text size a row can be too narrow, in rem, to hold the title beside the rest:
  the tile, the host's 3.5rem and the star take 10.5rem of it, and a 320px phone's row is 17.9rem at
  the usual size, 11.3rem at 150% and 7.9rem at 200%, where the title was squeezed to nothing (a
  letter a line, from 150% on a 320px phone and 175% on a 375px one) and a description ran 47px past
  the panel, cut. Under 16rem of list (never at the usual size: a 320px phone's row is 17.9rem, the
  two columns of a 640px window 18rem, every other window's more) the tile and the star take a line
  of their own, the star at the row's top right, its target 3rem wide (2.75rem from md) and 3.25rem
  tall, centred on the tile, the title starting under it; the title and description have the row's
  width, so they wrap between words ("LoLalytics" is 4.6rem and "announcements." 5.9rem; the row's
  line is 6.4rem at 200% on a 320px phone). The host stays beside the title where both fit, else
  goes under it, still the one cut short.
*/
function ResourceRow({ resource: e, favourite, onToggle }: { resource: Resource; favourite: boolean; onToggle: () => void }) {
  return (
    <li className="group flex min-w-0 items-stretch transition-colors hover:bg-surface-2/60 @max-[16rem]/resources:relative" data-testid="resource" data-id={e.id}>
      <a href={e.url} target="_blank" rel="noopener noreferrer" className="flex min-w-0 flex-1 items-start gap-3 py-2 pl-3 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent sm:pl-4 @max-[16rem]/resources:flex-col @max-[16rem]/resources:gap-2.5 @max-[16rem]/resources:pr-3 sm:@max-[16rem]/resources:pr-4" data-testid="resource-link">
        <ResourceIcon icon={e.icon} url={e.url} className="mt-0.5 h-8 w-8" />
        <span className="min-w-0 flex-1 @max-[16rem]/resources:self-stretch">
          {/* The title wraps rather than being cut (a phone row's name at the row standard, text-md
              semibold, docs/MOBILE.md); the host beside it gives way first, cut short, then ↗. Under
              16rem of list (larger text) the line wraps: the host goes under the title where the two
              do not fit side by side, still the one cut short. */}
          <span className="flex min-w-0 items-baseline gap-2 @max-[16rem]/resources:flex-wrap @max-[16rem]/resources:gap-y-0.5">
            <span className="min-w-0 text-md font-semibold leading-snug text-fg [overflow-wrap:anywhere] group-hover:text-accent md:text-sm md:font-medium" data-testid="resource-title">
              {e.title}
            </span>
            <span className="flex min-w-14 flex-1 basis-0 items-baseline gap-1 text-xs text-fg-subtle" data-testid="resource-host">
              <span className="min-w-0 truncate">{resourceHost(e.url)}</span>
              <span className="shrink-0" aria-hidden>
                ↗
              </span>
            </span>
          </span>
          {/* Whole on a touch screen; with a mouse two lines at most, the rest shown on hover (and read out). */}
          {e.description ? (
            <span className="mt-0.5 block text-xs leading-snug text-fg-muted pointer-fine:line-clamp-2 @max-[16rem]/resources:[overflow-wrap:anywhere]" title={e.description}>
              {e.description}
            </span>
          ) : null}
          <span className="sr-only">(opens in a new tab)</span>
        </span>
      </a>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={favourite}
        aria-label={favourite ? `Remove ${e.title} from favourites` : `Add ${e.title} to favourites`}
        title={favourite ? "Remove from favourites" : "Add to favourites (kept on this device)"}
        className="grid w-11 shrink-0 place-items-start justify-center pt-2.5 text-fg-subtle hover:text-fg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent max-md:w-12 @max-[16rem]/resources:absolute @max-[16rem]/resources:right-0 @max-[16rem]/resources:top-0 @max-[16rem]/resources:h-13 @max-[16rem]/resources:place-items-center @max-[16rem]/resources:pt-0"
        data-testid="resource-favourite"
      >
        <Star className={cn("h-4 w-4", favourite && "fill-current text-warn")} aria-hidden />
      </button>
    </li>
  );
}
