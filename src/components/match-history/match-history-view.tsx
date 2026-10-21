"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ROLE_LABELS, type Role } from "@/domain/roles";
import { MULTIKILL_NAMES } from "@/domain/multikills";
import type { MatchHistoryPage, MatchRow } from "@/server/players/match-history";
import type { PortraitChampion } from "@/components/champion-portrait";
import { RoleIcon } from "@/components/role-icon";
import { timeAgo, formatCount } from "@/lib/format";
import { cn } from "@/lib/cn";
import { MatchDetailModal } from "./match-detail";
import { MatchDetailCacheContext, createMatchDetailCache, type MatchDetailCache } from "./match-detail-cache";
import { ItemRow } from "./icon-img";
import { MultikillTag } from "./multikill-tag";
import { OpggHistoryLink } from "./opgg-history-link";
import { ChampionLoadout, MatchRail, MatchResult, matchCardClass, matchTone } from "./match-card";
import { TeamComposition } from "./team-composition";
import { ModeElsewhere, OverviewFilters } from "@/components/players/overview-filters";
import { MatchRefresh } from "./match-refresh";
import { MatchViewSwitch } from "./encounters-view";
import type { MatchSyncStatus } from "@/server/accounts/refresh";
import { useNow } from "@/components/ui/relative-time";

/** A card's rendered height in rem (about 6.4rem with both teams' five rows) plus the gap between cards; pixels follow the root size,
    so the page size is chosen for whole cards to fill the screen. */
const ROW_REM = 6.4 + 0.375;
const PHONE_PER = 10;

