"use client";

import * as React from "react";
import { ChevronRight } from "lucide-react";
import type { PortraitChampion } from "@/components/champion-portrait";
import { MatchDetailDrawer } from "@/components/match-history/match-detail";

/** Opens the full match (both teams, items, runes) from one member's stored history. */
export function TogetherDetails({ playerId, matchId, championsById }: { playerId: string; matchId: string; championsById: Record<string, PortraitChampion> }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-border px-2.5 text-xs font-medium text-fg-muted hover:border-border-strong hover:text-fg pointer-coarse:min-h-11" data-testid="together-details">
        Details <ChevronRight className="h-3.5 w-3.5" aria-hidden />
      </button>
      {open ? <MatchDetailDrawer playerId={playerId} matchId={matchId} championsById={championsById} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
