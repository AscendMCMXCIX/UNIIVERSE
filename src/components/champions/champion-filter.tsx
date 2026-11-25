"use client";

import * as React from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { screenBox } from "@/lib/screen";
import { normalise } from "./types";
import { RemoteImage } from "@/components/ui/remote-image";
import { bringIntoView, closeOnPressOutside, opensInFlow } from "@/components/ui/picker-flow";

export interface FilterChampion {
  id: string;
  name: string;
  portraitUrl?: string;
  /** Games in the current scope (shown, and used to rank "Most played"). */
  games?: number;
}

export type ChampionFilterValue = { scope: "all" } | { scope: "pool" } | { scope: "champion"; championId: string };

const MOST_PLAYED = 8;
const MAX_RESULTS = 40;

/**
 * The champion filter used across the app (Overview, Match History, Matches): a compact button
 * that opens a small search panel instead of a dropdown listing every champion. Empty, the panel
 * offers "All champions", the configured pools (where that applies) and the most played
 * champions; typing finds any champion by name (beginning of the name first). Arrow keys move,
 * Enter chooses, Escape closes. In a plain GET form, pass `name` and the choice is submitted as a
 * hidden field. In a window (the Filters sheet) and on a phone the panel opens in the flow of the
 * window's body, which is then the one thing that scrolls, and is brought into view; it fades in
 * where it rests, and a press outside closes it on its click, so what was tapped below it is what the
 * tap reaches. On a page from sm up it floats under the button (picker-flow.ts).
 */
