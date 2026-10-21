"use client";

import * as React from "react";
import { GripVertical, X, Plus } from "lucide-react";
import type { PickerChampion } from "@/components/champion-picker";
import { ChampionPortrait } from "@/components/champion-portrait";
import { cn } from "@/lib/cn";
import { championArtUrl } from "@/domain/player-card";
import { RemoteImage } from "@/components/ui/remote-image";

/** Moves one item to a new index (pure; used by drag, keyboard and tests). */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const copy = [...list];
  if (from < 0 || from >= copy.length) return copy;
  const [item] = copy.splice(from, 1);
  copy.splice(Math.max(0, Math.min(copy.length, to)), 0, item!);
  return copy;
}

/** A mouse drag starts after this many pixels, so a plain click never turns into a drag. */
const DRAG_THRESHOLD_PX = 4;
const SLIDE_MS = 170;
const EDGE_SCROLL_PX = 56;

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** An element's box inside the list, ignoring transforms (the layout slot it occupies). */
const slotOf = (el: HTMLElement): Box => ({ x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight });

/** Which index the pointer is over, by the layout slots of the other cards (stable while they animate). */
export function targetIndex(order: readonly string[], dragged: string, slots: Map<string, Box>, px: number, py: number, current: number): number {
  for (let i = 0; i < order.length; i++) {
    const id = order[i]!;
    if (id === dragged) continue;
    const s = slots.get(id);
    if (s && px >= s.x && px <= s.x + s.w && py >= s.y && py <= s.y + s.h) return i;
  }
  // Past the last card (or below the list): the end.
  const last = slots.get(order[order.length - 1]!);
  if (last && (py > last.y + last.h || (py >= last.y && px > last.x + last.w))) return order.length - 1;
  return current;
}

interface DragState {
  id: string;
  order: string[];
  /** Pointer position inside the card when it was picked up. */
  grabX: number;
  grabY: number;
  /** Latest pointer position, list coordinates. */
  px: number;
  py: number;
}

/** No text gets selected while a card is dragged across the page. */
function lockTextSelection(lock: boolean) {
  document.body.style.userSelect = lock ? "none" : "";
}

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * An ordered champion pool. Reorder by dragging a card (mouse: anywhere on the card; touch: the
 * grip): the card follows the pointer, a dashed slot shows where it will land and the others slide
 * out of the way. Keyboard: focus a card's grip, Space or Enter to pick it up, arrow keys to move,
 * Space or Enter to drop, Escape to cancel (a screen reader hears each step). Nothing is saved
 * until the drop; Escape or a cancelled pointer restores the order. Removing is a separate ×, so a
 * drag can never drop a champion. Order expresses preference, not measured strength.
 */
