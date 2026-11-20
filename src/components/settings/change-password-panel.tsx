"use client";

import * as React from "react";
import { changeOwnPasswordAction } from "@/server/actions/users";
import { signOutOtherDevicesAction } from "@/server/actions/account";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { NewPasswordFields, newPasswordReady } from "@/components/forms/new-password-fields";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";

/** Your password: the current one re-authenticates the change, the new one is typed twice. Never autosaved. */
export function ChangePasswordPanel({ hasPassword, className }: { hasPassword: boolean; className?: string }) {
  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [confirmValue, setConfirmValue] = React.useState("");
  const [fieldError, setFieldError] = React.useState<{ field: "current" | "next"; text: string } | null>(null);
  const [busy, setBusy] = React.useState(false);
  return (
    <Panel className={cn(!hasPassword && "border-warn/50", className)} id="password">
      <PanelHeader title={hasPassword ? "Password" : "Set a password"} subtitle={hasPassword ? "Your current one confirms it's you; changing it signs out your other devices." : "Your account has no password yet. Set one now so you can sign in again after this session ends or on another device."} />
      <PanelBody>
        <form
          className="space-y-3"
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
            setCurrent("");
            setNext("");
            setConfirmValue("");
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
          <Button type="submit" variant={hasPassword ? "outline" : "primary"} wrap disabled={busy || (hasPassword && !current) || !newPasswordReady(next, confirmValue)}>
            {busy ? "Saving…" : hasPassword ? "Change password" : "Set password"}
          </Button>
        </form>
        {hasPassword ? <SignOutOtherDevices /> : null}
      </PanelBody>
    </Panel>
  );
}

/** Ends every other session of your account; this device stays signed in. */
function SignOutOtherDevices() {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4" data-testid="sign-out-other-devices">
      <p className="min-w-0 text-sm text-fg-muted">Signed in somewhere you no longer use? Sign out everywhere else; this device stays signed in.</p>
      <Button variant="outline" wrap onClick={() => setOpen(true)}>
        Sign out of other devices
      </Button>
      <ConfirmDialog
        open={open}
        busy={busy}
        tone="primary"
        title="Sign out of your other devices?"
        description="Every other browser and device signed in to your account is signed out at once. This one stays signed in, and your password stays the same."
        confirmLabel="Sign out other devices"
        onCancel={() => setOpen(false)}
        onConfirm={async () => {
          setBusy(true);
          const r = await signOutOtherDevicesAction();
          setBusy(false);
          setOpen(false);
          if (r.ok) toast.success("Your other devices were signed out.");
          else toast.error("That did not work", { description: r.error });
        }}
      />
    </div>
  );
}
