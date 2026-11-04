"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import type { PortraitChampion } from "@/components/champion-portrait";
import { MatchDetailCacheContext, createMatchDetailCache, type MatchDetailCache } from "@/components/match-history/match-detail-cache";
import { MatchExpansion, revealIfAbove, revealOpened } from "@/components/match-history/inline-match";
import { usePhone } from "@/components/ui/use-phone";
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
}
const TogetherOpenContext = React.createContext<TogetherOpen | null>(null);

const domId = (entry: string) => `together-${entry.replace(/[^\w-]/g, "-")}`;

/**
 * The open game in the address: replacing the current entry under a card (Back leaves the page, not
 * the game), a new entry on a phone, where the game takes the whole screen and Back closes it.
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
export function TogetherList({ entries, championsById, className, children }: { entries: Array<{ entry: string; matchId: string; playerId: string }>; /** For a phone's whole-screen game. */ championsById: Record<string, PortraitChampion>; className?: string; children: React.ReactNode }) {
  // A link to a game (?match= on arrival): it opens under its card when listed, and is brought into view.
  const params = useSearchParams();
  const [arrival] = React.useState(() => {
    const id = params.get("match");
    return id ? (entries.find((e) => e.matchId === id)?.entry ?? null) : null;
  });
  const [open, setOpen] = React.useState<string | null>(arrival);
  // Set when a card opens, so the card is brought into view once it has.
  const reveal = React.useRef<string | null>(arrival);
  const entriesRef = React.useRef(entries);
  React.useLayoutEffect(() => {
    entriesRef.current = entries;
  });
  /** The first listed side of a match named by the address. */
  const fromAddress = React.useCallback(() => {
    const id = new URLSearchParams(window.location.search).get("match");
    return id ? (entriesRef.current.find((e) => e.matchId === id)?.entry ?? null) : null;
  }, []);
  // Phones open a game as a whole screen of its own (the match window); Back closes it.
  const phone = usePhone();
  const phoneRef = React.useRef(phone);
  React.useLayoutEffect(() => {
    phoneRef.current = phone;
  });
  React.useEffect(() => {
    if (phone) void loadMatchWindow().catch(() => {});
  }, [phone]);
  /** The entry this list added to the browser's history when a phone opened it. */
  const pushed = React.useRef<string | null>(null);
  // Back and Forward follow the address: the game it names opens under its card when listed.
  React.useEffect(() => {
    const onPop = () => {
      const entry = fromAddress();
      if (pushed.current !== entry) pushed.current = null;
      setOpen(entry);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [fromAddress]);
  const cache = React.useMemo<MatchDetailCache>(() => createMatchDetailCache(), []);
  const openRef = React.useRef(open);
  React.useLayoutEffect(() => {
    openRef.current = open;
  });
  const toggle = React.useCallback((entry: string, matchId: string) => {
    const next = openRef.current === entry ? null : entry;
    setOpen(next);
    reveal.current = next;
    const push = !!next && phoneRef.current;
    pushed.current = push ? next : null;
    writeMatch(next ? matchId : null, push);
  }, []);
  const prefetch = React.useCallback((playerId: string, matchId: string) => void cache.load(playerId, matchId).catch(() => {}), [cache]);
  // A game the new filters no longer list is not open; one they still list stays open, and stays in
  // the address (the filters' links do not carry it).
  const shown = open && entries.some((e) => e.entry === open) ? open : null;
  React.useEffect(() => {
    const matchId = shown ? entries.find((e) => e.entry === shown)!.matchId : null;
    if (new URLSearchParams(window.location.search).get("match") !== matchId) writeMatch(matchId);
  }, [entries, shown]);
  React.useLayoutEffect(() => {
    if (!shown || reveal.current !== shown || phone) return;
    reveal.current = null;
    revealOpened(document.getElementById(domId(shown)));
  }, [shown, phone]);
  const value = React.useMemo<TogetherOpen>(() => ({ open: phone ? null : shown, toggle, prefetch }), [shown, phone, toggle, prefetch]);
  const windowed = phone && shown ? entries.find((e) => e.entry === shown)! : null;
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
        {windowed ? (
          <React.Suspense fallback={null}>
            <MatchDetailModal playerId={windowed.playerId} matchId={windowed.matchId} championsById={championsById} onClose={closeWindow} />
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
  return (
    // group/together: the card's chevron turns while its game is open (TogetherCard).
    <li id={id} className="group/together scroll-mt-0 lg:scroll-mt-3" data-expanded={expanded || undefined} {...data}>
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
          onClose={() => {
            list?.toggle(entry, matchId);
            requestAnimationFrame(() => {
              revealIfAbove(document.getElementById(id));
              button.current?.focus({ preventScroll: true });
            });
          }}
        />
      ) : null}
    </li>
  );
}
