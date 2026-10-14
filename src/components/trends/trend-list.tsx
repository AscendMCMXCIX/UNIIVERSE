"use client";

import * as React from "react";
import { ROLES, ROLE_LABELS, type Role } from "@/domain/roles";
import { ChampionPortrait } from "@/components/champion-portrait";
import { RoleIcon } from "@/components/role-icon";
import { InfoTip } from "@/components/ui/info-tip";
import { cn } from "@/lib/cn";

export interface TrendItem {
  championId: string;
  name: string;
  portraitUrl: string;
  role: Role | null;
  pickRate: number;
  banRate: number;
  winRate: number;
  games: number;
  confidence: number;
  presenceDelta: number | null;
  proPresence: number;
  /** A professional-play row: only pick + ban presence and the pro game count are real. */
  pro?: boolean;
}

const pct = (v: number, digits = 0) => `${(v * 100).toFixed(digits)}%`;

/** What a list is ranked by: the bar and the highlighted figure follow it. */
export type TrendMetric = "presence" | "pick" | "ban" | "win";
const metricValue = (t: TrendItem, m: TrendMetric) => (m === "pick" ? t.pickRate : m === "ban" ? t.banRate : m === "win" ? t.winRate - 0.5 : t.pickRate + t.banRate);

/** Lists show the top ten (or fewer when fewer champions have real evidence); nothing is padded. */
export const TOP_N = 10;

const metricText = (t: TrendItem, m: TrendMetric) => (m === "pick" ? pct(t.pickRate, 1) : m === "ban" ? pct(t.banRate, 1) : m === "win" ? pct(t.winRate, 1) : pct(t.pickRate + t.banRate, 1));
const metricName: Record<TrendMetric, string> = { presence: "presence", pick: "pick rate", ban: "ban rate", win: "win rate" };

/**
 * One compact row: rank, portrait, name and role, a bar for the ranked figure, the figure itself
 * and its sample. The other figures are in the row's tooltip and read out to screen readers.
 */
function TrendRow({ t, rank, showDelta, max, metric }: { t: TrendItem; rank: number; showDelta: boolean; max: number; metric: TrendMetric }) {
  const value = metricValue(t, metric);
  const lowData = metric === "win" && t.confidence < 0.3;
  const details = t.pro ? `${t.name}: picked or banned in ${pct(t.proPresence, 1)} of ${t.games.toLocaleString()} professional games this patch` : `${t.name}${t.role ? ` (${ROLE_LABELS[t.role]})` : ""}: presence ${pct(t.pickRate + t.banRate, 1)}, pick ${pct(t.pickRate, 1)}, ban ${pct(t.banRate, 1)}, win ${pct(t.winRate, 1)}${t.confidence < 0.3 ? " (low data)" : ""}, ${t.games.toLocaleString()} games${t.proPresence > 0 ? `, ${pct(t.proPresence)} pro presence` : ""}`;
  return (
    <li className="flex items-center gap-2.5 py-1.5" data-testid="trend-row" title={details}>
      <span className="w-5 shrink-0 text-right text-xs font-semibold tabular-nums text-fg-subtle">{rank}</span>
      <ChampionPortrait champion={{ id: t.championId, name: t.name, portraitUrl: t.portraitUrl }} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium text-fg">{t.name}</span>
          {t.role ? <RoleIcon role={t.role} className="h-3.5 w-3.5 shrink-0 text-fg-subtle" title={ROLE_LABELS[t.role]} /> : null}
        </div>
        <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-3" aria-hidden>
          <div className={cn("h-full rounded-full", metric === "ban" ? "bg-bad/70" : metric === "win" ? "bg-good/70" : "bg-accent/70")} style={{ width: `${Math.max(4, (Math.max(0, value) / Math.max(max, 0.0001)) * 100)}%` }} />
        </div>
        <span className="sr-only">{details}</span>
      </div>
      {showDelta && t.presenceDelta !== null ? (
        <span className={cn("shrink-0 rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums", t.presenceDelta > 0 ? "bg-good/10 text-good" : t.presenceDelta < 0 ? "bg-bad/10 text-bad" : "text-fg-subtle")} title="Change in presence (pick + ban rate) versus the previous patch, in percentage points">
          {t.presenceDelta > 0 ? "+" : ""}
          {(t.presenceDelta * 100).toFixed(1)}
        </span>
      ) : null}
      <span className="w-20 shrink-0 text-right">
        <span className={cn("block text-sm font-semibold tabular-nums", lowData ? "text-fg-subtle" : metric === "win" && t.winRate >= 0.5 ? "text-good" : t.pro ? "text-info" : "text-fg")} aria-label={t.pro ? "pro presence" : metricName[metric]}>
          {metricText(t, metric)}
        </span>
        <span className="block text-xs tabular-nums text-fg-subtle">{lowData ? "low data" : t.pro ? "pro" : `${t.games.toLocaleString()} games`}</span>
      </span>
    </li>
  );
}

