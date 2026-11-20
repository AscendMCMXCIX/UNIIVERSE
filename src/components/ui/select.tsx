"use client";

import * as React from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn, withDefaults } from "@/lib/cn";
import { screenBox, screenHeight } from "@/lib/screen";
import { NativeSelect, selectClass } from "./input";
import { useWindowPosture } from "./posture";

/*
  The one dropdown of the desktop toolbars (PLAN S4a, container 4, "Popover: anchored choices"; UD.X7
  and M1). Until 20 Nov 2026 the toolbars used the browser's own <select>: drawn by the system, it
  looked different beside the app's own popovers, and different again in Safari.

  - **Where.** A screen that opens previews beside the list (posture.ts: 768px wide and more, taller
    than 480px) gets this popover. A phone, or a window that small, keeps the browser's own select and
    its picker: a phone's wheel or sheet is what its owner expects, and it never runs under the bars.
    The server and the first paint draw the popover's button, which looks like the closed native
    select, so a phone sees no change when it swaps after hydration.
  - **Pattern.** WAI-ARIA's select-only combobox: the button is a combobox that owns a listbox. Focus
    stays on the button the whole time (the active option is `aria-activedescendant`), so it is back on
    the button whenever the list closes, and a screen reader reads the field's name, its value and
    each option as it is reached.
  - **Opens** on a click, Enter, Space, ↓ or ↑. **Moves** with ↑ ↓, Home, End, Page Up and Down, and
    type-ahead (the first option starting with what was typed in the last half second; typed while
    closed, it chooses, as a native select does). **Chooses** with Enter, Space or a click.
    **Closes** on a choice, Escape, Tab, an outside press, a resize, or the button leaving the screen
    (a scroll otherwise moves the list with it).
  - **A choice** calls `onValueChange` with the option's value, exactly as the native select's change
    did: each caller writes it into the address as before.
  - **Width.** The closed button is as wide as its widest option, as a native select is, so a
    choice never moves the toolbar (and where it may be narrower, its label ends in an ellipsis).
  - **Look.** `bg-elevated`, a border and a shadow; a 160ms fade with a 2px slide from the button
    (none with reduced motion, globals.css). No dimming and no address of its own. Options are 44px on
    a touch screen and 36px under a mouse; at 200% text they grow with it and the list scrolls.
  - **Layer.** The list is fixed to the screen, so no card's rounded, clipped corners cut it off, and
    stays in the page right after its button: inside the window (a modal <dialog>) or the panel
    (Refine) that holds it, so their own "a press outside closes me" sees a press on it as inside,
    and nothing outside the topmost window is inert for it. Where what holds it moves the box fixed
    positioning uses (a transform in a window's opening motion, a blurred sticky bar), the list
    measures where its (0, 0) landed and corrects for it.
*/

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
  /** Consecutive options with the same group are shown under its heading (a native <optgroup>). */
  group?: string;
}

/** The options in runs: those of one group together, ungrouped ones alone, each with its index. */
export function runsOf(options: readonly SelectOption[]): { group?: string; items: { option: SelectOption; index: number }[] }[] {
  const runs: { group?: string; items: { option: SelectOption; index: number }[] }[] = [];
  options.forEach((option, index) => {
    const last = runs[runs.length - 1];
    if (last && option.group !== undefined && last.group === option.group) last.items.push({ option, index });
    else runs.push({ group: option.group, items: [{ option, index }] });
  });
  return runs;
}

export interface SelectProps {
  value: string;
  options: readonly SelectOption[];
  onValueChange: (value: string) => void;
  id?: string;
  /** The accessible name when no <label htmlFor={id}> names it. */
  "aria-label"?: string;
  name?: string;
  disabled?: boolean;
  /** Width and layout overrides for the closed control (as the native select took them). */
  className?: string;
  "data-testid"?: string;
  "aria-busy"?: boolean;
}

const noop = () => () => {};
const yes = () => true;
const no = () => false;
const GAP = 4;
const MARGIN = 8;
const TYPE_AHEAD_MS = 500;

