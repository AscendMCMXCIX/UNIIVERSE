"use client";

import * as React from "react";
import { ExternalLink, Star } from "lucide-react";
import { RESOURCE_SECTIONS, resourceHost, searchResources, sectionLabel, type Resource, type ResourceSection } from "@/domain/resource-entry";
import { FilterBar, FilterField } from "@/components/ui/filter-bar";
import { SearchInput } from "@/components/ui/search-input";
import { Select } from "@/components/ui/input";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { cn } from "@/lib/cn";
import { ResourceIcon } from "./resource-icon";
import { useFavourites } from "./favourites";

/*
  Player Mode → Resources. One filter bar like every other list (search first, then the section),
  your favourites on this device, then one panel per section, side by side on wide screens: each
  site a row with its icon, title, host and one or two lines of description. A whole row is the
  link (a new tab, without access back to this page and without sending this page's address); the
  star beside it keeps a favourite in this browser. Managing the library is Admin Mode's
  (Platform Settings → Resources), never this page's.
*/

type SectionFilter = ResourceSection | "all";

export function ResourcesView({ entries }: { entries: Resource[] }) {
  const [query, setQuery] = React.useState("");
  const [section, setSection] = React.useState<SectionFilter>("all");
  const { ids: favouriteIds, toggle } = useFavourites();
  const present = new Set(entries.map((e) => e.section));
  const shown = searchResources(section === "all" ? entries : entries.filter((e) => e.section === section), query);
  const favourites = favouriteIds.map((id) => entries.find((e) => e.id === id)).filter((e): e is Resource => !!e);
  const narrowed = section !== "all" || query.trim() !== "";
  const groups = RESOURCE_SECTIONS.map((s) => ({ ...s, entries: shown.filter((e) => e.section === s.key) })).filter((g) => g.entries.length);

  return (
    <div className="space-y-5">
      <FilterBar
        testId="resources-filters"
        summary={section === "all" ? "All sections" : sectionLabel(section)}
        activeCount={section !== "all" ? 1 : 0}
        onReset={() => setSection("all")}
        chips={section !== "all" ? [{ key: "section", text: sectionLabel(section), clear: () => setSection("all") }] : []}
        align="end"
        search={<SearchInput value={query} onChange={setQuery} placeholder="Search resources" label="Search resources by name, site or description" testId="resources-search" />}
      >
        <FilterField label="Section" htmlFor="resources-section">
          <Select id="resources-section" value={section} onChange={(e) => setSection(e.target.value as SectionFilter)} data-testid="resources-section">
            <option value="all">All sections</option>
            {RESOURCE_SECTIONS.filter((s) => present.has(s.key)).map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </Select>
        </FilterField>
      </FilterBar>

      {favourites.length && !narrowed ? (
        <section aria-labelledby="resources-favourites" className="space-y-2" data-testid="resources-favourites">
          <h2 id="resources-favourites" className="text-xs font-semibold uppercase tracking-label text-fg-muted">
            Favourites <span className="font-normal normal-case tracking-normal text-fg-subtle">· on this device</span>
          </h2>
          <ul className="flex flex-wrap gap-2">
            {favourites.map((e) => (
              <li key={e.id} className="min-w-0 max-w-full">
                <a href={e.url} target="_blank" rel="noopener noreferrer" className="flex min-h-11 min-w-0 max-w-full items-center gap-2 rounded-md border border-border bg-surface px-2 text-sm font-medium text-fg hover:border-border-strong focus-visible:outline-2 focus-visible:outline-accent md:pointer-fine:min-h-9" data-testid="resources-favourite-link">
                  <ResourceIcon icon={e.icon} url={e.url} className="h-6 w-6 border-0 bg-transparent" />
                  <span className="min-w-0 truncate">{e.title}</span>
                  <ExternalLink className="h-3 w-3 shrink-0 text-fg-subtle" aria-hidden />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="text-sm text-fg-muted" aria-live="polite" data-testid="resources-count">
        {entries.length === 0 ? "No resources yet." : shown.length === entries.length ? `${entries.length} resource${entries.length === 1 ? "" : "s"}` : `${shown.length} of ${entries.length} resources`}
      </p>

      {entries.length > 0 && shown.length === 0 ? <p className="text-sm text-fg-muted">Nothing matches. Try another word or section.</p> : null}

      {/* Panels keep their own height (items-start): a short section never stretches to its neighbour's. */}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        {groups.map((g) => (
          <Panel key={g.key} className="overflow-hidden" data-testid="resources-section-group" data-section={g.key}>
            <PanelHeader title={g.label} actions={<span className="text-xs tabular-nums text-fg-subtle">{g.entries.length}</span>} />
            <ul className="divide-y divide-border">
              {g.entries.map((e) => (
                <ResourceRow key={e.id} resource={e} favourite={favouriteIds.includes(e.id)} onToggle={() => toggle(e.id)} />
              ))}
            </ul>
          </Panel>
        ))}
      </div>
    </div>
  );
}

function ResourceRow({ resource: e, favourite, onToggle }: { resource: Resource; favourite: boolean; onToggle: () => void }) {
  return (
    <li className="group flex min-w-0 items-stretch transition-colors hover:bg-surface-2/60" data-testid="resource" data-id={e.id}>
      <a href={e.url} target="_blank" rel="noopener noreferrer" className="flex min-w-0 flex-1 items-start gap-3 px-3 py-3 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent sm:px-4" data-testid="resource-link">
        <ResourceIcon icon={e.icon} url={e.url} className="h-9 w-9" />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
            <span className="min-w-0 truncate text-sm font-medium leading-snug text-fg group-hover:text-accent">{e.title}</span>
            <span className="min-w-0 truncate text-xs text-fg-subtle">{resourceHost(e.url)}</span>
          </span>
          {e.description ? <span className="mt-0.5 line-clamp-2 block text-xs leading-snug text-fg-muted">{e.description}</span> : null}
          <span className="sr-only">(opens in a new tab)</span>
        </span>
        <ExternalLink className="mt-1 h-3.5 w-3.5 shrink-0 text-fg-subtle" aria-hidden />
      </a>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={favourite}
        aria-label={favourite ? `Remove ${e.title} from favourites` : `Add ${e.title} to favourites`}
        title={favourite ? "Remove from favourites" : "Add to favourites (kept on this device)"}
        className="grid w-11 shrink-0 place-items-start justify-center pt-3.5 text-fg-subtle hover:text-fg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent max-md:w-12"
        data-testid="resource-favourite"
      >
        <Star className={cn("h-4 w-4", favourite && "fill-current text-warn")} aria-hidden />
      </button>
    </li>
  );
}
