"use client";

import * as React from "react";
import { Search, X } from "lucide-react";
import type { ChampionChoice } from "@/domain/champion-lookup/types";
import { ChampionGrid } from "@/components/champions/champion-grid";
import type { PickerChampion } from "@/components/champions/types";
import { ChampionPortrait } from "@/components/champion-portrait";
import { AfterOpen, DetailModal, useModalClose } from "@/components/ui/detail-modal";
import { cn } from "@/lib/cn";
import { searchChampions } from "./search";

/*
  Champion Intel's window of every champion (docs/CHAMPION_INTEL.md, "Choosing a champion"),
  opened by a champion's name (to change it), by Compare, and by All champions beside the
  search where no champion is chosen: the whole screen on a phone, a centred window wider up
  (DetailModal "standard", as tall as its content: the grid grows with it and the window's body
  scrolls). A search field first, 16px so a phone never zooms into it, that filters as you type;
  with nothing typed, the champions looked up lately on this device, then every champion on the
  roster, every name whole under its portrait. Enter takes the first match; ArrowDown goes into the grid, whose arrows move between
  portraits; Escape clears what was typed before it closes the window. A task dialog: no history
  entry of its own (DESIGN_SYSTEM.md §7).
*/

const portraitOf = (c: ChampionChoice): PickerChampion => ({ id: c.id, name: c.name, portraitUrl: c.portrait });

/** The champions looked up lately, as a short row of buttons. */
function RecentRow({ choices, selected, onPick }: { choices: readonly ChampionChoice[]; selected: string | null; onPick: (id: string) => void }) {
  const id = React.useId();
  if (!choices.length) return null;
  return (
    <section aria-labelledby={id} data-testid="lookup-picker-recent">
      <h3 id={id} className="mb-2 text-sm font-semibold text-fg">
        Recent
      </h3>
      <ul className="flex flex-wrap gap-2">
        {choices.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => onPick(c.id)}
              aria-pressed={selected === c.id}
              className={cn("flex min-h-11 min-w-0 max-w-full items-center gap-2 rounded-md border bg-surface py-1 pl-1 pr-3 text-left text-sm font-medium text-fg transition-colors hover:border-border-strong", selected === c.id ? "border-accent/60" : "border-border")}
              data-champion={c.id}
            >
              <span aria-hidden className="shrink-0">
                <ChampionPortrait champion={portraitOf(c)} size="sm" />
              </span>
              <span className="min-w-0 break-words">{c.name}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** What the grid shows while the window opens (its portraits render once the motion is over), in the grid's own columns. */
function GridSkeleton() {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(6rem,1fr))] gap-1" aria-hidden>
      {Array.from({ length: 18 }, (_, i) => (
        <div key={i} className="h-24 animate-pulse rounded-lg bg-surface-2" />
      ))}
    </div>
  );
}