export function ChampionFilter({
  value,
  onChange,
  champions,
  poolLabel,
  label = "Champions",
  name,
  testId = "champion-filter",
  className,
}: {
  value: ChampionFilterValue;
  onChange?: (v: ChampionFilterValue) => void;
  champions: FilterChampion[];
  /** Offer the configured-pool scope with this wording ("Configured pools"). */
  poolLabel?: string;
  label?: string;
  name?: string;
  testId?: string;
  className?: string;
}) {
  // The page's value wins whenever it changes (a navigation); a choice shows at once meanwhile.
  const keyOf = (v: ChampionFilterValue) => (v.scope === "champion" ? `c:${v.championId}` : v.scope);
  const [current, setCurrent] = React.useState(value);
  const [seen, setSeen] = React.useState(keyOf(value));
  if (keyOf(value) !== seen) {
    setSeen(keyOf(value));
    setCurrent(value);
  }
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const [alignEnd, setAlignEnd] = React.useState(false);
  // The panel is part of what holds it (a window's body, a phone's page), decided as it opens.
  const [inFlow, setInFlow] = React.useState(false);
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const listId = React.useId();

  const byId = React.useMemo(() => new Map(champions.map((c) => [c.id, c])), [champions]);
  const selected = current.scope === "champion" ? byId.get(current.championId) ?? { id: current.championId, name: current.championId } : null;
  const buttonText = current.scope === "pool" ? (poolLabel ?? "Configured pools") : selected ? selected.name : "All champions";

  type Option = { key: string; value: ChampionFilterValue; text: string; champ?: FilterChampion; section?: string };
  const options: Option[] = React.useMemo(() => {
    const q = normalise(query.trim());
    const champ = (c: FilterChampion, section?: string): Option => ({ key: c.id, value: { scope: "champion", championId: c.id }, text: c.name, champ: c, section });
    if (q) {
      const starts = champions.filter((c) => normalise(c.name).startsWith(q));
      const contains = champions.filter((c) => !normalise(c.name).startsWith(q) && normalise(c.name).includes(q));
      return [...starts, ...contains].slice(0, MAX_RESULTS).map((c) => champ(c));
    }
    const out: Option[] = [{ key: "all", value: { scope: "all" }, text: "All champions" }];
    if (poolLabel) out.push({ key: "pool", value: { scope: "pool" }, text: poolLabel });
    const played = champions.filter((c) => (c.games ?? 0) > 0).sort((a, b) => (b.games ?? 0) - (a.games ?? 0) || a.name.localeCompare(b.name));
    played.slice(0, MOST_PLAYED).forEach((c, i) => out.push(champ(c, i === 0 ? "Most played" : undefined)));
    return out;
  }, [query, champions, poolLabel]);

  const isChosen = (o: Option) => (o.value.scope === "champion" ? current.scope === "champion" && current.championId === o.value.championId : current.scope === o.value.scope);

  const show = () => {
    const flow = opensInFlow(wrapRef.current);
    const r = buttonRef.current?.getBoundingClientRect();
    setInFlow(flow);
    // A floating panel lines up with the button's end where it would leave the screen (the box fixed positioning sees, lib/screen.ts).
    setAlignEnd(!flow && !!r && r.left + 320 > screenBox().width - 8);
    setQuery("");
    setActive(0);
    setOpen(true);
  };
  const hide = (focusButton = false) => {
    setOpen(false);
    if (focusButton) buttonRef.current?.focus();
  };
  const choose = (v: ChampionFilterValue) => {
    setCurrent(v);
    hide(true);
    onChange?.(v);
  };

  // Opened in the flow, the panel is brought into view in the body that holds it, before it is drawn.
  React.useLayoutEffect(() => {
    if (open && inFlow) bringIntoView(panelRef.current);
  }, [open, inFlow]);
  React.useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);
  // A press outside closes the panel: as it starts while the panel floats, on its click while the
  // panel is in the flow (what is below it moves up as it goes).
  React.useEffect(() => {
    if (!open) return;
    return closeOnPressOutside(document, (node) => !!wrapRef.current?.contains(node), inFlow, () => setOpen(false));
  }, [open, inFlow]);
  // The option the arrow keys reach stays in view: in the list's own scroller, or in the window's body.
  React.useEffect(() => {
    bringIntoView(document.getElementById(`${listId}-${active}`));
  }, [active, listId]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(options.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const o = options[active];
      if (o) choose(o.value);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      hide(true);
    } else if (e.key === "Tab") hide();
  };

  const hiddenValue = current.scope === "champion" ? current.championId : current.scope === "pool" ? "pool" : "";
  return (
    <div ref={wrapRef} className={cn("relative min-w-0", className)} data-testid={testId}>
      {name ? <input type="hidden" name={name} value={hiddenValue} /> : null}
      {/* The button and its clear mark share a box of their own: the mark stays centred on the
          button while the panel, opened in the flow below it, makes the whole picker taller. */}
      <div className="relative">
        <button
          ref={buttonRef}
          type="button"
          onClick={() => (open ? hide() : show())}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={`${label}: ${buttonText}`}
          className="flex h-11 w-full min-w-0 items-center gap-2 rounded-md border border-border bg-bg-elevated px-2.5 text-left text-sm text-fg hover:border-border-strong md:pointer-fine:h-9"
          data-testid={`${testId}-button`}
        >
          {selected?.portraitUrl ? <RemoteImage src={selected.portraitUrl} alt="" width={20} height={20} className="h-5 w-5 shrink-0 rounded object-cover" /> : null}
          <span className="min-w-0 flex-1 truncate">{buttonText}</span>
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-fg-subtle", current.scope !== "all" && !name && "invisible")} aria-hidden />
        </button>
        {current.scope !== "all" && !name ? (
          <button type="button" onClick={() => choose({ scope: "all" })} aria-label="Show all champions" className="absolute right-1.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded text-fg-subtle hover:bg-surface-2 hover:text-fg" data-testid={`${testId}-clear`}>
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        ) : null}
      </div>
      {open ? (
        // In the flow it fades in where it rests: a rise would move it while it is brought into view.
        <div ref={panelRef} className={cn("mt-1.5 overflow-hidden rounded-panel border border-border bg-bg-elevated", inFlow ? "fade-in w-full" : cn("rise-in absolute top-full z-50 w-80 shadow-2xl shadow-black/40", alignEnd ? "right-0" : "left-0"))} data-testid={`${testId}-panel`} data-flow={inFlow || undefined}>
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search className="h-4 w-4 shrink-0 text-fg-subtle" aria-hidden />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
              placeholder="Find a champion…"
              aria-label={`Find a champion (${champions.length})`}
              role="combobox"
              aria-expanded
              aria-controls={listId}
              aria-activedescendant={options[active] ? `${listId}-${active}` : undefined}
              // 16px on touch screens at every width (iOS zooms into a smaller field, on a phone held
              // sideways too); 14px from md with a mouse.
              className="h-11 min-w-0 flex-1 bg-transparent text-base text-fg outline-none placeholder:text-fg-subtle md:h-10 md:pointer-fine:text-sm"
              data-testid={`${testId}-search`}
            />
          </div>
          {/* In the flow, as tall as its options: the body holding it scrolls. Floating, a height of its own. */}
          <ul id={listId} role="listbox" aria-label={label} className={cn("p-1.5", !inFlow && "max-h-72 overflow-y-auto")}>
            {options.length === 0 ? <li className="px-3 py-4 text-center text-sm text-fg-subtle">No champion matches “{query}”.</li> : null}
            {options.map((o, i) => (
              <React.Fragment key={o.key}>
                {o.section ? <li role="presentation" className="px-2 pb-1 pt-2 text-xs font-medium text-fg-muted">{o.section}</li> : null}
                <li
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={isChosen(o)}
                  onPointerMove={() => setActive(i)}
                  onClick={() => choose(o.value)}
                  className={cn("flex min-h-10 cursor-pointer items-center gap-2.5 rounded-lg px-2 text-sm md:min-h-9", i === active ? "bg-surface-2 text-fg" : "text-fg-muted")}
                  data-option={o.key}
                >
                  {o.champ ? (
                    <PortraitOrLetters url={o.champ.portraitUrl} letters={o.text} />
                  ) : null}
                  <span className="min-w-0 flex-1 truncate">{o.text}</span>
                  {o.champ?.games ? <span className="text-xs tabular-nums text-fg-subtle">{o.champ.games} game{o.champ.games === 1 ? "" : "s"}</span> : null}
                  {isChosen(o) ? <Check className="h-4 w-4 shrink-0 text-accent" aria-hidden /> : null}
                </li>
              </React.Fragment>
            ))}
            {!query && champions.length > 0 ? <li role="presentation" className="px-2 pb-1 pt-2 text-2xs text-fg-subtle">Type to find any of {champions.length} champions.</li> : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/** A champion's portrait in the list, or its first two letters when there is none (or it cannot load). */
function PortraitOrLetters({ url, letters }: { url: string | undefined; letters: string }) {
  const tile = <span className="grid h-6 w-6 shrink-0 place-items-center rounded bg-surface-3 text-4xs font-semibold text-fg-muted">{letters.slice(0, 2).toUpperCase()}</span>;
  return url ? <RemoteImage src={url} fallback={tile} alt="" width={24} height={24} loading="lazy" className="h-6 w-6 shrink-0 rounded object-cover" /> : tile;
}
