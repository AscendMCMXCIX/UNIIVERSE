"use client";

import * as React from "react";
import { Search, X } from "lucide-react";
import type { ChampionChoice } from "@/domain/champion-lookup/types";
import { ChampionPortrait } from "@/components/champion-portrait";
import { cn } from "@/lib/cn";
import { searchChampions } from "./search";

/*
  Champion Intel's search (docs/CHAMPION_INTEL.md, "Choosing a champion"): one field that finds
  any champion on the roster as you type ("kha" Kha'Zix, "tf" Twisted Fate, "j4" Jarvan IV:
  search.ts), its matches in a list under it, the best first. The WAI-ARIA combobox with a list:
  the focus stays in the field, ↑/↓ move through the matches (aria-activedescendant), Enter takes
  the one marked (the first when none is), Escape closes the list and then clears the field, a
  press on a match takes it. "/" anywhere on the page outside a field puts the focus here. 16px on
  phones and touch screens, so iOS never zooms into it. The list shows at most SHOWN matches and
  says how many more there are, never a list that scrolls inside the page; every champion is also in
  All champions' window beside it.
*/

/** The most matches the list shows; the rest are counted. */
export const SHOWN = 8;

export function ChampionSearch({ champions, onPick, inputRef, className }: { champions: readonly ChampionChoice[]; onPick: (id: string) => void; inputRef?: React.RefObject<HTMLInputElement | null>; className?: string }) {
  const ownRef = React.useRef<HTMLInputElement>(null);
  const ref = inputRef ?? ownRef;
  const listId = React.useId();
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const results = React.useMemo(() => searchChampions(champions, query), [champions, query]);
  const shown = results.slice(0, SHOWN);
  const typed = query.trim() !== "";
  const expanded = open && typed;
  const optionId = (i: number) => `${listId}-o${i}`;

  // "/" puts the focus in the search from anywhere on the page that is not a field (a second monitor's quick reach).
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (document.querySelector("dialog[open]")) return;
      e.preventDefault();
      ref.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ref]);

  const pick = (id: string) => {
    setQuery("");
    setOpen(false);
    setActive(0);
    onPick(id);
    // On a touch screen the keyboard goes down, so the abilities are in view; with a mouse the field keeps the focus for the next search.
    if (window.matchMedia("(pointer: coarse)").matches) ref.current?.blur();
  };

  return (
    <div className={cn("relative min-w-0", className)} data-testid="lookup-search">
      <label className="block">
        <span className="sr-only">Search champions</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
        <input
          ref={ref}
          type="text"
          role="combobox"
          // No width of its own (an input is 20 characters wide by default, which at 200% text made the window wider than a phone held sideways): its box sets it.
          size={1}
          aria-expanded={expanded}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={expanded && shown.length ? optionId(Math.min(active, shown.length - 1)) : undefined}
          aria-keyshortcuts="/"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" && shown.length) {
              e.preventDefault();
              setOpen(true);
              setActive((a) => (a + 1) % shown.length);
            } else if (e.key === "ArrowUp" && shown.length) {
              e.preventDefault();
              setOpen(true);
              setActive((a) => (a - 1 + shown.length) % shown.length);
            } else if (e.key === "Enter" && typed) {
              e.preventDefault();
              const hit = shown[Math.min(active, shown.length - 1)];
              if (hit) pick(hit.id);
            } else if (e.key === "Escape" && (expanded || query)) {
              // The list first, then what was typed.
              e.preventDefault();
              if (expanded) setOpen(false);
              else setQuery("");
            }
          }}
          placeholder="Search champions"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          enterKeyHint="go"
          className="h-11 w-full rounded-md border border-border-control bg-bg-elevated pl-9 pr-11 text-base text-fg placeholder:text-fg-subtle hover:border-fg-subtle focus:border-accent focus:outline-none md:pointer-fine:h-9 md:pointer-fine:text-sm"
          data-testid="lookup-search-input"
        />
      </label>
      {query ? (
        <button
          type="button"
          onClick={() => {
            setQuery("");
            ref.current?.focus();
          }}
          className="absolute right-0 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-md text-fg-subtle hover:text-fg md:pointer-fine:h-9 md:pointer-fine:w-9"
          aria-label="Clear search"
          data-testid="lookup-search-clear"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      ) : (
        <kbd aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded-sm border border-border px-1.5 text-2xs text-fg-subtle md:pointer-fine:block">
          /
        </kbd>
      )}
      {/* The list: always in the page (empty and hidden while closed), so the field's aria-controls names it. */}
      <div className={cn("absolute inset-x-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-border-strong bg-bg-elevated shadow-2xl", !expanded && "hidden")} data-testid="lookup-search-popup">
        <ul id={listId} role="listbox" aria-label="Champions found">
          {expanded
            ? shown.map((c, i) => (
                <li
                  key={c.id}
                  id={optionId(i)}
                  role="option"
                  aria-selected={i === Math.min(active, shown.length - 1)}
                  // Taken on the press itself, before the field's blur closes the list.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(c.id)}
                  onMouseMove={() => setActive(i)}
                  className={cn("flex min-h-11 cursor-pointer items-center gap-2.5 px-2.5 py-1 text-sm md:pointer-fine:min-h-9", i === Math.min(active, shown.length - 1) ? "bg-surface-3 text-fg" : "text-fg-muted")}
                  data-champion={c.id}
                  data-testid="lookup-search-option"
                >
                  <span aria-hidden className="shrink-0">
                    <ChampionPortrait champion={{ id: c.id, name: c.name, portraitUrl: c.portrait }} size="xs" />
                  </span>
                  <span className="min-w-0 truncate font-medium text-fg">{c.name}</span>
                  <span className="min-w-0 truncate text-xs text-fg-subtle max-sm:hidden">{c.title}</span>
                </li>
              ))
            : null}
        </ul>
        {expanded ? (
          <p className="border-t border-border px-2.5 py-2 text-xs text-fg-muted" data-testid="lookup-search-note">
            {results.length === 0 ? `No champion matches “${query.trim()}”.` : results.length > SHOWN ? `${results.length - SHOWN} more: keep typing, or open All champions.` : results.length === 1 ? "1 champion found" : `${results.length} champions found`}
          </p>
        ) : null}
      </div>
      {/* What the search found, said as it is typed. */}
      <p className="sr-only" aria-live="polite">
        {expanded ? (results.length ? `${results.length} ${results.length === 1 ? "champion" : "champions"} found` : "No champion found") : ""}
      </p>
    </div>
  );
}
