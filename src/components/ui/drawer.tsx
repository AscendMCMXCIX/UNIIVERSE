"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * A panel that slides over the right edge of the screen (native <dialog>: focus is trapped and
 * Escape closes it). For secondary detail that should not push the main workspace off screen.
 */
export function Drawer({ open, onClose, title, description, children, className, testId }: { open: boolean; onClose: () => void; title: string; description?: React.ReactNode; children?: React.ReactNode; className?: string; testId?: string }) {
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
      aria-labelledby="drawer-title"
      className={cn("m-0 ml-auto h-dvh max-h-none w-[min(40rem,100vw)] max-w-none border-l border-border-strong bg-bg-elevated p-0 text-fg shadow-2xl backdrop:bg-black/50 backdrop:backdrop-blur-[1px] motion-safe:drawer-in", className)}
      data-testid={testId}
    >
      {open ? (
        <div className="flex h-full flex-col">
          <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
            <div className="min-w-0">
              <h2 id="drawer-title" className="text-base font-semibold">
                {title}
              </h2>
              {description ? <p className="mt-0.5 text-sm text-fg-muted">{description}</p> : null}
            </div>
            <button type="button" onClick={onClose} className="-m-1 rounded p-2 text-fg-subtle hover:text-fg" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">{children}</div>
        </div>
      ) : null}
    </dialog>
  );
}
