"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "@/lib/cn";
import { noTopLayer, subscribeModals, topLayer } from "./top-layer";

/*
  Toast notifications: short-lived messages for things that just happened (saved, failed, signed
  out elsewhere). Persistent problems belong on the page they concern, never in a global header.
  A tiny module store keeps this dependency-free; <Toaster /> renders it once in the root layout.

  While a window is open the toasts are drawn inside it (the topmost one, top-layer.ts): a window is
  in the browser's top layer, above the page and its z-indexes, and everything outside it is inert,
  so a toast left on the page was out of sight and its buttons could not be pressed (an editor's
  error never showed). They keep their place on the screen either way: they go into a window once
  its opening motion is over and leave it as its closing motion starts, because a moving window
  carries what is fixed inside it along (they once jumped into the window's corner and slid away
  with a closing sheet). A screen reader hears each toast once: one raised as its window closed
  (`toast.success(...); onClose()`) is heard on the page, not lost with the window.
*/

export type ToastTone = "success" | "info" | "warning" | "error";

export interface ToastItem {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  /** Milliseconds before it disappears; errors with an action stay until dismissed. */
  duration: number;
}

type Listener = () => void;
let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<Listener>();
const timers = new Map<number, ReturnType<typeof setTimeout>>();
const MAX_VISIBLE = 3;

function emit() {
  for (const l of listeners) l();
}

export function dismissToast(id: number) {
  const t = timers.get(id);
  if (t) clearTimeout(t);
  timers.delete(id);
  items = items.filter((i) => i.id !== id);
  emit();
}

function push(tone: ToastTone, title: string, options: { description?: string; action?: ToastItem["action"]; duration?: number } = {}): number {
  // The same message twice in a row replaces the older one instead of stacking.
  const dup = items.find((i) => i.title === title && i.tone === tone);
  if (dup) dismissToast(dup.id);
  const duration = options.duration ?? (tone === "error" ? (options.action ? 0 : 8000) : tone === "warning" ? 6000 : 3500);
  const item: ToastItem = { id: nextId++, tone, title, description: options.description, action: options.action, duration };
  items = [...items, item].slice(-MAX_VISIBLE);
  if (duration > 0) timers.set(item.id, setTimeout(() => dismissToast(item.id), duration));
  emit();
  return item.id;
}

export const toast = {
  success: (title: string, options?: { description?: string; duration?: number }) => push("success", title, options),
  info: (title: string, options?: { description?: string; duration?: number }) => push("info", title, options),
  warning: (title: string, options?: { description?: string; duration?: number }) => push("warning", title, options),
  error: (title: string, options?: { description?: string; action?: ToastItem["action"]; duration?: number }) => push("error", title, options),
};

function subscribe(l: Listener) {
  listeners.add(l);
  return () => listeners.delete(l);
}
const snapshot = () => items;
/** The same empty list on every call: a new one each time makes React re-render without end. */
const NO_TOASTS: ToastItem[] = [];
const serverSnapshot = (): ToastItem[] => NO_TOASTS;

const ICONS = { success: CheckCircle2, info: Info, warning: AlertTriangle, error: XCircle } as const;
const TONES: Record<ToastTone, string> = { success: "text-good", info: "text-accent", warning: "text-warn", error: "text-bad" };

const NO_IDS: ReadonlySet<number> = new Set();

/**
 * A moment, in two uses. How long a toast is live (drawn with its live role, in a region in place)
 * before it counts as heard: a screen reader speaks what a live region gains within a moment, and a
 * toast gone sooner (raised as its window closed: `toast.success(...); onClose()`) was likely never
 * spoken. And how long the region is in a new place before a toast is added to it there: a live
 * region speaks what is added to it, not what it holds as it appears. Longer than a window's closing
 * motion (DetailModal's EXIT_MS, 140 ms), so a toast raised as a window starts to close is added
 * once the page under it is in reach again.
 */
const SETTLE_MS = 200;

/**
 * Which toasts a screen reader has heard. A toast drawn live (`live`) counts as heard once it has been
 * so for `ms` where the region is. The region leaving its place first, or a window moving in over it
 * (`moved`), stops the clocks of the toasts not yet heard: they are heard where the region settles
 * instead. Each is heard once, however often the toasts move.
 */
export function hearing(ms: number) {
  const heard = new Set<number>();
  const clocks = new Map<number, ReturnType<typeof setTimeout>>();
  return {
    has: (id: number) => heard.has(id),
    /** These toasts are drawn live now: each one's clock runs from the first time it is. */
    live(ids: readonly number[]) {
      for (const id of ids) {
        if (heard.has(id) || clocks.has(id)) continue;
        clocks.set(
          id,
          setTimeout(() => {
            clocks.delete(id);
            heard.add(id);
          }, ms),
        );
      }
    },
    /** The region left its place, or a window moving in covers it. */
    moved() {
      for (const clock of clocks.values()) clearTimeout(clock);
      clocks.clear();
    },
    /** Only these toasts are shown: the others are forgotten. */
    keep(ids: ReadonlySet<number>) {
      for (const id of heard) if (!ids.has(id)) heard.delete(id);
      for (const [id, clock] of clocks) {
        if (ids.has(id)) continue;
        clearTimeout(clock);
        clocks.delete(id);
      }
    },
  };
}
/** The Toaster's (there is one, in the root layout). */
const heard = hearing(SETTLE_MS);

