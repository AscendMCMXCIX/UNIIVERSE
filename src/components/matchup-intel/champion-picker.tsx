"use client";

import * as React from "react";
import { Search, X } from "lucide-react";
import type { ChampionChoice } from "@/domain/matchup-intel/types";
import { ChampionGrid, RoleFilterBar, type RoleFilter } from "@/components/champions/champion-grid";
import { ROLE_LABELS, type Role as GameRole } from "@/domain/roles";
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
  enemy the curated matchups that exist for your champion, in your own slot your own pool for the
  lane (your player profile's, never anyone else's), then the whole roster, which a role filter
  narrows to the champions Riot recorded in that position in the team's stored games (offered only
  to an account that may see teammates' statistics; src/server/matchup-intel/picker.ts). Enter takes the
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
              className={cn("flex min-h-11 min-w-0 max-w-full items-center gap-2 rounded-md border bg-surface py-1 pl-1 pr-3 text-left text-sm font-medium transition-colors hover:border-border-strong hover:text-fg", selected === c.id ? "border-accent/60 text-fg" : "border-border text-fg-muted")}
              data-champion={c.id}
            >
              <span aria-hidden className="shrink-0">
                <ChampionPortrait champion={portraitOf(c)} size="sm" />
              </span>
              {/* A long name breaks rather than reach past the window at a larger text size. */}
              <span className="min-w-0 [overflow-wrap:anywhere]">{c.name}</span>
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
    <div className="grid grid-cols-[repeat(auto-fill,minmax(4.75rem,1fr))] gap-1" aria-hidden>
      {Array.from({ length: 18 }, (_, i) => (
        <div key={i} className="h-24 animate-pulse rounded-lg bg-surface-2" />
      ))}
    </div>
  );
}

type RecordedRoles = Partial<Record<GameRole, string[]>>;

