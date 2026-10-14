"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { SEASON_MODES } from "@/domain/season-stats";
import { seasonLabel } from "@/domain/season";
import { ROLES, ROLE_LABELS, type Role } from "@/domain/roles";
import type { Icon, MatchHistoryPage, MatchRow } from "@/server/players/match-history";
import { ChampionPortrait, type PortraitChampion } from "@/components/champion-portrait";
import { RoleIcon } from "@/components/role-icon";
import { Select } from "@/components/ui/input";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/cn";
import { MatchDetailDrawer } from "./match-detail";

/** Desktop row height (px): the page size is chosen so whole rows fill the screen. */
const ROW_PX = 64;
const PHONE_PER = 10;

export const fmtDuration = (s: number | null) => (s === null ? "—" : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`);
export const fmtNum = (v: number | null, digits = 1) => (v === null ? "—" : v.toFixed(digits));
export const fmtInt = (v: number | null) => (v === null ? "—" : Math.round(v).toLocaleString("en"));

export function IconImg({ icon, size = 22, rounded = "rounded", className }: { icon: Icon | null; size?: number; rounded?: string; className?: string }) {
  const [failed, setFailed] = React.useState(false);
  if (!icon || failed) return <span className={cn("inline-block shrink-0 bg-surface-3/70", rounded, className)} style={{ width: size, height: size }} aria-hidden />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={icon.url} alt={icon.name} title={icon.name} width={size} height={size} loading="lazy" decoding="async" className={cn("shrink-0 bg-surface-3", rounded, className)} style={{ width: size, height: size }} onError={() => setFailed(true)} />
  );
}

export function ItemRow({ items, size = 22 }: { items: Array<Icon | null> | null; size?: number }) {
  if (!items) return <span className="text-xs text-fg-subtle">Items not recorded</span>;
  return (
    <span className="flex items-center gap-0.5" aria-label={`Items: ${items.filter(Boolean).map((i) => i!.name).join(", ") || "none"}`}>
      {items.map((it, i) => (
        <IconImg key={i} icon={it} size={size} className={i === 6 ? "ml-0.5 rounded-full" : undefined} />
      ))}
    </span>
  );
}

function ResultTag({ win, compact = false }: { win: boolean; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1 font-semibold uppercase tracking-wide", compact ? "text-[11px]" : "text-xs", win ? "text-blue" : "text-red")}>
      <span aria-hidden>{win ? "▲" : "▼"}</span>
      {win ? "Win" : "Loss"}
    </span>
  );
}

function MatchRowButton({ row, champion, onOpen, active }: { row: MatchRow; champion: PortraitChampion; onOpen: (el: HTMLElement) => void; active: boolean }) {
  return (
    <li>
      <button
        type="button"
        onClick={(e) => onOpen(e.currentTarget)}
        className={cn(
          "group grid w-full grid-cols-[4px_minmax(0,1fr)] overflow-hidden rounded-xl border text-left transition-colors focus-visible:outline-2 focus-visible:outline-accent md:h-16",
          row.win ? "border-blue/25 bg-blue/[0.06] hover:border-blue/50" : "border-red/25 bg-red/[0.06] hover:border-red/50",
          active && "ring-2 ring-accent",
        )}
        aria-label={`${row.win ? "Win" : "Loss"} on ${champion.name}, ${row.queue}, ${timeAgo(new Date(row.playedAt))}. Open the match details.`}
        data-testid="match-row"
        data-match={row.matchId}
      >
        <span className={row.win ? "bg-blue" : "bg-red"} aria-hidden />
        <span className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 px-3 py-2 md:grid-cols-[7.5rem_minmax(9rem,1.1fr)_minmax(6rem,0.8fr)_minmax(10rem,1.2fr)_auto] md:py-0">
          {/* Result, queue, when, how long */}
          <span className="min-w-0 leading-tight max-md:col-span-2 max-md:flex max-md:items-baseline max-md:gap-2">
            <ResultTag win={row.win} />
            <span className="block truncate text-xs text-fg-muted">{row.queue}</span>
            <span className="block truncate text-[11px] text-fg-subtle">
              {timeAgo(new Date(row.playedAt))} · {fmtDuration(row.durationS)}
            </span>
          </span>
          {/* Champion, spells, runes */}
          <span className="flex min-w-0 items-center gap-2">
            <ChampionPortrait champion={champion} size="sm" />
            <span className="hidden flex-col gap-0.5 sm:flex">
              <span className="flex gap-0.5">{row.spells?.length ? row.spells.map((s, i) => <IconImg key={i} icon={s} size={16} />) : <><IconImg icon={null} size={16} /><IconImg icon={null} size={16} /></>}</span>
              <span className="flex gap-0.5">
                <IconImg icon={row.keystone} size={16} rounded="rounded-full" />
                <IconImg icon={row.secondary} size={16} rounded="rounded-full" className="p-0.5" />
              </span>
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-sm font-semibold text-fg">{champion.name}</span>
              <span className="flex items-center gap-1 text-[11px] text-fg-subtle">
                {row.role ? <RoleIcon role={row.role as Role} className="h-3 w-3" /> : null}
                {row.role ? ROLE_LABELS[row.role as Role] : "Role not recorded"}
                {row.riotId ? <span className="truncate"> · {row.riotId.split("#")[0]}</span> : null}
              </span>
            </span>
          </span>
          {/* KDA */}
          <span className="text-right leading-tight md:text-left">
            <span className="block text-sm font-semibold tabular-nums text-fg">{row.kills === null ? "—" : `${row.kills} / ${row.deaths} / ${row.assists}`}</span>
            <span className={cn("block text-[11px] tabular-nums", row.perfect ? "text-good" : (row.kda ?? 0) >= 3 ? "text-fg-muted" : "text-fg-subtle")}>{row.kda === null ? "details not collected" : row.perfect ? "Perfect KDA" : `${row.kda.toFixed(2)} KDA`}</span>
          </span>
          {/* Per-minute figures */}
          <span className="grid grid-cols-4 gap-2 text-[11px] leading-tight text-fg-subtle max-md:col-span-2 md:text-xs">
            <Stat label="CS/min" value={fmtNum(row.csPerMin)} />
            <Stat label="Dmg/min" value={fmtInt(row.damagePerMin)} />
            <Stat label="Vision" value={fmtInt(row.vision)} />
            <Stat label="KP" value={row.killParticipation === null ? "—" : `${Math.round(row.killParticipation * 100)}%`} />
          </span>
          {/* Items */}
          <span className="max-md:col-span-2 max-md:hidden md:flex md:items-center md:gap-2">
            {row.record === "stored" ? <ItemRow items={row.items} size={22} /> : <span className="text-[11px] text-fg-subtle">{row.record === "missing" ? "Items: being collected" : "Items: not provided by Riot"}</span>}
            <ChevronRight className="h-4 w-4 text-fg-subtle transition-transform group-hover:translate-x-0.5" aria-hidden />
          </span>
        </span>
      </button>
    </li>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="min-w-0">
      <span className="block font-semibold tabular-nums text-fg">{value}</span>
      <span className="block truncate">{label}</span>
    </span>
  );
}

/** Numbered pages with the ends and the neighbourhood of the current page; gaps shown as "…". */
export function pageList(page: number, pages: number): Array<number | "gap"> {
  const keep = new Set([1, pages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pages));
  const out: Array<number | "gap"> = [];
  let last = 0;
  for (const p of [...keep].sort((a, b) => a - b)) {
    if (p - last > 1) out.push("gap");
    out.push(p);
    last = p;
  }
  return out;
}

/**
 * Match History: the player's stored Riot games, newest first, a screenful at a time (the page size
 * follows the window height, so the list never needs scrolling on a desktop), with compact
 * filters and numbered pages. A match opens in a drawer over the page, so nothing scrolls away;
 * closing it returns to the same page and match.
 */
export function MatchHistoryView({ data, championsById, basePath, playerId }: { data: MatchHistoryPage; championsById: Record<string, PortraitChampion>; basePath: string; playerId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = React.useTransition();
  const listRef = React.useRef<HTMLDivElement>(null);
  const [open, setOpen] = React.useState<string | null>(params.get("match"));
  const returnFocus = React.useRef<HTMLElement | null>(null);
  const champ = (id: string): PortraitChampion => championsById[id] ?? { id, name: id, portraitUrl: "" };

  const go = React.useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      }
      next.delete("match");
      startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
    },
    [params, pathname, router],
  );

  // Page size from the space left on screen (phones use a fixed size and scroll).
  React.useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const phone = window.innerWidth < 768;
    const room = window.innerHeight - el.getBoundingClientRect().top - 64;
    const fits = phone ? PHONE_PER : Math.max(6, Math.min(25, Math.floor(room / (ROW_PX + 6))));
    if (fits !== data.per && data.total > 0) {
      const firstIndex = (data.page - 1) * data.per;
      go({ per: String(fits), page: String(Math.floor(firstIndex / fits) + 1) });
    }
    // Only on arrival and when the list changes size class, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.per, data.total]);

  const openMatch = (matchId: string, el: HTMLElement | null) => {
    returnFocus.current = el;
    setOpen(matchId);
    const next = new URLSearchParams(params.toString());
    next.set("match", matchId);
    window.history.pushState(null, "", `${pathname}?${next.toString()}`);
  };
  const close = () => {
    setOpen(null);
    const next = new URLSearchParams(params.toString());
    next.delete("match");
    window.history.replaceState(null, "", `${pathname}${next.size ? `?${next.toString()}` : ""}`);
    requestAnimationFrame(() => returnFocus.current?.focus());
  };
  // Browser Back closes the drawer.
  React.useEffect(() => {
    const onPop = () => setOpen(new URLSearchParams(window.location.search).get("match"));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const f = data.filter;
  const narrowed = f.role || f.championId || f.accountId || f.mode !== "all" || f.season !== data.currentSeason;
  const field = "h-10 min-w-0 text-sm md:h-9";
  return (
    <section className="space-y-3" aria-labelledby="match-history" data-testid="match-history">
      <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <h2 id="match-history" className="text-lg font-semibold text-fg">
            Match history
          </h2>
          <p className="text-sm text-fg-muted" data-testid="match-count">
            {data.total.toLocaleString("en")} game{data.total === 1 ? "" : "s"} · {seasonLabel(f.season)} · {SEASON_MODES.find((m) => m.key === f.mode)?.label}
            {data.accountsLinked > 1 && !f.accountId ? ` · all ${data.accountsLinked} accounts` : ""}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center" data-testid="match-filters" aria-busy={pending}>
          {data.seasons.length > 1 ? (
            <Select aria-label="Season" value={String(f.season)} onChange={(e) => go({ season: e.target.value, page: null })} className={`${field} sm:w-40`}>
              {data.seasons.map((s) => (
                <option key={s} value={s}>
                  {seasonLabel(s)}
                </option>
              ))}
            </Select>
          ) : null}
          <Select aria-label="Game mode" value={f.mode} onChange={(e) => go({ mode: e.target.value === "all" ? null : e.target.value, page: null })} className={`${field} sm:w-44`} data-testid="match-mode">
            {SEASON_MODES.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </Select>
          <Select aria-label="Role played" value={f.role ?? ""} onChange={(e) => go({ role: e.target.value || null, page: null })} className={`${field} sm:w-32`}>
            <option value="">All roles</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </Select>
          <Select aria-label="Champion" value={f.championId ?? ""} onChange={(e) => go({ champion: e.target.value || null, page: null })} className={`${field} sm:w-44`} data-testid="match-champion">
            <option value="">All champions</option>
            {data.championOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {champ(c.id).name} ({c.games})
              </option>
            ))}
          </Select>
          {data.accountOptions.length > 1 ? (
            <Select aria-label="Linked account" value={f.accountId ?? ""} onChange={(e) => go({ account: e.target.value || null, page: null })} className={`${field} sm:w-44`} data-testid="match-account">
              <option value="">All accounts</option>
              {data.accountOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.riotId}
                </option>
              ))}
            </Select>
          ) : null}
          {narrowed ? (
            <button type="button" onClick={() => startTransition(() => router.replace(basePath, { scroll: false }))} className="inline-flex h-10 items-center gap-1 rounded-md px-2 text-xs font-medium text-accent hover:bg-accent/10 md:h-9">
              <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Everything
            </button>
          ) : null}
        </div>
      </div>

      <div ref={listRef} className={cn("transition-opacity", pending && "opacity-60")}>
        {data.total === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-fg-muted" data-testid="match-empty">
            {data.accountsLinked === 0 ? "No Riot account is linked yet: games appear here once one is linked and synced." : narrowed ? "No stored game matches these filters." : data.syncing ? "No games stored for this season yet; the first sync is collecting them and this page fills in by itself." : "No games stored for this season."}
          </p>
        ) : (
          <ol className="space-y-1.5" aria-label={`Page ${data.page} of ${data.pages}`}>
            {data.rows.map((r) => (
              <MatchRowButton key={r.matchId} row={r} champion={champ(r.championId)} onOpen={(el) => openMatch(r.matchId, el)} active={open === r.matchId} />
            ))}
          </ol>
        )}
      </div>

      {data.pages > 1 ? (
        <nav aria-label="Match history pages" className="flex flex-wrap items-center justify-between gap-2" data-testid="match-pages">
          <button type="button" disabled={data.page <= 1 || pending} onClick={() => go({ page: String(data.page - 1) })} className="inline-flex h-10 items-center gap-1 rounded-lg border border-border px-3 text-sm text-fg-muted hover:border-border-strong hover:text-fg disabled:opacity-40 md:h-9" data-testid="match-prev">
            <ChevronLeft className="h-4 w-4" aria-hidden /> Newer
          </button>
          <span className="flex items-center gap-1">
            {pageList(data.page, data.pages).map((p, i) =>
              p === "gap" ? (
                <span key={`g${i}`} className="px-1 text-fg-subtle" aria-hidden>
                  …
                </span>
              ) : (
                <button key={p} type="button" aria-current={p === data.page ? "page" : undefined} onClick={() => go({ page: String(p) })} className={cn("h-9 min-w-9 rounded-lg px-2 text-sm tabular-nums", p === data.page ? "bg-accent/15 font-semibold text-accent" : "text-fg-muted hover:bg-surface-2 hover:text-fg")}>
                  {p}
                </button>
              ),
            )}
          </span>
          <button type="button" disabled={data.page >= data.pages || pending} onClick={() => go({ page: String(data.page + 1) })} className="inline-flex h-10 items-center gap-1 rounded-lg border border-border px-3 text-sm text-fg-muted hover:border-border-strong hover:text-fg disabled:opacity-40 md:h-9" data-testid="match-next">
            Older <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </nav>
      ) : null}
      {data.missingOnPage > 0 ? <p className="text-xs text-fg-subtle">Items and runes of {data.missingOnPage} older game{data.missingOnPage === 1 ? " are" : "s are"} still being collected by the account sync; their results already count.</p> : null}

      {open ? <MatchDetailDrawer playerId={playerId} matchId={open} championsById={championsById} onClose={close} /> : null}
    </section>
  );
}
