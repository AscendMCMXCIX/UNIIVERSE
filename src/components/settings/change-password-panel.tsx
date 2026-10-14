"use client";

import * as React from "react";
import { changeOwnPasswordAction } from "@/server/actions/users";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { NewPasswordFields, newPasswordReady } from "@/components/forms/new-password-fields";
import { toast } from "@/components/ui/toast";

/** Your password: the current one re-authenticates the change, the new one is typed twice. Never autosaved. */
export function ChangePasswordPanel({ hasPassword }: { hasPassword: boolean }) {
  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [confirmValue, setConfirmValue] = React.useState("");
  const [fieldError, setFieldError] = React.useState<{ field: "current" | "next"; text: string } | null>(null);
  const [busy, setBusy] = React.useState(false);
  return (
    <Panel className={hasPassword ? undefined : "border-warn/50"} id="password">
      <PanelHeader title={hasPassword ? "Password" : "Set a password"} subtitle={hasPassword ? "Enter your current password to confirm it is you. Changing it signs out your other devices." : "Your account has no password yet. Set one now so you can sign in again after this session ends or on another device."} />
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
          <Button type="submit" variant={hasPassword ? "outline" : "primary"} disabled={busy || (hasPassword && !current) || !newPasswordReady(next, confirmValue)}>
            {busy ? "Saving…" : hasPassword ? "Change password" : "Set password"}
          </Button>
        </form>
      </PanelBody>
    </Panel>
  );
}
