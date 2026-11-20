"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import type { PortraitChampion } from "@/components/champion-portrait";
import { MatchDetailCacheContext, createMatchDetailCache, type MatchDetailCache } from "@/components/match-history/match-detail-cache";
import { MatchExpansion, revealIfAbove, revealOpened, type GameNav } from "@/components/match-history/inline-match";
import { isPhone, usePhone } from "@/components/ui/use-phone";
import { isTyping, modalOpen } from "@/components/ui/posture";
import { cn } from "@/lib/cn";

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
  /** The game open under its card: its entry (match and side), or null (always null on a phone, where the game takes the whole screen). */
  open: string | null;
  toggle: (entry: string, matchId: string) => void;
  prefetch: (playerId: string, matchId: string) => void;
  /** The open game's Previous and Next in the list (null at that end), by Match History's rules: a step replaces `?match=`. */
  navFor: (entry: string) => GameNav | null;
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
export function TogetherList({ entries, total, championsById, className, children }: { /** The games the filters find, when more than the list shows ("Show more"): "Game 4 of 25 shown". */ total?: number; entries: Array<{ entry: string; matchId: string; playerId: string; /** "Victory on Gwen": said after Previous or Next, as "Game 4 of 10: Victory on Gwen". */ said?: string }>; /** For a phone's whole-screen game. */ championsById: Record<string, PortraitChampion>; className?: string; children: React.ReactNode }) {
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
  }, []);
  const prefetch = React.useCallback((playerId: string, matchId: string) => void cache.load(playerId, matchId).catch(() => {}), [cache]);
  // Previous and Next, as in Match History: another game in the open one's place, the address
  // replaced (one entry for the whole visit), the new card's header held where the old one's was,
  // and which game it is said once ("Game 4 of 10: Victory on Gwen").
  const anchor = React.useRef<{ entry: string; top: number } | null>(null);
  const [said, setSaid] = React.useState("");
  const step = React.useCallback((entry: string) => {
    const list = entriesRef.current;
    const at = list.findIndex((e) => e.entry === entry);
    if (at < 0) return;
    const was = openRef.current ? document.getElementById(domId(openRef.current)) : null;
    anchor.current = was && !isPhone() ? { entry, top: was.getBoundingClientRect().top } : null;
    reveal.current = null;
    setOpen(entry);
    if (pushed.current) pushed.current = entry;
    writeMatch(list[at]!.matchId);
    // The phone's window says it itself (MatchDetailModal), once the game has loaded.
    if (!isPhone()) setSaid(`Game ${at + 1} of ${list.length}${totalRef.current !== undefined && totalRef.current > list.length ? " shown" : ""}${list[at]!.said ? `: ${list[at]!.said}` : ""}`);
  }, []);
  const navFor = React.useCallback(
    (entry: string): GameNav | null => {
      const i = entries.findIndex((e) => e.entry === entry);
      return i < 0 ? null : { prev: entries[i - 1]?.entry ?? null, next: entries[i + 1]?.entry ?? null, go: step };
    },
    [entries, step],
  );
  // A game the new filters no longer list is not open; one they still list stays open, and stays in
  // the address (the filters' links do not carry it).
  const shown = open && entries.some((e) => e.entry === open) ? open : null;
  // Phones open a game as a whole screen of its own (the match window); Back closes it. Asked only
  // while a game is open, so the list does not render twice on a phone once it has hydrated.
  const phone = usePhone(shown !== null);
  React.useEffect(() => {
    const matchId = shown ? entries.find((e) => e.entry === shown)!.matchId : null;
    if (new URLSearchParams(window.location.search).get("match") !== matchId) writeMatch(matchId);
  }, [entries, shown]);
  // After a step, the new card's top where the old one's was (the old game's breakdown closing above it would move it).
  React.useLayoutEffect(() => {
    const a = anchor.current;
    if (!shown || !a || a.entry !== shown) return;
    anchor.current = null;
    const el = document.getElementById(domId(shown));
    if (!el) return;
    const hold = () => {
      const off = el.getBoundingClientRect().top - a.top;
      if (Math.abs(off) > 0.5) window.scrollBy({ top: off, behavior: "instant" });
    };
    hold();
    let frames = 0;
    let raf = 0;
    const stop = () => {
      cancelAnimationFrame(raf);
      for (const t of ["wheel", "touchstart", "keydown", "pointerdown"]) window.removeEventListener(t, stop);
    };
    const tick = () => {
      hold();
      if (++frames < 30) raf = requestAnimationFrame(tick);
      else stop();
    };
    raf = requestAnimationFrame(tick);
    for (const t of ["wheel", "touchstart", "keydown", "pointerdown"]) window.addEventListener(t, stop, { passive: true, once: true });
    return stop;
  }, [shown]);
  React.useLayoutEffect(() => {
    if (!shown || reveal.current !== shown || phone) return;
    reveal.current = null;
    revealOpened(document.getElementById(domId(shown)));
  }, [shown, phone]);
  const value = React.useMemo<TogetherOpen>(() => ({ open: phone ? null : shown, toggle, prefetch, navFor }), [shown, phone, toggle, prefetch, navFor]);
  const windowed = phone && shown ? entries.find((e) => e.entry === shown)! : null;
  const windowAt = windowed ? entries.indexOf(windowed) : -1;
  const windowNav = windowed && windowAt >= 0 ? { ...navFor(windowed.entry)!, index: windowAt, total: entries.length } : null;
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
        <ol className={className} data-testid="together-list">
          {children}
        </ol>
        <span className="sr-only" aria-live="polite" data-testid="together-said">
          {said}
        </span>
        {windowed ? (
          <React.Suspense fallback={null}>
            <MatchDetailModal playerId={windowed.playerId} matchId={windowed.matchId} championsById={championsById} onClose={closeWindow} nav={windowNav} />
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
      className="group/together scroll-mt-0 lg:scroll-mt-3"
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
          onClose={() => {
            closing.current = "close";
            list?.toggle(entry, matchId);
          }}
        />
      ) : null}
    </li>
  );
}