export function SortablePool({
  ids,
  championsById,
  onChange,
  onRemove,
  editable = true,
  emptySlots = 0,
  onAddSlot,
  testId,
  addTestId,
  renderMeta,
  renderStats,
  addSlot,
  gridClassName,
  onInspect,
  inspectHref,
  inspectLabel = "statistics and matchups",
}: {
  /** Opens the champion (the profile's champion window). A click opens it; a drag never does. */
  onInspect?: (id: string) => void;
  /**
   * The address that shows the champion. With it the card is a real link: a click that lands
   * before the page is interactive (a slow phone) still opens the champion, by loading its address.
   */
  inspectHref?: (id: string) => string;
  /** What opening a champion shows, for its accessible name. */
  inspectLabel?: string;
  ids: string[];
  championsById: Map<string, PickerChampion>;
  onChange: (ids: string[]) => void;
  onRemove: (id: string) => void;
  editable?: boolean;
  emptySlots?: number;
  onAddSlot?: () => void;
  testId?: string;
  addTestId?: string;
  /** A quiet line under a champion's name (e.g. its proficiency). */
  renderMeta?: (id: string) => React.ReactNode;
  /** The champion's figures, as a band along the bottom of its card (all cards keep one height). */
  renderStats?: (id: string) => React.ReactNode;
  /** A custom last cell (e.g. an inline "Add" search) instead of the empty-slot buttons. */
  addSlot?: React.ReactNode;
  gridClassName?: string;
}) {
  const [drag, setDrag] = React.useState<DragState | null>(null);
  const [kbd, setKbd] = React.useState<{ id: string; order: string[] } | null>(null);
  const [announce, setAnnounce] = React.useState("");
  const listRef = React.useRef<HTMLOListElement>(null);
  const placeholderRef = React.useRef<HTMLLIElement>(null);
  const refs = React.useRef(new Map<string, HTMLLIElement>());
  const prevSlots = React.useRef(new Map<string, Box>());
  const order = drag?.order ?? kbd?.order ?? ids;
  const nameOf = (id: string) => championsById.get(id)?.name ?? id;

  const live = React.useRef({ drag, ids, onChange });
  const nameOfRef = React.useRef(nameOf);
  React.useEffect(() => {
    live.current = { drag, ids, onChange };
    nameOfRef.current = nameOf;
  });

  /** Puts the dragged card under the pointer, relative to whatever slot it occupies now. */
  const placeDragged = React.useCallback((d: DragState) => {
    const el = refs.current.get(d.id);
    if (!el) return;
    const slot = slotOf(el);
    el.style.transform = `translate(${d.px - d.grabX - slot.x}px, ${d.py - d.grabY - slot.y}px) scale(1.04)`;
    const ph = placeholderRef.current;
    if (ph) {
      ph.style.transform = `translate(${slot.x}px, ${slot.y}px)`;
      ph.style.width = `${slot.w}px`;
      ph.style.height = `${slot.h}px`;
    }
  }, []);

  // Slide the other cards from their old slot to the new one whenever the order changes (FLIP).
  React.useLayoutEffect(() => {
    const next = new Map<string, Box>();
    const animate = !reducedMotion();
    for (const [id, el] of refs.current) {
      const slot = slotOf(el);
      next.set(id, slot);
      const prev = prevSlots.current.get(id);
      if (!prev || id === drag?.id || (prev.x === slot.x && prev.y === slot.y)) continue;
      if (animate && typeof el.animate === "function") el.animate([{ transform: `translate(${prev.x - slot.x}px, ${prev.y - slot.y}px)` }, { transform: "translate(0, 0)" }], { duration: SLIDE_MS, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" });
    }
    prevSlots.current = next;
    if (drag) placeDragged(drag);
  }, [order, drag, placeDragged]);

  const toListCoords = (clientX: number, clientY: number) => {
    const r = listRef.current!.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top };
  };

  // A drag ends with a click on the card it moved; that click must not open the champion.
  const dragged = React.useRef(false);
  const begin = (id: string, clientX: number, clientY: number) => {
    dragged.current = true;
    const el = refs.current.get(id);
    if (!el || !listRef.current) return;
    const p = toListCoords(clientX, clientY);
    const slot = slotOf(el);
    const d: DragState = { id, order: ids, grabX: p.x - slot.x, grabY: p.y - slot.y, px: p.x, py: p.y };
    live.current.drag = d;
    setKbd(null);
    setDrag(d);
    setAnnounce(`Picked up ${nameOf(id)}.`);
  };

  const onPointerDown = (id: string, fromHandle: boolean) => (e: React.PointerEvent) => {
    if (fromHandle) e.stopPropagation();
    if (!editable || (e.pointerType === "mouse" && e.button !== 0)) return;
    // Touch scrolls the page from the card; only the grip drags.
    if (e.pointerType !== "mouse" && !fromHandle) return;
    if ((e.target as HTMLElement).closest("button:not([data-grip]):not([data-inspect])")) return;
    dragged.current = false;
    const startX = e.clientX;
    const startY = e.clientY;
    if (fromHandle && e.pointerType !== "mouse") {
      e.preventDefault();
      begin(id, startX, startY);
      return;
    }
    const onMove = (ev: PointerEvent) => {
      if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_THRESHOLD_PX) return;
      cleanup();
      begin(id, startX, startY);
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", cleanup);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", cleanup);
  };

  // While dragging, follow the pointer on the window (the card moves in the DOM as the order
  // changes, which would lose element-level pointer capture).
  const dragging = drag !== null;
  React.useEffect(() => {
    if (!dragging) return;
    const finish = (commit: boolean) => {
      const { drag: d, ids: current, onChange: save } = live.current;
      live.current.drag = null;
      const el = d ? refs.current.get(d.id) : null;
      if (el) {
        const from = el.style.transform;
        el.style.transform = "";
        if (from && !reducedMotion() && typeof el.animate === "function") el.animate([{ transform: from }, { transform: "none" }], { duration: 140, easing: "ease-out" });
      }
      setDrag(null);
      lockTextSelection(false);
      if (!d) return;
      const changed = d.order.some((id, i) => id !== current[i]);
      if (commit && changed) {
        save(d.order);
        setAnnounce(`${nameOfRef.current(d.id)} dropped at position ${d.order.indexOf(d.id) + 1} of ${d.order.length}.`);
      } else setAnnounce(commit ? `${nameOfRef.current(d.id)} dropped; order unchanged.` : "Reorder cancelled.");
    };
    const onMove = (e: PointerEvent) => {
      const d = live.current.drag;
      if (!d || !listRef.current) return;
      e.preventDefault();
      const p = toListCoords(e.clientX, e.clientY);
      const slots = new Map<string, Box>();
      for (const [id, el] of refs.current) slots.set(id, slotOf(el));
      const from = d.order.indexOf(d.id);
      const to = targetIndex(d.order, d.id, slots, p.x, p.y, from);
      const next: DragState = { ...d, px: p.x, py: p.y, order: to !== from ? moveItem(d.order, from, to) : d.order };
      live.current.drag = next;
      if (next.order !== d.order) setDrag(next);
      else placeDragged(next);
      // Large pools: scroll when the pointer nears the top or bottom of the window.
      if (e.clientY < EDGE_SCROLL_PX) window.scrollBy(0, -12);
      else if (e.clientY > window.innerHeight - EDGE_SCROLL_PX) window.scrollBy(0, 12);
    };
    const onUp = () => finish(true);
    const onCancel = () => finish(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish(false);
    };
    lockTextSelection(true);
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey);
      lockTextSelection(false);
    };
  }, [dragging, placeDragged]);

  const focusGrip = (id: string) => requestAnimationFrame(() => refs.current.get(id)?.querySelector<HTMLElement>("[data-grip]")?.focus());

  const onGripKey = (id: string) => (e: React.KeyboardEvent) => {
    if (!editable) return;
    const pick = e.key === " " || e.key === "Enter";
    if (!kbd) {
      if (pick) {
        e.preventDefault();
        setKbd({ id, order: ids });
        setAnnounce(`Picked up ${nameOf(id)}, position ${ids.indexOf(id) + 1} of ${ids.length}. Use the arrow keys to move, Space to drop, Escape to cancel.`);
        return;
      }
      // Quick move without picking up: Alt/Ctrl + arrow saves at once.
      const delta = e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : 0;
      if (delta && (e.altKey || e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        const i = ids.indexOf(id);
        if (i + delta < 0 || i + delta >= ids.length) return;
        onChange(moveItem(ids, i, i + delta));
        setAnnounce(`${nameOf(id)} moved to position ${i + delta + 1} of ${ids.length}.`);
        focusGrip(id);
      }
      return;
    }
    if (kbd.id !== id) return;
    const i = kbd.order.indexOf(id);
    if (e.key === "ArrowLeft" || e.key === "ArrowUp" || e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === "Home" || e.key === "End") {
      e.preventDefault();
      const to = e.key === "Home" ? 0 : e.key === "End" ? kbd.order.length - 1 : Math.max(0, Math.min(kbd.order.length - 1, i + (e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 1)));
      if (to === i) return;
      setKbd({ id, order: moveItem(kbd.order, i, to) });
      setAnnounce(`${nameOf(id)}, position ${to + 1} of ${kbd.order.length}.`);
      focusGrip(id);
    } else if (pick) {
      e.preventDefault();
      const changed = kbd.order.some((x, j) => x !== ids[j]);
      if (changed) onChange(kbd.order);
      setKbd(null);
      setAnnounce(changed ? `${nameOf(id)} dropped at position ${i + 1} of ${kbd.order.length}.` : `${nameOf(id)} dropped; order unchanged.`);
    } else if (e.key === "Escape" || e.key === "Tab") {
      if (e.key === "Escape") e.preventDefault();
      setKbd(null);
      setAnnounce("Reorder cancelled.");
      if (e.key === "Escape") focusGrip(id);
    }
  };

  return (
    <div className="relative">
      <ol ref={listRef} className={cn("relative grid gap-2", gridClassName ?? "grid-cols-1 @sm:grid-cols-2 @2xl:grid-cols-3")} data-testid={testId} aria-label="Champion pool in order of preference" aria-describedby={editable ? `${testId ?? "pool"}-help` : undefined}>
        {drag ? <li ref={placeholderRef} role="presentation" aria-hidden className="pointer-events-none absolute left-0 top-0 rounded-panel border-2 border-dashed border-accent/50 bg-accent/5" data-testid="pool-placeholder" /> : null}
        {order.map((id, index) => {
          const c = championsById.get(id);
          const isDragged = drag?.id === id;
          const isLifted = kbd?.id === id;
          return (
            <li
              key={id}
              ref={(el) => {
                if (el) refs.current.set(id, el);
                else refs.current.delete(id);
              }}
              className={cn(
                "group relative isolate flex min-w-0 flex-col overflow-hidden rounded-panel border border-border bg-surface/70 transition-[box-shadow,border-color,background-color] duration-150 hover:border-border-strong hover:bg-surface",
                editable && "md:cursor-grab",
                isDragged && "z-20 cursor-grabbing border-accent bg-surface-2 shadow-2xl shadow-black/50 will-change-transform",
                isLifted && "z-10 border-accent ring-2 ring-accent/40",
              )}
              data-testid="pool-item"
              data-champion={id}
              data-dragging={isDragged || undefined}
              onPointerDown={editable ? onPointerDown(id, false) : undefined}
            >
              {renderStats ? (
                // The champion's own splash art, quiet behind the figures: a static image (lazy, no
                // blur; a little brighter on hover) under a dark gradient that keeps every label readable whatever
                // the artwork. Riot's art, through the same address as the player cards.
                <span aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" data-testid="pool-splash">
                  <RemoteImage src={championArtUrl({ championId: id, skinNum: 0 }, "splash")} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover object-[70%_18%] opacity-55 transition-opacity duration-300 group-hover:opacity-70" />
                  <span className="absolute inset-0 bg-gradient-to-r from-surface via-surface/80 to-surface/20" />
                  <span className="absolute inset-0 bg-gradient-to-t from-bg/80 via-transparent to-transparent" />
                </span>
              ) : c?.portraitUrl ? (
                // A faint wash of the champion's own colours, so each card is recognisable at a glance.
                <span aria-hidden className="pointer-events-none absolute -inset-6 -z-10 scale-110 bg-cover bg-center opacity-[0.13] blur-2xl" style={{ backgroundImage: `url(${c.portraitUrl})` }} />
              ) : null}
              {onInspect && inspectHref ? (
                // The whole card opens the champion; the grip, × and the proficiency note sit above it.
                // Keyboard: Tab reaches it (Enter opens); the grip has its own reordering keys. A real
                // link: before the page is interactive a click loads the champion's address instead
                // (the server opens the window); afterwards it opens in place. Not draggable, so the
                // browser never drags the address instead of the card.
                <a
                  href={inspectHref(id)}
                  draggable={false}
                  data-inspect
                  onClick={(e) => {
                    if (dragged.current) {
                      e.preventDefault();
                      dragged.current = false;
                      return;
                    }
                    // A new tab or window keeps the browser's own behaviour.
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                    e.preventDefault();
                    onInspect(id);
                  }}
                  className="absolute inset-0 z-0 rounded-panel focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
                  aria-label={`${c?.name ?? id}: ${inspectLabel}`}
                  aria-haspopup="dialog"
                  data-testid="pool-inspect"
                />
              ) : onInspect ? (
                <button
                  type="button"
                  data-inspect
                  onClick={() => {
                    if (dragged.current) {
                      dragged.current = false;
                      return;
                    }
                    onInspect(id);
                  }}
                  className="absolute inset-0 z-0 rounded-panel focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
                  aria-label={`${c?.name ?? id}: ${inspectLabel}`}
                  aria-haspopup="dialog"
                  data-testid="pool-inspect"
                />
              ) : null}
              <div className={cn("flex min-w-0 items-center gap-3", renderStats ? "p-2.5" : "p-2", onInspect && "pointer-events-none relative z-[1] [&_button]:pointer-events-auto [&_[role=button]]:pointer-events-auto")}>
                <span className="pointer-events-none relative shrink-0">
                  <ChampionPortrait champion={c ?? { id, name: id, portraitUrl: "" }} size="md" className="rounded-lg shadow-md shadow-black/30" />
                  <span className="absolute -left-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full border border-border-strong bg-bg px-1 text-xs font-bold tabular-nums text-fg-muted">{index + 1}</span>
                </span>
                <span className="min-w-0 flex-1 select-none">
                  <span className={cn("block truncate font-semibold text-fg", renderStats ? "text-base leading-tight" : "text-sm", onInspect && "group-hover:underline group-hover:decoration-fg-subtle group-hover:underline-offset-2")}>{c?.name ?? id}</span>
                  {renderMeta ? <span className="mt-1 block">{renderMeta(id)}</span> : null}
                </span>
                {editable ? (
                  // Editing controls stay out of the way until the card is pointed at or focused
                  // (always shown on touch screens, where there is no hover).
                  <span className="flex shrink-0 items-center gap-0.5 self-start opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100">
                    <span
                      role="button"
                      tabIndex={0}
                      data-grip
                      aria-roledescription="sortable"
                      aria-pressed={isLifted}
                      aria-label={`${c?.name ?? id}, position ${index + 1} of ${order.length}. Press Space to pick up and reorder.`}
                      className="grid h-8 w-7 cursor-grab touch-none place-items-center rounded-md text-fg-subtle hover:bg-surface-2 hover:text-fg focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-accent active:cursor-grabbing pointer-coarse:h-10 pointer-coarse:w-9"
                      onPointerDown={onPointerDown(id, true)}
                      onKeyDown={onGripKey(id)}
                      onBlur={() => {
                        if (kbd?.id === id) {
                          setKbd(null);
                          setAnnounce("Reorder cancelled.");
                        }
                      }}
                      data-testid="pool-grip"
                    >
                      <GripVertical className="h-4 w-4" aria-hidden />
                    </span>
                    <button type="button" className="grid h-8 w-7 place-items-center rounded-md text-fg-subtle hover:bg-bad/15 hover:text-bad pointer-coarse:h-10 pointer-coarse:w-9" onClick={() => onRemove(id)} aria-label={`Remove ${c?.name ?? id}`} data-testid="pool-remove">
                      <X className="h-4 w-4" />
                    </button>
                  </span>
                ) : null}
              </div>
              {renderStats ? <div className={cn("mt-auto border-t border-border/60 bg-bg/55", onInspect && "pointer-events-none relative z-[1]")}>{renderStats(id)}</div> : null}
            </li>
          );
        })}
        {addSlot ? <li className="min-w-0">{addSlot}</li> : null}
        {Array.from({ length: addSlot ? 0 : emptySlots }, (_, i) => (
          <li key={`empty-${i}`}>
            <button type="button" disabled={!editable || !onAddSlot} onClick={onAddSlot} className="flex h-full min-h-[3.75rem] w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border text-sm text-fg-subtle transition-colors hover:border-accent/50 hover:bg-accent/5 hover:text-fg disabled:hover:border-border disabled:hover:text-fg-subtle" data-testid={i === 0 ? addTestId : undefined}>
              {editable ? (
                <>
                  <Plus className="h-4 w-4" aria-hidden /> Add
                </>
              ) : (
                "Empty"
              )}
            </button>
          </li>
        ))}
      </ol>
      {editable ? (
        <p id={`${testId ?? "pool"}-help`} className="sr-only">
          Drag a champion to reorder. With a keyboard, focus its grip, press Space to pick it up, move with the arrow keys and press Space to drop.
        </p>
      ) : null}
      <p className="sr-only" aria-live="assertive" data-testid="pool-announce">
        {announce}
      </p>
    </div>
  );
}
