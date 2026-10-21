"use client";

import * as React from "react";
import { X } from "lucide-react";
import { withDefaults } from "@/lib/cn";
import { Button } from "./button";
import { MODAL_BACKDROP } from "./detail-modal";

/**
 * Modal dialog on the native <dialog> element (editors and confirmations): focus is trapped and
 * Escape closes it for free. Phones get a bottom sheet; larger screens a centred card, with the
 * same backdrop and entry motion as the site's detail windows (DetailModal). However short the
 * window (a phone held sideways), the dialog fits it: the title and the actions stay in view and
 * only the body scrolls.
 */
export function Dialog({ open, onClose, title, description, children, footer, className }: { open: boolean; onClose: () => void; title: string; description?: React.ReactNode; children?: React.ReactNode; footer?: React.ReactNode; className?: string }) {
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
      className={withDefaults(`m-0 mt-auto max-h-[calc(100dvh-env(safe-area-inset-top)-1.5rem)] w-full max-w-none overflow-hidden rounded-t-panel border border-border-strong bg-bg-elevated p-0 text-fg shadow-2xl shadow-black/50 open:flex open:flex-col motion-safe:modal-in ${MODAL_BACKDROP} sm:m-auto sm:max-h-[min(88dvh,52rem)] sm:max-w-lg sm:rounded-card short:max-h-[calc(100dvh-1rem)]`, className)}
    >
      {open ? (
        <div className="flex min-h-0 flex-1 flex-col px-safe pb-safe">
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-3">
            <div className="min-w-0">
              <h2 id="dialog-title" className="text-base font-semibold">
                {title}
              </h2>
              {description ? <p className="mt-0.5 text-sm text-fg-muted">{description}</p> : null}
            </div>
            <button type="button" onClick={onClose} className="-m-1.5 grid h-9 w-9 shrink-0 place-items-center rounded-md text-fg-subtle hover:bg-surface-2 hover:text-fg pointer-coarse:-m-2.5 pointer-coarse:h-11 pointer-coarse:w-11" aria-label="Close" data-testid="dialog-close">
              <X className="h-4 w-4" />
            </button>
          </div>
          {children ? <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">{children}</div> : null}
          {footer ? <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-border px-4 py-3">{footer}</div> : null}
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