/** The option a type-ahead string reaches: the next one after `from` whose label starts with it (a repeated letter cycles). */
export function typeAhead(options: readonly SelectOption[], typed: string, from: number): number {
  const q = typed.toLowerCase();
  if (!q) return -1;
  const repeated = q.length > 1 && [...q].every((c) => c === q[0]);
  const needle = repeated ? q[0]! : q;
  const n = options.length;
  // A new search starts at the current option (it may already match); a repeated letter moves on.
  const start = repeated || q.length === 1 ? from + 1 : from;
  for (let k = 0; k < n; k++) {
    const i = (((start + k) % n) + n) % n;
    const o = options[i]!;
    if (!o.disabled && o.label.toLowerCase().startsWith(needle)) return i;
  }
  return -1;
}

/** The next enabled option from `from` in direction `step`, clamped to the list's ends. */
export function nextEnabled(options: readonly SelectOption[], from: number, step: number): number {
  let i = from;
  for (;;) {
    const j = i + step;
    if (j < 0 || j >= options.length) return i >= 0 && i < options.length && !options[i]!.disabled ? i : from;
    i = j;
    if (!options[i]!.disabled) return i;
  }
}

export function Select(props: SelectProps) {
  const native = useWindowPosture();
  const ready = React.useSyncExternalStore(noop, yes, no);
  // A field of a form (it has a `name`) is the browser's own select until the page's code runs, so
  // the form works without JavaScript (the Overview's filters and their noscript Apply).
  if (native || (props.name && !ready)) {
    const { value, options, onValueChange, className, "data-testid": testId, ...rest } = props;
    return (
      <NativeSelect {...rest} value={value} onChange={(e) => onValueChange(e.target.value)} className={className} data-testid={testId} data-ready={ready || undefined}>
        {runsOf(options).map((run) => {
          const items = run.items.map(({ option: o }) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </option>
          ));
          return run.group === undefined ? items : <optgroup key={`g-${run.items[0]!.option.value}`} label={run.group}>{items}</optgroup>;
        })}
      </NativeSelect>
    );
  }
  return <PopoverSelect {...props} />;
}

