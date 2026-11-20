"use client";

import type * as React from "react";
import { Button } from "./button";
import { DetailModal } from "./detail-modal";

/**
 * A dialog for editors and confirmations: the site's one sheet (DetailModal size="sheet"), so it
 * looks and behaves like every other sheet (docs/MOBILE.md): docked to the bottom edge on phones and
 * in short windows, a centred window on taller wider screens; as tall as its content up to the
 * screen less a strip of the page (a share of the screen it is fixed to); its title and actions
 * in place and only the body scrolling; a handle to pull it down; the page behind locked; Escape,
 * the backdrop and Close ask the owner to close (it may want to confirm first), and focus returns to
 * what opened it. It once had its own bottom sheet, with another radius, motion and height rule, no
 * scroll lock, and actions on the bottom edge in a browser.
 */
/**
 * The Task dialog's sizes where it is a centred window (PLAN S4a, DESIGN_SYSTEM §7): a form or a
 * confirmation 30rem, a picker (a choice among many, an editor with a table) 42rem, and Card Studio
 * alone 76rem (DetailModal size="wide", customise-card.tsx). Phones and short windows dock it to the
 * bottom edge at the screen's width whatever its size. Nothing inside scrolls sideways at these widths.
 */
export const TASK_DIALOG_REM = { form: 30, picker: 42, studio: 76 } as const;
export type DialogSize = "form" | "picker";

export function Dialog({ open, onClose, title, description, children, footer, size }: { open: boolean; onClose: () => void; title: string; description?: React.ReactNode; children?: React.ReactNode; footer?: React.ReactNode; /** Every dialog states its size (TASK_DIALOG_REM). */ size: DialogSize }) {
  return (
    <DetailModal
      open={open}
      onClose={onClose}
      size="sheet"
      sheetWidth={size === "picker" ? "picker" : "standard"}
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
      size="form"
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
