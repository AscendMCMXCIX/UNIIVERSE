"use client";

import * as React from "react";
import { Check, Search, X } from "lucide-react";
import { ROLES, ROLE_LABELS, type Role } from "@/domain/roles";
import { normalise, type PickerChampion } from "./types";
import { perAccountKey } from "@/components/account-storage";
import { ChampionPortrait } from "@/components/champion-portrait";
import { RoleIcon } from "@/components/role-icon";
import { cn } from "@/lib/cn";

export type RoleFilter = Role | "ALL";

/** Role filter like champion select: All | Top | Jungle | Mid | Bottom | Support, with the position icons. */
export function RoleFilterBar({ value, onChange, className }: { value: RoleFilter; onChange: (v: RoleFilter) => void; className?: string }) {
  const options: RoleFilter[] = ["ALL", ...ROLES];
  return (
    <div role="group" aria-label="Filter by role" className={cn("flex items-center gap-0.5 rounded-lg border border-border bg-bg-elevated p-0.5", className)}>
      {options.map((o) => {
        const active = value === o;
        return (
          <button
            key={o}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o)}
            title={o === "ALL" ? "All roles" : ROLE_LABELS[o]}
            className={cn("grid h-9 min-w-9 place-items-center rounded-md px-2 text-xs font-semibold transition-colors pointer-coarse:h-11 pointer-coarse:min-w-11", active ? "bg-accent/15 text-accent" : "text-fg-muted hover:bg-surface-2 hover:text-fg")}
          >
            {o === "ALL" ? "All" : <RoleIcon role={o} className="h-[18px] w-[18px]" decorative />}
            <span className="sr-only">{o === "ALL" ? "All roles" : ROLE_LABELS[o]}</span>
          </button>
        );
      })}
    </div>
  );
}

export interface ChampionGridProps {
  champions: PickerChampion[];
  /** Selected champions: shown with a check and a ring. */
  selectedIds?: ReadonlySet<string>;
  /** Not selectable (taken, banned, or the pool is full): dimmed. */
  disabledIds?: ReadonlySet<string>;
  /** Why disabled champions are unavailable, for their tooltip. */
  disabledReason?: string;
  onPick: (championId: string) => void;
  /** Initial role filter (e.g. the pool's role). */
  initialRole?: RoleFilter;
  /** Grid height: "auto" grows with content; a number caps it and scrolls inside. */
  maxHeight?: number | "auto" | "fill";
  autoFocus?: boolean;
  /** Extra controls on the toolbar's right. */
  toolbarExtra?: React.ReactNode;
  size?: "sm" | "md";
  testId?: string;
  /** Shown first and outlined (e.g. the player's own pool). */
  prioritisedIds?: ReadonlySet<string>;
  /** Tooltip suffix for prioritised champions. */
  prioritisedLabel?: string;
  /** Browse only: search and filters work, nothing can be picked. */
  readOnly?: boolean;
  placeholder?: string;
  inputRef?: React.Ref<HTMLInputElement>;
  /**
   * Progressive: with no search and no role chosen, show only a short list (selected, prioritised
   * and recently used champions) and a "Browse all" button, instead of every champion at once.
   */
  progressive?: boolean;
  /**
   * False: no search field or role filter of its own, for a window that searches the champions
   * itself and hands over the ones to show (Matchup Intel's pickers). The grid keeps its keyboard
   * moves; what it says when nothing matches is the window's.
   */
  toolbar?: boolean;
  /**
   * Where ArrowUp or ArrowLeft from the first portraits leads, for a window whose search is its own
   * (toolbar false): it focuses that search. Without it the keys go back to the grid's own search.
   */
  onExitTop?: () => void;
}

const noopSubscribe = () => () => {};
const RECENT_MAX = 12;
/** Per account: people who use one browser one after the other keep their recent picks apart. */
const recentKey = () => perAccountKey("uniiverse_recent_champions");
/** Champions recently chosen in any picker on this device by this account (a convenience; empty when storage is unavailable). */
function readRecent(): string[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(recentKey()) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}
function rememberRecent(id: string) {
  try {
    window.localStorage.setItem(recentKey(), JSON.stringify([id, ...readRecent().filter((x) => x !== id)].slice(0, RECENT_MAX)));
  } catch {
    // Storage unavailable (private mode): nothing to remember.
  }
}

