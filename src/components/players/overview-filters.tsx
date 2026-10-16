"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { RoleSegmented } from "@/components/ui/segmented";
import { FilterBar, FilterField } from "@/components/ui/filter-bar";
import {
  SEASON_MODES,
  statsQuery,
  type StatsFilter,
} from "@/domain/season-stats";
import { seasonLabel } from "@/domain/season";
import { ROLES, ROLE_LABELS } from "@/domain/roles";
import { Select } from "@/components/ui/input";
import { ChampionFilter } from "@/components/champions/champion-filter";


/**
 * The profile's statistics filters. Up front: season (when there is more than one) and game mode.
 * Behind "Refine": the role played, which champions (all, the configured pool, or one) and which
 * linked account (only with two or more). Active refinements show as chips that remove themselves
 * with one click, so the scope is always visible without the full panel. Everything is included
 * by default; each choice is a plain GET parameter, applied at once.
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
}: {
  /** Offer the champion filter (All Champions has its own search instead). */
  showChampions?: boolean;
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
  ].filter((r): r is { key: string; text: string; clear: () => void } => !!r);
  const [open, setOpen] = React.useState(false);
  const narrowed = refinements.length + (filter.mode !== "all" ? 1 : 0) + (filter.season !== currentSeason ? 1 : 0);
  const field = "md:w-auto";
  const summary = [seasonLabel(filter.season), SEASON_MODES.find((m) => m.key === filter.mode)?.label ?? "All supported games", ...refinements.map((r) => r.text)].join(" · ");
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
        onReset={() => startTransition(() => router.replace(basePath, { scroll: false }))}
        align="end"
        pending={pending}
        after={
          refinements.length && !open ? (
            <ul className="flex flex-wrap gap-1.5 max-md:hidden xl:justify-end" aria-label="Active filters">
              {refinements.map((r) => (
                <li key={r.key}>
                  <button type="button" onClick={r.clear} className="inline-flex h-8 items-center gap-1 rounded-full border border-border bg-surface px-2.5 text-xs text-fg hover:border-border-strong" aria-label={`Remove filter ${r.text}`}>
                    {r.text} <X className="h-3 w-3 text-fg-subtle" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          ) : null
        }
      >
        {seasons.length > 1 ? (
          <FilterField label="Season" htmlFor="overview-season">
            <Select id="overview-season" name="season" value={String(filter.season)} disabled={pending} onChange={(e) => go({ season: Number(e.target.value) })} className={`${field} md:w-56`}>
              {seasons.map((s) => (
                <option key={s} value={s}>
                  {seasonLabel(s)}
                  {s === currentSeason ? " (current)" : ""}
                </option>
              ))}
            </Select>
          </FilterField>
        ) : null}
        <FilterField label="Game mode" htmlFor="overview-mode">
          <Select id="overview-mode" name="mode" value={filter.mode} disabled={pending} onChange={(e) => go({ mode: e.target.value as StatsFilter["mode"] })} className={`${field} md:w-48`}>
            {SEASON_MODES.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </Select>
        </FilterField>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="overview-refine"
          className={cn(
            "inline-flex h-9 items-center justify-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-colors pointer-coarse:min-h-11 max-md:hidden",
            open || refinements.length ? "border-accent/50 bg-accent/10 text-fg" : "border-border text-fg-muted hover:border-border-strong hover:text-fg",
          )}
          data-testid="refine-filters"
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden /> Refine
          {refinements.length ? <span className="rounded-full bg-accent px-1.5 text-xs font-semibold text-bg">{refinements.length}</span> : null}
        </button>
        {/* Phones: part of the opened filters. Wide screens: a row of its own, opened by Refine. */}
        <div id="overview-refine" className={cn("flex min-w-0 flex-col gap-3 md:order-last md:basis-full md:flex-row md:flex-wrap md:items-end md:gap-2 md:rounded-panel md:border md:border-border md:bg-surface/70 md:p-3", open ? "md:rise-in" : "md:hidden")} data-testid="refine-panel">
          <FilterField label="Role played" labelId="overview-role-label">
            <RoleSegmented label="Role played" roles={ROLES} value={filter.role ?? null} onChange={(r) => go({ role: r })} allowAll testId="role-filter" />
          </FilterField>
          {showChampions ? (
            <FilterField label="Champions" className="md:w-56">
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
            <FilterField label="Linked account" htmlFor="overview-account">
              <Select id="overview-account" name="account" value={filter.accountId ?? ""} disabled={pending} onChange={(e) => go({ accountId: e.target.value || null })} className={`${field} md:w-48`}>
                <option value="">All accounts</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.riotId}
                    {a.label === "main" ? " (Main)" : ""}
                  </option>
                ))}
              </Select>
            </FilterField>
          ) : null}
        </div>
      </FilterBar>
      <noscript>
        <button type="submit" className="text-xs underline">
          Apply
        </button>
      </noscript>
    </form>
  );
}
