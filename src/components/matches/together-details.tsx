"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { PortraitChampion } from "@/components/champion-portrait";
import { MatchDetailCacheContext, createMatchDetailCache, type MatchDetailCache } from "@/components/match-history/match-detail-cache";
import { MatchExpansion, holdInPlace, revealIfAbove, revealOpened, type GameNav } from "@/components/match-history/inline-match";
import { isPhone, usePhone } from "@/components/ui/use-phone";
import { isTyping, modalOpen } from "@/components/ui/posture";
import { cn } from "@/lib/cn";
import { useRowBudget } from "@/components/ui/fit-rows";
import { Pager } from "@/components/ui/pager";
import { rangeText, rangeWords } from "@/components/ui/paged-list";
import { useWorkspaceMarks, wsTierClass, type WorkspaceMarks } from "@/components/ui/workspace";
import { LIST_PER_MAX, forgetListPer, rememberListPer } from "@/lib/list-per";

/** A game either side of the workspace's page (the server's), for the game window's steps across the pages. */
export interface TogetherNeighbour {
  entry: string;
  matchId: string;
  playerId: string;
  said: string;
}

/** The one-screen workspace's pages of Team Matches, as the server drew them (app/(app)/matches/page.tsx). */
export interface TogetherPaging {
  /** Games a page (the row budget, from the address or the list's cookie); null in the flow (the first `limit` and Show more). */
  per: number | null;
  page: number;
  pages: number;
  /** The index of the page's first game on the whole list. */
  offset: number;
  perFrom: "address" | "cookie" | "default";
  /** A browser test's cap on the budget (server/demo/test-hooks.ts). */
  cap: number | null;
  before: TogetherNeighbour | null;
  after: TogetherNeighbour | null;
}

/** The workspace writes its budget to the address once the window has been at rest this long (each new size is a server render). */
const PER_SETTLE_MS = 250;
/** A card's height while none is drawn (about 120px: two members). */
const CARD_PROBE_REM = 7.5;
/** The first paint's cards by the window's height tier, before the page has measured (where neither the address nor the cookie gave a size). */
const FIRST_PAINT_TIERS = { gate: 1, mid: 2, tall: 3 } as const;
const GAME_WORDS = { one: "game", many: "games" } as const;
const noSubscribe = () => () => {};

interface TogetherPagingState {
  marks: WorkspaceMarks;
  /** The budget once measured, in the workspace (else null). */
  perPage: number | null;
  /** The page of the budget's size is drawn (the server's `per`). */
  paged: boolean;
  paging: TogetherPaging;
  total: number;
  cardRef: React.RefObject<HTMLDivElement | null>;
  listRef: React.RefObject<HTMLOListElement | null>;
  endRef: React.RefObject<HTMLDivElement | null>;
  /** Shows a page, and with `match` the game the window steps to on it (the address replaced). */
  goTo: (page: number, match?: string) => void;
  pending: boolean;
  live: string;
  turn: (page: number) => void;
  /** The first paint's tiers apply (a first visit, before the page has measured). */
  tiered: boolean;
}
const TogetherPagingContext = React.createContext<TogetherPagingState | null>(null);

/** The address with these changes (the list's own choices kept; a Show more's `limit` and an open game left out unless given). */
function withParams(change: Record<string, string | null>): string {
  const next = new URLSearchParams(window.location.search);
  next.delete("match");
  next.delete("limit");
  for (const [k, v] of Object.entries(change)) {
    if (v === null) next.delete(k);
    else next.set(k, v);
  }
  return `${window.location.pathname}${next.size ? `?${next.toString()}` : ""}`;
}

/**
 * Team Matches in the one-screen workspace (docs/RESPONSIVE.md, "One-screen desktop pages", Team Matches): the
 * section (data-workspace while the gate may hold) that holds the filters, the summary and the list, and the
 * list's pages. Its cards a page are the row budget (useRowBudget, by the cards' own heights: a card grows with
 * its members), written to the address as `per` once the window is at rest (the server slices its list: the
 * teams and the scores are read for that page's games only) and kept in the list's cookie for the next
 * visit's first paint. The pager stands on the filters' row (TogetherPager). The flow (phones, tablets,
 * touch, short windows, a larger text size) shows the first 20 and Show more, as it always has: a page size
 * the address or the cookie gave is dropped there.
 */
