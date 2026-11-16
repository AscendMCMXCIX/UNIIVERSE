"use client";

import * as React from "react";
import { Search, X } from "lucide-react";
import type { ChampionChoice } from "@/domain/matchup-intel/types";
import { ChampionGrid } from "@/components/champions/champion-grid";
import type { PickerChampion } from "@/components/champions/types";
import { ChampionPortrait } from "@/components/champion-portrait";
import { AfterOpen, DetailModal, useModalClose } from "@/components/ui/detail-modal";
import { cn } from "@/lib/cn";
import type { PickerSlot } from "./preferences";
import { searchChampions } from "./search";

/*
  The window a champion is chosen in (docs/MATCHUP_INTEL.md, "Where it is"): the whole screen on a
  phone, a centred window wider up (DetailModal "standard", as tall as its content: the grid grows
  with it and the window's body scrolls). A search field first, 16px so a phone never zooms into it,
  that filters as you type; with nothing typed, the champions chosen lately on this side, for the
  enemy the curated matchups that exist for your champion, then the whole roster. Enter takes the
  first match; Escape clears what was typed before it closes the window.
*/

const portraitOf = (c: ChampionChoice): PickerChampion => ({ id: c.id, name: c.name, portraitUrl: c.portrait });

/** A short row of champions to pick from (Recent, the curated matchups). */
function ChoiceRow({ title, choices, selected, onPick, testId }: { title: string; choices: readonly ChampionChoice[]; selected: string | null; onPick: (id: string) => void; testId: string }) {
  const id = React.useId();
  if (!choices.length) return null;
  return (
    <section aria-labelledby={id} data-testid={testId}>
      <h3 id={id} className="mb-2 text-xs font-semibold uppercase tracking-label text-fg-subtle">
        {title}
      </h3>
      <ul className="flex flex-wrap gap-2">
        {choices.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => onPick(c.id)}
              aria-pressed={selected === c.id}
              className={cn("flex min-h-11 items-center gap-2 rounded-md border bg-surface py-1 pl-1 pr-3 text-sm font-medium transition-colors hover:border-border-strong hover:text-fg", selected === c.id ? "border-accent/60 text-fg" : "border-border text-fg-muted")}
              data-champion={c.id}
            >
              <span aria-hidden className="shrink-0">
                <ChampionPortrait champion={portraitOf(c)} size="sm" />
              </span>
              {c.name}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** What the grid shows while the window opens (its portraits render once the motion is over). */
function GridSkeleton() {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(68px,1fr))] gap-1 sm:grid-cols-[repeat(auto-fill,minmax(76px,1fr))]" aria-hidden>
      {Array.from({ length: 18 }, (_, i) => (
        <div key={i} className="h-24 animate-pulse rounded-lg bg-surface-2" />
      ))}
    </div>
  );
}

function PickerBody({ slot, champions, selected, recent, curated, curatedTitle, inputRef, onPick }: { slot: PickerSlot; champions: readonly ChampionChoice[]; selected: string | null; recent: readonly ChampionChoice[]; curated: readonly ChampionChoice[]; curatedTitle: string; inputRef: React.RefObject<HTMLInputElement | null>; onPick: (id: string) => void }) {
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
      <ChampionGrid champions={list} toolbar={false} maxHeight="auto" selectedIds={selectedIds} onPick={pick} onExitTop={() => inputRef.current?.focus()} testId="matchup-picker-grid" />
    </div>
  );
  return (
    <div className="space-y-4">
      {/* The search stays at the top of the window while the roster scrolls under it (not in a
          short window, which scrolls as one under its own pinned title). The clear button sits
          beside the label, not in it, so the field's name stays its own once something is typed;
          it covers the field's right end, 44px square like the field is tall. */}
      <div className="sticky top-0 z-10 -mx-4 bg-bg-elevated px-4 py-1 sm:-mx-6 sm:px-6 short:static">
        <div className="relative">
          <label className="block">
            <span className="sr-only">{slot === "you" ? "Search for your champion by name" : "Search for the enemy by name"}</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
            <input
              ref={inputRef}
              type="search"
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
                  // Clears the search; a second Escape closes the window.
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
              data-testid="matchup-picker-search"
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
              data-testid="matchup-picker-clear"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          ) : null}
        </div>
      </div>
      <AfterOpen fallback={<GridSkeleton />}>
        {typed ? (
          <section aria-label="Search results" className="space-y-2">
            <p className="text-sm text-fg-muted" aria-live="polite" data-testid="matchup-picker-count">
              {results.length ? `${results.length} ${results.length === 1 ? "champion" : "champions"} found` : `No champion matches “${query.trim()}”.`}
            </p>
            {results.length ? grid(found) : null}
          </section>
        ) : (
          <div className="space-y-5">
            <ChoiceRow title="Recent" choices={recent} selected={selected} onPick={pick} testId="matchup-picker-recent" />
            <ChoiceRow title={curatedTitle} choices={curated} selected={selected} onPick={pick} testId="matchup-picker-curated" />
            <section aria-label="All champions" className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-label text-fg-subtle">
                All champions <span className="font-normal normal-case tracking-normal">· {champions.length}</span>
              </h3>
              {champions.length ? grid(all) : <p className="text-sm text-fg-muted">The champion list arrives with the first game-data update.</p>}
            </section>
          </div>
        )}
      </AfterOpen>
    </div>
  );
}

/** The picker window for one side: your champion, or the enemy. */
export function ChampionPickerWindow({ slot, champions, selected, recent, curated, yourName, onPick, onClose }: { slot: PickerSlot; champions: readonly ChampionChoice[]; selected: string | null; recent: readonly ChampionChoice[]; curated: readonly ChampionChoice[]; yourName: string | null; onPick: (id: string) => void; onClose: () => void }) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  return (
    <DetailModal
      open
      onClose={onClose}
      size="standard"
      title={slot === "you" ? "Your champion" : "The enemy"}
      description={slot === "you" ? "The champion you play: remembered on this device." : "The champion you face in lane."}
      testId="matchup-picker"
      closeTestId="matchup-picker-close"
      // With a mouse or a trackpad the search takes the focus once the window is open; a touch
      // screen keeps its keyboard down until the field is tapped, so the lists stay in view.
      onSettled={() => {
        if (window.matchMedia("(pointer: fine)").matches) inputRef.current?.focus({ preventScroll: true });
      }}
    >
      <PickerBody slot={slot} champions={champions} selected={selected} recent={recent} curated={curated} curatedTitle={yourName ? `Curated briefings for ${yourName}` : "Curated briefings"} inputRef={inputRef} onPick={onPick} />
    </DetailModal>
  );
}