export const fmtDuration = (s: number | null) => (s === null ? "—" : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`);
export const fmtNum = (v: number | null, digits = 1) => (v === null ? "—" : v.toFixed(digits));
export const fmtInt = (v: number | null) => (v === null ? "—" : formatCount(v));

/** Memoised: opening a match re-renders only the card it marks, not the whole page of cards. */
const MatchCard = React.memo(function MatchCard({ row, champion, champ, onOpen, onPrefetch, active }: { row: MatchRow; champion: PortraitChampion; champ: (id: string | null) => PortraitChampion; onOpen: (matchId: string, el: HTMLElement) => void; onPrefetch: (matchId: string) => void; active: boolean }) {
  const kp = row.killParticipation === null ? "—" : `${Math.round(row.killParticipation * 100)}%`;
  const tone = matchTone(row.win);
  const account = row.riotId ? row.riotId.split("#")[0] : null;
  const when = timeAgo(new Date(row.playedAt), useNow());
  const kda = row.kills === null ? "—" : `${row.kills} / ${row.deaths} / ${row.assists}`;
  const ratio = row.kda === null ? "details not collected" : row.perfect ? "Perfect KDA" : `${row.kda.toFixed(2)} KDA`;
  const multikill = row.multikill ? MULTIKILL_NAMES[row.multikill] : null;
  const build = row.record === "stored" ? <ItemRow items={row.items} size={22} stacked className="grid-cols-7 @min-[56rem]/mh:grid-cols-4" trinketClassName="order-last ml-0.5 @min-[56rem]/mh:order-none @min-[56rem]/mh:ml-0" /> : <span className="text-xs text-fg-subtle">{row.record === "missing" ? "Items being collected" : "Items not provided by Riot"}</span>;
  const teamsId = `teams-${row.matchId}`;
  const open = React.useRef<HTMLButtonElement>(null);
  return (
    <li>
      {/* One game per card, read the way a player scans a match list: the result column (queue,
          when, Victory / Defeat, length), the champion with its spells and runes, the KDA, the
          figures, the build and both teams (who played what, the player in bold, team members
          in the accent colour). The runes in full, every figure and the timeline are in the
          match window the card opens. The wide layout follows the list's own width (a container
          query), not the window's: below 50rem it stacks in rows, below 56rem the build is left
          to the match window. */}
      {/* The whole card opens the match. The player links in the teams cannot sit inside a button,
          so the card is a box: a click anywhere on it (but a link) opens the match, and one
          button behind the content is the card for the keyboard and screen readers (one stop per
          card, Enter or Space opens it, its outline marks the card). */}
      <div
        className={cn("group cursor-pointer", matchCardClass(row.win, { interactive: true }), active && "ring-2 ring-accent")}
        onClick={(e) => {
          if ((e.target as Element).closest("a")) return;
          // Like clicking the card's button: it takes the focus, so closing the window returns there.
          open.current!.focus({ preventScroll: true });
          onOpen(row.matchId, open.current!);
        }}
        // A mouse press starts loading the match before the click lands (not touch: a finger that
        // goes down on a card is as often starting a scroll).
        onPointerDown={(e) => {
          if (e.pointerType === "mouse" && e.button === 0 && !(e.target as Element).closest("a")) onPrefetch(row.matchId);
        }}
        data-testid="match-card"
      >
        <button
          ref={open}
          type="button"
          className="absolute inset-0 rounded-[inherit] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
          aria-label={`${tone.word} on ${champion.name}, ${row.queue}, ${when}${multikill ? `, ${multikill.toLowerCase()}` : ""}. Open the match details.`}
          aria-describedby={row.teams ? teamsId : undefined}
          data-testid="match-row"
          data-match={row.matchId}
          data-result={row.win ? "W" : "L"}
        />
        <MatchRail win={row.win} />
        <span className="relative grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-3 py-2.5 @min-[50rem]/mh:grid-cols-[6.25rem_auto_minmax(6rem,0.8fr)_minmax(5.25rem,0.55fr)_minmax(5rem,0.5fr)_minmax(12rem,2fr)_auto] @min-[50rem]/mh:gap-x-4 @min-[50rem]/mh:py-2 @min-[56rem]/mh:grid-cols-[6.25rem_auto_minmax(6rem,0.8fr)_minmax(5.25rem,0.55fr)_minmax(5rem,0.5fr)_auto_minmax(12rem,2fr)_auto] @min-[72rem]/mh:gap-x-5">
          <MatchResult win={row.win} queue={row.queue} when={when} duration={fmtDuration(row.durationS)} className="hidden @min-[50rem]/mh:flex" />
          <ChampionLoadout champion={champion} spells={row.spells} keystone={row.keystone} secondary={row.secondary} size="md" icon={22} portraitClassName="@min-[50rem]/mh:h-14 @min-[50rem]/mh:w-14" iconsClassName="@max-[50rem]/mh:hidden" />
          {/* The champion, the role and the account it was played on */}
          <span className="min-w-0 leading-snug">
            <span className={cn("block truncate text-xs font-bold @min-[50rem]/mh:hidden", tone.text)}>
              {tone.word} <span className="font-medium text-fg-subtle">· {row.queue} · {when}</span>
            </span>
            <span className="block truncate text-md font-semibold text-fg">{champion.name}</span>
            <span className="flex min-w-0 items-center gap-1 text-xs text-fg-muted">
              {row.role ? <RoleIcon role={row.role as Role} className="h-3.5 w-3.5 shrink-0" /> : null}
              <span className="truncate">{row.role ? ROLE_LABELS[row.role as Role] : "Role not recorded"}</span>
              {account ? (
                <span className="ml-0.5 truncate rounded bg-surface-2 px-1.5 py-px text-2xs text-fg-subtle" title={`Played on ${row.riotId}`} data-testid="match-row-account">
                  {account}
                </span>
              ) : null}
            </span>
          </span>
          {/* KDA: the primary performance figure */}
          <span className="text-right leading-snug @min-[50rem]/mh:text-left">
            <span className="block whitespace-nowrap text-base font-semibold tabular-nums text-fg">{kda}</span>
            <span className={cn("block text-xs tabular-nums", row.perfect ? "text-good" : (row.kda ?? 0) >= 3 ? "text-fg-muted" : "text-fg-subtle")}>{ratio}</span>
            {/* The game's largest multikill, quietly (see MultikillTag). */}
            {row.multikill ? <MultikillTag size={row.multikill} className="mt-0.5" /> : null}
          </span>
          {/* Kill participation and the per-minute figures: secondary, one per line on wide cards */}
          <span className="col-span-3 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-fg-subtle @min-[36rem]/mh:col-span-2 @min-[50rem]/mh:col-span-1 @min-[50rem]/mh:flex-col @min-[50rem]/mh:gap-y-px">
            <Stat label="KP" value={kp} />
            <Stat label="CS/min" value={fmtNum(row.csPerMin)} />
            <Stat label="Dmg/min" value={fmtInt(row.damagePerMin)} />
          </span>
          {/* The build: its own row on phones, a compact block on wide cards (left to the match
              window when the list is too narrow for it beside the teams); on narrower cards it shares the
              figures' row when there is room, in one line */}
          <span className="col-span-3 flex items-center overflow-hidden @min-[36rem]/mh:col-span-1 @min-[36rem]/mh:justify-end @min-[50rem]/mh:hidden @min-[56rem]/mh:flex @min-[56rem]/mh:justify-start">{build}</span>
          {/* Both teams; without the full record, a quiet note instead of empty slots. */}
          <span className="col-span-3 min-w-0 @min-[50rem]/mh:col-span-1">
            {row.teams ? (
              <TeamComposition teams={row.teams} champion={champ} id={teamsId} />
            ) : (
              <span className="block text-xs text-fg-subtle" data-testid="match-teams-missing">
                {row.record === "missing" ? "Teams being collected" : "Teams not provided by Riot"}
              </span>
            )}
          </span>
          <ChevronRight className="hidden h-4 w-4 text-fg-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-fg motion-reduce:transition-none @min-[50rem]/mh:block" aria-hidden />
        </span>
      </div>
    </li>
  );
});

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex min-w-0 items-baseline gap-1 leading-snug">
      <span className="font-semibold tabular-nums text-fg">{value}</span>
      <span className="whitespace-nowrap">{label}</span>
    </span>
  );
}

/** A participant whose champion Riot did not record. */
const UNKNOWN_CHAMPION: PortraitChampion = { id: "unknown", name: "Unknown champion", portraitUrl: "" };

/** A champion missing from the static data, by id (kept per id so memoised cards stay equal). */
const noopSubscribe = () => () => {};

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
  // Interactive once hydrated (data-ready, which browser tests wait for). A link followed before
  // then is a full page load, and the page size chosen on arrival below would overtake it.
  const interactive = React.useSyncExternalStore(noopSubscribe, () => true, () => false);
  const [pending, startTransition] = React.useTransition();
  const listRef = React.useRef<HTMLDivElement>(null);
  const [open, setOpen] = React.useState<string | null>(params.get("match"));
  const returnFocus = React.useRef<HTMLElement | null>(null);
  const champ = (id: string): PortraitChampion => championsById[id] ?? { id, name: id, portraitUrl: "" };
  // One function for every card's team icons (stable while the champions are, so memoised cards stay equal).
  const champOrUnknown = React.useCallback((id: string | null): PortraitChampion => (id ? (championsById[id] ?? fallbackChampion(id)) : UNKNOWN_CHAMPION), [championsById]);

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
  // The chosen account's history on OP.GG, or the first account's when all are shown (never another
  // account's in place of a chosen one without a reliable address).
  const opgg = f.accountId ? (data.opgg.find((o) => o.accountId === f.accountId) ?? null) : (data.opgg[0] ?? null);

  return (
    <section className="space-y-3" aria-labelledby="match-history" data-testid="match-history" data-accounts-linked={data.accountsLinked} data-ready={interactive ? "true" : undefined}>
      {/* Browsing individual games comes first: the title, the filters (the scope they set is
          readable in them), when the history was last checked with Refresh, then the games. Season
          totals and averages belong to the profile's Overview, not here. */}
      <div className="space-y-2">
        {/* The same header as Overview and All Champions: the title and the switch to the players
            met (Encounters), with the filters beside them on wide screens and under them otherwise;
            then when the history was checked, and OP.GG. */}
        <div className="flex flex-col gap-2 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
            <h2 id="match-history" className="min-w-0 text-lg font-semibold text-fg">
              Match History
            </h2>
            <MatchViewSwitch view="games" basePath={basePath} filter={f} />
          </div>
          <div aria-busy={pending} className="min-w-0 xl:shrink-0">
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
        {sync || opgg ? (
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            {sync ? <MatchRefresh playerId={playerId} status={sync.status} canRefresh={sync.canRefresh} page={data.page} onShowNewest={() => go({ page: "1" })} /> : <span />}
            {opgg ? <OpggHistoryLink href={opgg.href} account={opgg.account} testId="match-history-opgg" /> : null}
          </div>
        ) : null}
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
              <MatchCard key={r.matchId} row={r} champion={championsById[r.championId] ?? fallbackChampion(r.championId)} champ={champOrUnknown} onOpen={openMatch} onPrefetch={prefetch} active={open === r.matchId} />
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
        Games {from}–{to} of {formatCount(total)}
      </span>
    </nav>
  );
}
