"use client";

import * as React from "react";
import { ROLE_LABELS, type Role } from "@/domain/roles";
import type { ChampionTrend, TrendSort, TrendTop, TrendView } from "@/server/trends";
import { ChampionPortrait } from "@/components/champion-portrait";
import { RoleIcon } from "@/components/role-icon";
import { cn } from "@/lib/cn";

type Champ = { id: string; name: string; portraitUrl: string };
type Tab = TrendView;

const pct = (v: number, digits = 1) => `${(v * 100).toFixed(digits)}%`;
const TAB_LABEL: Record<Tab, string> = { ALL: "Overall", TOP: "Top", JUNGLE: "Jungle", MID: "Mid", ADC: "Bottom", SUPPORT: "Support" };
const SORT_LABEL: Record<TrendSort, string> = { presence: "Presence", pick: "Pick rate", ban: "Ban rate", win: "Win rate" };
const SORT_SHORT: Record<TrendSort, string> = { presence: "Presence", pick: "Pick", ban: "Ban", win: "Win" };

/** Why a list holds fewer than ten champions (never padded with weak evidence). */
function shortfall(view: Tab, sort: TrendSort, top: TrendTop | null, shown: number, patch: string, minWinGames: number, minRoleGames: number): string | null {
  if (shown >= 10 || !top) return null;
  const where = view === "ALL" ? "" : ` in ${TAB_LABEL[view]}`;
  if (shown === 0 && sort !== "win") return `No champion has been ${sort === "ban" ? "banned" : "played"}${where} on patch ${patch} yet.`;
  if (sort === "win") return `Only ${top.winEligible} champion${top.winEligible === 1 ? " has" : "s have"} ${minWinGames}+ games${where} on patch ${patch}; win rates with fewer games are too uncertain to rank.`;
  if (sort === "ban") return `Only ${shown} champion${shown === 1 ? " was" : "s were"} banned${where} on patch ${patch} so far.`;
  return view === "ALL" ? `Only ${shown} champions appear on patch ${patch} so far.` : `Only ${shown} champions have ${minRoleGames}+ games${where} on patch ${patch} so far.`;
}

function Row({ t, rank, champ, sort, view, showDelta }: { t: ChampionTrend; rank: number; champ: Champ; sort: TrendSort; view: TrendView; showDelta: boolean }) {
  const lowWin = t.confidence < 0.3;
  const cell = (s: TrendSort, value: string, extra?: string) => (
    <td className={cn("px-2 py-1.5 text-right tabular-nums", s === sort ? "font-semibold text-fg" : "text-fg-muted", s !== sort && "max-md:hidden")} data-metric={s}>
      {value}
      {extra ? <span className="block text-[11px] font-normal text-fg-subtle">{extra}</span> : null}
    </td>
  );
  return (
    <tr className="border-t border-border/70" data-testid="trend-row" data-champion={t.championId}>
      <td className="w-8 py-1.5 pl-3 pr-1 text-right text-xs font-semibold tabular-nums text-fg-subtle">{rank}</td>
      <td className="py-1.5 pl-1 pr-2">
        <span className="flex min-w-0 items-center gap-2.5">
          <ChampionPortrait champion={champ} size="xs" />
          <span className="min-w-0 truncate text-sm font-medium text-fg">{champ.name}</span>
          {view === "ALL" && t.role ? <RoleIcon role={t.role} className="h-3.5 w-3.5 shrink-0 text-fg-subtle" title={`Mostly ${ROLE_LABELS[t.role]}`} /> : null}
        </span>
      </td>
      {cell("presence", pct(t.presence))}
      {cell("pick", pct(t.pickRate))}
      {cell("ban", pct(t.banRate))}
      {cell("win", lowWin ? "—" : pct(t.winRate), lowWin ? "low data" : `${t.games.toLocaleString()} games`)}
      {showDelta ? (
        <td className={cn("px-2 py-1.5 pr-3 text-right text-xs font-semibold tabular-nums max-sm:hidden", t.presenceDelta === null ? "text-fg-subtle" : t.presenceDelta > 0.001 ? "text-good" : t.presenceDelta < -0.001 ? "text-bad" : "text-fg-subtle")}>
          {t.presenceDelta === null ? "—" : `${t.presenceDelta > 0 ? "+" : ""}${(t.presenceDelta * 100).toFixed(1)}`}
        </td>
      ) : null}
    </tr>
  );
}

/**
 * Trends as one table: Overall or a role (tabs), ranked by presence, pick, ban or win rate (a
 * switch), top ten. Every combination is computed on the server and sent with the page, so
 * switching is instant. Fewer than ten rows always come with the reason.
 */
