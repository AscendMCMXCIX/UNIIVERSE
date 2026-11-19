"use client";

import { AlertCircle, Check, Loader2 } from "lucide-react";
import type { SaveStatus } from "@/components/profile/use-profile-autosave";

/** Saving… / Saved / Unable to save — Retry: quiet, next to what is being edited, announced politely. */
export function SaveStatusIndicator({ status, error, onRetry }: { status: SaveStatus; error?: string | null; onRetry?: () => void }) {
  return (
    <span className="inline-flex min-h-6 items-center gap-1.5 text-xs" role="status" aria-live="polite" data-testid="save-status" data-status={status}>
      {status === "saving" ? (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin text-fg-subtle" aria-hidden /> <span className="text-fg-muted">Saving…</span>
        </>
      ) : status === "saved" ? (
        <span className="fade-in inline-flex items-center gap-1 text-good">
          <Check className="h-3.5 w-3.5" aria-hidden /> Saved
        </span>
      ) : status === "error" ? (
        // The reason is shown, not hidden in a title a phone or a keyboard never reaches (the tooltip inventory's G15).
        <span className="inline-flex flex-wrap items-center gap-x-1.5 text-bad">
          <AlertCircle className="h-3.5 w-3.5" aria-hidden /> Unable to save{error ? <span data-testid="save-error">: {error}</span> : null}
          {onRetry ? (
            <button type="button" onClick={onRetry} className="font-semibold underline underline-offset-2 hover:text-fg">
              Retry
            </button>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}
