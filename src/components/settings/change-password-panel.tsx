"use client";

import * as React from "react";
import { changeOwnPasswordAction } from "@/server/actions/users";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Panel, PanelBody } from "@/components/ui/panel";
import { NewPasswordFields, newPasswordReady } from "@/components/forms/new-password-fields";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";

/**
 * Your password: the current one re-authenticates the change, the new one is typed twice. Never
 * autosaved. On a phone, and in any window 480px tall or less, while the account has a password,
 * the form waits behind Change password at the header's end (it is changed rarely, and it is the
 * longest part of Settings): pressed, the form opens with the focus in its first field, and Cancel
 * folds it again, emptied. From md in a taller window it is always open, and an account without a
 * password sees it at once.
 */
export function ChangePasswordPanel({ hasPassword, className }: { hasPassword: boolean; className?: string }) {
  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [confirmValue, setConfirmValue] = React.useState("");
  const [fieldError, setFieldError] = React.useState<{ field: "current" | "next"; text: string } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const folded = hasPassword && !open;
  const fold = () => {
    setOpen(false);
    setCurrent("");
    setNext("");
    setConfirmValue("");
    setFieldError(null);
  };
  return (
    <Panel className={cn(!hasPassword && "border-warn/50", className)} id="password">
      {/* PanelHeader's look, with Change password on the title's row while the form is folded: the
          row wraps, so with a larger text size the button goes under the title rather than squeezing it. */}
      <header className={cn("border-b border-border px-3 py-3 sm:px-4", folded && "max-md:border-b-0 short:border-b-0")}>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <h2 className="min-w-0 text-base font-semibold text-fg">{hasPassword ? "Password" : "Set a password"}</h2>
          {folded ? (
            <Button
              variant="outline"
              className="md:not-short:hidden"
              wrap
              onClick={() => {
                setOpen(true);
                requestAnimationFrame(() => document.getElementById("current")?.focus());
              }}
              data-testid="password-open"
            >
              Change password
            </Button>
          ) : null}
        </div>
        <p className="mt-0.5 text-sm text-fg-muted">{hasPassword ? "Enter your current password to confirm it is you. Changing it signs out your other devices." : "Your account has no password yet. Set one now so you can sign in again after this session ends or on another device."}</p>
      </header>
      <PanelBody className={cn(folded && "max-md:hidden short:hidden")}>
        <form
          className="space-y-3"
          data-testid="password-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setFieldError(null);
            const r = await changeOwnPasswordAction({ current, next, confirm: confirmValue });
            setBusy(false);
            if (!r.ok) {
              setFieldError({ field: /current/i.test(r.error) ? "current" : "next", text: r.error });
              return;
            }
            toast.success(hasPassword ? "Password changed. Your other devices were signed out." : "Password set.");
            fold();
          }}
        >
          {hasPassword ? (
            <div className="max-w-sm">
              <Label htmlFor="current">Current password</Label>
              <Input id="current" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" aria-invalid={fieldError?.field === "current"} aria-describedby={fieldError?.field === "current" ? "current-error" : undefined} />
              {fieldError?.field === "current" ? (
                <p id="current-error" className="mt-1.5 text-xs text-bad">
                  {fieldError.text}
                </p>
              ) : null}
            </div>
          ) : null}
          <NewPasswordFields next={next} confirm={confirmValue} onNext={setNext} onConfirm={setConfirmValue} idPrefix="change" />
          {fieldError?.field === "next" ? <p className="text-xs text-bad">{fieldError.text}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant={hasPassword ? "outline" : "primary"} wrap disabled={busy || (hasPassword && !current) || !newPasswordReady(next, confirmValue)}>
              {busy ? "Saving…" : hasPassword ? "Change password" : "Set password"}
            </Button>
            {hasPassword ? (
              <Button variant="ghost" className="md:not-short:hidden" disabled={busy} onClick={fold} data-testid="password-cancel">
                Cancel
              </Button>
            ) : null}
          </div>
        </form>
      </PanelBody>
    </Panel>
  );
}