/**
 * The one champion selector: instant search (accents and punctuation ignored), Riot-style role
 * filter, portrait grid with clear selected and unavailable states. Enter picks the first match;
 * every portrait is a real button, so keyboard and touch work the same. No network calls.
 */
export function ChampionGrid({ champions, selectedIds, disabledIds, disabledReason, onPick, initialRole = "ALL", maxHeight = 360, autoFocus = false, toolbarExtra, size = "md", testId = "champion-grid", prioritisedIds, prioritisedLabel, readOnly = false, placeholder = "Search champion…", inputRef, progressive = false, toolbar = true, onExitTop }: ChampionGridProps) {
  const [query, setQuery] = React.useState("");
  const [role, setRole] = React.useState<RoleFilter>(initialRole);
  const [browseAll, setBrowseAll] = React.useState(false);
  // On the client only: the server render has no storage, and the first paint must match it.
  const mounted = React.useSyncExternalStore(noopSubscribe, () => true, () => false);
  const recent = React.useMemo(() => (progressive && mounted ? readRecent() : []), [progressive, mounted]);
  const gridRef = React.useRef<HTMLDivElement>(null);
  const q = normalise(query);
  /** Progressive and idle: the short list instead of every champion. */
  const short = progressive && !q && role === "ALL" && !browseAll;
  const filtered = React.useMemo(() => {
    let list = champions;
    if (q) list = list.filter((c) => normalise(c.name).includes(q) || normalise(c.id).includes(q));
    // A search looks across every role; the role filter narrows browsing.
    else if (role !== "ALL") list = list.filter((c) => !c.roles || c.roles.length === 0 || c.roles.includes(role));
    else if (short) {
      const wanted = [...(selectedIds ?? []), ...(prioritisedIds ?? []), ...recent];
      const byId = new Map(champions.map((c) => [c.id, c]));
      list = [...new Set(wanted)].map((id) => byId.get(id)).filter((c): c is PickerChampion => !!c).slice(0, 18);
    }
    // Prioritised champions first, in the order given (a pool's preference order); the rest keep theirs.
    if (prioritisedIds && prioritisedIds.size > 0) {
      const order = new Map([...prioritisedIds].map((id, i) => [id, i]));
      list = [...list].sort((a, b) => (order.get(a.id) ?? Infinity) - (order.get(b.id) ?? Infinity));
    }
    return list;
  }, [champions, q, role, prioritisedIds, short, selectedIds, recent]);
  const first = filtered.find((c) => !disabledIds?.has(c.id));
  const portrait = size === "sm" ? "md" : "lg";
  const pick = (id: string) => {
    if (progressive) rememberRecent(id);
    onPick(id);
  };
  /** Arrow keys move between portraits (left/right by one, up/down by a row); Home/End jump. */
  const onGridKeyDown = (e: React.KeyboardEvent) => {
    const buttons = [...(gridRef.current?.querySelectorAll<HTMLButtonElement>("button[data-champion]:not(:disabled)") ?? [])];
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    const cols = Math.max(1, Math.round((gridRef.current?.clientWidth ?? 1) / (buttons[0]?.offsetWidth || 1)));
    const to = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "ArrowDown" ? i + cols : e.key === "ArrowUp" ? i - cols : e.key === "Home" ? 0 : e.key === "End" ? buttons.length - 1 : null;
    if (to === null) return;
    e.preventDefault();
    if (to < 0 && (e.key === "ArrowUp" || e.key === "ArrowLeft")) {
      if (onExitTop) onExitTop();
      else (gridRef.current?.closest("[data-testid]")?.querySelector("input[type=search]") as HTMLInputElement | null)?.focus();
    } else buttons[Math.max(0, Math.min(buttons.length - 1, to))]?.focus();
  };
  return (
    <div className="flex min-h-0 flex-col gap-2" data-testid={testId}>
      {toolbar ? (
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-40 flex-1">
            <span className="sr-only">Search champions</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
            <input
              ref={inputRef}
              type="search"
              value={query}
              autoFocus={autoFocus}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && first && !readOnly) {
                  e.preventDefault();
                  pick(first.id);
                  setQuery("");
                }
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  gridRef.current?.querySelector<HTMLButtonElement>("button[data-champion]:not(:disabled)")?.focus();
                }
                if (e.key === "Escape" && query) {
                  e.stopPropagation();
                  setQuery("");
                }
              }}
              placeholder={placeholder}
              className="h-11 w-full rounded-lg border border-border bg-bg-elevated pl-9 pr-9 text-base text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none md:pointer-fine:h-9 md:pointer-fine:text-sm"
            />
            {query ? (
              <button type="button" onClick={() => setQuery("")} className="absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-fg-subtle hover:text-fg" aria-label="Clear search">
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </label>
          <RoleFilterBar value={role} onChange={setRole} />
          {toolbarExtra}
        </div>
      ) : null}
      {short ? (
        <div className="flex items-center justify-between gap-2 text-xs text-fg-subtle">
          <span>{filtered.length ? "Your champions and recent picks · type to search, or pick a role" : "Type a name, or pick a role to browse"}</span>
          <button type="button" onClick={() => setBrowseAll(true)} className="rounded-md px-2 py-1 font-medium text-accent hover:bg-accent/10" data-testid={`${testId}-browse-all`}>
            Browse all {champions.length}
          </button>
        </div>
      ) : null}
      <div
        ref={gridRef}
        onKeyDown={onGridKeyDown}
        // Columns at least as wide as a portrait and the button's padding, in rem, so they grow with
        // the reader's text size as the portraits do (4rem or 3rem, and 0.75rem of padding): in px,
        // a large text size drew portraits wider than their columns and cut every name.
        className={cn("grid content-start gap-1 overflow-y-auto overscroll-contain rounded-lg", size === "sm" ? "grid-cols-[repeat(auto-fill,minmax(3.75rem,1fr))]" : "grid-cols-[repeat(auto-fill,minmax(4.75rem,1fr))]", maxHeight === "fill" && "min-h-0 flex-1")}
        style={typeof maxHeight === "number" ? { maxHeight } : undefined}
      >
        {filtered.map((c) => {
          const disabled = disabledIds?.has(c.id) ?? false;
          const selected = selectedIds?.has(c.id) ?? false;
          const prioritised = prioritisedIds?.has(c.id) ?? false;
          return (
            <button
              key={c.id}
              type="button"
              disabled={(disabled && !selected) || readOnly}
              aria-pressed={selectedIds ? selected : undefined}
              onClick={() => pick(c.id)}
              title={c.name}
              className={cn("group relative flex flex-col items-center gap-1 rounded-lg p-1.5 text-center transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:hover:bg-transparent", selected && "bg-accent/10")}
              data-champion={c.id}
              data-unavailable={disabled ? "true" : undefined}
              data-prioritised={prioritised ? "true" : undefined}
            >
              {/* The button is named by the name under the portrait: the portrait is hidden from
                  assistive technology, or each champion would be read twice. */}
              <span className="relative" aria-hidden>
                <ChampionPortrait champion={c} size={portrait} dimmed={disabled && !selected} className={cn("transition-shadow", selected && "ring-2 ring-accent", prioritised && !disabled && !selected && "ring-1 ring-accent/60")} />
                {selected ? (
                  <span className="pop-in absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-accent text-bg shadow" aria-hidden>
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  </span>
                ) : null}
              </span>
              {/* Two lines where a name needs them (Nunu & Willump, a large text size), never cut. */}
              <span className={cn("line-clamp-2 w-full break-words leading-tight", c.name.length > 7 ? "text-2xs tracking-tight" : "text-xs", disabled && !selected ? "text-fg-subtle" : selected ? "text-fg" : "text-fg-muted group-hover:text-fg")}>{c.name}</span>
              {disabled && !selected && disabledReason ? <span className="sr-only">, {disabledReason}</span> : prioritised && prioritisedLabel ? <span className="sr-only">, {prioritisedLabel}</span> : null}
            </button>
          );
        })}
        {filtered.length === 0 && !short && toolbar ? <p className="col-span-full py-8 text-center text-sm text-fg-muted">{query ? `No champion matches “${query}”.` : "No champions in this role."}</p> : null}
      </div>
    </div>
  );
}