export function TogetherWorkspace({ paging, total, listKey, className, children }: { paging: TogetherPaging; total: number; /** What the list is (the filters): measured again when it changes. */ listKey: string; className?: string; children: React.ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const marks = useWorkspaceMarks();
  // Interactive once hydrated (data-ready, which browser tests wait for: the workspace's mark is then the page's own).
  const interactive = React.useSyncExternalStore(noSubscribe, () => true, () => false);
  const cardRef = React.useRef<HTMLDivElement>(null);
  const listRef = React.useRef<HTMLOListElement>(null);
  const endRef = React.useRef<HTMLDivElement>(null);
  const budget = useRowBudget(listRef, { footRef: endRef, cardRef, probeRem: CARD_PROBE_REM, mode: "cumulative", active: marks.paged && total > 0, observe: () => [cardRef.current], key: [total, listKey], cap: paging.cap });
  const perPage = marks.paged && budget !== null ? Math.min(LIST_PER_MAX, budget) : null;
  const replace = React.useCallback((url: string) => startTransition(() => router.replace(url, { scroll: false })), [router]);
  React.useEffect(() => {
    // The flow: a page size from the cookie is forgotten (the server drew the first 20 and Show more without it), one from the address dropped.
    if (marks.ws === false && paging.per !== null) {
      forgetListPer("together");
      if (paging.perFrom === "cookie") return startTransition(() => router.refresh());
      return replace(withParams({ per: null, page: null }));
    }
    if (perPage === null || perPage === paging.per || total === 0) return;
    const t = window.setTimeout(() => {
      rememberListPer("together", perPage);
      replace(withParams({ per: String(perPage), page: String(Math.floor(paging.offset / perPage) + 1) }));
    }, PER_SETTLE_MS);
    return () => window.clearTimeout(t);
  }, [perPage, paging.per, paging.offset, paging.perFrom, total, marks.ws, replace, router]);
  const goTo = React.useCallback((page: number, match?: string) => replace(withParams({ page: page > 1 ? String(page) : null, ...(match ? { match } : {}) })), [replace]);
  const [live, setLive] = React.useState("");
  const paged = perPage !== null && paging.per !== null;
  const turn = React.useCallback(
    (p: number) => {
      if (!paging.per || p < 1 || p > paging.pages) return;
      setLive(rangeWords(GAME_WORDS, (p - 1) * paging.per + 1, Math.min(total, p * paging.per), total));
      goTo(p);
    },
    [paging.per, paging.pages, total, goTo],
  );
  const value = React.useMemo<TogetherPagingState>(() => ({ marks, perPage, paged, paging, total, cardRef, listRef, endRef, goTo, pending, live, turn, tiered: paging.perFrom === "default" && perPage === null && marks.ws !== false }), [marks, perPage, paged, paging, total, goTo, pending, live, turn]);
  return (
    <TogetherPagingContext.Provider value={value}>
      <div className={cn("space-y-4 ws:flex ws:flex-1 ws:flex-col ws:gap-4 ws:space-y-0", className)} {...marks.attrs} data-testid="played-together" data-ready={interactive ? "true" : undefined}>
        {children}
      </div>
    </TogetherPagingContext.Provider>
  );
}

/** Team Matches' pager in the workspace, on the filters' row before Bookmarked (no line of its own): the range and the page buttons. */
export function TogetherPager() {
  const ctx = React.useContext(TogetherPagingContext);
  if (!ctx || ctx.marks.ws !== true || !ctx.paged || ctx.paging.pages <= 1) return null;
  const { paging, total } = ctx;
  const per = paging.per!;
  return (
    <div className="flex shrink-0 self-center" data-testid="together-pager-lead">
      <Pager
        layout="inline"
        label="Team match pages"
        page={paging.page}
        pages={paging.pages}
        onPage={ctx.turn}
        range={rangeText(GAME_WORDS, { from: paging.offset + 1, to: Math.min(total, paging.offset + per) }, paging.pages, total)}
        widest={`${total}–${total} of ${total}`}
        rangeId="together-pager-range"
        prevLabel="Newer games"
        nextLabel="Older games"
        disabled={ctx.pending}
        live={ctx.live}
        testId="together-pager"
        prevTestId="together-prev"
        nextTestId="together-next"
      />
    </div>
  );
}

/**
 * The match window, which only a phone opens from this list (wider screens open the game under its
 * card): loaded on demand, so tablets and desktops never download it, and fetched ahead on a phone
 * once the list is on screen, so the first game opens without waiting for it.
 */
const loadMatchWindow = () => import("@/components/match-history/match-detail");
const MatchDetailModal = React.lazy(() => loadMatchWindow().then((m) => ({ default: m.MatchDetailModal })));

/** Clicks on these inside a card do their own thing (a name, a bookmark). */
const OWN_ACTION = "a, button, input, select, textarea, summary, label";

interface TogetherOpen {
  /** The game open under its card: its entry (match and side), or null (always null on a phone and in the workspace, where the game opens in a window). */
  open: string | null;
  /** A card's place in the workspace's pages: its row attributes (ui/workspace.tsx's data contract), and a class (its first paint's tier, or hidden past the budget). */
  rowOf: (entry: string) => { attrs: Record<string, string | number | undefined>; className?: string };
  toggle: (entry: string, matchId: string) => void;
  prefetch: (playerId: string, matchId: string) => void;
  /** The open game's Previous and Next in the list (null at that end), by Match History's rules: a step replaces `?match=`. */
  navFor: (entry: string) => GameNav | null;
  /** The game open after Previous or Next: its card is held where the last one's header was, so it is not moved into view (InlineMatch's fit). */
  stepped: string | null;
}
const TogetherOpenContext = React.createContext<TogetherOpen | null>(null);

const domId = (entry: string) => `together-${entry.replace(/[^\w-]/g, "-")}`;

/**
 * The open game in the address (`?match=`), by the one history rule (ui/address-item.ts), as Match
 * History's: the first open pushes one entry, under its card as on a phone's whole screen, so Back
 * closes the game; another game replaces it; closing goes Back when this list pushed the entry.
 */
function writeMatch(matchId: string | null, push = false) {
  const next = new URLSearchParams(window.location.search);
  if (matchId) next.set("match", matchId);
  else next.delete("match");
  // No state of our own: Next.js keeps its router in step with the new address (as Match History does).
  const url = `${window.location.pathname}${next.size ? `?${next.toString()}` : ""}`;
  if (push) window.history.pushState(null, "", url);
  else window.history.replaceState(null, "", url);
}

/**
 * Team → Matches' list of games, which opens one game at a time under its card, as a player's
 * Match History does (MatchExpansion): the same breakdown, the same keyboard and the same way
 * back, and the list, its filters and the page's place stay as they were. The open game is in the
 * address (?match=), so a link to it opens it here, and Back and Forward follow it. Details the
 * list has loaded are kept (MatchDetailCache) while it is shown.
 */
export function TogetherList({ entries, total, offset = 0, championsById, className, children }: { /** The games the filters find, when more than the list shows ("Show more"): "Game 4 of 25 shown". */ total?: number; /** The index of the first entry on the whole list (the workspace's page). */ offset?: number; entries: Array<{ entry: string; matchId: string; playerId: string; /** "Victory on Gwen": said after Previous or Next, as "Game 4 of 10: Victory on Gwen". */ said?: string }>; /** For a phone's whole-screen game. */ championsById: Record<string, PortraitChampion>; className?: string; children: React.ReactNode }) {
  // The one-screen workspace's pages and its game window (TogetherWorkspace): every game opens in the window, which steps on across the pages.
  const ws = React.useContext(TogetherPagingContext);
  const workspace = ws?.marks.ws === true;
  // A step of the window across a page's end: the game of the next or previous page, open while that page is on its way.
  const [crossing, setCrossing] = React.useState<TogetherNeighbour | null>(null);
  if (crossing && entries.some((e) => e.entry === crossing.entry)) setCrossing(null);
  // A link to a game (?match= on arrival): it opens under its card when listed, and is brought into view.
  const params = useSearchParams();
  const [arrival] = React.useState(() => {
    const id = params.get("match");
    return id ? (entries.find((e) => e.matchId === id)?.entry ?? null) : null;
  });
  const [open, setOpen] = React.useState<string | null>(arrival);
  // Set when a card opens, so the card is brought into view once it has.
  const reveal = React.useRef<string | null>(arrival);
  const openRef = React.useRef(open);
  React.useLayoutEffect(() => {
    openRef.current = open;
  });
  const entriesRef = React.useRef(entries);
  const totalRef = React.useRef(total);
  React.useLayoutEffect(() => {
    totalRef.current = total;
  });
  React.useLayoutEffect(() => {
    entriesRef.current = entries;
  });
  /** The first listed side of a match named by the address. */
  const fromAddress = React.useCallback(() => {
    const id = new URLSearchParams(window.location.search).get("match");
    return id ? (entriesRef.current.find((e) => e.matchId === id)?.entry ?? null) : null;
  }, []);
  // A phone fetches the match window's code ahead, once the page is idle (it opens the games), so
  // the first game opens at once without adding to the page's start.
  React.useEffect(() => {
    if (!isPhone()) return;
    const load = () => void loadMatchWindow().catch(() => {});
    // Safari has no requestIdleCallback.
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(load, { timeout: 4000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(load, 2000);
    return () => window.clearTimeout(id);
  }, []);
  /** The game whose history entry this list added (the first open; a switch hands the entry on). */
  const pushed = React.useRef<string | null>(null);
  // Back and Forward follow the address: the game it names opens under its card when listed.
  React.useEffect(() => {
    const onPop = () => {
      const entry = fromAddress();
      if (pushed.current !== entry) pushed.current = null;
      const was = openRef.current;
      setOpen(entry);
      // Back closed a game under its card: the focus on that card (the last game viewed), as Close leaves it.
      if (!entry && was && !isPhone())
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            const li = document.getElementById(domId(was));
            revealIfAbove(li);
            li?.querySelector<HTMLElement>("[data-testid=together-open]")?.focus({ preventScroll: true });
          }),
        );
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [fromAddress]);
  const cache = React.useMemo<MatchDetailCache>(() => createMatchDetailCache(), []);
  // The game open after Previous or Next (TogetherOpen's stepped).
  const [stepped, setStepped] = React.useState<string | null>(null);
  const toggle = React.useCallback((entry: string, matchId: string) => {
    // The game open, if the list still shows it (one the filters no longer list is not open).
    const current = openRef.current && entriesRef.current.some((e) => e.entry === openRef.current) ? openRef.current : null;
    if (current === entry) {
      // Closed: Back when this list added the entry (the list follows the address), else the address without it.
      reveal.current = null;
      if (pushed.current === entry) {
        pushed.current = null;
        window.history.back();
        return;
      }
      setOpen(null);
      writeMatch(null);
      return;
    }
    setOpen(entry);
    setStepped(null);
    reveal.current = entry;
    if (current === null) {
      // Opened: one entry, at every width (before 20 Nov 2026 only a phone's, so Back from a game
      // under its card left Team Matches).
      pushed.current = entry;
      writeMatch(matchId, true);
      return;
    }
    // Another game in its place: the entry is replaced (one entry for the whole visit).
    if (pushed.current) pushed.current = entry;
    writeMatch(matchId);
  }, [setStepped]);
  const prefetch = React.useCallback((playerId: string, matchId: string) => void cache.load(playerId, matchId).catch(() => {}), [cache]);
  // Previous and Next, as in Match History: another game in the open one's place, the address
  // replaced (one entry for the whole visit), the new card's header held where the old one's was,
  // and which game it is said once ("Game 4 of 10: Victory on Gwen").
  const anchor = React.useRef<{ entry: string; top: number } | null>(null);
  const [said, setSaid] = React.useState("");
  const step = React.useCallback((entry: string) => {
    const list = entriesRef.current;
    const at = list.findIndex((e) => e.entry === entry);
    if (at < 0) {
      // The workspace's window at a page's end: the game either side of the page, its page shown behind the window.
      const n = ws?.paging.after?.entry === entry ? ws.paging.after : ws?.paging.before?.entry === entry ? ws.paging.before : null;
      if (!n || !ws) return;
      setCrossing(n);
      setOpen(entry);
      if (pushed.current) pushed.current = entry;
      ws.goTo(ws.paging.page + (n === ws.paging.after ? 1 : -1), n.matchId);
      return;
    }
    const was = openRef.current ? document.getElementById(domId(openRef.current)) : null;
    anchor.current = was && !isPhone() ? { entry, top: was.getBoundingClientRect().top } : null;
    reveal.current = null;
    setOpen(entry);
    setStepped(entry);
    if (pushed.current) pushed.current = entry;
    writeMatch(list[at]!.matchId);
    // The phone's window says it itself (MatchDetailModal), once the game has loaded.
    if (!isPhone() && ws?.marks.ws !== true) setSaid(`Game ${at + 1} of ${list.length}${totalRef.current !== undefined && totalRef.current > list.length ? " shown" : ""}${list[at]!.said ? `: ${list[at]!.said}` : ""}`);
  }, [setStepped, ws]);
  const navFor = React.useCallback(
    (entry: string): GameNav | null => {
      const i = entries.findIndex((e) => e.entry === entry);
      return i < 0 ? null : { prev: entries[i - 1]?.entry ?? null, next: entries[i + 1]?.entry ?? null, go: step };
    },
    [entries, step],
  );
  // A game the new filters no longer list is not open; one they still list stays open, and stays in
  // the address (the filters' links do not carry it). A window's step across a page's end stays open while its page comes.
  const shown = open && (entries.some((e) => e.entry === open) || crossing?.entry === open) ? open : null;
  const shownEntry = shown ? (entries.find((e) => e.entry === shown) ?? crossing) : null;
  // Phones open a game as a whole screen of its own (the match window); Back closes it. Asked only
  // while a game is open, so the list does not render twice on a phone once it has hydrated.
  const phone = usePhone(shown !== null);
  React.useEffect(() => {
    // A step across a page's end writes its own address (the new page and the game) as the page comes.
    if (crossing) return;
    const matchId = shownEntry ? shownEntry.matchId : null;
    if (new URLSearchParams(window.location.search).get("match") !== matchId) writeMatch(matchId);
  }, [entries, shownEntry, crossing]);
  // After a step, the new card's top where the old one's was (the old game's breakdown closing above it would move it).
  React.useLayoutEffect(() => {
    const a = anchor.current;
    if (!shown || !a || a.entry !== shown) return;
    anchor.current = null;
    const el = document.getElementById(domId(shown));
    if (!el) return;
    return holdInPlace(el, a.top);
  }, [shown]);
  React.useLayoutEffect(() => {
    if (!shown || reveal.current !== shown || phone) return;
    reveal.current = null;
    revealOpened(document.getElementById(domId(shown)));
  }, [shown, phone]);
  // A card's place in the workspace's pages: its row attributes (data-ws-row, its key, its place on the whole list), its first
  // paint's tier, and hidden past the budget while the page of that size is on its way.
  const paged = !!ws?.paged;
  const tiered = !!ws?.tiered;
  const budget = ws?.perPage ?? null;
  const rowOf = React.useCallback(
    (entry: string) => {
      const i = entries.findIndex((e) => e.entry === entry);
      const attrs = { "data-ws-row": "", "data-row-key": entry, "aria-posinset": paged && total !== undefined ? offset + i + 1 : undefined, "aria-setsize": paged ? total : undefined };
      const className = tiered ? wsTierClass(i, FIRST_PAINT_TIERS) : budget !== null && i >= budget ? "hidden" : undefined;
      return { attrs, className };
    },
    [entries, paged, total, offset, tiered, budget],
  );
  const value = React.useMemo<TogetherOpen>(() => ({ open: phone || workspace ? null : shown, rowOf, toggle, prefetch, navFor, stepped }), [shown, phone, workspace, rowOf, toggle, prefetch, navFor, stepped]);
  const windowed = (phone || workspace) && shownEntry ? shownEntry : null;
  const windowAt = windowed ? entries.indexOf(windowed as (typeof entries)[number]) : -1;
  // The workspace's window steps through the whole list (the neighbours at a page's ends) and says where the game is on it; a phone's, through the page.
  const windowNav = !windowed
    ? null
    : workspace && ws
      ? windowAt >= 0
        ? { prev: entries[windowAt - 1]?.entry ?? ws.paging.before?.entry ?? null, next: entries[windowAt + 1]?.entry ?? ws.paging.after?.entry ?? null, go: step, index: offset + windowAt, total: total ?? entries.length }
        : { prev: null, next: null, go: step, index: windowed === ws.paging.after ? offset + entries.length : offset - 1, total: total ?? entries.length }
      : windowAt >= 0
        ? { ...navFor(windowed.entry)!, index: windowAt, total: entries.length }
        : null;
  // The window closed (✕, Back): the list on the last game viewed, and the focus on its card.
  const lastWindowed = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (windowed) {
      lastWindowed.current = windowed.entry;
      return;
    }
    const last = lastWindowed.current;
    if (!last) return;
    lastWindowed.current = null;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const li = document.getElementById(domId(last));
        if (!li) return;
        revealIfAbove(li);
        const r = li.getBoundingClientRect();
        if (r.top > window.innerHeight || r.bottom < 0) li.scrollIntoView({ block: "center", behavior: "instant" });
        li.querySelector<HTMLElement>("[data-testid=together-open]")?.focus({ preventScroll: true });
      }),
    );
  }, [windowed]);
  const closeWindow = () => {
    setCrossing(null);
    // Opened from its card: closing is Back (the list follows the address). Opened by a link: no entry of ours to leave.
    if (pushed.current && pushed.current === shown) {
      pushed.current = null;
      window.history.back();
      return;
    }
    setOpen(null);
    writeMatch(null);
  };
  return (
    <MatchDetailCacheContext.Provider value={cache}>
      <TogetherOpenContext.Provider value={value}>
        {/* The list: in the workspace the frame's remainder, its complete cards a page (the region), its foot the window's. */}
        <div ref={ws?.cardRef} className="relative min-w-0 ws:flex ws:flex-1 ws:flex-col" data-ws-card="" data-testid="together-region" {...(paged && ws ? { "data-ws-region": "together", "data-per": ws.perPage === ws.paging.per ? ws.paging.per! : undefined, "data-page": ws.paging.page, "data-pages": ws.paging.pages, "data-total": total } : {})}>
          <ol ref={ws?.listRef} className={className} data-testid="together-list" aria-describedby={paged && ws && ws.paging.pages > 1 ? "together-pager-range" : undefined}>
            {children}
          </ol>
          <div ref={ws?.endRef} aria-hidden className="mt-auto" />
        </div>
        <span className="sr-only" aria-live="polite" data-testid="together-said">
          {said}
        </span>
        {windowed ? (
          <React.Suspense fallback={null}>
            <MatchDetailModal playerId={windowed.playerId} matchId={windowed.matchId} championsById={championsById} onClose={closeWindow} nav={windowNav} workspace={workspace && !phone} />
          </React.Suspense>
        ) : null}
      </TogetherOpenContext.Provider>
    </MatchDetailCacheContext.Provider>
  );
}