/**
 * Which toasts the region draws, and which carry their live role (heard as they are added): those
 * that moved with it (`moved`, heard where they first showed) are drawn without one, so they are not
 * heard again; the others are drawn with it once the region is `ready`, and held back until then.
 */
export function drawnToasts<T extends { id: number }>(list: readonly T[], moved: ReadonlySet<number>, ready: boolean): Array<{ toast: T; live: boolean }> {
  return list.flatMap((toast): Array<{ toast: T; live: boolean }> => (moved.has(toast.id) ? [{ toast, live: false }] : ready ? [{ toast, live: true }] : []));
}

/**
 * Renders the toasts: bottom-right on desktop, above the tab bar on phones (near the bottom edge when
 * a phone is held sideways); announced politely to screen readers, an error at once. In place on the
 * page, or inside the topmost open window at rest (top-layer.ts), following windows as they open and
 * close: into a window once its opening motion is over, out of it as its closing motion starts, so
 * the toasts never ride a window's motion. While a window moves in over them they stay where they
 * were, under it, and wait. Moving draws the region again in its new place: the toasts already heard
 * come along without their live role, and the others (new ones, and one gone with its window before
 * it could be heard) wait a moment (SETTLE_MS) for the region to be in place, so that every toast is
 * heard once, never twice.
 */
export function Toaster() {
  const list = React.useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const layer = React.useSyncExternalStore(subscribeModals, topLayer, noTopLayer);
  const [place, setPlace] = React.useState<{ host: HTMLDialogElement | null; opening: boolean; moved: ReadonlySet<number>; ready: boolean }>({ host: null, opening: false, moved: NO_IDS, ready: true });
  if (place.host !== layer.host || place.opening !== layer.opening) {
    // The region leaves its place, or a window moving in covers it: what was heard there stays heard
    // (drawn on without its role), and the rest waits to be heard where the region comes to rest.
    setPlace({ host: layer.host, opening: layer.opening, moved: new Set(list.filter((t) => heard.has(t.id)).map((t) => t.id)), ready: false });
  }
  const host = layer.host;
  React.useEffect(() => {
    if (place.ready || place.opening) return;
    const timer = window.setTimeout(() => setPlace((p) => (p.host === host && !p.opening ? { ...p, ready: true } : p)), SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [place.ready, place.opening, host]);
  // The toasts not yet heard where the region was are heard where it goes.
  React.useEffect(() => () => heard.moved(), [place.host, place.opening]);
  const drawn = drawnToasts(list, place.moved, place.ready);
  React.useEffect(() => {
    heard.live(drawn.filter((d) => d.live).map((d) => d.toast.id));
    heard.keep(new Set(list.map((t) => t.id)));
  });
  const region = (
    // data-floating: drawn over a window without being part of it, so a finger on a toast never
    // pulls the sheet under it (DetailModal's useSheetDrag).
    <div aria-live="polite" aria-relevant="additions" className="pointer-events-none fixed bottom-tabbar left-[max(0.75rem,env(safe-area-inset-left))] right-[max(0.75rem,env(safe-area-inset-right))] z-[60] flex flex-col items-end gap-2 md:inset-x-auto md:bottom-5 md:right-5 md:w-96" data-floating="" data-testid="toaster">
      {drawn.map(({ toast: t, live }) => {
        const Icon = ICONS[t.tone];
        return (
          <div key={t.id} role={live ? (t.tone === "error" ? "alert" : "status") : undefined} className="toast-in pointer-events-auto flex w-full items-start gap-3 rounded-lg border border-border-strong bg-bg-elevated/95 px-3.5 py-3 text-sm shadow-xl backdrop-blur" data-testid="toast" data-tone={t.tone}>
            <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", TONES[t.tone])} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-fg">{t.title}</p>
              {t.description ? <p className="mt-0.5 text-xs text-fg-muted">{t.description}</p> : null}
              {t.action ? (
                <button
                  type="button"
                  className="mt-1.5 text-xs font-semibold text-accent hover:underline"
                  onClick={() => {
                    t.action?.onClick();
                    dismissToast(t.id);
                  }}
                >
                  {t.action.label}
                </button>
              ) : null}
            </div>
            {/* A 44px target around its 16px mark: the negative margins reach into the toast's own
                padding and the gap before the text, so the toast is no larger for it. */}
            <button type="button" onClick={() => dismissToast(t.id)} className="-m-3 grid h-11 w-11 shrink-0 place-items-center rounded-md text-fg-subtle hover:text-fg" aria-label="Dismiss notification">
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        );
      })}
    </div>
  );
  return host ? createPortal(region, host) : region;
}
