"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { RoleSegmented } from "@/components/ui/segmented";
import { FILTER_CHIP, FilterBar, FilterField, InFilterSheet, RefineButton, type FilterChip } from "@/components/ui/filter-bar";
import { InfoTip } from "@/components/ui/info-tip";
import { FiltersControl, PageToolbar } from "@/components/ui/page-toolbar";
import {
  SEASON_MODES,
  statsQuery,
  type StatsFilter,
} from "@/domain/season-stats";
import { seasonLabel } from "@/domain/season";
import { ROLES, ROLE_LABELS } from "@/domain/roles";
import { Select } from "@/components/ui/select";
import { ChampionFilter } from "@/components/champions/champion-filter";
import { accountShortNames } from "@/domain/account-names";
import { formatCount } from "@/lib/format";


/**
 * The inline toolbar's joined group (from md): season, game mode and Refine share their edges, each
 * after the first drawn over the gap (the bar's 0.5rem, and 1px so the two borders are one); the one
 * pointed at or focused is lifted, so its whole edge shows. `field` goes on the control's wrapper,
 * `before` and `after` on the control itself.
 */
const JOIN = {
  field: "md:-ml-2.25",
  before: "md:rounded-r-none md:relative md:hover:z-10 md:focus-visible:z-10",
  after: "md:rounded-l-none md:relative md:hover:z-10 md:focus-visible:z-10",
  /** Before a Refine that only shows from lg (refineUnavailable). */
  beforeFromLg: "lg:rounded-r-none md:relative md:hover:z-10 md:focus-visible:z-10",
} as const;

/**
 * The profile's statistics filters. Up front: season (when there is more than one) and game mode.
 * Behind "Refine": the role played, which champions (all, the configured pool, or one) and which
 * linked account (only with two or more). Active refinements show as chips that remove themselves
 * with one click, so the scope is always visible without the full panel. Everything is included
 * by default; each choice is a plain GET parameter, applied at once.
 *
 * From tablets up, Refine opens a panel anchored under its button that floats over the page: it
 * never takes part in the layout around it (the heading beside the filters keeps its width), and
 * it closes on a click outside, Escape or Refine again. On phones the same fields are part of the
 * opened filter bar, which is already a full-width panel.
 *
 * `sheetFields` and `sheetChips`: a list's own choices that a phone keeps in the Filters sheet and
 * wider screens in the list's own toolbar (Encounters' Minimum games and Sort by, owner decision D8
 * of 8 Nov 2026): the fields join the sheet only, and their chips (when a choice differs from its
 * default) sit beside the phone's Filters button with the other chips and count with them; the
 * sheet's Reset (the page's `resetQuery`) puts them back too. From tablets up they are not filters
 * of this bar: they do not count, its Reset appears only for what the bar narrows, and it leaves
 * them as they are (it keeps `keep`, which carries them).
 * `compactToggle`: the bar shares a row with a section's views (FilterBar's `compactToggle`).
 */