export function TrendsBoard({
  views,
  champions,
  patch,
  previousPatch,
  showDelta,
  minWinGames,
  minRoleGames,
}: {
  views: Record<TrendView, TrendTop>;
  champions: Record<string, Champ>;
  patch: string;
  previousPatch: string | null;
  showDelta: boolean;
  minWinGames: number;
  minRoleGames: number;
}) {
  const [view, setView] = React.useState<Tab>("ALL");
  const [sort, setSort] = React.useState<TrendSort>("presence");
  const tabs: Tab[] = ["ALL", "TOP", "JUNGLE", "MID", "ADC", "SUPPORT"];
  const champ = (id: string): Champ => champions[id] ?? { id, name: id, portraitUrl: "" };
  const top = views[view];
  const rows = top ? top.bySort[sort] : [];
  const note = shortfall(view, sort, top, rows.length, patch, minWinGames, minRoleGames);
  const tabRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const onTabKey = (e: React.KeyboardEvent, i: number) => {
    const next = e.key === "ArrowRight" ? (i + 1) % tabs.length : e.key === "ArrowLeft" ? (i - 1 + tabs.length) % tabs.length : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    setView(tabs[next]!);
    tabRefs.current[next]?.focus();
  };

  return (
    <section className="min-w-0 overflow-hidden rounded-2xl border border-border bg-surface" data-testid="trends-board">
      <div className="flex flex-col gap-2 border-b border-border p-2 lg:flex-row lg:items-center lg:justify-between">
        <div role="tablist" aria-label="Role" className="grid grid-cols-3 gap-1 sm:flex sm:flex-wrap" data-testid="trends-tabs">
          {tabs.map((t, i) => (
            <button
              key={t}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`trends-tab-${t}`}
              aria-selected={view === t}
              aria-controls="trends-panel"
              tabIndex={view === t ? 0 : -1}
              onClick={() => setView(t)}
              onKeyDown={(e) => onTabKey(e, i)}
              className={cn("inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg px-2.5 text-sm font-medium transition-colors pointer-coarse:min-h-11", view === t ? "bg-accent/15 text-accent" : "text-fg-muted hover:bg-surface-2 hover:text-fg")}
              data-testid={`trends-tab-${t}`}
            >
              {t !== "ALL" ? <RoleIcon role={t as Role} className="h-4 w-4" /> : null}
              {TAB_LABEL[t]}
            </button>
          ))}
        </div>
        <div role="radiogroup" aria-label="Rank by" className="flex shrink-0 gap-0.5 rounded-lg border border-border bg-bg-elevated p-0.5" data-testid="trends-sort">
            {(["presence", "pick", "ban", "win"] as const).map((s) => (
              <button key={s} type="button" role="radio" aria-checked={sort === s} onClick={() => setSort(s)} className={cn("min-h-8 flex-1 rounded-md px-2.5 text-xs font-medium pointer-coarse:min-h-10 sm:flex-none", sort === s ? "bg-surface-3 text-fg" : "text-fg-muted hover:text-fg")} data-testid={`trends-sort-${s}`}>
                {SORT_SHORT[s]}
              </button>
            ))}
          </div>
      </div>

      <div id="trends-panel" role="tabpanel" aria-labelledby={`trends-tab-${view}`}>
        <table className="w-full table-fixed text-sm">
            <caption className="sr-only">
              {TAB_LABEL[view]}: top champions by {SORT_LABEL[sort].toLowerCase()} on patch {patch}
            </caption>
            <colgroup>
              <col className="w-10" />
              <col />
              <col className={cn("w-24", sort !== "presence" && "max-md:hidden")} />
              <col className={cn("w-20", sort !== "pick" && "max-md:hidden")} />
              <col className={cn("w-20", sort !== "ban" && "max-md:hidden")} />
              <col className={cn("w-24", sort !== "win" && "max-md:hidden")} />
              {showDelta ? <col className="w-20 max-sm:hidden" /> : null}
            </colgroup>
            <thead>
              <tr className="text-xs text-fg-subtle">
                <th scope="col" className="py-2 pl-3 pr-1 text-right font-medium">#</th>
                <th scope="col" className="py-2 pl-1 pr-2 text-left font-medium">Champion</th>
                {(["presence", "pick", "ban", "win"] as const).map((s) => (
                  <th key={s} scope="col" aria-sort={sort === s ? "descending" : undefined} className={cn("px-2 py-2 text-right font-medium", sort === s && "text-accent", sort !== s && "max-md:hidden")}>
                    {SORT_SHORT[s]}
                  </th>
                ))}
                {showDelta ? (
                  <th scope="col" className="px-2 py-2 pr-3 text-right font-medium max-sm:hidden" title={`Change in presence since ${previousPatch}, in percentage points`}>
                    vs {previousPatch}
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((t, i) => (
                <Row key={t.championId} t={t} rank={i + 1} champ={champ(t.championId)} sort={sort} view={view} showDelta={showDelta} />
              ))}
            </tbody>
          </table>
        {note ? (
          <p className="border-t border-border/70 px-3 py-2.5 text-xs text-fg-muted" data-testid="trends-shortfall">
            {note}
          </p>
        ) : null}
      </div>
    </section>
  );
}
