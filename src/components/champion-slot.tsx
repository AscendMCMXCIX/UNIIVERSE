"use client";

import * as React from "react";
import { Plus, X } from "lucide-react";
import { ChampionPortrait } from "./champion-portrait";
import { ChampionPicker, type PickerChampion } from "./champion-picker";
import { cn } from "@/lib/cn";

export interface ChampionSlotProps {
  championId: string | null;
  champions: PickerChampion[];
  championsById: Map<string, PickerChampion>;
  disabledIds?: ReadonlySet<string>;
  onChange: (championId: string | null) => void;
  size?: "md" | "lg";
  label?: string;
  disabled?: boolean;
  /** Champions offered first in the picker, in this order (e.g. the player's main pool). */
  preferredIds?: readonly string[];
  preferredLabel?: string;
}

/** Click to open the picker; portrait fills the slot; small × removes it. */
export function ChampionSlot({ championId, champions, championsById, disabledIds, onChange, size = "lg", label, disabled, preferredIds, preferredLabel }: ChampionSlotProps) {
  const [open, setOpen] = React.useState(false);
  const preferred = React.useMemo(() => (preferredIds?.length ? new Set(preferredIds) : undefined), [preferredIds]);
  const champion = championId ? championsById.get(championId) ?? { id: championId, name: championId, portraitUrl: "" } : null;
  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={cn("group relative block rounded-md focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-default", !champion && "border border-dashed border-border-strong hover:border-accent")}
        title={champion ? `${champion.name} — click to replace` : label ?? "Add champion"}
      >
        {champion ? (
          <ChampionPortrait champion={champion} size={size === "lg" ? "lg" : "md"} className="border-0" />
        ) : (
          <div className={cn("grid place-content-center text-fg-subtle group-hover:text-accent", size === "lg" ? "h-16 w-16" : "h-12 w-12")}>
            <Plus className="h-4 w-4" />
          </div>
        )}
      </button>
      {champion && !disabled ? (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="absolute -right-2 -top-2 grid h-6 w-6 place-content-center rounded-full border border-border bg-surface text-fg-muted hover:text-bad max-md:-right-2.5 max-md:-top-2.5 max-md:h-7 max-md:w-7 pointer-coarse:-right-2.5 pointer-coarse:-top-2.5 pointer-coarse:h-7 pointer-coarse:w-7"
          aria-label={`Remove ${champion.name}`}
        >
          <X className="h-3 w-3" />
        </button>
      ) : null}
      <ChampionPicker
        open={open}
        champions={champions}
        disabledIds={disabledIds}
        highlightIds={preferred}
        highlightLabel={preferredLabel}
        onClose={() => setOpen(false)}
        onSelect={(id) => {
          onChange(id);
          setOpen(false);
        }}
      />
    </div>
  );
}