function PickerBody({ champions, selected, recent, inputRef, onPick }: { champions: readonly ChampionChoice[]; selected: string | null; recent: readonly ChampionChoice[]; inputRef: React.RefObject<HTMLInputElement | null>; onPick: (id: string) => void }) {
  const close = useModalClose();
  const [query, setQuery] = React.useState("");
  const gridRef = React.useRef<HTMLDivElement>(null);
  const typed = query.trim() !== "";
  const results = React.useMemo(() => searchChampions(champions, query), [champions, query]);
  const all = React.useMemo(() => champions.map(portraitOf), [champions]);
  const found = React.useMemo(() => results.map(portraitOf), [results]);
  const selectedIds = React.useMemo(() => new Set(selected ? [selected] : []), [selected]);
  const pick = (id: string) => {
    onPick(id);
    close();
  };
  const grid = (list: PickerChampion[]) => (
    <div ref={gridRef}>
      {/* ArrowUp (or ArrowLeft) from the first portraits goes back to the search, which is this window's, not the grid's. */}
      <ChampionGrid champions={list} toolbar={false} maxHeight="auto" selectedIds={selectedIds} onPick={pick} onExitTop={() => inputRef.current?.focus()} testId="lookup-picker-grid" wholeNames />
    </div>
  );
  return (
    <div className="space-y-4">
      {/* The search stays at the top of the window while the roster scrolls under it (not in a short
          window, which scrolls as one under its own pinned title); its band covers the window
          body's top padding too, so no strip of portraits shows above it. Its clear button is 44px,
          gives the focus back to the field, and Escape clears what was typed before it closes. */}
      <div className="sticky -top-4 z-10 -mx-4 -mt-4 border-t border-transparent bg-bg-elevated bg-clip-padding px-4 pb-1 pt-5 sm:-top-5 sm:-mx-6 sm:-mt-5 sm:px-6 sm:pt-6 short:static" data-testid="lookup-picker-band">
        <div className="relative">
          <label className="block">
            <span className="sr-only">Search for a champion by name</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
            <input
              ref={inputRef}
              type="search"
              // No width of its own (an input is 20 characters wide by default, which at 200% text made the window wider than a phone held sideways): its box sets it.
              size={1}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && results[0]) {
                  e.preventDefault();
                  pick(results[0].id);
                } else if (e.key === "ArrowDown") {
                  const first = gridRef.current?.querySelector<HTMLButtonElement>("button[data-champion]:not(:disabled)");
                  if (first) {
                    e.preventDefault();
                    first.focus();
                  }
                } else if (e.key === "Escape" && query) {
                  e.preventDefault();
                  e.stopPropagation();
                  setQuery("");
                }
              }}
              placeholder="Search champions"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              enterKeyHint="go"
              className="h-11 w-full rounded-md border border-border-control bg-bg-elevated pl-9 pr-11 text-base text-fg placeholder:text-fg-subtle hover:border-fg-subtle focus:border-accent focus:outline-none [&::-webkit-search-cancel-button]:hidden"
              data-testid="lookup-picker-search"
            />
          </label>
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              className="absolute right-0 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-md text-fg-subtle hover:text-fg"
              aria-label="Clear search"
              data-testid="lookup-picker-clear"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          ) : null}
        </div>
      </div>
      {/* What a search found, said as it is typed (the live region is there from the opening, empty until something is typed). */}
      <p className={typed ? "text-sm text-fg-muted" : "sr-only"} aria-live="polite" data-testid="lookup-picker-count">
        {typed ? (results.length ? `${results.length} ${results.length === 1 ? "champion" : "champions"} found` : `No champion matches “${query.trim()}”.`) : ""}
      </p>
      <AfterOpen fallback={<GridSkeleton />}>
        {typed ? (
          <section aria-label="Search results" className="space-y-2">
            {results.length ? grid(found) : null}
          </section>
        ) : (
          <div className="space-y-5">
            <RecentRow choices={recent} selected={selected} onPick={pick} />
            <section aria-label="All champions" className="space-y-2">
              <h3 className="text-sm font-semibold text-fg" data-testid="lookup-picker-all-title">
                All champions <span className="font-normal text-fg-muted">· {all.length}</span>
              </h3>
              {champions.length ? grid(all) : <p className="text-sm text-fg-muted">The champion list arrives with the first game-data update.</p>}
            </section>
          </div>
        )}
      </AfterOpen>
    </div>
  );
}

/** The window of every champion, for Champion Intel: a champion's name (to change it), Compare, and All champions where none is chosen. */
export function ChampionPickerWindow({ champions, selected, recent, onPick, onClose, title = "All champions" }: { champions: readonly ChampionChoice[]; selected: string | null; recent: readonly ChampionChoice[]; onPick: (id: string) => void; onClose: () => void; title?: string }) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  return (
    <DetailModal
      open
      onClose={onClose}
      size="standard"
      title={title}
      description="Choose a champion."
      testId="lookup-picker"
      headerTestId="lookup-picker-header"
      closeTestId="lookup-picker-close"
      // With a mouse or a trackpad the search takes the focus once the window is open; a touch
      // screen keeps its keyboard down until the field is tapped, so the portraits stay in view.
      onSettled={() => {
        if (window.matchMedia("(pointer: fine)").matches) inputRef.current?.focus({ preventScroll: true });
      }}
    >
      <PickerBody champions={champions} selected={selected} recent={recent} inputRef={inputRef} onPick={onPick} />
    </DetailModal>
  );
}
