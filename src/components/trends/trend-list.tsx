"use client";

import * as React from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
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
}

const pct = (v: number, digits = 0) => `${(v * 100).toFixed(digits)}%`;

function TrendRow({ t, rank, showDelta, maxPresence }: { t: TrendItem; rank: number; showDelta: boolean; maxPresence: number }) {
  const presence = t.pickRate + t.banRate;
  return (
    <li className="flex items-center gap-3 py-2.5" data-testid="trend-row">
      <span className="w-5 shrink-0 text-right text-sm font-semibold tabular-nums text-fg-subtle">{rank}</span>
      <ChampionPortrait champion={{ id: t.championId, name: t.name, portraitUrl: t.portraitUrl }} size="md" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-fg">{t.name}</span>
          {t.role ? <RoleIcon role={t.role} className="h-3.5 w-3.5 shrink-0 text-fg-subtle" title={ROLE_LABELS[t.role]} /> : null}
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3" aria-hidden>
          <div className="h-full rounded-full bg-accent/70" style={{ width: `${Math.max(4, (presence / Math.max(maxPresence, 0.0001)) * 100)}%` }} />
        </div>
        <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-fg-muted">
          <span>
            <span className="text-fg">{pct(t.pickRate)}</span> pick
          </span>
          <span>
            <span className="text-fg">{pct(t.banRate)}</span> ban
          </span>
          <span title={`Sample: ${t.games.toLocaleString()} games`}>
            <span className={t.confidence < 0.3 ? "text-fg-subtle" : t.winRate >= 0.5 ? "text-good" : "text-fg"}>{pct(t.winRate, 1)}</span> win{t.confidence < 0.3 ? " (low data)" : ""}
          </span>
          {t.proPresence > 0 ? <span className="text-info">{pct(t.proPresence)} pro</span> : null}
        </div>
      </div>
      {showDelta && t.presenceDelta !== null ? (
        <span className={cn("shrink-0 rounded-md px-2 py-1 text-xs font-semibold tabular-nums", t.presenceDelta > 0 ? "bg-good/10 text-good" : t.presenceDelta < 0 ? "bg-bad/10 text-bad" : "text-fg-subtle")} title="Change in presence (pick + ban rate) versus the previous patch, in percentage points">
          {t.presenceDelta > 0 ? "+" : ""}
          {(t.presenceDelta * 100).toFixed(1)}
        </span>
      ) : null}
    </li>
  );
}

/** A ranked list that starts short (top 5) and grows on request: never an enormous table up front. */
export function TrendList({ title, subtitle, info, items, initial = 5, showDelta = false, empty = "Not enough data yet.", testId }: { title: string; subtitle?: string; info?: string; items: TrendItem[]; initial?: number; showDelta?: boolean; empty?: string; testId?: string }) {
  const [count, setCount] = React.useState(initial);
  const maxPresence = Math.max(0, ...items.map((t) => t.pickRate + t.banRate));
  const shown = items.slice(0, count);
  return (
    <section className="rounded-2xl border border-border bg-surface p-4" data-testid={testId}>
      <header className="mb-1">
        <h2 className="flex items-center gap-1.5 text-base font-semibold">
          {title} {info ? <InfoTip text={info} label={`About ${title}`} /> : null}
        </h2>
        {subtitle ? <p className="text-xs text-fg-muted">{subtitle}</p> : null}
      </header>
      {items.length === 0 ? <p className="py-4 text-sm text-fg-muted">{empty}</p> : null}
      <ol className="divide-y divide-border">
        {shown.map((t, i) => (
          <TrendRow key={`${t.championId}-${t.role ?? ""}`} t={t} rank={i + 1} showDelta={showDelta} maxPresence={maxPresence} />
        ))}
      </ol>
      {items.length > initial ? (
        <button type="button" onClick={() => setCount(count >= items.length ? initial : Math.min(items.length, count + 10))} className="mt-2 inline-flex min-h-10 items-center gap-1 rounded-md px-2 text-sm font-medium text-accent hover:bg-accent/10">
          {count >= items.length ? (
            <>
              Show less <ChevronUp className="h-4 w-4" />
            </>
          ) : (
            <>
              Show more <ChevronDown className="h-4 w-4" />
            </>
          )}
        </button>
      ) : null}
    </section>
  );
}

/** Most-played champions per role, one role at a time (role tabs like champion select). */
export function RoleTrends({ byRole }: { byRole: Record<Role, TrendItem[]> }) {
  const [role, setRole] = React.useState<Role>("TOP");
  return (
    <section className="rounded-2xl border border-border bg-surface p-4" data-testid="trends-by-role">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">By role</h2>
          <p className="text-xs text-fg-muted">Most played champions in each role this patch.</p>
        </div>
        <div role="tablist" aria-label="Role" className="flex gap-0.5 rounded-lg border border-border bg-bg-elevated p-0.5">
          {ROLES.map((r) => (
            <button key={r} type="button" role="tab" aria-selected={role === r} onClick={() => setRole(r)} className={cn("inline-flex min-h-9 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium pointer-coarse:min-h-11", role === r ? "bg-accent/15 text-accent" : "text-fg-muted hover:text-fg")}>
              <RoleIcon role={r} className="h-4 w-4" /> <span className="hidden sm:inline">{ROLE_LABELS[r]}</span>
            </button>
          ))}
        </div>
      </div>
      <TrendListBody key={role} items={byRole[role]} />
    </section>
  );
}

function TrendListBody({ items }: { items: TrendItem[] }) {
  const [count, setCount] = React.useState(5);
  const maxPresence = Math.max(0, ...items.map((t) => t.pickRate + t.banRate));
  return (
    <>
      {items.length === 0 ? <p className="py-4 text-sm text-fg-muted">No games recorded for this role yet.</p> : null}
      <ol className="divide-y divide-border">
        {items.slice(0, count).map((t, i) => (
          <TrendRow key={t.championId} t={t} rank={i + 1} showDelta={false} maxPresence={maxPresence} />
        ))}
      </ol>
      {items.length > 5 ? (
        <button type="button" onClick={() => setCount(count >= items.length ? 5 : items.length)} className="mt-2 inline-flex min-h-10 items-center gap-1 rounded-md px-2 text-sm font-medium text-accent hover:bg-accent/10">
          {count >= items.length ? "Show less" : `Show all ${items.length}`}
        </button>
      ) : null}
    </>
  );
}
