"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn, withDefaults } from "@/lib/cn";
import { Button } from "./button";

/**
 * Modal dialog on the native <dialog> element: focus is trapped and Escape closes it for free.
 * Phones get a bottom sheet; larger screens a centred card.
 */
export function Dialog({ open, onClose, title, description, children, footer, className, tall = false }: { open: boolean; onClose: () => void; title: string; description?: React.ReactNode; children?: React.ReactNode; footer?: React.ReactNode; className?: string; /** A taller body on phones (editors with a preview). */ tall?: boolean }) {
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
      // Escape asks the owner to close (it may want to confirm first) instead of closing behind its back.
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby="dialog-title"
      // withDefaults: a caller's sm:max-w-* replaces the default instead of losing to it in stylesheet order.
      className={withDefaults("fade-in m-0 mt-auto w-full max-w-none rounded-t-xl border border-border-strong bg-bg-elevated p-0 text-fg shadow-2xl backdrop:bg-black/70 sm:m-auto sm:max-w-lg sm:rounded-panel", className)}
    >
      {open ? (
        <div className="pb-safe">
          <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
            <div className="min-w-0">
              <h2 id="dialog-title" className="text-base font-semibold">
                {title}
              </h2>
              {description ? <p className="mt-0.5 text-sm text-fg-muted">{description}</p> : null}
            </div>
            <button type="button" onClick={onClose} className="-m-1 rounded p-2 text-fg-subtle hover:text-fg" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
          {children ? <div className={cn("overflow-y-auto px-4 py-3", tall ? "max-h-[calc(100dvh-11rem)] sm:max-h-[78dvh]" : "max-h-[70dvh]")}>{children}</div> : null}
          {footer ? <div className="flex flex-wrap justify-end gap-2 border-t border-border px-4 py-3">{footer}</div> : null}
        </div>
      ) : null}
    </dialog>
  );
}

/** "Are you sure?" for destructive or sensitive actions; never used for ordinary edits (those autosave). */
export function ConfirmDialog({ open, onCancel, onConfirm, title, description, confirmLabel = "Confirm", tone = "danger", busy = false }: { open: boolean; onCancel: () => void; onConfirm: () => void; title: string; description?: React.ReactNode; confirmLabel?: string; tone?: "danger" | "primary"; busy?: boolean }) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant={tone === "danger" ? "danger" : "primary"} onClick={onConfirm} disabled={busy} data-testid="confirm-dialog-confirm">
            {busy ? "Working…" : confirmLabel}
          </Button>
        </>
      }
    />
  );
}
