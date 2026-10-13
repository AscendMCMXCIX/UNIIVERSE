"use client";

import * as React from "react";
import { X } from "lucide-react";
import { ChampionPortrait, type PortraitChampion } from "./champion-portrait";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { cn } from "@/lib/cn";

export interface PickerChampion extends PortraitChampion {
  isNew?: boolean;
}

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

export function normalise(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Visual champion selector: search box + portrait grid. Keyboard friendly (type to filter,
 * Enter selects the first match, Escape closes). Full-screen on phones, a centred dialog from sm up.
 */
export function ChampionPicker({ open, title = "Select champion", champions, disabledIds, highlightIds, highlightLabel, onSelect, onClose }: ChampionPickerProps) {
  const [query, setQuery] = React.useState("");
  const close = () => {
    setQuery("");
    onClose();
  };
  const select = (id: string) => {
    setQuery("");
    onSelect(id);
  };

  React.useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const q = normalise(query);
  const filtered = React.useMemo(() => {
    const list = q ? champions.filter((c) => normalise(c.name).includes(q) || normalise(c.id).includes(q)) : champions;
    if (!highlightIds || highlightIds.size === 0) return list;
    return [...list].sort((a, b) => Number(highlightIds.has(b.id)) - Number(highlightIds.has(a.id)));
  }, [champions, q, highlightIds]);

  if (!open) return null;

  const first = filtered.find((c) => !disabledIds?.has(c.id));

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 sm:p-4" onMouseDown={close} role="dialog" aria-modal="true" aria-label={title}>
      <div className="flex h-dvh w-full flex-col border-border bg-surface pt-safe pb-safe shadow-2xl sm:h-auto sm:max-h-[85vh] sm:max-w-4xl sm:rounded-lg sm:border" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-border px-3 py-2 sm:gap-3 sm:px-4 sm:py-3">
          <div className="hidden text-sm font-semibold sm:block">{title}</div>
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search champion…"
            aria-label={title}
            className="min-w-0 flex-1 sm:ml-auto sm:max-w-xs sm:flex-none"
            onKeyDown={(e) => {
              if (e.key === "Escape") close();
              if (e.key === "Enter" && first) select(first.id);
            }}
          />
          <Button variant="ghost" size="sm" onClick={close} aria-label="Close" className="h-11 w-11 shrink-0 px-0 sm:h-9 sm:w-9">
            <X className="h-5 w-5" />
          </Button>
        </div>
        {highlightIds && highlightIds.size > 0 ? <div className="px-3 pt-2 text-[11px] uppercase tracking-wider text-fg-subtle sm:px-4">{highlightLabel ?? "In pool first"}</div> : null}
        <div className="grid flex-1 grid-cols-[repeat(auto-fill,minmax(68px,1fr))] gap-1.5 overflow-y-auto p-2 sm:grid-cols-[repeat(auto-fill,minmax(72px,1fr))] sm:gap-2 sm:p-4">
          {filtered.map((c) => {
            const disabled = disabledIds?.has(c.id) ?? false;
            const highlighted = highlightIds?.has(c.id) ?? false;
            return (
              <button
                key={c.id}
                type="button"
                disabled={disabled}
                onClick={() => select(c.id)}
                className={cn(
                  "group flex min-h-[88px] flex-col items-center gap-1 rounded-md p-1 text-center transition-colors hover:bg-surface-2 disabled:cursor-not-allowed",
                  highlighted && "ring-1 ring-accent/60",
                )}
                title={c.name}
              >
                <ChampionPortrait champion={c} size="lg" dimmed={disabled} />
                <span className={cn("w-full truncate text-[11px] leading-tight", disabled ? "text-fg-subtle" : "text-fg-muted group-hover:text-fg")}>{c.name}</span>
                {c.isNew ? <span className="text-[9px] uppercase tracking-wider text-accent">new</span> : null}
              </button>
            );
          })}
          {filtered.length === 0 ? <div className="col-span-full py-8 text-center text-sm text-fg-muted">No champion matches “{query}”.</div> : null}
        </div>
      </div>
    </div>
  );
}
