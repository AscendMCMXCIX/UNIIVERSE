"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * A panel that slides over the right edge of the screen (native <dialog>: focus is trapped and
 * Escape closes it). For secondary detail that should not push the main workspace off screen.
 */
export function Drawer({ open, onClose, title, description, children, className, testId, sheetOnPhone = false, headerExtra, titleId = "drawer-title" }: { open: boolean; onClose: () => void; title: string; description?: React.ReactNode; children?: React.ReactNode; className?: string; testId?: string; /** Phones: a bottom sheet (thumb-reachable, page visible above) instead of a full-width side panel. */ sheetOnPhone?: boolean; /** Controls beside the close button (e.g. previous / next). */ headerExtra?: React.ReactNode; titleId?: string }) {
  const ref = React.useRef<HTMLDialogElement>(null);
  React.useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby={titleId}
      className={cn(
        "max-w-none bg-bg-elevated p-0 text-fg shadow-2xl backdrop:bg-black/50 backdrop:backdrop-blur-[1px]",
        sheetOnPhone
          ? "m-0 mt-auto h-auto max-h-[88dvh] w-full rounded-t-card border-t border-border-strong motion-safe:rise-in sm:ml-auto sm:mt-0 sm:h-dvh sm:max-h-none sm:w-[min(32rem,100vw)] sm:rounded-none sm:border-l sm:border-t-0 sm:motion-safe:drawer-in"
          : "m-0 ml-auto h-dvh max-h-none w-[min(40rem,100vw)] border-l border-border-strong motion-safe:drawer-in",
        className,
      )}
      data-testid={testId}
    >
      {open ? (
        <div className={cn("flex flex-col", sheetOnPhone ? "max-h-[88dvh] pb-safe sm:h-full sm:max-h-none" : "h-full")}>
          {sheetOnPhone ? <span className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border-strong sm:hidden" aria-hidden /> : null}
          <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
            <div className="min-w-0">
              <h2 id={titleId} className="text-base font-semibold">
                {title}
              </h2>
              {description ? <p className="mt-0.5 text-sm text-fg-muted">{description}</p> : null}
            </div>
            <span className="flex shrink-0 items-center gap-1">
              {headerExtra}
              <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-md text-fg-subtle hover:bg-surface-2 hover:text-fg pointer-coarse:h-11 pointer-coarse:w-11" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">{children}</div>
        </div>
      ) : null}
    </dialog>
  );
}