export function OverviewFilters({
  basePath,
  filter,
  seasons,
  currentSeason,
  champions,
  accounts,
  keep = {},
  testId = "overview-filters",
  showChampions = true,
  showRole = true,
  resetQuery,
  modeCounts,
  refineScope,
  extraFields,
  extraRefinements = [],
  refineLabel = "Refine the statistics",
  sheetFields,
  sheetChips = [],
  compactToggle = false,
  refineUnavailable,
  toggleOnPhones,
}: {
  /** Phones: the Filters button drawn in the page's own row (All Champions' search and sort row): see FilterBar. */
  toggleOnPhones?: { host: HTMLElement | null };
  /** A page whose list Refine cannot narrow (Match History's Encounters, UD.H4): with no field to offer, Refine stays in view from lg (where Games shows it beside the same filters), off, with this reason beside it; a tablet's toolbar keeps its place beside the views. */
  refineUnavailable?: string;
  /** The folded bar shares a row with a section's views (Match History): see FilterBar. */
  compactToggle?: boolean;
  /** A list's own fields that only a phone's Filters sheet holds (see above). */
  sheetFields?: React.ReactNode;
  /** Those choices where they differ from their default: chips beside a phone's Filters button. */
  sheetChips?: readonly FilterChip[];
  /** The Refine panel's name for assistive technology. */
  refineLabel?: string;
  /** What Refine's choices narrow on this page, said at the top of its panel (the sections it leaves alone keep their own scope). */
  refineScope?: string;
  /** A page's own fields at the end of Refine (Match History's result, patch, days, team members, highlights). */
  extraFields?: React.ReactNode;
  /** The page's own choices in effect, shown and removed like the shared ones. */
  extraRefinements?: ReadonlyArray<{ key: string; text: string; clear: () => void }>;
  /** Games per game mode in the chosen season, shown beside each mode ("Ranked Flex (14)"). */
  modeCounts?: Partial<Record<StatsFilter["mode"], number>>;
  /** Offer the champion filter (All Champions has its own search instead). */
  showChampions?: boolean;
  /** Offer the role filter (Match History's Encounters count every role's games). */
  showRole?: boolean;
  /** Where Reset leads, after the page's address (default: the page with no filters). */
  resetQuery?: string;
  /** Parameters carried over every change (e.g. the match list's page size); the page resets. */
  keep?: Record<string, string>;
  testId?: string;
  basePath: string;
  filter: StatsFilter;
  seasons: number[];
  currentSeason: number;
  champions: Array<{ id: string; name: string; games: number; portraitUrl?: string }>;
  accounts: Array<{ id: string; riotId: string; label: string }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const accountNames = accountShortNames(accounts);
  const go = (next: Partial<StatsFilter>) => {
    const merged = { ...filter, ...next };
    startTransition(() =>
      router.replace(`${basePath}?${statsQuery(merged, keep)}`, { scroll: false }),
    );
  };
  const refinements = [
    filter.role ? { key: "role", text: ROLE_LABELS[filter.role], clear: () => go({ role: null }) } : null,
    filter.scope === "pool" ? { key: "scope", text: "Configured pool", clear: () => go({ scope: "all", championId: null }) } : null,
    filter.scope === "champion" && filter.championId ? { key: "champion", text: champions.find((c) => c.id === filter.championId)?.name ?? filter.championId, clear: () => go({ scope: "all", championId: null }) } : null,
    filter.accountId ? { key: "account", text: accounts.find((a) => a.id === filter.accountId)?.riotId ?? "One account", clear: () => go({ accountId: null }) } : null,
    ...extraRefinements,
  ].filter((r): r is { key: string; text: string; clear: () => void } => !!r);
  const [open, setOpen] = React.useState(false);
  const refineRef = React.useRef<HTMLDivElement>(null);
  const refineButton = React.useRef<HTMLButtonElement>(null);
  // Which edge of the button the panel lines up with, so it stays inside the window.
  const [side, setSide] = React.useState<"right" | "left">("right");
  React.useLayoutEffect(() => {
    if (!open || !refineButton.current) return;
    const r = refineButton.current.getBoundingClientRect();
    const width = Math.min(34 * 16, window.innerWidth - 32);
    setSide(r.right - width < 16 ? "left" : "right");
  }, [open]);
  React.useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (refineRef.current && !refineRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      refineButton.current?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const hasRefine = showRole || showChampions || accounts.length > 1 || !!extraFields;
  const narrowed = refinements.length + (filter.mode !== "all" ? 1 : 0) + (filter.season !== currentSeason ? 1 : 0) + sheetChips.length;
  const field = "md:w-auto";
  // What the bar chooses; below md a list's own choices too (they join the sheet there).
  const barSummary = [seasonLabel(filter.season), SEASON_MODES.find((m) => m.key === filter.mode)?.label ?? "All supported games", ...refinements.map((r) => r.text)].join(" · ");
  const summary = [barSummary, ...sheetChips.map((c) => c.text)].join(" · ");
  return (
    <form
      method="get"
      action={basePath}
      className="min-w-0"
      onSubmit={(e) => e.preventDefault()}
      data-testid={testId}
      aria-busy={pending}
    >
      {/*
        The shared filter bar. Wide screens: season and game mode up front, the role, champions and
        account behind Refine, with the active refinements as chips that remove themselves. Phones:
        one "Filters" summary that opens every filter at once (no second disclosure inside it).
      */}
      <FilterBar
        summary={summary}
        activeCount={narrowed}
        chips={[
          ...(filter.season !== currentSeason ? [{ key: "season", text: seasonLabel(filter.season), clear: () => go({ season: currentSeason }) }] : []),
          ...(filter.mode !== "all" ? [{ key: "mode", text: SEASON_MODES.find((m) => m.key === filter.mode)?.label ?? filter.mode, clear: () => go({ mode: "all" }) }] : []),
          ...refinements,
          ...sheetChips,
        ]}
        onReset={() => startTransition(() => router.replace(resetQuery ? `${basePath}?${resetQuery}` : basePath, { scroll: false }))}
        // From tablets up a list's own choices are not this bar's (see above).
        inlineReset={sheetFields ? { count: narrowed - sheetChips.length, summary: barSummary, onReset: () => startTransition(() => router.replace(`${basePath}?${new URLSearchParams(keep).toString()}`, { scroll: false })) } : undefined}
        compactToggle={compactToggle}
        toggleOnPhones={toggleOnPhones}
        align="end"
        pending={pending}
      >
        {/* The refinements in effect, in the toolbar's own row from md (one row: what is narrowed, the
            controls, Reset), as the phone's chips beside its Filters button: the same pill, the same
            words. Until 23 Nov 2026 they took a row of their own under the bar, in another look. */}
        {refinements.length ? (
          <InFilterSheet>
            {(inSheet) =>
              inSheet ? null : (
                <ul className="flex min-w-0 flex-wrap items-center gap-1.5" aria-label="Active filters" data-testid={`${testId}-active`}>
                  {refinements.map((r) => (
                    <li key={r.key}>
                      <button type="button" onClick={r.clear} className={FILTER_CHIP} aria-label={`${r.text}: remove this filter`}>
                        {r.text} <X className="h-3 w-3 text-fg-subtle" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              )
            }
          </InFilterSheet>
        ) : null}
        {/* Season, game mode and Refine as one joined group from md (JOIN: shared edges, no gaps), so
            the toolbar reads as one control rather than a row of separate boxes; in the sheet each
            field stands on its own, labelled. */}
        {seasons.length > 1 ? (
          <InFilterSheet>
            {(inSheet) => (
              <FilterField label="Season" htmlFor="overview-season">
                <Select
                  id="overview-season"
                  name="season"
                  value={String(filter.season)}
                  disabled={pending}
                  onValueChange={(v) => go({ season: Number(v) })}
                  className={cn(`${field} md:w-56`, !inSheet && JOIN.before)}
                  options={seasons.map((s) => ({ value: String(s), label: `${seasonLabel(s)}${s === currentSeason ? " (current)" : ""}` }))}
                />
              </FilterField>
            )}
          </InFilterSheet>
        ) : null}
        <InFilterSheet>
          {(inSheet) => (
            <FilterField label="Game mode" htmlFor="overview-mode" className={cn(!inSheet && seasons.length > 1 && JOIN.field)}>
              <Select
                id="overview-mode"
                name="mode"
                value={filter.mode}
                disabled={pending}
                onValueChange={(v) => go({ mode: v as StatsFilter["mode"] })}
                className={cn(`${field} md:w-48`, !inSheet && seasons.length > 1 && JOIN.after, !inSheet && (hasRefine ? JOIN.before : refineUnavailable ? JOIN.beforeFromLg : null))}
                options={SEASON_MODES.map((m) => ({ value: m.key, label: `${m.label}${modeCounts && modeCounts[m.key] !== undefined ? ` (${formatCount(modeCounts[m.key]!)})` : ""}` }))}
              />
            </FilterField>
          )}
        </InFilterSheet>
        {/* Refine and its panel. In the Filters sheet (phones, and the sheet the pinned row opens at any
            width): no box or button of its own (display: contents), so the fields sit in the sheet.
            From md in the page: the anchor of the floating panel. Without a field to offer, none. */}
        {!hasRefine && refineUnavailable ? (
          <InFilterSheet>
            {(inSheet) =>
              inSheet ? null : (
                <span className={cn("inline-flex items-center gap-1 max-lg:hidden", JOIN.field)} data-testid="refine-unavailable">
                  <RefineButton open={false} onClick={() => {}} unavailable={{ describedBy: "refine-unavailable-reason" }} className={JOIN.after} testId="refine-filters" />
                  <span id="refine-unavailable-reason" className="sr-only">
                    {refineUnavailable}
                  </span>
                  <InfoTip text={refineUnavailable} label="Why Refine is off here" testId="refine-unavailable-tip" />
                </span>
              )
            }
          </InFilterSheet>
        ) : null}
        {hasRefine ? (
          <InFilterSheet>
            {(inSheet) => (
              <div ref={refineRef} className={inSheet ? "contents" : cn("max-md:contents md:relative", JOIN.field)}>
                {inSheet ? null : <RefineButton buttonRef={refineButton} open={open} count={refinements.length} controls="overview-refine" haspopup="dialog" onClick={() => setOpen((o) => !o)} className={cn("max-md:hidden", JOIN.after)} testId="refine-filters" />}
                <div
                  id="overview-refine"
                  role="group"
                  aria-label={refineLabel}
                  className={cn(
                    "flex min-w-0 flex-col gap-3",
                    !inSheet && "md:absolute md:top-full md:z-40 md:mt-2 md:w-[min(34rem,calc(100vw-2rem))] md:rounded-panel md:border md:border-border md:bg-bg-elevated md:p-3.5 md:shadow-2xl md:shadow-black/40",
                    !inSheet && (side === "right" ? "md:right-0" : "md:left-0"),
                    !inSheet && (open ? "md:rise-in" : "md:hidden"),
                  )}
                  data-testid="refine-panel"
                >
                  {refineScope ? (
                    <p className="text-xs text-fg-subtle" data-testid="refine-scope">
                      {refineScope}
                    </p>
                  ) : null}
                  {showRole ? (
                    <FilterField label="Role played" labelId="overview-role-label" alwaysLabel>
                      <RoleSegmented label="Role played" roles={ROLES} value={filter.role ?? null} onChange={(r) => go({ role: r })} allowAll testId="role-filter" />
                    </FilterField>
                  ) : null}
                  {showChampions || accounts.length > 1 ? (
                    <div className={cn("flex min-w-0 flex-col gap-3", !inSheet && "md:grid md:grid-cols-2 md:gap-3")}>
                      {showChampions ? (
                        <FilterField label="Champions" alwaysLabel>
                          <ChampionFilter
                            value={filter.scope === "champion" && filter.championId ? { scope: "champion", championId: filter.championId } : filter.scope === "pool" ? { scope: "pool" } : { scope: "all" }}
                            onChange={(v) => go(v.scope === "champion" ? { scope: "champion", championId: v.championId } : { scope: v.scope, championId: null })}
                            champions={champions}
                            poolLabel={filter.role ? `Configured ${ROLE_LABELS[filter.role]} pool` : "Configured pools"}
                            testId="overview-champion"
                          />
                        </FilterField>
                      ) : null}
                      {accounts.length > 1 ? (
                        <FilterField label="Linked account" htmlFor="overview-account" alwaysLabel>
                          <Select
                            id="overview-account"
                            name="account"
                            value={filter.accountId ?? ""}
                            disabled={pending}
                            onValueChange={(v) => go({ accountId: v || null })}
                            className="w-full"
                            options={[{ value: "", label: "All accounts" }, ...accounts.map((a) => ({ value: a.id, label: `${accountNames.get(a.id) ?? ""}${a.label === "main" ? " · Primary" : ""}` }))]}
                          />
                        </FilterField>
                      ) : null}
                    </div>
                  ) : null}
                  {extraFields}
                </div>
              </div>
            )}
          </InFilterSheet>
        ) : null}
        {/* Only in a phone's sheet: wider screens keep these in the list's own toolbar. */}
        {sheetFields ? <div className="flex min-w-0 flex-col gap-4 md:hidden">{sheetFields}</div> : null}
      </FilterBar>
      <noscript>
        <button type="submit" className="text-xs underline">
          Apply
        </button>
      </noscript>
      {/* The Overview's Filters at the pinned tabs' end once its header has scrolled away; a page with
          a toolbar of its own (Match History, All Champions) shows that instead (ui/page-toolbar.tsx). */}
      <PageToolbar fallback label="Season performance controls" land="[data-testid=overview-dashboard]">
        <FiltersControl />
      </PageToolbar>
    </form>
  );
}


/**
 * Under an empty list filtered by game mode: where that mode's games are, as links to those
 * seasons ("Ranked Flex: 14 games in Season 2025"), so an empty current season never reads as
 * "no Flex games stored". The other filters stay as they are.
 */
export function ModeElsewhere({ basePath, filter, elsewhere, keep = {} }: { basePath: string; filter: StatsFilter; elsewhere: Array<{ season: number; games: number }>; keep?: Record<string, string> }) {
  if (filter.mode === "all" || elsewhere.length === 0) return null;
  const label = SEASON_MODES.find((m) => m.key === filter.mode)?.label ?? "This mode";
  return (
    <span className="mt-2 block text-sm text-fg-muted" data-testid="mode-elsewhere">
      {label} games stored in other seasons:{" "}
      {elsewhere.map((e, i) => (
        <React.Fragment key={e.season}>
          {i ? ", " : ""}
          <Link href={`${basePath}?${statsQuery({ ...filter, season: e.season }, keep)}`} replace scroll={false} className="font-medium text-accent hover:underline">
            {seasonLabel(e.season)} ({formatCount(e.games)})
          </Link>
        </React.Fragment>
      ))}
      .
    </span>
  );
}