function PickerBody({ slot, champions, selected, recent, pool, curated, curatedTitle, recordedRoles, inputRef, onPick }: { slot: PickerSlot; champions: readonly ChampionChoice[]; selected: string | null; recent: readonly ChampionChoice[]; pool: readonly ChampionChoice[]; curated: readonly ChampionChoice[]; curatedTitle: string; recordedRoles: RecordedRoles | null; inputRef: React.RefObject<HTMLInputElement | null>; onPick: (id: string) => void }) {
  const close = useModalClose();
  const [query, setQuery] = React.useState("");
  // The role filter: the picker's own (the page's address keeps its lane); All when it opens.
  const [role, setRole] = React.useState<RoleFilter>("ALL");
  const gridRef = React.useRef<HTMLDivElement>(null);
  const typed = query.trim() !== "";
  const results = React.useMemo(() => searchChampions(champions, query), [champions, query]);
  const all = React.useMemo(() => {
    const recorded = role !== "ALL" && recordedRoles ? new Set(recordedRoles[role] ?? []) : null;
    return (recorded ? champions.filter((c) => recorded.has(c.id)) : champions).map(portraitOf);
  }, [champions, role, recordedRoles]);
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
          short window, which scrolls as one under its own pinned title). Its band covers the
          window body's top padding too (pulled up over it, and pinned at the body's edge), so no
          strip of portraits shows above it while the roster scrolls. Its background starts 1px
          below its top edge (a transparent border, the background kept to the padding): a window
          centred at a fractional position rounded the band's top into the row of the header's
          1px divider and painted over it; pinned, that 1px is above the body's edge, unseen. The
          clear button sits beside the label, not in it, so the field's name stays its own once
          something is typed; it covers the field's right end, 44px square like the field is tall.

          Not the shared SearchInput, on purpose: this field is 16px at every width (a tablet's
          Safari zooms into a smaller one too, and this window opens on touch screens of any size),
          its clear button is 44px with a mouse as well and gives the focus back to the field, and
          Escape clears what was typed before it closes the window. SearchInput is 14px and 36px
          from md with a mouse, as the app's other lists are. */}
      <div className="sticky -top-4 z-10 -mx-4 -mt-4 border-t border-transparent bg-bg-elevated bg-clip-padding px-4 pb-1 pt-5 sm:-top-5 sm:-mx-6 sm:-mt-5 sm:px-6 sm:pt-6 short:static" data-testid="matchup-picker-band">
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
      {/* What a search found, said as it is typed. The live region is there from the window's
          opening, empty until something is typed: one created with its first words is often not
          read. */}
      <p className={typed ? "text-sm text-fg-muted" : "sr-only"} aria-live="polite" data-testid="matchup-picker-count">
        {typed ? (results.length ? `${results.length} ${results.length === 1 ? "champion" : "champions"} found` : `No champion matches “${query.trim()}”.`) : ""}
      </p>
      <AfterOpen fallback={<GridSkeleton />}>
        {typed ? (
          <section aria-label="Search results" className="space-y-2">
            {results.length ? grid(found) : null}
          </section>
        ) : (
          <div className="space-y-5">
            <ChoiceRow title="Recent" choices={recent} selected={selected} onPick={pick} testId="matchup-picker-recent" />
            <ChoiceRow title="Your pool" choices={pool} selected={selected} onPick={pick} testId="matchup-picker-pool" />
            <ChoiceRow title={curatedTitle} choices={curated} selected={selected} onPick={pick} testId="matchup-picker-curated" />
            <section aria-label="All champions" className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-label text-fg-subtle" data-testid="matchup-picker-all-title">
                  {role === "ALL" ? "All champions" : ROLE_LABELS[role]} <span className="font-normal normal-case tracking-normal">· {all.length}</span>
                </h3>
                {recordedRoles && champions.length ? <RoleFilterBar value={role} onChange={setRole} className="flex-wrap" /> : null}
              </div>
              {role !== "ALL" ? (
                <p className="text-xs text-fg-muted" data-testid="matchup-picker-role-note">
                  The champions Riot recorded as {ROLE_LABELS[role]} in the team&apos;s stored games. The search finds every champion.
                </p>
              ) : null}
              {champions.length ? (all.length ? grid(all) : <p className="text-sm text-fg-muted">No stored game records a champion as {role === "ALL" ? "this" : ROLE_LABELS[role]} yet.</p>) : <p className="text-sm text-fg-muted">The champion list arrives with the first game-data update.</p>}
            </section>
          </div>
        )}
      </AfterOpen>
    </div>
  );
}

/** The picker window for one side: your champion, or the enemy. */
export function ChampionPickerWindow({ slot, title, description, champions, selected, recent, pool = [], curated, yourName, recordedRoles = null, onPick, onClose }: { slot: PickerSlot; title?: string; description?: string; champions: readonly ChampionChoice[]; selected: string | null; recent: readonly ChampionChoice[]; /** The viewer's own pool for the lane, in their own slot's picker only. */ pool?: readonly ChampionChoice[]; curated: readonly ChampionChoice[]; yourName: string | null; recordedRoles?: RecordedRoles | null; onPick: (id: string) => void; onClose: () => void }) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  return (
    <DetailModal
      open
      onClose={onClose}
      size="standard"
      title={title ?? (slot === "you" ? "Your champion" : "The enemy")}
      description={description ?? (slot === "you" ? "The champion you play: remembered on this device." : "The champion you face in lane.")}
      testId="matchup-picker"
      headerTestId="matchup-picker-header"
      closeTestId="matchup-picker-close"
      // With a mouse or a trackpad the search takes the focus once the window is open; a touch
      // screen keeps its keyboard down until the field is tapped, so the lists stay in view.
      onSettled={() => {
        if (window.matchMedia("(pointer: fine)").matches) inputRef.current?.focus({ preventScroll: true });
      }}
    >
      <PickerBody slot={slot} champions={champions} selected={selected} recent={recent} pool={pool} curated={curated} recordedRoles={recordedRoles} curatedTitle={yourName ? `Curated briefings for ${yourName}` : "Curated briefings"} inputRef={inputRef} onPick={onPick} />
    </DetailModal>
  );
}