/**
 * A Team Matches game card that opens the game under it: the same breakdown My Profile → Match
 * History opens under its cards (Scoreboard, Analysis, Timeline, Build, possible groups), read from
 * one member's stored history. As there: a click anywhere on the card toggles it except on a link
 * or a control (member names open their profile, other players' names their OP.GG page, the
 * bookmark toggles), one button behind the content is the card for the keyboard and screen readers,
 * and a mouse press starts loading the game before the click lands.
 */
export function TogetherCardFrame({ entry, playerId, matchId, championsById, label, className, children, ...data }: { entry: string; playerId: string; matchId: string; championsById: Record<string, PortraitChampion>; label: string; className?: string; children: React.ReactNode } & Record<`data-${string}`, string | number | undefined>) {
  const list = React.useContext(TogetherOpenContext);
  const expanded = list?.open === entry;
  const row = list?.rowOf(entry);
  const button = React.useRef<HTMLButtonElement>(null);
  const id = domId(entry);
  const regionId = `${id}-details`;
  const champ = React.useCallback((c: string | null): PortraitChampion => (c ? (championsById[c] ?? { id: c, name: c, portraitUrl: "" }) : { id: "unknown", name: "Unknown champion", portraitUrl: "" }), [championsById]);
  // Closed from the game (Close, Escape): the focus back on the card, and with Close the card back on
  // the screen if it went up under what is pinned, once the game is gone. Closing goes Back when the
  // list added the game's entry, so that is when the address has followed, a moment after the press.
  const closing = React.useRef<"close" | "escape" | null>(null);
  React.useLayoutEffect(() => {
    if (expanded || !closing.current) return;
    const how = closing.current;
    closing.current = null;
    if (how === "close") revealIfAbove(document.getElementById(id));
    button.current?.focus({ preventScroll: true });
  }, [expanded, id]);
  return (
    // group/together: the card's chevron turns while its game is open (TogetherCard).
    <li
      id={id}
      className={cn("group/together scroll-mt-0 lg:scroll-mt-3", row?.className)}
      {...row?.attrs}
      data-expanded={expanded || undefined}
      // Escape, with the focus anywhere in the open game, closes it and returns the focus to the card.
      onKeyDown={(e) => {
        if (!expanded || e.key !== "Escape" || e.defaultPrevented || modalOpen() || isTyping(e.target)) return;
        e.preventDefault();
        closing.current = "escape";
        list?.toggle(entry, matchId);
      }}
      {...data}
    >
      <div
        className={cn("group cursor-pointer", className, expanded && "rounded-b-none border-b-border/40")}
        onClick={(e) => {
          const own = (e.target as Element).closest(OWN_ACTION);
          if (own && own !== button.current) return;
          button.current!.focus({ preventScroll: true });
          list?.toggle(entry, matchId);
        }}
        // A mouse press starts loading the game before the click lands (not touch: a finger that goes
        // down on a card is as often starting a scroll).
        onPointerDown={(e) => {
          if (!expanded && e.pointerType === "mouse" && e.button === 0 && !(e.target as Element).closest(OWN_ACTION)) list?.prefetch(playerId, matchId);
        }}
        data-testid="together-card"
      >
        <button
          ref={button}
          type="button"
          className="absolute inset-0 z-0 rounded-[inherit] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
          aria-label={`${label}. ${expanded ? "Hide" : "Show"} the match details.`}
          aria-expanded={expanded}
          aria-controls={expanded ? regionId : undefined}
          data-testid="together-open"
        />
        {children}
      </div>
      {expanded ? (
        <MatchExpansion
          id={regionId}
          label={`${label}: match details`}
          playerId={playerId}
          matchId={matchId}
          champ={champ}
          nav={list?.navFor(entry) ?? null}
          fit={list?.stepped !== entry}
          onClose={() => {
            closing.current = "close";
            list?.toggle(entry, matchId);
          }}
        />
      ) : null}
    </li>
  );
}
