"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  SEASON_MODES,
  statsQuery,
  type StatsFilter,
} from "@/domain/season-stats";
import { seasonLabel } from "@/domain/season";
import { ROLES, ROLE_LABELS } from "@/domain/roles";
import { Select } from "@/components/ui/input";


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
}: {
  /** Parameters carried over every change (e.g. the match list's page size); the page resets. */
  keep?: Record<string, string>;
  testId?: string;
  basePath: string;
  filter: StatsFilter;
  seasons: number[];
  currentSeason: number;
  champions: Array<{ id: string; name: string; games: number }>;
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
  const champValue =
    filter.scope === "champion" && filter.championId
      ? `c:${filter.championId}`
      : filter.scope;
  const refinements = [
    filter.role ? { key: "role", text: ROLE_LABELS[filter.role], clear: () => go({ role: null }) } : null,
    filter.scope === "pool" ? { key: "scope", text: "Configured pool", clear: () => go({ scope: "all", championId: null }) } : null,
    filter.scope === "champion" && filter.championId ? { key: "champion", text: champions.find((c) => c.id === filter.championId)?.name ?? filter.championId, clear: () => go({ scope: "all", championId: null }) } : null,
    filter.accountId ? { key: "account", text: accounts.find((a) => a.id === filter.accountId)?.riotId ?? "One account", clear: () => go({ accountId: null }) } : null,
  ].filter((r): r is { key: string; text: string; clear: () => void } => !!r);
  const [open, setOpen] = React.useState(false);
  const narrowed =
    refinements.length > 0 ||
    filter.mode !== "all" ||
    filter.season !== currentSeason;
  const field = "h-10 min-w-0 text-sm md:h-9";
  return (
    <form
      method="get"
      action={basePath}
      className="flex flex-col gap-2 xl:items-end"
      onSubmit={(e) => e.preventDefault()}
      data-testid={testId}
      aria-busy={pending}
    >
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-end">
        {seasons.length > 1 ? (
          <Select
            id="overview-season"
            aria-label="Season"
            name="season"
            value={String(filter.season)}
            disabled={pending}
            onChange={(e) => go({ season: Number(e.target.value) })}
            className={`${field} sm:w-56`}
          >
            {seasons.map((s) => (
              <option key={s} value={s}>
                {seasonLabel(s)}
                {s === currentSeason ? " (current)" : ""}
              </option>
            ))}
          </Select>
        ) : null}
        <Select
          id="overview-mode"
          aria-label="Game mode"
          name="mode"
          value={filter.mode}
          disabled={pending}
          onChange={(e) => go({ mode: e.target.value as StatsFilter["mode"] })}
          className={`${field} sm:w-48`}
        >
          {SEASON_MODES.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </Select>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="overview-refine"
          className={cn(
            "inline-flex h-10 items-center justify-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-colors md:h-9",
            open || refinements.length ? "border-accent/50 bg-accent/10 text-fg" : "border-border text-fg-muted hover:border-border-strong hover:text-fg",
          )}
          data-testid="refine-filters"
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden /> Refine
          {refinements.length ? <span className="rounded-full bg-accent px-1.5 text-xs font-semibold text-bg">{refinements.length}</span> : null}
        </button>
        {narrowed ? (
          <button
            type="button"
            onClick={() =>
              startTransition(() => router.replace(basePath, { scroll: false }))
            }
            className="inline-flex h-10 items-center justify-center gap-1 rounded-md px-2 text-xs font-medium text-accent hover:bg-accent/10 md:h-9"
            data-testid="reset-filters"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Everything
          </button>
        ) : null}
      </div>
      {refinements.length && !open ? (
        <ul className="flex flex-wrap gap-1.5 xl:justify-end" aria-label="Active filters">
          {refinements.map((r) => (
            <li key={r.key}>
              <button type="button" onClick={r.clear} className="inline-flex h-8 items-center gap-1 rounded-full border border-border bg-surface px-2.5 text-xs text-fg hover:border-border-strong" aria-label={`Remove filter ${r.text}`}>
                {r.text} <X className="h-3 w-3 text-fg-subtle" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {open ? (
        <div id="overview-refine" className="rise-in grid w-full grid-cols-1 gap-2 rounded-xl border border-border bg-surface/70 p-3 min-[400px]:grid-cols-2 sm:flex sm:flex-wrap sm:items-end xl:w-auto" data-testid="refine-panel">
          <label className="flex flex-col gap-1 text-xs text-fg-muted sm:w-36">
            Role played
            <Select
              id="overview-role"
              name="role"
              value={filter.role ?? ""}
              disabled={pending}
              onChange={(e) =>
                go({ role: (e.target.value || null) as StatsFilter["role"] })
              }
              className={field}
            >
              <option value="">All roles</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-fg-muted sm:w-52">
            Champions
            <Select
              id="overview-champions"
              name="scope"
              value={champValue}
              disabled={pending}
              onChange={(e) => {
                const v = e.target.value;
                if (v.startsWith("c:"))
                  go({ scope: "champion", championId: v.slice(2) });
                else go({ scope: v as StatsFilter["scope"], championId: null });
              }}
              className={field}
            >
              <option value="all">All champions</option>
              <option value="pool">
                {filter.role
                  ? `Configured ${ROLE_LABELS[filter.role]} pool`
                  : "Configured pools"}
              </option>
              <optgroup label="One champion (played this season)">
                {champions.map((c) => (
                  <option key={c.id} value={`c:${c.id}`}>
                    {c.name}
                    {c.games ? ` (${c.games})` : ""}
                  </option>
                ))}
              </optgroup>
            </Select>
          </label>
          {accounts.length > 1 ? (
            <label className="flex flex-col gap-1 text-xs text-fg-muted sm:w-48">
              Linked account
              <Select
                id="overview-account"
                name="account"
                value={filter.accountId ?? ""}
                disabled={pending}
                onChange={(e) => go({ accountId: e.target.value || null })}
                className={field}
              >
                <option value="">All accounts</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.riotId}
                    {a.label === "main" ? " (main)" : ""}
                  </option>
                ))}
              </Select>
            </label>
          ) : null}
        </div>
      ) : null}
      <noscript>
        <button type="submit" className="text-xs underline">
          Apply
        </button>
      </noscript>
    </form>
  );
}
