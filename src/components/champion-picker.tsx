"use client";

import * as React from "react";
import { X } from "lucide-react";
import type { PickerChampion } from "./champions/types";
import { ChampionGrid } from "./champions/champion-grid";
import { Button } from "./ui/button";

export type { PickerChampion } from "./champions/types";
export { normalise } from "./champions/types";

export interface ChampionPickerProps {
  open: boolean;
  title?: string;
  champions: PickerChampion[];
  /** Champions that cannot be selected (already used), shown dimmed. */
  disabledIds?: ReadonlySet<string>;
  /** Champions to show first (e.g. recommended / in-pool). */
  highlightIds?: ReadonlySet<string>;
  highlightLabel?: string;
  onSelect: (championId: string) => void;
  onClose: () => void;
}

/**
 * Single-champion selector in a dialog (journal entries, focus champions): the shared champion
 * grid with search and role filters. Full-screen on phones, a centred dialog from sm up.
 */
export function ChampionPicker({ open, title = "Select champion", champions, disabledIds, highlightIds, highlightLabel, onSelect, onClose }: ChampionPickerProps) {
  React.useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);
  // Highlighted champions first, in the order given (a pool's preference order).
  const ordered = React.useMemo(() => {
    if (!highlightIds || highlightIds.size === 0) return champions;
    const order = new Map([...highlightIds].map((id, i) => [id, i]));
    return [...champions].sort((a, b) => (order.get(a.id) ?? Infinity) - (order.get(b.id) ?? Infinity));
  }, [champions, highlightIds]);
  if (!open) return null;
  return (
    <div className="fade-in fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm sm:p-4 short:p-0" onMouseDown={onClose} role="dialog" aria-modal="true" aria-label={title}>
      {/* Phones and short windows (a phone held sideways): the whole screen; otherwise a centred window. */}
      <div className="flex h-dvh w-full flex-col border-border bg-bg-elevated px-safe pt-safe pb-safe shadow-2xl sm:h-[min(80vh,720px)] sm:max-w-4xl sm:rounded-panel sm:border short:h-dvh short:max-w-none short:rounded-none short:border-0" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3 short:py-2">
          <h2 className="text-base font-semibold">{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close" className="h-9 w-9 shrink-0 px-0 pointer-coarse:h-11 pointer-coarse:w-11">
            <X className="h-5 w-5" />
          </Button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col p-3 sm:p-4">
          <ChampionGrid champions={ordered} disabledIds={disabledIds} disabledReason="already chosen" onPick={onSelect} prioritisedIds={highlightIds} prioritisedLabel={highlightLabel} maxHeight="fill" autoFocus progressive />
        </div>
      </div>
    </div>
  );
}
