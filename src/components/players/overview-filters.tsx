"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { RoleSegmented } from "@/components/ui/segmented";
import { FilterBar, FilterField, RefineButton } from "@/components/ui/filter-bar";
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
 *
 * From tablets up, Refine opens a panel anchored under its button that floats over the page: it
 * never takes part in the layout around it (the heading beside the filters keeps its width), and
 * it closes on a click outside, Escape or Refine again. On phones the same fields are part of the
 * opened filter bar, which is already a full-width panel.
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
  modeCounts,
}: {
  /** Games per game mode in the chosen season, shown beside each mode ("Ranked Flex (14)"). */
  modeCounts?: Partial<Record<StatsFilter["mode"], number>>;
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
          refinements.length ? (
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
                {modeCounts && modeCounts[m.key] !== undefined ? ` (${modeCounts[m.key]!.toLocaleString("en")})` : ""}
              </option>
            ))}
          </Select>
        </FilterField>
        {/* Refine and its panel. Phones: no box of its own (display: contents), so the fields sit in the
            opened filter bar. Wider: the anchor of the floating panel. */}
        <div ref={refineRef} className="max-md:contents md:relative">
          <RefineButton buttonRef={refineButton} open={open} count={refinements.length} controls="overview-refine" haspopup="dialog" onClick={() => setOpen((o) => !o)} className="max-md:hidden" testId="refine-filters" />
          <div
            id="overview-refine"
            role="group"
            aria-label="Refine the statistics"
            className={cn(
              "flex min-w-0 flex-col gap-3",
              "md:absolute md:top-full md:z-40 md:mt-2 md:w-[min(34rem,calc(100vw-2rem))] md:rounded-panel md:border md:border-border md:bg-bg-elevated md:p-3.5 md:shadow-2xl md:shadow-black/40",
              side === "right" ? "md:right-0" : "md:left-0",
              open ? "md:rise-in" : "md:hidden",
            )}
            data-testid="refine-panel"
          >
            <FilterField label="Role played" labelId="overview-role-label" alwaysLabel>
              <RoleSegmented label="Role played" roles={ROLES} value={filter.role ?? null} onChange={(r) => go({ role: r })} allowAll testId="role-filter" />
            </FilterField>
            {showChampions || accounts.length > 1 ? (
              <div className="flex min-w-0 flex-col gap-3 md:grid md:grid-cols-2 md:gap-3">
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
                    <Select id="overview-account" name="account" value={filter.accountId ?? ""} disabled={pending} onChange={(e) => go({ accountId: e.target.value || null })} className="w-full">
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
            ) : null}
          </div>
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
          <Link href={`${basePath}?${statsQuery({ ...filter, season: e.season }, keep)}`} scroll={false} className="font-medium text-accent hover:underline">
            {seasonLabel(e.season)} ({e.games.toLocaleString("en")})
          </Link>
        </React.Fragment>
      ))}
      .
    </span>
  );
}