function PopoverSelect({ value, options, onValueChange, id, "aria-label": ariaLabel, name, disabled, className, "data-testid": testId, "aria-busy": busy }: SelectProps) {
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(-1);
  const [pos, setPos] = React.useState<{ top: number; left: number; minWidth: number; maxHeight: number; up: boolean } | null>(null);
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);
  const typed = React.useRef({ text: "", at: 0 });
  const listId = React.useId();
  // The list's name: the field's (its aria-label, or the text of the <label> naming its button).
  const [listName, setListName] = React.useState<string | undefined>(ariaLabel);
  // Hydrated: until then a press does nothing (tests wait for it: e2e/select.ts).
  const ready = React.useSyncExternalStore(noop, yes, no);
  const selected = options.findIndex((o) => o.value === value);
  const current = options[selected];

  const close = React.useCallback(() => {
    setOpen(false);
    setPos(null);
  }, []);

  const choose = (i: number) => {
    const o = options[i];
    close();
    if (!o || o.disabled) return;
    if (o.value !== value) onValueChange(o.value);
  };

  const show = () => {
    if (disabled) return;
    setListName(ariaLabel ?? labelOf(buttonRef.current));
    setActive(selected >= 0 ? selected : nextEnabled(options, -1, 1));
    setOpen(true);
  };

  const place = React.useCallback(() => {
    const b = buttonRef.current;
    const l = listRef.current;
    if (!b || !l) return;
    const r = b.getBoundingClientRect();
    const { width: W, height: H } = screenBox();
    const needs = l.scrollHeight;
    const below = H - r.bottom - GAP - MARGIN;
    const above = r.top - GAP - MARGIN;
    const up = below < needs && above > below;
    const room = Math.max(120, up ? above : below);
    const shown = Math.min(needs, room);
    const width = Math.max(l.offsetWidth, r.width);
    const left = Math.max(MARGIN, Math.min(r.left, W - MARGIN - width));
    const top = up ? r.top - GAP - shown : r.bottom + GAP;
    // Fixed positioning is relative to the screen, unless what holds the list moves that box (a
    // transform, in a window's opening motion): where the list's (0, 0) lands says by how much.
    const origin = originOf(l);
    setPos({ top: Math.max(MARGIN, top) - origin.y, left: left - origin.x, minWidth: r.width, maxHeight: room, up });
  }, []);

  React.useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  // The active option stays in view in a list that scrolls.
  React.useLayoutEffect(() => {
    if (!open || active < 0) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    el?.scrollIntoView?.({ block: "nearest" });
  }, [open, active, pos]);

  React.useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node;
      if (listRef.current?.contains(t) || buttonRef.current?.contains(t)) return;
      close();
    };
    let frame = 0;
    const onScroll = (e: Event) => {
      if (listRef.current?.contains(e.target as Node)) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const r = buttonRef.current?.getBoundingClientRect();
        if (!r || r.bottom < 0 || r.top > screenHeight()) close();
        else place();
      });
    };
    const onResize = () => close();
    // Escape closes the list alone, as a native select's picker does: heard first (the window, on
    // the way down) and kept from what holds it (Refine's panel, a Peek, the Filters window).
    const onEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      close();
    };
    window.addEventListener("keydown", onEscape, true);
    document.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onEscape, true);
    };
  }, [open, close, place]);

  // A disabled control (a choice loading) never holds an open list.
  if (disabled && open) close();

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    const k = e.key;
    // A key that is not a letter ends a type-ahead word: a Space after Home chooses, it does not search.
    if (k.length !== 1) typed.current.text = "";
    if (!open) {
      if (k === "Enter" || k === " " || k === "ArrowDown" || k === "ArrowUp") {
        e.preventDefault();
        show();
        return;
      }
      if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // Typed while closed: the matching option is chosen, as a native select does.
        const i = typeAheadAt(k, selected, e.timeStamp);
        if (i >= 0) choose(i);
      }
      return;
    }
    if (k === "ArrowDown" && e.altKey) {
      e.preventDefault();
      return;
    }
    if (k === "ArrowUp" && e.altKey) {
      e.preventDefault();
      choose(active);
      return;
    }
    switch (k) {
      case "ArrowDown":
        e.preventDefault();
        setActive((i) => nextEnabled(options, i, 1));
        return;
      case "ArrowUp":
        e.preventDefault();
        setActive((i) => nextEnabled(options, i, -1));
        return;
      case "Home":
        e.preventDefault();
        setActive(nextEnabled(options, -1, 1));
        return;
      case "End":
        e.preventDefault();
        setActive(nextEnabled(options, options.length, -1));
        return;
      case "PageDown":
        e.preventDefault();
        setActive((i) => nextEnabled(options, Math.min(options.length, i + 9), 1));
        return;
      case "PageUp":
        e.preventDefault();
        setActive((i) => nextEnabled(options, Math.max(-1, i - 9), -1));
        return;
      case "Enter":
        e.preventDefault();
        choose(active);
        return;
      case " ":
        e.preventDefault();
        // A space inside a type-ahead word is part of it ("Ranked Solo").
        if (typed.current.text && e.timeStamp - typed.current.at < TYPE_AHEAD_MS) {
          const i = typeAheadAt(" ", active, e.timeStamp);
          if (i >= 0) setActive(i);
        } else choose(active);
        return;
      case "Escape":
        e.preventDefault();
        e.stopPropagation();
        close();
        return;
      case "Tab":
        close();
        return;
    }
    if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const i = typeAheadAt(k, active, e.timeStamp);
      if (i >= 0) setActive(i);
    }
  };

  function typeAheadAt(key: string, from: number, now: number): number {
    const t = typed.current;
    t.text = now - t.at < TYPE_AHEAD_MS ? t.text + key : key;
    t.at = now;
    return typeAhead(options, t.text, from);
  }

  const activeId = open && active >= 0 ? `${listId}-${active}` : undefined;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        id={id}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={activeId}
        aria-label={ariaLabel}
        aria-busy={busy}
        // aria-disabled, not disabled: a choice disables the control while its page loads, and a
        // disabled button would drop the focus the choice has just left on it.
        aria-disabled={disabled || undefined}
        onClick={() => (open ? close() : show())}
        onKeyDown={onKeyDown}
        // The closed control looks like the native select it replaces (input.tsx), with its chevron.
        className={cn(withDefaults(selectClass("inline-flex items-center gap-1.5 pr-2 text-left aria-disabled:cursor-default aria-disabled:opacity-50"), className), open && "border-accent")}
        data-testid={testId}
        data-value={value}
        data-select=""
        data-ready={ready || undefined}
      >
        {/* As wide as the widest option, as a native select is: a choice never changes the toolbar's
            layout, and the phone's swap to its own select at hydration moves nothing. Every label
            takes the same cell; only the current one is shown (and read). */}
        <span className="grid min-w-0 flex-1">
          <span className="truncate [grid-area:1/1]" data-select-label="">
            {current?.label ?? ""}
          </span>
          {options.map((o) => (
            <span key={o.value} className="invisible truncate [grid-area:1/1]" aria-hidden>
              {o.label}
            </span>
          ))}
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-fg-subtle transition-transform motion-reduce:transition-none", open && "rotate-180")} aria-hidden />
      </button>
      {name ? <input type="hidden" name={name} value={value} /> : null}
      {open ? (
            <ul
              ref={listRef}
              id={listId}
              role="listbox"
              aria-label={listName}
              tabIndex={-1}
              style={{ position: "fixed", top: pos?.top ?? 0, left: pos?.left ?? 0, minWidth: pos?.minWidth, maxHeight: pos?.maxHeight, visibility: pos ? "visible" : "hidden" }}
              className={cn("z-[60] max-w-[min(24rem,calc(100vw-1rem))] overflow-y-auto overscroll-contain rounded-lg border border-border-strong bg-bg-elevated p-1 shadow-2xl", pos && (pos.up ? "popover-in-up" : "popover-in"))}
              data-testid={testId ? `${testId}-list` : undefined}
              data-select-list=""
              // A press on the list keeps the focus on the button.
              onPointerDown={(e) => e.preventDefault()}
            >
              {runsOf(options).map((run) => {
                const items = run.items.map(({ option: o, index: i }) => (
                  <li
                  key={o.value}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === selected}
                  aria-disabled={o.disabled || undefined}
                  data-index={i}
                  data-value={o.value}
                  onPointerMove={() => !o.disabled && active !== i && setActive(i)}
                  onClick={() => choose(i)}
                  className={cn(
                    "flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 text-sm md:pointer-fine:min-h-9",
                    i === active ? "bg-surface-2 text-fg" : "text-fg-muted",
                    i === selected && "font-medium text-fg",
                    o.disabled && "cursor-default opacity-50",
                  )}
                >
                  <span className="min-w-0 flex-1">{o.label}</span>
                  <Check className={cn("h-4 w-4 shrink-0 text-accent", i === selected ? "visible" : "invisible")} aria-hidden />
                </li>
                ));
                if (run.group === undefined) return items;
                // A group: its heading, then its options (a listbox's group, as an <optgroup> is read).
                return (
                  <li key={`g-${run.items[0]!.option.value}`} role="group" aria-label={run.group} className="mt-1 border-t border-border/60 pt-1 first:mt-0 first:border-t-0 first:pt-0">
                    <div className="px-3 pb-0.5 pt-1 text-xs font-medium text-fg-subtle" aria-hidden>
                      {run.group}
                    </div>
                    <ul role="presentation">{items}</ul>
                  </li>
                );
              })}
            </ul>
      ) : null}
    </>
  );
}

/** The name a <label for> gives the button, for the list's own name. */
function labelOf(button: HTMLButtonElement | null): string | undefined {
  const label = button?.labels?.[0]?.textContent?.trim();
  return label || undefined;
}

/** Where a fixed element at (0, 0) actually is: the corner of the box its fixed positioning uses. */
function originOf(el: HTMLElement): { x: number; y: number } {
  const prev = { top: el.style.top, left: el.style.left };
  el.style.top = "0px";
  el.style.left = "0px";
  const r = el.getBoundingClientRect();
  el.style.top = prev.top;
  el.style.left = prev.left;
  return { x: r.left, y: r.top };
}
