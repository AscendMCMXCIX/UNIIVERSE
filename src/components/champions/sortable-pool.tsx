"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, GripVertical, X } from "lucide-react";
import type { PickerChampion } from "@/components/champion-picker";
import { ChampionPortrait } from "@/components/champion-portrait";
import { cn } from "@/lib/cn";

/** Moves one item to a new index (pure; used by drag, buttons and tests). */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const copy = [...list];
  if (from < 0 || from >= copy.length) return copy;
  const [item] = copy.splice(from, 1);
  copy.splice(Math.max(0, Math.min(copy.length, to)), 0, item!);
  return copy;
}

/**
 * An ordered champion pool: numbered cards that reorder by dragging the handle (mouse or touch),
 * or with the arrow buttons / arrow keys for keyboards. Removing is a separate, explicit ×, so a
 * drag can never drop a champion. Order expresses preference, not measured strength.
 */
export function SortablePool({ ids, championsById, onChange, onRemove, editable = true, emptySlots = 0, onAddSlot, testId }: { ids: string[]; championsById: Map<string, PickerChampion>; onChange: (ids: string[]) => void; onRemove: (id: string) => void; editable?: boolean; emptySlots?: number; onAddSlot?: () => void; testId?: string }) {
  const [drag, setDrag] = React.useState<{ id: string; order: string[]; x: number; y: number; dx: number; dy: number } | null>(null);
  const refs = React.useRef(new Map<string, HTMLLIElement>());
  const order = drag?.order ?? ids;

  // Latest values for the window listeners below (they live for one drag, not one render).
  const live = React.useRef({ drag, ids, onChange });
  React.useEffect(() => {
    live.current = { drag, ids, onChange };
  });

  const onPointerDown = (id: string) => (e: React.PointerEvent) => {
    if (!editable || (e.pointerType === "mouse" && e.button !== 0)) return;
    e.preventDefault();
    setDrag({ id, order: ids, x: e.clientX, y: e.clientY, dx: 0, dy: 0 });
  };

  // While dragging, follow the pointer on the window: the dragged card moves in the DOM as the
  // order changes, which would drop element-level pointer capture.
  const dragging = drag !== null;
  React.useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => {
      const d = live.current.drag;
      if (!d) return;
      // The card under the pointer (by centre distance) is where the dragged one goes.
      let target = d.order.indexOf(d.id);
      let best = Infinity;
      d.order.forEach((id, i) => {
        if (id === d.id) return;
        const r = refs.current.get(id)?.getBoundingClientRect();
        if (!r) return;
        const dist = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
        if (dist < best && dist < Math.max(r.width, r.height) * 0.75) {
          best = dist;
          target = i;
        }
      });
      const from = d.order.indexOf(d.id);
      const next = target !== from ? moveItem(d.order, from, target) : d.order;
      const updated = { ...d, order: next, dx: e.clientX - d.x, dy: e.clientY - d.y };
      live.current.drag = updated;
      setDrag(updated);
    };
    const onUp = () => {
      const { drag: d, ids: current, onChange: commit } = live.current;
      setDrag(null);
      if (d && d.order.some((id, i) => id !== current[i])) commit(d.order);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [dragging]);

  const move = (id: string, delta: number) => {
    const i = ids.indexOf(id);
    const j = i + delta;
    if (j < 0 || j >= ids.length) return;
    onChange(moveItem(ids, i, j));
    // Keep focus on the moved card's control so repeated presses keep moving it.
    requestAnimationFrame(() => refs.current.get(id)?.querySelector<HTMLButtonElement>(`[data-move="${delta < 0 ? "earlier" : "later"}"]`)?.focus());
  };

  return (
    <ol className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 md:grid-cols-3" data-testid={testId} aria-label="Champion pool in order of preference">
      {order.map((id, index) => {
        const c = championsById.get(id);
        const dragging = drag?.id === id;
        return (
          <li
            key={id}
            ref={(el) => {
              if (el) refs.current.set(id, el);
              else refs.current.delete(id);
            }}
            className={cn("group relative flex min-w-0 items-center gap-2 rounded-lg border border-border bg-bg-elevated p-1.5 pr-1 transition-[box-shadow,border-color] duration-150", dragging && "z-10 border-accent shadow-xl shadow-black/40")}
            style={dragging ? { transform: `translate(${drag.dx * 0.15}px, ${drag.dy * 0.15}px) scale(1.03)` } : undefined}
            data-testid="pool-item"
            data-champion={id}
            onKeyDown={(e) => {
              if (!editable || !(e.altKey || e.ctrlKey || e.metaKey)) return;
              if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                e.preventDefault();
                move(id, -1);
              }
              if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                e.preventDefault();
                move(id, 1);
              }
            }}
          >
            {editable ? (
              <span
                role="button"
                tabIndex={-1}
                aria-label={`Drag ${c?.name ?? id} to reorder`}
                className="grid h-10 w-5 shrink-0 cursor-grab touch-none place-items-center text-fg-subtle hover:text-fg active:cursor-grabbing pointer-coarse:w-7"
                onPointerDown={onPointerDown(id)}
              >
                <GripVertical className="h-4 w-4" aria-hidden />
              </span>
            ) : null}
            <span className="relative shrink-0">
              <ChampionPortrait champion={c ?? { id, name: id, portraitUrl: "" }} size="md" />
              <span className="absolute -left-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full border border-border-strong bg-bg px-1 text-xs font-bold text-fg-muted">{index + 1}</span>
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{c?.name ?? id}</span>
            {editable ? (
              <span className="flex shrink-0 items-center">
                <span className="flex opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:hidden">
                  <button type="button" data-move="earlier" className="grid h-7 w-6 place-items-center rounded text-fg-subtle hover:bg-surface-2 hover:text-fg disabled:opacity-30 pointer-coarse:hidden" disabled={index === 0} onClick={() => move(id, -1)} aria-label={`Move ${c?.name ?? id} earlier`}>
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button type="button" data-move="later" className="grid h-7 w-6 place-items-center rounded text-fg-subtle hover:bg-surface-2 hover:text-fg disabled:opacity-30 pointer-coarse:hidden" disabled={index === order.length - 1} onClick={() => move(id, 1)} aria-label={`Move ${c?.name ?? id} later`}>
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </span>
                <button type="button" className="grid h-7 w-7 place-items-center rounded text-fg-subtle hover:bg-bad/15 hover:text-bad pointer-coarse:h-10 pointer-coarse:w-10" onClick={() => onRemove(id)} aria-label={`Remove ${c?.name ?? id}`} data-testid="pool-remove">
                  <X className="h-4 w-4" />
                </button>
              </span>
            ) : null}
          </li>
        );
      })}
      {Array.from({ length: emptySlots }, (_, i) => (
        <li key={`empty-${i}`}>
          <button type="button" disabled={!editable || !onAddSlot} onClick={onAddSlot} className="flex h-full min-h-[3.75rem] w-full items-center justify-center rounded-lg border border-dashed border-border text-xs text-fg-subtle transition-colors hover:border-accent/50 hover:text-fg disabled:hover:border-border disabled:hover:text-fg-subtle">
            {editable ? "+ Add" : "Empty"}
          </button>
        </li>
      ))}
    </ol>
  );
}
