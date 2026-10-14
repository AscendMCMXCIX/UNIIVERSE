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
export function ChampionPicker({ open, title = "Select champion", champions, disabledIds, highlightIds, onSelect, onClose }: ChampionPickerProps) {
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
  const ordered = React.useMemo(() => (highlightIds && highlightIds.size > 0 ? [...champions].sort((a, b) => Number(highlightIds.has(b.id)) - Number(highlightIds.has(a.id))) : champions), [champions, highlightIds]);
  if (!open) return null;
  return (
    <div className="fade-in fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm sm:p-4" onMouseDown={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className="flex h-dvh w-full flex-col border-border bg-bg-elevated pt-safe pb-safe shadow-2xl sm:h-[min(80vh,720px)] sm:max-w-4xl sm:rounded-xl sm:border" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close" className="h-11 w-11 shrink-0 px-0 sm:h-9 sm:w-9">
            <X className="h-5 w-5" />
          </Button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col p-3 sm:p-4">
          <ChampionGrid champions={ordered} disabledIds={disabledIds} disabledReason="already chosen" onPick={onSelect} maxHeight="fill" autoFocus />
        </div>
      </div>
    </div>
  );
}
