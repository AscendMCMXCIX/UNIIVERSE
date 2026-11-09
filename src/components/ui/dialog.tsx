"use client";

import type * as React from "react";
import { Button } from "./button";
import { DetailModal } from "./detail-modal";

/**
 * A dialog for editors and confirmations: the site's one sheet (DetailModal size="sheet"), so it
 * looks and behaves like every other sheet (docs/MOBILE.md): docked to the bottom edge on phones and
 * in short windows, a centred window on taller wider screens; as tall as its content up to the
 * screen less a strip of the page (svh, steady while Safari's toolbars move); its title and actions
 * in place and only the body scrolling; a handle to pull it down; the page behind locked; Escape,
 * the backdrop and Close ask the owner to close (it may want to confirm first), and focus returns to
 * what opened it. It once had its own bottom sheet, with another radius, motion and height rule, no
 * scroll lock, and actions on the bottom edge in a browser.
 */
export function Dialog({ open, onClose, title, description, children, footer, width = "standard" }: { open: boolean; onClose: () => void; title: string; description?: React.ReactNode; children?: React.ReactNode; footer?: React.ReactNode; /** wide: an editor with a table (48rem where it is a centred window). */ width?: "standard" | "wide" }) {
  return (
    <DetailModal
      open={open}
      onClose={onClose}
      size="sheet"
      sheetWidth={width}
      title={title}
      // One dialog is open at a time; the id is what tests and the header's label read.
      titleId="dialog-title"
      description={description}
      closeTestId="dialog-close"
      footer={footer}
      // A confirmation has only its question and its actions: no empty body between them.
      bodyClassName={children ? undefined : "hidden"}
    >
      {children}
    </DetailModal>
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
