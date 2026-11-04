"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "@/lib/cn";

/*
  Toast notifications: short-lived messages for things that just happened (saved, failed, signed
  out elsewhere). Persistent problems belong on the page they concern, never in a global header.
  A tiny module store keeps this dependency-free; <Toaster /> renders it once in the root layout.
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

/** Renders the toasts: bottom-right on desktop, above the tab bar on phones (near the bottom edge when a phone is held sideways); announced politely to screen readers. */
export function Toaster() {
  const list = React.useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  return (
    <div aria-live="polite" aria-relevant="additions" className="pointer-events-none fixed bottom-tabbar left-[max(0.75rem,env(safe-area-inset-left))] right-[max(0.75rem,env(safe-area-inset-right))] z-[60] flex flex-col items-end gap-2 md:inset-x-auto md:bottom-5 md:right-5 md:w-96">
      {list.map((t) => {
        const Icon = ICONS[t.tone];
        return (
          <div key={t.id} role={t.tone === "error" ? "alert" : "status"} className="toast-in pointer-events-auto flex w-full items-start gap-3 rounded-lg border border-border-strong bg-bg-elevated/95 px-3.5 py-3 text-sm shadow-xl backdrop-blur" data-testid="toast" data-tone={t.tone}>
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
            <button type="button" onClick={() => dismissToast(t.id)} className="-m-1 rounded p-1 text-fg-subtle hover:text-fg" aria-label="Dismiss notification">
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
