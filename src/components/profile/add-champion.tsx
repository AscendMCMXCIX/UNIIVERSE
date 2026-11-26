"use client";

import * as React from "react";
import { Plus, Search } from "lucide-react";
import { ROLE_LABELS, type Role } from "@/domain/roles";
import type { PickerChampion } from "@/components/champions/types";
import { normalise } from "@/components/champions/types";
import { cn } from "@/lib/cn";
import { clearArea } from "@/lib/screen";
import { aboveKeyboard, watchVisiblePart } from "@/components/ui/keyboard-fit";
import { placeList, visibleArea } from "@/components/ui/picker-flow";
import { RemoteImage } from "@/components/ui/remote-image";

const SHOWN = 8;
/** The list at its tallest (max-h-72), in rem; at its shortest, about one row. */
const LIST_REM = 18;
const LEAST_REM = 2.5;
/** Between the field and its list (mt-1.5, mb-1.5), in px. */
const LIST_GAP = 6;

/**
 * The last cell of a pool: "+ Add champion". Clicking turns the cell itself into a search box with
 * a short list underneath: champions usually played in this role first, any champion by typing.
 * Click or Enter adds one and keeps the box open for the next; Escape, Tab or clicking elsewhere
 * closes it. Champions already in the pool are left out (a pool never holds one twice). The list
 * opens above the box instead where the room below it, down to the tab bar's top on a phone, is too
 * small for it and the room above is larger, and is never taller than the room on its side, so it
 * never ends under the bars (placeList, clearArea). On a touch screen the box takes the focus as it
 * opens, so the on-screen keyboard rises over the bottom of the screen: while it is up the room ends
 * at its top instead (aboveKeyboard), measured again as the keyboard rises and as the page or the
 * visible part of it moves (iOS fires no resize for the keyboard).
 */
