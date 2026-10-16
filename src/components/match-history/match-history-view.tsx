"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { SEASON_MODES } from "@/domain/season-stats";
import { seasonLabel } from "@/domain/season";
import { ROLE_LABELS, type Role } from "@/domain/roles";
import type { Icon, MatchHistoryPage, MatchRow } from "@/server/players/match-history";
import { ChampionPortrait, type PortraitChampion } from "@/components/champion-portrait";
import { RoleIcon } from "@/components/role-icon";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/cn";
import { MatchDetailDrawer } from "./match-detail";
import { OverviewFilters } from "@/components/players/overview-filters";

/** Desktop row height (px): the page size is chosen so whole rows fill the screen. */
const ROW_PX = 60;
const PHONE_PER = 10;

export const fmtDuration = (s: number | null) => (s === null ? "—" : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`);
export const fmtNum = (v: number | null, digits = 1) => (v === null ? "—" : v.toFixed(digits));
export const fmtInt = (v: number | null) => (v === null ? "—" : Math.round(v).toLocaleString("en"));

export function IconImg({ icon, size = 22, rounded = "rounded", className }: { icon: Icon | null; size?: number; rounded?: string; className?: string }) {
  const [failed, setFailed] = React.useState(false);
  if (!icon || failed) return <span className={cn("inline-block shrink-0 bg-surface-3/70", rounded, className)} style={{ width: `${size / 16}rem`, height: `${size / 16}rem` }} aria-hidden />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={icon.url} alt={icon.name} title={icon.name} width={size} height={size} loading="lazy" decoding="async" className={cn("shrink-0 bg-surface-3", rounded, className)} style={{ width: `${size / 16}rem`, height: `${size / 16}rem` }} onError={() => setFailed(true)} />
  );
}

export function ItemRow({ items, size = 22 }: { items: Array<Icon | null> | null; size?: number }) {
  // Not collected yet: quiet empty slots (the list footer explains once), never the same sentence on every row.
  if (!items)
    return (
      <span className="flex items-center gap-0.5" role="img" aria-label="Items not recorded" data-testid="items-missing">
        {Array.from({ length: 7 }, (_, i) => (
          <IconImg key={i} icon={null} size={size} className={cn("opacity-40", i === 6 ? "ml-0.5 rounded-full" : undefined)} />
        ))}
      </span>
    );
  return (
    <span className="flex items-center gap-0.5" aria-label={`Items: ${items.filter(Boolean).map((i) => i!.name).join(", ") || "none"}`}>
      {items.map((it, i) => (
        <IconImg key={i} icon={it} size={size} className={i === 6 ? "ml-0.5 rounded-full" : undefined} />
      ))}
    </span>
  );
}

function MatchRowButton({ row, champion, onOpen, active }: { row: MatchRow; champion: PortraitChampion; onOpen: (el: HTMLElement) => void; active: boolean }) {
  const kp = row.killParticipation === null ? "—" : `${Math.round(row.killParticipation * 100)}%`;
  return (
    <li>
      {/* One scannable line per game: result and when, champion and loadout, KDA, the per-minute
          figures and the items. Everything else (both teams, runes in full, builds, timeline) is in
          the details panel the row opens. */}
      <button
        type="button"
        onClick={(e) => onOpen(e.currentTarget)}
        className={cn(
          "group relative grid w-full grid-cols-[3px_minmax(0,1fr)] overflow-hidden rounded-panel border bg-surface text-left transition-colors focus-visible:outline-2 focus-visible:outline-accent md:h-[3.75rem]",
          row.win ? "border-border hover:border-blue/50 hover:bg-blue/[0.04]" : "border-border hover:border-red/50 hover:bg-red/[0.04]",
          active && "ring-2 ring-accent",
        )}
        aria-label={`${row.win ? "Win" : "Loss"} on ${champion.name}, ${row.queue}, ${timeAgo(new Date(row.playedAt))}. Open the match details.`}
        data-testid="match-row"
        data-match={row.matchId}
        data-result={row.win ? "W" : "L"}
      >
        <span className={row.win ? "bg-blue" : "bg-red"} aria-hidden />
        <span className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-3 py-2 md:grid-cols-[5.75rem_minmax(9rem,15rem)_minmax(5.5rem,7.5rem)_minmax(10rem,13rem)_minmax(0,1fr)_auto] md:py-0">
          {/* Result, queue, when, how long (phones: under the champion) */}
          <span className="hidden min-w-0 leading-tight md:block">
            <span className={cn("block text-sm font-semibold", row.win ? "text-blue" : "text-red")}>{row.win ? "Win" : "Loss"}</span>
            <span className="block truncate text-[11px] text-fg-muted">{row.queue}</span>
            <span className="block truncate text-[11px] tabular-nums text-fg-subtle">
              {timeAgo(new Date(row.playedAt))} · {fmtDuration(row.durationS)}
            </span>
          </span>
          {/* Champion with its spells and runes */}
          <span className="relative shrink-0 md:hidden">
            <ChampionPortrait champion={champion} size="sm" />
          </span>
          <span className="flex min-w-0 items-center gap-2.5">
            <span className="relative hidden shrink-0 md:block">
              <ChampionPortrait champion={champion} size="sm" />
            </span>
            <span className="hidden flex-col gap-0.5 lg:flex" aria-hidden>
              <span className="flex gap-0.5">{row.spells?.length ? row.spells.map((s, i) => <IconImg key={i} icon={s} size={16} />) : <><IconImg icon={null} size={16} /><IconImg icon={null} size={16} /></>}</span>
              <span className="flex gap-0.5">
                <IconImg icon={row.keystone} size={16} rounded="rounded-full" />
                <IconImg icon={row.secondary} size={16} rounded="rounded-full" className="p-0.5" />
              </span>
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-sm font-semibold text-fg">{champion.name}</span>
              <span className="flex min-w-0 items-center gap-1 text-[11px] text-fg-subtle">
                {row.role ? <RoleIcon role={row.role as Role} className="h-3 w-3 shrink-0" /> : null}
                <span className="truncate">
                  {row.role ? ROLE_LABELS[row.role as Role] : "Role not recorded"}
                  {row.riotId ? ` · ${row.riotId.split("#")[0]}` : ""}
                </span>
              </span>
              <span className={cn("mt-0.5 flex items-baseline gap-1.5 truncate text-[11px] md:hidden")}>
                <span className={cn("font-semibold", row.win ? "text-blue" : "text-red")}>{row.win ? "Win" : "Loss"}</span>
                <span className="truncate text-fg-muted">
                  {row.queue} · {timeAgo(new Date(row.playedAt))}
                </span>
              </span>
            </span>
          </span>
          {/* KDA */}
          <span className="text-right leading-tight md:text-left">
            <span className="block text-[0.9375rem] font-semibold tabular-nums text-fg">{row.kills === null ? "—" : `${row.kills} / ${row.deaths} / ${row.assists}`}</span>
            <span className={cn("block text-[11px] tabular-nums", row.perfect ? "text-good" : (row.kda ?? 0) >= 3 ? "text-fg-muted" : "text-fg-subtle")}>{row.kda === null ? "details not collected" : row.perfect ? "Perfect KDA" : `${row.kda.toFixed(2)} KDA`}</span>
          </span>
          {/* Per-minute figures and kill participation */}
          <span className="col-span-3 flex items-baseline gap-x-4 text-[11px] text-fg-subtle md:col-span-1 md:grid md:grid-cols-3 md:gap-x-2">
            <Stat label="CS/min" value={fmtNum(row.csPerMin)} />
            <Stat label="Dmg/min" value={fmtInt(row.damagePerMin)} />
            <Stat label="KP" value={kp} />
          </span>
          {/* Items (left to the details panel when the list is too narrow for them) */}
          <span className="hidden md:flex md:items-center md:justify-self-end @max-[46rem]/mh:hidden">
            {row.record === "stored" ? <ItemRow items={row.items} size={22} /> : <span className="text-[11px] text-fg-subtle">{row.record === "missing" ? "Items being collected" : "Items not provided by Riot"}</span>}
          </span>
          <ChevronRight className="hidden h-4 w-4 text-fg-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-fg motion-reduce:transition-none md:block" aria-hidden />
        </span>
      </button>
    </li>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="min-w-0 md:leading-tight">
      <span className="font-semibold tabular-nums text-fg md:block md:text-xs">{value}</span> <span className="whitespace-nowrap md:block">{label}</span>
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
 * follows the window height, so the list never needs scrolling on a desktop). The header holds
 * the record and averages of everything the filters match, and the same filters as the profile's
 * Overview (season and mode up front, role, champions and account behind Refine). A match opens
 * in a drawer over the page, so nothing scrolls away; closing it returns to the same page and match.
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
    const room = window.innerHeight - el.getBoundingClientRect().top - 56;
    const fits = phone ? PHONE_PER : Math.max(10, Math.min(25, Math.floor(room / (ROW_PX + 4))));
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
  const narrowed = f.role || f.scope !== "all" || f.accountId || f.mode !== "all" || f.season !== data.currentSeason;
  return (
    <section className="space-y-3" aria-labelledby="match-history" data-testid="match-history">
      <div className="flex flex-col gap-2 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <h2 id="match-history" className="text-lg font-semibold text-fg">
            Match history
          </h2>
          <p className="text-sm text-fg-muted" data-testid="match-count">
            {data.total.toLocaleString("en")} game{data.total === 1 ? "" : "s"} · {seasonLabel(f.season)} · {SEASON_MODES.find((m) => m.key === f.mode)?.label}
            {data.accountsLinked > 1 && !f.accountId ? ` · all ${data.accountsLinked} accounts` : ""}
          </p>
          <HistorySummary summary={data.summary} />
        </div>
        <div aria-busy={pending}>
          <OverviewFilters
            basePath={basePath}
            filter={f}
            seasons={data.seasons}
            currentSeason={data.currentSeason}
            champions={data.championOptions.map((c) => ({ id: c.id, name: champ(c.id).name, games: c.games, portraitUrl: champ(c.id).portraitUrl }))}
            accounts={data.accountOptions}
            keep={{ per: String(data.per) }}
            testId="match-filters"
          />
        </div>
      </div>

      <div ref={listRef} className={cn("transition-opacity", pending && "opacity-60")}>
        {data.total === 0 ? (
          <p className="rounded-panel border border-dashed border-border px-4 py-6 text-center text-sm text-fg-muted" data-testid="match-empty">
            {data.accountsLinked === 0 ? "No Riot account is linked yet: games appear here once one is linked and synced." : narrowed ? "No stored game matches these filters." : data.syncing ? "No games stored for this season yet; the first sync is collecting them and this page fills in by itself." : "No games stored for this season."}
          </p>
        ) : (
          <ol className="@container/mh space-y-1" aria-label={`Page ${data.page} of ${data.pages}`}>
            {data.rows.map((r) => (
              <MatchRowButton key={r.matchId} row={r} champion={champ(r.championId)} onOpen={(el) => openMatch(r.matchId, el)} active={open === r.matchId} />
            ))}
          </ol>
        )}
      </div>

      {data.pages > 1 ? <Pages page={data.page} pages={data.pages} total={data.total} per={data.per} pending={pending} go={(p) => go({ page: String(p) })} /> : null}
      {data.missingOnPage > 0 ? <p className="text-xs text-fg-subtle">Items and runes of {data.missingOnPage} older game{data.missingOnPage === 1 ? " are" : "s are"} still being collected by the account sync; their results already count.</p> : null}

      {open ? <MatchDetailDrawer playerId={playerId} matchId={open} championsById={championsById} onClose={close} /> : null}
    </section>
  );
}

/** Record and averages of every game the filters match (the same arithmetic as the Overview). */
function HistorySummary({ summary }: { summary: MatchHistoryPage["summary"] }) {
  const { record: r, performance: p } = summary;
  if (!r.games) return null;
  const decided = r.wins + r.losses;
  const parts: Array<[string, string]> = [[`${r.wins}W ${r.losses}L`, decided ? `${Math.round((r.wins / decided) * 100)}% win rate` : ""]];
  if (p.detailedGames) parts.push([p.perfectKda ? "Perfect" : fmtNum(p.kdaRatio, 2), `KDA (${fmtNum(p.kills)} / ${fmtNum(p.deaths)} / ${fmtNum(p.assists)})`]);
  if (p.csMinuteGames) parts.push([fmtNum(p.csPerMinute), "CS/min"]);
  if (p.damageMinuteGames) parts.push([fmtInt(p.damagePerMinute), "damage/min"]);
  return (
    <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-fg-subtle" data-testid="match-summary">
      {parts.map(([value, label]) => (
        <span key={label}>
          <span className="font-semibold tabular-nums text-fg">{value}</span> {label}
        </span>
      ))}
      {p.detailedGames && p.detailedGames < r.games ? <span>averages from {p.detailedGames} of {r.games} games</span> : null}
    </p>
  );
}

/** Compact page controls: arrows, the ends and the neighbourhood of the current page. */
function Pages({ page, pages, total, per, pending, go }: { page: number; pages: number; total: number; per: number; pending: boolean; go: (p: number) => void }) {
  const arrow = "grid h-10 w-10 place-items-center rounded-lg border border-border text-fg-muted hover:border-border-strong hover:text-fg disabled:opacity-40 md:h-8 md:w-8";
  const from = (page - 1) * per + 1;
  const to = Math.min(total, page * per);
  return (
    <nav aria-label="Match history pages" className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1" data-testid="match-pages">
      <span className="flex items-center gap-1">
        <button type="button" disabled={page <= 1 || pending} onClick={() => go(page - 1)} className={arrow} aria-label="Newer games" data-testid="match-prev">
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
        {pageList(page, pages).map((p, i) =>
          p === "gap" ? (
            <span key={`g${i}`} className="px-0.5 text-fg-subtle" aria-hidden>
              …
            </span>
          ) : (
            <button key={p} type="button" aria-current={p === page ? "page" : undefined} aria-label={`Page ${p}`} onClick={() => go(p)} className={cn("h-10 min-w-10 rounded-lg px-1.5 text-sm tabular-nums md:h-8 md:min-w-8", p === page ? "bg-accent/15 font-semibold text-accent" : "text-fg-muted hover:bg-surface-2 hover:text-fg")}>
              {p}
            </button>
          ),
        )}
        <button type="button" disabled={page >= pages || pending} onClick={() => go(page + 1)} className={arrow} aria-label="Older games" data-testid="match-next">
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </span>
      <span className="text-xs tabular-nums text-fg-subtle">
        Games {from}–{to} of {total.toLocaleString("en")}
      </span>
    </nav>
  );
}
