"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { SEASON_MODES } from "@/domain/season-stats";
import { seasonLabel } from "@/domain/season";
import { ROLE_LABELS, type Role } from "@/domain/roles";
import type { MatchHistoryPage, MatchRow } from "@/server/players/match-history";
import type { PortraitChampion } from "@/components/champion-portrait";
import { RoleIcon } from "@/components/role-icon";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/cn";
import { MatchDetailModal } from "./match-detail";
import { MatchDetailCacheContext, createMatchDetailCache, type MatchDetailCache } from "./match-detail-cache";
import { ItemRow } from "./icon-img";
import { ChampionLoadout, MatchRail, MatchResult, matchCardClass, matchTone } from "./match-card";
import { ModeElsewhere, OverviewFilters } from "@/components/players/overview-filters";
import { MatchRefresh } from "./match-refresh";
import type { MatchSyncStatus } from "@/server/accounts/refresh";

/** A card's rendered height in rem (about 5rem with the result column) plus the gap between cards; pixels follow the root size,
    so the page size is chosen for whole cards to fill the screen. */
const ROW_REM = 5 + 0.375;
const PHONE_PER = 10;

export const fmtDuration = (s: number | null) => (s === null ? "—" : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`);
export const fmtNum = (v: number | null, digits = 1) => (v === null ? "—" : v.toFixed(digits));
export const fmtInt = (v: number | null) => (v === null ? "—" : Math.round(v).toLocaleString("en"));

/** Memoised: opening a match re-renders only the card it marks, not the whole page of cards. */
const MatchCard = React.memo(function MatchCard({ row, champion, onOpen, onPrefetch, active }: { row: MatchRow; champion: PortraitChampion; onOpen: (matchId: string, el: HTMLElement) => void; onPrefetch: (matchId: string) => void; active: boolean }) {
  const kp = row.killParticipation === null ? "—" : `${Math.round(row.killParticipation * 100)}%`;
  const tone = matchTone(row.win);
  const account = row.riotId ? row.riotId.split("#")[0] : null;
  const when = timeAgo(new Date(row.playedAt));
  const kda = row.kills === null ? "—" : `${row.kills} / ${row.deaths} / ${row.assists}`;
  const ratio = row.kda === null ? "details not collected" : row.perfect ? "Perfect KDA" : `${row.kda.toFixed(2)} KDA`;
  const build = row.record === "stored" ? <ItemRow items={row.items} size={24} /> : <span className="text-xs text-fg-subtle">{row.record === "missing" ? "Items being collected" : "Items not provided by Riot"}</span>;
  return (
    <li>
      {/* One game per card, read the way a player scans a match list: the result column (queue,
          when, Victory / Defeat, length), the champion with its spells and runes, the KDA, the
          figures and the build. Both teams, the runes in full and the timeline are in the match
          window the card opens. Spare width is shared between the columns (fr), so a wide window
          never opens an empty band. Phones stack it in two rows instead of squeezing one. */}
      <button
        type="button"
        onClick={(e) => onOpen(row.matchId, e.currentTarget)}
        // A mouse press starts loading the match before the click lands (not touch: a finger that
        // goes down on a card is as often starting a scroll).
        onPointerDown={(e) => {
          if (e.pointerType === "mouse" && e.button === 0) onPrefetch(row.matchId);
        }}
        className={cn("group w-full text-left focus-visible:outline-2 focus-visible:outline-accent md:min-h-[4.75rem]", matchCardClass(row.win, { interactive: true }), active && "ring-2 ring-accent")}
        aria-label={`${tone.word} on ${champion.name}, ${row.queue}, ${when}. Open the match details.`}
        data-testid="match-row"
        data-match={row.matchId}
        data-result={row.win ? "W" : "L"}
      >
        <MatchRail win={row.win} />
        <span className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-3 py-2.5 md:grid-cols-[6.5rem_auto_minmax(8rem,1fr)_minmax(6.5rem,0.7fr)_minmax(11rem,1fr)_auto_auto] md:gap-x-4 md:py-2 lg:gap-x-5">
          <MatchResult win={row.win} queue={row.queue} when={when} duration={fmtDuration(row.durationS)} className="hidden md:flex" />
          <ChampionLoadout champion={champion} spells={row.spells} keystone={row.keystone} secondary={row.secondary} size="md" icon={22} portraitClassName="md:h-14 md:w-14" iconsClassName="max-md:hidden" />
          {/* The champion, the role and the account it was played on */}
          <span className="min-w-0 leading-snug">
            <span className={cn("block truncate text-xs font-bold md:hidden", tone.text)}>
              {tone.word} <span className="font-medium text-fg-subtle">· {row.queue} · {when}</span>
            </span>
            <span className="block truncate text-[0.9375rem] font-semibold text-fg">{champion.name}</span>
            <span className="flex min-w-0 items-center gap-1 text-xs text-fg-muted">
              {row.role ? <RoleIcon role={row.role as Role} className="h-3.5 w-3.5 shrink-0" /> : null}
              <span className="truncate">{row.role ? ROLE_LABELS[row.role as Role] : "Role not recorded"}</span>
              {account ? (
                <span className="ml-0.5 truncate rounded bg-surface-2 px-1.5 py-px text-[0.6875rem] text-fg-subtle" title={`Played on ${row.riotId}`} data-testid="match-row-account">
                  {account}
                </span>
              ) : null}
            </span>
          </span>
          {/* KDA: the primary performance figure */}
          <span className="text-right leading-snug md:text-left">
            <span className="block whitespace-nowrap text-base font-semibold tabular-nums text-fg">{kda}</span>
            <span className={cn("block text-xs tabular-nums", row.perfect ? "text-good" : (row.kda ?? 0) >= 3 ? "text-fg-muted" : "text-fg-subtle")}>{ratio}</span>
          </span>
          {/* Kill participation and the per-minute figures: secondary, grouped */}
          <span className="col-span-3 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-fg-subtle md:col-span-1 md:grid md:grid-cols-3 md:gap-x-3">
            <Stat label="KP" value={kp} />
            <Stat label="CS/min" value={fmtNum(row.csPerMin)} />
            <Stat label="Dmg/min" value={fmtInt(row.damagePerMin)} />
          </span>
          {/* The build: its own row on phones, after the figures on wider cards (left to the match
              window when the list is too narrow for it) */}
          <span className="col-span-3 flex items-center overflow-hidden md:col-span-1 @max-[56rem]/mh:md:hidden">{build}</span>
          <ChevronRight className="hidden h-4 w-4 text-fg-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-fg motion-reduce:transition-none md:block" aria-hidden />
        </span>
      </button>
    </li>
  );
});

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex min-w-0 items-baseline gap-1 leading-snug md:block">
      <span className="block font-semibold tabular-nums text-fg md:text-sm">{value}</span>
      <span className="block whitespace-nowrap">{label}</span>
    </span>
  );
}

/** A champion missing from the static data, by id (kept per id so memoised cards stay equal). */
const fallbacks = new Map<string, PortraitChampion>();
function fallbackChampion(id: string): PortraitChampion {
  let c = fallbacks.get(id);
  if (!c) fallbacks.set(id, (c = { id, name: id, portraitUrl: "" }));
  return c;
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
 * in the shared centred window over the page, so nothing scrolls away; closing it returns to the same page and match.
 */
export function MatchHistoryView({ data, championsById, basePath, playerId, sync }: { data: MatchHistoryPage; championsById: Record<string, PortraitChampion>; basePath: string; playerId: string; sync?: { status: MatchSyncStatus; canRefresh: boolean } }) {
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
    const rowPx = ROW_REM * (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16);
    const fits = phone ? PHONE_PER : Math.max(10, Math.min(25, Math.floor(room / rowPx)));
    if (fits !== data.per && data.total > 0) {
      const firstIndex = (data.page - 1) * data.per;
      go({ per: String(fits), page: String(Math.floor(firstIndex / fits) + 1) });
    }
    // Only on arrival and when the list changes size class, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.per, data.total]);

  // Details this page has loaded (a new one with every new page of data, see MatchDetailCache).
  // eslint-disable-next-line react-hooks/exhaustive-deps -- a new cache for every new page of data, on purpose
  const cache = React.useMemo<MatchDetailCache>(() => createMatchDetailCache(), [data]);
  const prefetch = React.useCallback((matchId: string) => void cache.load(playerId, matchId).catch(() => {}), [cache, playerId]);
  const latestParams = React.useRef({ params, pathname });
  React.useLayoutEffect(() => {
    latestParams.current = { params, pathname };
  });
  const openMatch = React.useCallback((matchId: string, el: HTMLElement | null) => {
    returnFocus.current = el;
    setOpen(matchId);
    const { params, pathname } = latestParams.current;
    const next = new URLSearchParams(params.toString());
    next.set("match", matchId);
    window.history.pushState(null, "", `${pathname}?${next.toString()}`);
  }, []);
  const close = () => {
    setOpen(null);
    const next = new URLSearchParams(params.toString());
    next.delete("match");
    window.history.replaceState(null, "", `${pathname}${next.size ? `?${next.toString()}` : ""}`);
    requestAnimationFrame(() => returnFocus.current?.focus());
  };
  // Browser Back closes the match window.
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
          {sync ? <MatchRefresh playerId={playerId} status={sync.status} canRefresh={sync.canRefresh} page={data.page} onShowNewest={() => go({ page: "1" })} /> : null}
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
            modeCounts={data.modes.counts}
            testId="match-filters"
          />
        </div>
      </div>

      <div ref={listRef} className={cn("transition-opacity", pending && "opacity-60")}>
        {data.total === 0 ? (
          <p className="rounded-panel border border-dashed border-border px-4 py-6 text-center text-sm text-fg-muted" data-testid="match-empty">
            {data.accountsLinked === 0 ? "No Riot account is linked yet: games appear here once one is linked and synced." : narrowed ? "No stored game matches these filters." : data.syncing ? "No games stored for this season yet; the first sync is collecting them and this page fills in by itself." : "No games stored for this season."}
            <ModeElsewhere basePath={basePath} filter={f} elsewhere={data.modes.elsewhere} keep={{ per: String(data.per) }} />
          </p>
        ) : (
          <ol className="@container/mh space-y-1.5" aria-label={`Page ${data.page} of ${data.pages}`}>
            {data.rows.map((r) => (
              <MatchCard key={r.matchId} row={r} champion={championsById[r.championId] ?? fallbackChampion(r.championId)} onOpen={openMatch} onPrefetch={prefetch} active={open === r.matchId} />
            ))}
          </ol>
        )}
      </div>

      {data.pages > 1 ? <Pages page={data.page} pages={data.pages} total={data.total} per={data.per} pending={pending} go={(p) => go({ page: String(p) })} /> : null}
      {data.missingOnPage > 0 ? <p className="text-xs text-fg-subtle">Items and runes of {data.missingOnPage} older game{data.missingOnPage === 1 ? " are" : "s are"} still being collected by the account sync; their results already count.</p> : null}

      {open ? (
        <MatchDetailCacheContext.Provider value={cache}>
          <MatchDetailModal playerId={playerId} matchId={open} championsById={championsById} onClose={close} />
        </MatchDetailCacheContext.Provider>
      ) : null}
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