export function AddChampion({ role, champions, exclude, onAdd, testId, compact = false }: { role: Role; champions: PickerChampion[]; exclude: ReadonlySet<string>; onAdd: (id: string) => void; testId: string; /** A small button beside the section heading (the search opens under it) instead of a grid cell. */ compact?: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listId = React.useId();
  // Which side of the box the list opens on, and how tall it may be there; measured as it opens.
  const [place, setPlace] = React.useState<{ side: "below" | "above"; maxHeight: number } | null>(null);

  const results = React.useMemo(() => {
    const q = normalise(query.trim());
    const free = champions.filter((c) => !exclude.has(c.id));
    if (!q) return free.filter((c) => c.roles?.includes(role)).sort((a, b) => a.name.localeCompare(b.name)).slice(0, SHOWN);
    const starts = free.filter((c) => normalise(c.name).startsWith(q));
    const contains = free.filter((c) => !normalise(c.name).startsWith(q) && normalise(c.name).includes(q));
    return [...starts, ...contains].slice(0, SHOWN);
  }, [query, champions, exclude, role]);

  // Chosen for the list at its tallest, so it keeps its side while the search narrows it: before the
  // list is first drawn, again once the box has the focus (focusing it can scroll the page to it),
  // when the screen changes size (a phone turned), while the on-screen keyboard rises or goes, and
  // as the page or its visible part moves (Safari brings the box above the keyboard).
  const measure = React.useCallback(() => {
    const field = wrapRef.current?.getBoundingClientRect();
    if (!field) return;
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const next = placeList(field, LIST_REM * rem, visibleArea(clearArea(), aboveKeyboard(inputRef.current)), LIST_GAP, LEAST_REM * rem);
    setPlace((cur) => (cur && cur.side === next.side && cur.maxHeight === next.maxHeight ? cur : next));
  }, []);
  React.useLayoutEffect(() => {
    if (!open) return;
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, { passive: true });
    const unwatch = watchVisiblePart(measure);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure);
      unwatch();
    };
  }, [open, measure]);
  React.useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    measure();
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open, measure]);

  const add = (id: string) => {
    onAdd(id);
    setQuery("");
    setActive(0);
    inputRef.current?.focus();
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const c = results[active];
      if (c) add(c.id);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    } else if (e.key === "Tab") setOpen(false);
  };

  if (!open)
    return (
      <button
        type="button"
        onClick={() => {
          setQuery("");
          setActive(0);
          setOpen(true);
        }}
        className={cn(
          compact
            ? "inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border bg-bg-elevated/60 px-3 text-sm font-medium text-fg-muted transition-colors hover:border-accent/50 hover:bg-accent/5 hover:text-fg pointer-coarse:min-h-11"
            : "flex h-full min-h-[3.75rem] w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border text-sm text-fg-subtle transition-colors hover:border-accent/50 hover:bg-accent/5 hover:text-fg",
        )}
        data-testid={`${testId}-toggle`}
      >
        <Plus className="h-4 w-4" aria-hidden /> Add champion
      </button>
    );
  return (
    <div ref={wrapRef} className={cn("relative", compact ? "w-[min(18rem,calc(100vw-3rem))]" : "h-full")} data-testid={`${testId}-add`}>
      <label className={cn("flex items-center gap-2 rounded-lg border border-accent/60 bg-bg-elevated px-3 ring-2 ring-accent/20", compact ? "min-h-9" : "h-full min-h-[3.75rem]")}>
        <Search className="h-4 w-4 shrink-0 text-fg-subtle" aria-hidden />
        <span className="sr-only">Add a champion to the {ROLE_LABELS[role]} pool</span>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          placeholder="Champion name…"
          role="combobox"
          aria-expanded
          aria-controls={listId}
          aria-activedescendant={results[active] ? `${listId}-${active}` : undefined}
          autoComplete="off"
          // 16px on touch screens at every width (iOS zooms into a smaller field, on a phone held
          // sideways too); 14px from md with a mouse.
          className="h-10 min-w-0 flex-1 bg-transparent text-base text-fg outline-none placeholder:text-fg-subtle md:pointer-fine:text-sm"
          data-testid={`${testId}-search`}
        />
      </label>
      <ul
        id={listId}
        role="listbox"
        aria-label={`Champions to add to ${ROLE_LABELS[role]}`}
        style={place ? { maxHeight: place.maxHeight } : undefined}
        className={cn("rise-in absolute right-0 z-50 w-full max-h-72 min-w-[14rem] overflow-y-auto rounded-panel border border-border bg-bg-elevated p-1.5 shadow-2xl shadow-black/40", place?.side === "above" ? "bottom-full mb-1.5" : "top-full mt-1.5")}
        data-testid={`${testId}-results`}
        data-side={place?.side}
      >
        {!query ? <li role="presentation" className="px-2 pb-1 pt-1 text-xs font-medium text-fg-muted">Often played {ROLE_LABELS[role]}</li> : null}
        {results.length === 0 ? <li className="px-2 py-3 text-center text-sm text-fg-subtle">{query ? `No champion matches “${query}”.` : "Type a champion's name."}</li> : null}
        {results.map((c, i) => (
          <li
            key={c.id}
            id={`${listId}-${i}`}
            role="option"
            aria-selected={i === active}
            onPointerMove={() => setActive(i)}
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => add(c.id)}
            className={cn("flex min-h-10 cursor-pointer items-center gap-2.5 rounded-lg px-2 text-sm md:min-h-9", i === active ? "bg-surface-2 text-fg" : "text-fg-muted")}
            data-champion={c.id}
          >
            {c.portraitUrl ? (
              <RemoteImage src={c.portraitUrl} fallback={<span className="grid h-6 w-6 shrink-0 place-items-center rounded bg-surface-3 text-4xs font-semibold">{c.name.slice(0, 2).toUpperCase()}</span>} alt="" width={24} height={24} loading="lazy" className="h-6 w-6 shrink-0 rounded object-cover" />
            ) : (
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded bg-surface-3 text-4xs font-semibold">{c.name.slice(0, 2).toUpperCase()}</span>
            )}
            <span className="min-w-0 flex-1 truncate">{c.name}</span>
            {i === active ? <span className="text-2xs text-fg-subtle">Enter</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
