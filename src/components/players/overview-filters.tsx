"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { SEASON_MODES, statsQuery, type StatsFilter } from "@/domain/season-stats";
import { seasonLabel } from "@/domain/season";
import { ROLES, ROLE_LABELS } from "@/domain/roles";
import { Select } from "@/components/ui/input";

const DEFAULT_SCOPE = "all";

/**
 * The profile's statistics filters in one compact row: season, game mode, role played, which
 * champions (all, the configured pool, or one champion) and which linked account. Everything is
 * included by default; each choice is a plain GET parameter, applied at once.
 */
export function OverviewFilters({ basePath, filter, seasons, currentSeason, champions, accounts }: { basePath: string; filter: StatsFilter; seasons: number[]; currentSeason: number; champions: Array<{ id: string; name: string; games: number }>; accounts: Array<{ id: string; riotId: string; label: string }> }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const go = (next: Partial<StatsFilter>) => {
    const merged = { ...filter, ...next };
    startTransition(() => router.replace(`${basePath}?${statsQuery(merged)}`, { scroll: false }));
  };
  const champValue = filter.scope === "champion" && filter.championId ? `c:${filter.championId}` : filter.scope;
  const narrowed = filter.role || filter.scope !== DEFAULT_SCOPE || filter.accountId || filter.mode !== "all" || filter.season !== currentSeason;
  const field = "h-10 min-w-0 text-sm md:h-9";
  return (
    <form method="get" action={basePath} className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center" onSubmit={(e) => e.preventDefault()} data-testid="overview-filters" aria-busy={pending}>
      <Select id="overview-season" aria-label="Season" name="season" value={String(filter.season)} disabled={pending} onChange={(e) => go({ season: Number(e.target.value) })} className={`${field} sm:w-48`}>
        {seasons.map((s) => (
          <option key={s} value={s}>
            {seasonLabel(s)}
            {s === currentSeason ? " (current)" : ""}
          </option>
        ))}
      </Select>
      <Select id="overview-mode" aria-label="Game mode" name="mode" value={filter.mode} disabled={pending} onChange={(e) => go({ mode: e.target.value as StatsFilter["mode"] })} className={`${field} sm:w-48`}>
        {SEASON_MODES.map((m) => (
          <option key={m.key} value={m.key}>
            {m.label}
          </option>
        ))}
      </Select>
      <Select id="overview-role" aria-label="Role played" name="role" value={filter.role ?? ""} disabled={pending} onChange={(e) => go({ role: (e.target.value || null) as StatsFilter["role"] })} className={`${field} sm:w-36`}>
        <option value="">All roles</option>
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABELS[r]}
          </option>
        ))}
      </Select>
      <Select
        id="overview-champions"
        aria-label="Champions"
        name="scope"
        value={champValue}
        disabled={pending}
        onChange={(e) => {
          const v = e.target.value;
          if (v.startsWith("c:")) go({ scope: "champion", championId: v.slice(2) });
          else go({ scope: v as StatsFilter["scope"], championId: null });
        }}
        className={`${field} sm:w-48`}
      >
        <option value="all">All champions</option>
        <option value="pool">{filter.role ? `Configured ${ROLE_LABELS[filter.role]} pool` : "Configured pools"}</option>
        <optgroup label="One champion">
          {champions.map((c) => (
            <option key={c.id} value={`c:${c.id}`}>
              {c.name}
              {c.games ? ` (${c.games})` : ""}
            </option>
          ))}
        </optgroup>
      </Select>
      {accounts.length > 1 ? (
        <Select id="overview-account" aria-label="Linked account" name="account" value={filter.accountId ?? ""} disabled={pending} onChange={(e) => go({ accountId: e.target.value || null })} className={`${field} sm:w-44`}>
          <option value="">All accounts</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.riotId}
              {a.label === "main" ? " (main)" : ""}
            </option>
          ))}
        </Select>
      ) : null}
      {narrowed ? (
        <button type="button" onClick={() => startTransition(() => router.replace(basePath, { scroll: false }))} className="inline-flex h-10 items-center gap-1 rounded-md px-2 text-xs font-medium text-accent hover:bg-accent/10 md:h-9" data-testid="reset-filters">
          <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Everything
        </button>
      ) : null}
      <noscript>
        <button type="submit" className="text-xs underline">
          Apply
        </button>
      </noscript>
    </form>
  );
}