/** A ranked list: the top ten, compact. */
export function TrendList({ title, subtitle, info, items, metric = "presence", showDelta = false, empty = "Not enough data yet.", testId }: { title: string; subtitle?: string; info?: string; items: TrendItem[]; metric?: TrendMetric; showDelta?: boolean; empty?: string; testId?: string }) {
  const shown = items.slice(0, TOP_N);
  const max = Math.max(0, ...shown.map((t) => metricValue(t, metric)));
  return (
    <section className="flex h-full min-w-0 flex-col rounded-2xl border border-border bg-surface px-3.5 py-3" data-testid={testId}>
      <header className="mb-1 flex items-baseline justify-between gap-2">
        <h2 className="flex shrink-0 items-center gap-1.5 text-sm font-semibold text-fg">
          {title} {info ? <InfoTip text={info} label={`About ${title}`} /> : null}
        </h2>
        {subtitle ? <p className="min-w-0 truncate text-xs text-fg-muted" title={subtitle}>{subtitle}</p> : null}
      </header>
      {items.length === 0 ? <p className="py-4 text-sm text-fg-muted">{empty}</p> : null}
      <ol className="divide-y divide-border/70">
        {shown.map((t, i) => (
          <TrendRow key={`${t.championId}-${t.role ?? ""}`} t={t} rank={i + 1} showDelta={showDelta} max={max} metric={metric} />
        ))}
      </ol>
    </section>
  );
}

/** Most-played champions per role, one role at a time (role tabs like champion select). */
export function RoleTrends({ byRole }: { byRole: Record<Role, TrendItem[]> }) {
  const [role, setRole] = React.useState<Role>("TOP");
  const items = byRole[role].slice(0, TOP_N);
  const max = Math.max(0, ...items.map((t) => t.pickRate));
  return (
    <section className="flex h-full min-w-0 flex-col rounded-2xl border border-border bg-surface px-3.5 py-3" data-testid="trends-by-role">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-fg">
          By role <InfoTip text="Most played champions in each role this patch (30+ games in the role)." label="About By role" />
        </h2>
        <div role="tablist" aria-label="Role" className="flex gap-0.5 rounded-lg border border-border bg-bg-elevated p-0.5">
          {ROLES.map((r) => (
            <button key={r} type="button" role="tab" aria-selected={role === r} aria-label={ROLE_LABELS[r]} title={ROLE_LABELS[r]} onClick={() => setRole(r)} className={cn("inline-flex min-h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium pointer-coarse:min-h-11", role === r ? "bg-accent/15 text-accent" : "text-fg-muted hover:text-fg")}>
              <RoleIcon role={r} className="h-4 w-4" />
            </button>
          ))}
        </div>
      </div>
      {items.length === 0 ? <p className="py-4 text-sm text-fg-muted">No champion has 30+ games in this role yet.</p> : null}
      <ol className="divide-y divide-border/70">
        {items.map((t, i) => (
          <TrendRow key={t.championId} t={t} rank={i + 1} showDelta={false} max={max} metric="pick" />
        ))}
      </ol>
    </section>
  );
}
