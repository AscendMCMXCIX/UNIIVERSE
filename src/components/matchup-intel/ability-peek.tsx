"use client";

import * as React from "react";
import { PanelRightOpen } from "lucide-react";
import { Peek, usePeek, type PeekControl } from "@/components/ui/peek";
import { cn } from "@/lib/cn";

/*
  An ability's full detail in the overlay kit's Peek (docs/DESIGN_SYSTEM.md §7, "Peek";
  docs/MATCHUP_INTEL.md, "The lane plan"): every ability on the page (the enemies' cooldown strips and
  your side's kits) opens its whole reference, the cooldown in full and where it comes from, every
  fact with its source or quoted clause, the notes' longer words and Riot's description, in a panel
  docked at the right edge on a wider screen, the page staying live beside it, or a window on a touch
  phone or in a short window. The ability is in the page's address (`?ability=Mordekaiser.Q`) under the
  one history rule: the first open pushes one entry, switching replaces it, and Back, Escape or ✕
  close it; ↑/↓ (J/K) and ‹ › step through the page's abilities in their order (the enemy's P to R
  first). Nothing is fetched: each body is rendered on the server with the page and handed in.
*/

export interface AbilityPeekItem {
  /** "Mordekaiser.Q": the champion's id and the key. */
  id: string;
  /** The ability's name, the panel's title. */
  title: string;
  /** "Mordekaiser · Q", under the title. */
  description: string;
  body: React.ReactNode;
}

const PeekContext = React.createContext<PeekControl | null>(null);

/** The page's abilities and their Peek: the opener buttons below it read it from context. */
export function AbilityPeekProvider({ items, initial = null, children }: { items: readonly AbilityPeekItem[]; initial?: string | null; children: React.ReactNode }) {
  const ids = React.useMemo(() => items.map((i) => i.id), [items]);
  const peek = usePeek({ param: "ability", ids, initial });
  const shown = peek.id ? (items.find((i) => i.id === peek.id) ?? null) : null;
  return (
    <PeekContext.Provider value={peek}>
      {children}
      <Peek peek={peek} label="Ability" title={shown ? shown.title : ""} itemKey={shown ? shown.id : null} windowSize="standard" testId="ability-peek">
        {shown ? (
          <div data-testid="ability-details-body">
            <p className="mb-3 text-sm text-fg-muted" data-testid="ability-peek-description">
              {shown.description}
            </p>
            {shown.body}
          </div>
        ) : null}
      </Peek>
    </PeekContext.Provider>
  );
}

/**
 * The button that opens an ability's Peek: an icon (its name "Details: Obliterate, Q"), or words
 * (`children`). A plain button: with no page code yet it does nothing, as any control in a window.
 * The selected one is marked as a Peek's row is.
 */
export function AbilityPeekButton({ id, name, children, className, testId = "ability-details" }: { id: string; name: string; children?: React.ReactNode; className?: string; testId?: string }) {
  const peek = React.useContext(PeekContext);
  const selected = peek?.id === id;
  return (
    <button
      type="button"
      data-peek-row={id}
      aria-haspopup="dialog"
      aria-expanded={selected}
      onClick={(e) => {
        // Safari never focuses a clicked button: the focus goes back to it when the Peek closes.
        e.currentTarget.focus({ preventScroll: true });
        peek?.toggle(id, e.currentTarget);
      }}
      className={cn("touch-target inline-flex min-h-6 shrink-0 items-center gap-1 rounded-sm text-xs font-medium text-accent hover:text-accent-strong", children ? null : "min-w-6 justify-center", selected && "text-accent-strong", className)}
      data-testid={testId}
    >
      <PanelRightOpen className="h-4 w-4 shrink-0" aria-hidden />
      {children ?? <span className="sr-only">{`Details: ${name}`}</span>}
    </button>
  );
}
