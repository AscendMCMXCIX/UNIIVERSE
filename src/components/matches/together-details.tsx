"use client";

import * as React from "react";
import type { PortraitChampion } from "@/components/champion-portrait";
import { MatchDetailModal } from "@/components/match-history/match-detail";
import { cn } from "@/lib/cn";

/** Clicks on these inside a card do their own thing (a name, a bookmark). */
const OWN_ACTION = "a, button, input, select, textarea, summary, label";

/**
 * A Team Matches game card that opens the match window: the same breakdown My Profile → Match
 * History opens under its cards (both teams, analysis, timeline, build, possible groups), read from
 * one member's stored history. As there: a click anywhere on the card opens it except on a link or
 * a control (member names open their profile, other players' names their OP.GG page, the bookmark
 * toggles), and one button behind the content is the card for the keyboard and screen readers.
 * Closing returns the focus to that button.
 */
export function TogetherCardFrame({ playerId, matchId, championsById, label, className, children, ...data }: { playerId: string; matchId: string; championsById: Record<string, PortraitChampion>; label: string; className?: string; children: React.ReactNode } & Record<`data-${string}`, string | number | undefined>) {
  const [open, setOpen] = React.useState(false);
  const button = React.useRef<HTMLButtonElement>(null);
  const close = React.useCallback(() => {
    setOpen(false);
    requestAnimationFrame(() => button.current?.focus({ preventScroll: true }));
  }, []);
  return (
    <li
      className={cn("group cursor-pointer", className, open && "ring-2 ring-accent")}
      onClick={(e) => {
        // The match window is a <dialog> inside the card: its own clicks (and its backdrop) are not the card's.
        if ((e.target as Element).closest("dialog")) return;
        const own = (e.target as Element).closest(OWN_ACTION);
        if (own && own !== button.current) return;
        button.current!.focus({ preventScroll: true });
        setOpen(true);
      }}
      {...data}
    >
      <button ref={button} type="button" className="absolute inset-0 z-0 rounded-[inherit] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent" aria-label={`${label}. Open the match details.`} aria-haspopup="dialog" data-testid="together-open" />
      {children}
      {open ? <MatchDetailModal playerId={playerId} matchId={matchId} championsById={championsById} onClose={close} /> : null}
    </li>
  );
}
